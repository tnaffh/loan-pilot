import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import type { LoanProduct, TenantSettings } from '@prisma/client';
import {
  feeSettingsSchema,
  lenderIdentitySchema,
  loanProductSchema,
  openingBalanceSchema,
  updateLoanProductSchema,
  type FeeSettingsInput,
  type LenderIdentityInput,
  type LoanProductInput,
  type OpeningBalanceInput,
  type SessionUser,
  type UpdateLoanProductInput,
} from '@loan-pilot/domain';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
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
}
