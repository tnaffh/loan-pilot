import { Module } from '@nestjs/common';
import { DocumentsModule } from '../documents/documents.module';
import { SecretBox } from './secret-box';
import { AnthropicProvider } from './providers/anthropic.provider';
import { AiProviderRegistry } from './providers/provider-registry';
import { AiSettingsService } from './ai-settings.service';
import { AiSettingsController } from './ai-settings.controller';
import { AiReviewService } from './ai-review.service';
import { AiReviewController } from './ai-review.controller';

/** AI document review: provider settings and the reviews themselves. */
@Module({
  imports: [DocumentsModule],
  providers: [SecretBox, AnthropicProvider, AiProviderRegistry, AiSettingsService, AiReviewService],
  controllers: [AiSettingsController, AiReviewController],
})
export class AiModule {}
