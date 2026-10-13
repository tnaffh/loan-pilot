import { Injectable } from '@nestjs/common';
import type { AiProvider } from '@loan-pilot/domain';
import type { AiProviderClient } from './ai-provider';
import { AnthropicProvider } from './anthropic.provider';

/** The implemented provider clients, by provider id. */
@Injectable()
export class AiProviderRegistry {
  private readonly clients: ReadonlyMap<AiProvider, AiProviderClient>;

  constructor(anthropic: AnthropicProvider) {
    this.clients = new Map<AiProvider, AiProviderClient>([[anthropic.provider, anthropic]]);
  }

  get(provider: AiProvider): AiProviderClient | undefined {
    return this.clients.get(provider);
  }
}
