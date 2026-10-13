import type { AiProvider, AiUsage } from '@loan-pilot/domain';

/** One piece of the review request, in a provider-neutral form. */
export type AiContentPart =
  | { type: 'text'; text: string }
  | { type: 'pdf'; data: Buffer; title: string }
  | { type: 'image'; data: Buffer; mediaType: AiImageMediaType };

export type AiImageMediaType = 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif';

export interface AiReviewRequest {
  apiKey: string;
  model: string;
  system: string;
  content: AiContentPart[];
  /** JSON Schema the response must conform to (structured output). */
  outputSchema: Record<string, unknown>;
}

export interface AiReviewResult {
  /** The parsed JSON response — validated by the caller, not here. */
  output: unknown;
  /** The model that actually answered (may differ after a provider fallback). */
  model: string;
  usage: AiUsage;
}

/** What a provider accepts, so the caller can skip files instead of failing. */
export interface AiProviderLimits {
  maxPdfBytes: number;
  maxImageBytes: number;
  /** Raw (pre-encoding) bytes of all files in one request. */
  maxTotalBytes: number;
  imageTypes: readonly AiImageMediaType[];
}

export type AiProviderErrorReason =
  | 'auth'
  | 'rate_limit'
  | 'invalid_request'
  | 'refused'
  | 'truncated'
  | 'invalid_output'
  | 'unavailable';

/** A provider failure with a message fit to show a loan officer. */
export class AiProviderError extends Error {
  constructor(
    message: string,
    readonly reason: AiProviderErrorReason,
  ) {
    super(message);
    this.name = 'AiProviderError';
  }
}

/**
 * A client for one AI vendor. Adding a provider (OpenAI, Gemini, DeepSeek…) means
 * implementing this, registering it in {@link AiProviderRegistry} and flipping
 * `available` for it in the domain's AI_PROVIDERS catalog.
 */
export interface AiProviderClient {
  readonly provider: AiProvider;
  readonly limits: AiProviderLimits;
  review(request: AiReviewRequest): Promise<AiReviewResult>;
  /** Cheaply confirm the key works and can use the model; throws AiProviderError. */
  verify(apiKey: string, model: string): Promise<void>;
}
