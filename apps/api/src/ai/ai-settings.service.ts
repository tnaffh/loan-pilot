import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  AI_PROVIDERS,
  aiProviderInfo,
  aiProviderSchema,
  type AiModelInfo,
  type AiProvider,
  type AiProviderInfo,
  type SaveAiCredentialInput,
} from '@loan-pilot/domain';
import { PrismaService } from '../prisma/prisma.service';
import { SecretBox } from './secret-box';
import { AiProviderRegistry } from './providers/provider-registry';
import { AiProviderError, type AiProviderClient } from './providers/ai-provider';

/** A provider as the settings page shows it. The API key itself never leaves the server. */
export interface AiProviderSettingsView {
  provider: AiProvider;
  label: string;
  vendor: string;
  available: boolean;
  models: readonly AiModelInfo[];
  defaultModel: string;
  keyPlaceholder: string;
  keysUrl: string;
  configured: boolean;
  /** Last four characters of the stored key, e.g. "…f3Qa". */
  keyHint: string | null;
  model: string | null;
  updatedAt: Date | null;
  updatedByName: string | null;
}

export interface AiSettingsView {
  activeProvider: AiProvider | null;
  providers: AiProviderSettingsView[];
}

/** Everything a review needs to call the active provider. */
export interface ActiveAiConfig {
  provider: AiProvider;
  model: string;
  apiKey: string;
  client: AiProviderClient;
}

/** Narrow a stored/route string to a provider, or null when unknown. */
export const parseAiProvider = (value: string | null | undefined): AiProvider | null => {
  const parsed = aiProviderSchema.safeParse(value);

  return parsed.success ? parsed.data : null;
};

const keyHint = (apiKey: string): string => `…${apiKey.slice(-4)}`;

