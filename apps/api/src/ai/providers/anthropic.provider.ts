import { Injectable } from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';
import { AiProvider } from '@loan-pilot/domain';
import {
  AiProviderError,
  type AiContentPart,
  type AiProviderClient,
  type AiProviderLimits,
  type AiReviewRequest,
  type AiReviewResult,
} from './ai-provider';

const MB = 1024 * 1024;

/**
 * Models that accept the server-side refusal fallback (`fallbacks: "default"`):
 * if a safety classifier declines the request, the API re-runs it on another
 * model in the same call instead of returning a refusal. Haiku has no fallback.
 */
const FALLBACK_MODELS = /^claude-(opus-5|fable-5|sonnet-5-5)/;

const toBlock = (part: AiContentPart): Anthropic.Beta.BetaContentBlockParam => {
  if (part.type === 'pdf') {
    return {
      type: 'document',
      title: part.title,
      source: { type: 'base64', media_type: 'application/pdf', data: part.data.toString('base64') },
    };
  }

  if (part.type === 'image') {
    return {
      type: 'image',
      source: { type: 'base64', media_type: part.mediaType, data: part.data.toString('base64') },
    };
  }

  return { type: 'text', text: part.text };
};

/** Map an SDK error to one a loan officer can act on. Most specific first. */
const toProviderError = (error: unknown): AiProviderError => {
  if (error instanceof AiProviderError) {
    return error;
  }

  if (error instanceof Anthropic.AuthenticationError) {
    return new AiProviderError(
      'Claude rejected the API key. An administrator can update it under Settings → AI review.',
      'auth',
    );
  }

  if (error instanceof Anthropic.PermissionDeniedError) {
    return new AiProviderError(
      'This API key is not allowed to use the selected Claude model.',
      'auth',
    );
  }

  if (error instanceof Anthropic.NotFoundError) {
    return new AiProviderError('The selected Claude model was not found.', 'invalid_request');
  }

  if (error instanceof Anthropic.RateLimitError) {
    return new AiProviderError(
      'Claude is rate-limiting this account. Wait a minute and try again.',
      'rate_limit',
    );
  }

  if (error instanceof Anthropic.BadRequestError) {
    // Includes "credit balance is too low" — the provider's own wording is clearest.
    return new AiProviderError(
      `Claude could not process the request: ${error.message}`,
      'invalid_request',
    );
  }

  if (error instanceof Anthropic.APIConnectionError) {
    return new AiProviderError(
      "Could not reach Claude. Check the server's internet access and retry.",
      'unavailable',
    );
  }

  if (error instanceof Anthropic.APIError) {
    return new AiProviderError(
      `Claude is temporarily unavailable (HTTP ${error.status ?? 'error'}). Try again shortly.`,
      'unavailable',
    );
  }

  return new AiProviderError(
    error instanceof Error ? error.message : 'The AI review failed unexpectedly.',
    'unavailable',
  );
};

@Injectable()
export class AnthropicProvider implements AiProviderClient {
  readonly provider = AiProvider.Anthropic;

  // A request may be at most 32 MB once base64-encoded (~4/3 growth).
  readonly limits: AiProviderLimits = {
    maxPdfBytes: 20 * MB,
    maxImageBytes: 5 * MB,
    maxTotalBytes: 22 * MB,
    imageTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
  };

  private client(apiKey: string): Anthropic {
    // A review normally takes 1–3 minutes. One retry covers a 429/5xx; the worst
    // case (2 × 8 min) stays inside the 20-minute window after which a review that
    // never reported back is treated as lost (AiReviewService STALE_AFTER_MS).
    return new Anthropic({ apiKey, maxRetries: 1, timeout: 8 * 60 * 1000 });
  }

  async review({
    apiKey,
    model,
    system,
    content,
    outputSchema,
  }: AiReviewRequest): Promise<AiReviewResult> {
    try {
      const fallback = FALLBACK_MODELS.test(model);
      // Streaming keeps a long, document-heavy request clear of HTTP timeouts;
      // finalMessage() collects the complete response.
      const message = await this.client(apiKey)
        .beta.messages.stream({
          model,
          max_tokens: 64000,
          ...(fallback ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' } : {}),
          // Thinking is adaptive by default on current models; effort sets how hard
          // it looks. Document forensics is worth `high`.
          output_config: {
            effort: 'high',
            format: { type: 'json_schema', schema: outputSchema },
          },
          // The system prompt is identical across reviews — cache it.
          system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
          messages: [{ role: 'user', content: content.map(toBlock) }],
        })
        .finalMessage();

      if (message.stop_reason === 'refusal') {
        throw new AiProviderError(
          'Claude declined to review these documents. Review them manually.',
          'refused',
        );
      }

      if (message.stop_reason === 'max_tokens') {
        throw new AiProviderError(
          'The AI response was cut off before it finished. Try again.',
          'truncated',
        );
      }

      const text = message.content
        .flatMap((block) => (block.type === 'text' ? [block.text] : []))
        .join('');
      const output: unknown = (() => {
        try {
          return JSON.parse(text);
        } catch {
          throw new AiProviderError(
            'The AI returned a response that could not be read.',
            'invalid_output',
          );
        }
      })();

      return {
        output,
        model: message.model,
        usage: {
          inputTokens: message.usage.input_tokens,
          outputTokens: message.usage.output_tokens,
          cacheReadTokens: message.usage.cache_read_input_tokens ?? 0,
          cacheWriteTokens: message.usage.cache_creation_input_tokens ?? 0,
        },
      };
    } catch (error) {
      throw toProviderError(error);
    }
  }

  /** Free: retrieving the model checks both the key and access to the model. */
  async verify(apiKey: string, model: string): Promise<void> {
    try {
      await this.client(apiKey).models.retrieve(model);
    } catch (error) {
      throw toProviderError(error);
    }
  }
}
