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
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { LoanProduct, TenantSettings } from '@prisma/client';
import {
  feeSettingsSchema,
  initialsImageSchema,
  lenderIdentitySchema,
  loanProductSchema,
  openingBalanceSchema,
  signatureImageSchema,
  updateLoanProductSchema,
  type FeeSettingsInput,
  type HandwritingImageInput,
  type LenderIdentityInput,
  type LoanProductInput,
  type OpeningBalanceInput,
  type SessionUser,
  type UpdateLoanProductInput,
} from '@loan-pilot/domain';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { documentUploadOptions } from '../documents/upload.config';
import { requireTenantId } from '../common/tenant';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { RequirePermissions } from '../auth/permissions.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { SettingsService, type LenderIdentity, type LevyReport } from './settings.service';

@Controller('settings')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  @Get('fees')
  @RequirePermissions('settings:read')
  getFees(@CurrentUser() user: SessionUser): Promise<TenantSettings> {
    return this.settings.getFeeSettings(requireTenantId(user));
  }

  @Patch('fees')
  @RequirePermissions('settings:write')
  updateFees(
    @CurrentUser() user: SessionUser,
    @Body(new ZodValidationPipe(feeSettingsSchema)) body: FeeSettingsInput,
  ): Promise<TenantSettings> {
    return this.settings.updateFeeSettings(requireTenantId(user), body);
  }

  @Patch('opening-balance')
  @RequirePermissions('settings:write')
  updateOpeningBalance(
    @CurrentUser() user: SessionUser,
    @Body(new ZodValidationPipe(openingBalanceSchema)) body: OpeningBalanceInput,
  ): Promise<TenantSettings> {
    return this.settings.updateOpeningBalance(requireTenantId(user), body.openingBalance);
  }

  @Get('products')
  @RequirePermissions('settings:read')
  listProducts(@CurrentUser() user: SessionUser): Promise<LoanProduct[]> {
    return this.settings.listProducts(requireTenantId(user));
  }

  @Post('products')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions('settings:write')
  createProduct(
    @CurrentUser() user: SessionUser,
    @Body(new ZodValidationPipe(loanProductSchema)) body: LoanProductInput,
  ): Promise<LoanProduct> {
    return this.settings.createProduct(requireTenantId(user), body);
  }

  @Patch('products/:id')
  @RequirePermissions('settings:write')
  updateProduct(
    @CurrentUser() user: SessionUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateLoanProductSchema)) body: UpdateLoanProductInput,
  ): Promise<LoanProduct> {
    return this.settings.updateProduct(requireTenantId(user), id, body);
  }

  @Delete('products/:id')
  @RequirePermissions('settings:write')
  deleteProduct(
    @CurrentUser() user: SessionUser,
    @Param('id') id: string,
  ): Promise<{ ok: true }> {
    return this.settings.deleteProduct(requireTenantId(user), id);
  }

  @Get('levies')
  @RequirePermissions('finance:read')
  levies(@CurrentUser() user: SessionUser): Promise<LevyReport> {
    return this.settings.leviesReport(requireTenantId(user));
  }

  @Get('lender-identity')
  @RequirePermissions('settings:read')
  getLenderIdentity(@CurrentUser() user: SessionUser): Promise<LenderIdentity> {
    return this.settings.getLenderIdentity(requireTenantId(user));
  }

  @Patch('lender-identity')
  @RequirePermissions('settings:write')
  updateLenderIdentity(
    @CurrentUser() user: SessionUser,
    @Body(new ZodValidationPipe(lenderIdentitySchema)) body: LenderIdentityInput,
  ): Promise<LenderIdentity> {
    return this.settings.updateLenderIdentity(requireTenantId(user), body);
  }

  @Post('logo')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('settings:write')
  @UseInterceptors(FileInterceptor('file', documentUploadOptions))
  uploadLogo(
    @CurrentUser() user: SessionUser,
    @UploadedFile() file: Express.Multer.File | undefined,
  ): Promise<{ logoUrl: string | null }> {
    if (!file) {
      throw new BadRequestException('A file is required');
    }
    return this.settings.uploadLogo(requireTenantId(user), file);
  }

  // ── Principal officer signature / initials + optional custom stamp ─────
  // Embedded into every generated agreement and statement letter so the
  // documents leave the system already signed and stamped for the lender.

  @Post('officer-signature')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('settings:write')
  saveOfficerSignature(
    @CurrentUser() user: SessionUser,
    @Body(new ZodValidationPipe(signatureImageSchema)) body: HandwritingImageInput,
  ): Promise<LenderIdentity> {
    return this.settings.saveSigningImage(
      requireTenantId(user),
      'principalOfficerSignature',
      body.dataUrl,
    );
  }

  @Delete('officer-signature')
  @RequirePermissions('settings:write')
  clearOfficerSignature(@CurrentUser() user: SessionUser): Promise<LenderIdentity> {
    return this.settings.clearSigningImage(requireTenantId(user), 'principalOfficerSignature');
  }

  @Post('officer-initials')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('settings:write')
  saveOfficerInitials(
    @CurrentUser() user: SessionUser,
    @Body(new ZodValidationPipe(initialsImageSchema)) body: HandwritingImageInput,
  ): Promise<LenderIdentity> {
    return this.settings.saveSigningImage(
      requireTenantId(user),
      'principalOfficerInitials',
      body.dataUrl,
    );
  }

  @Delete('officer-initials')
  @RequirePermissions('settings:write')
  clearOfficerInitials(@CurrentUser() user: SessionUser): Promise<LenderIdentity> {
    return this.settings.clearSigningImage(requireTenantId(user), 'principalOfficerInitials');
  }

  /** A custom (undated) stamp image that replaces the drawn default stamp. */
  @Post('stamp')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('settings:write')
  @UseInterceptors(FileInterceptor('file', documentUploadOptions))
  uploadStamp(
    @CurrentUser() user: SessionUser,
    @UploadedFile() file: Express.Multer.File | undefined,
  ): Promise<LenderIdentity> {
    if (!file) {
      throw new BadRequestException('A file is required');
    }
    return this.settings.uploadStamp(requireTenantId(user), file);
  }

  @Delete('stamp')
  @RequirePermissions('settings:write')
  clearStamp(@CurrentUser() user: SessionUser): Promise<LenderIdentity> {
    return this.settings.clearSigningImage(requireTenantId(user), 'companyStamp');
  }
}