@Injectable()
export class AiSettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly secrets: SecretBox,
    private readonly registry: AiProviderRegistry,
  ) {}

  async getSettings(tenantId: string): Promise<AiSettingsView> {
    const [settings, credentials] = await Promise.all([
      this.prisma.tenantSettings.findUnique({
        where: { tenantId },
        select: { aiProvider: true },
      }),
      this.prisma.aiProviderCredential.findMany({ where: { tenantId } }),
    ]);

    return {
      activeProvider: parseAiProvider(settings?.aiProvider),
      providers: AI_PROVIDERS.map((info) => {
        const credential = credentials.find((row) => row.provider === info.id);

        return {
          provider: info.id,
          label: info.label,
          vendor: info.vendor,
          available: info.available && Boolean(this.registry.get(info.id)),
          models: info.models,
          defaultModel: info.defaultModel,
          keyPlaceholder: info.keyPlaceholder,
          keysUrl: info.keysUrl,
          configured: Boolean(credential),
          keyHint: credential?.apiKeyHint ?? null,
          model: credential?.model ?? null,
          updatedAt: credential?.updatedAt ?? null,
          updatedByName: credential?.updatedByName ?? null,
        };
      }),
    };
  }

  /**
   * Store a provider's key and model. A new key (or model) is verified with the
   * provider before it is saved, so a typo is caught here and not mid-review.
   * Omitting the key keeps the stored one (changing only the model).
   */
  async saveCredential(
    tenantId: string,
    actorName: string,
    provider: AiProvider,
    input: SaveAiCredentialInput,
  ): Promise<AiSettingsView> {
    const { info, client } = this.implemented(provider);

    if (!info.models.some((model) => model.id === input.model)) {
      throw new BadRequestException(`Choose one of the ${info.label} models listed.`);
    }

    const existing = await this.prisma.aiProviderCredential.findUnique({
      where: { tenantId_provider: { tenantId, provider } },
    });
    const apiKey = input.apiKey ?? (existing ? this.secrets.decrypt(existing.apiKeyCipher) : null);

    if (!apiKey) {
      throw new BadRequestException('Enter the API key.');
    }

    await this.verifyWith(client, apiKey, input.model);

    const data = {
      apiKeyCipher: this.secrets.encrypt(apiKey),
      apiKeyHint: keyHint(apiKey),
      model: input.model,
      updatedByName: actorName,
    };

    await this.prisma.aiProviderCredential.upsert({
      where: { tenantId_provider: { tenantId, provider } },
      update: data,
      create: { tenantId, provider, ...data },
    });

    return this.getSettings(tenantId);
  }

  /** Delete a provider's key; AI review switches off if it was the active one. */
  async removeCredential(tenantId: string, provider: AiProvider): Promise<AiSettingsView> {
    await this.prisma.$transaction([
      this.prisma.aiProviderCredential.deleteMany({ where: { tenantId, provider } }),
      this.prisma.tenantSettings.updateMany({
        where: { tenantId, aiProvider: provider },
        data: { aiProvider: null },
      }),
    ]);

    return this.getSettings(tenantId);
  }

  /** Choose the provider reviews run on; null turns AI review off. */
  async setActive(tenantId: string, provider: AiProvider | null): Promise<AiSettingsView> {
    if (provider) {
      this.implemented(provider);
      const credential = await this.prisma.aiProviderCredential.findUnique({
        where: { tenantId_provider: { tenantId, provider } },
        select: { id: true },
      });

      if (!credential) {
        throw new BadRequestException('Save an API key for this provider before making it active.');
      }
    }

    await this.prisma.tenantSettings.upsert({
      where: { tenantId },
      update: { aiProvider: provider },
      create: { tenantId, aiProvider: provider },
    });

    return this.getSettings(tenantId);
  }

  /** Check the stored key still works (no tokens are billed). */
  async test(tenantId: string, provider: AiProvider): Promise<{ ok: true }> {
    const { client } = this.implemented(provider);
    const credential = await this.prisma.aiProviderCredential.findUnique({
      where: { tenantId_provider: { tenantId, provider } },
    });

    if (!credential) {
      throw new NotFoundException('No API key is saved for this provider.');
    }

    const apiKey = this.readKey(credential.apiKeyCipher);

    await this.verifyWith(client, apiKey, credential.model);

    return { ok: true };
  }

  /** The active provider's config, or a 400 explaining what an admin must set up. */
  async resolveActive(tenantId: string): Promise<ActiveAiConfig> {
    const settings = await this.prisma.tenantSettings.findUnique({
      where: { tenantId },
      select: { aiProvider: true },
    });
    const provider = parseAiProvider(settings?.aiProvider);

    if (!provider) {
      throw new BadRequestException(
        'AI review is not set up. An administrator can add an API key under Settings → AI review.',
      );
    }

    const { client } = this.implemented(provider);
    const credential = await this.prisma.aiProviderCredential.findUnique({
      where: { tenantId_provider: { tenantId, provider } },
    });

    if (!credential) {
      throw new BadRequestException(
        'The active AI provider has no API key. An administrator can add one under Settings → AI review.',
      );
    }

    return {
      provider,
      model: credential.model,
      apiKey: this.readKey(credential.apiKeyCipher),
      client,
    };
  }

  private readKey(cipher: string): string {
    const apiKey = this.secrets.decrypt(cipher);

    if (!apiKey) {
      throw new BadRequestException(
        'The stored AI API key can no longer be read (the server secret changed). Enter it again under Settings → AI review.',
      );
    }

    return apiKey;
  }

  private implemented(provider: AiProvider): { info: AiProviderInfo; client: AiProviderClient } {
    const info = aiProviderInfo(provider);
    const client = this.registry.get(provider);

    if (!info?.available || !client) {
      throw new BadRequestException(`${info?.label ?? provider} is not supported yet.`);
    }

    return { info, client };
  }

  private async verifyWith(client: AiProviderClient, apiKey: string, model: string): Promise<void> {
    try {
      await client.verify(apiKey, model);
    } catch (error) {
      throw new BadRequestException(
        error instanceof AiProviderError ? error.message : 'Could not verify the API key.',
      );
    }
  }
}
