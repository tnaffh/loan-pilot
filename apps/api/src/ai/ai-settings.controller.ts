import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import {
  aiSettingsSchema,
  saveAiCredentialSchema,
  type AiProvider,
  type AiSettingsInput,
  type SaveAiCredentialInput,
  type SessionUser,
} from '@loan-pilot/domain';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { requireTenantId } from '../common/tenant';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { RequirePermissions } from '../auth/permissions.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { AiSettingsService, parseAiProvider, type AiSettingsView } from './ai-settings.service';

const providerParam = (value: string): AiProvider => {
  const provider = parseAiProvider(value);

  if (!provider) {
    throw new BadRequestException('Unknown AI provider');
  }

  return provider;
};

/** Lender settings for AI document review: provider keys and which one is active. */
@Controller('settings/ai')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class AiSettingsController {
  constructor(private readonly aiSettings: AiSettingsService) {}

  @Get()
  @RequirePermissions('settings:read')
  get(@CurrentUser() user: SessionUser): Promise<AiSettingsView> {
    return this.aiSettings.getSettings(requireTenantId(user));
  }

  @Patch()
  @RequirePermissions('settings:write')
  setActive(
    @CurrentUser() user: SessionUser,
    @Body(new ZodValidationPipe(aiSettingsSchema)) body: AiSettingsInput,
  ): Promise<AiSettingsView> {
    return this.aiSettings.setActive(requireTenantId(user), body.activeProvider);
  }

  @Put('providers/:provider')
  @RequirePermissions('settings:write')
  save(
    @CurrentUser() user: SessionUser,
    @Param('provider') provider: string,
    @Body(new ZodValidationPipe(saveAiCredentialSchema)) body: SaveAiCredentialInput,
  ): Promise<AiSettingsView> {
    return this.aiSettings.saveCredential(
      requireTenantId(user),
      user.name,
      providerParam(provider),
      body,
    );
  }

  @Delete('providers/:provider')
  @RequirePermissions('settings:write')
  remove(
    @CurrentUser() user: SessionUser,
    @Param('provider') provider: string,
  ): Promise<AiSettingsView> {
    return this.aiSettings.removeCredential(requireTenantId(user), providerParam(provider));
  }

  @Post('providers/:provider/test')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('settings:write')
  test(
    @CurrentUser() user: SessionUser,
    @Param('provider') provider: string,
  ): Promise<{ ok: true }> {
    return this.aiSettings.test(requireTenantId(user), providerParam(provider));
  }
}
