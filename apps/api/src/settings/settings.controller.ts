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
  UserRole,
  feeSettingsSchema,
  loanProductSchema,
  openingBalanceSchema,
  updateLoanProductSchema,
  type FeeSettingsInput,
  type LoanProductInput,
  type OpeningBalanceInput,
  type SessionUser,
  type UpdateLoanProductInput,
} from '@loan-pilot/domain';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { requireTenantId } from '../common/tenant';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { SettingsService, type LevyReport } from './settings.service';

@Controller('settings')
@UseGuards(JwtAuthGuard, RolesGuard)
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  @Get('fees')
  @Roles(UserRole.LenderAdmin, UserRole.LenderStaff)
  getFees(@CurrentUser() user: SessionUser): Promise<TenantSettings> {
    return this.settings.getFeeSettings(requireTenantId(user));
  }

  @Patch('fees')
  @Roles(UserRole.LenderAdmin)
  updateFees(
    @CurrentUser() user: SessionUser,
    @Body(new ZodValidationPipe(feeSettingsSchema)) body: FeeSettingsInput,
  ): Promise<TenantSettings> {
    return this.settings.updateFeeSettings(requireTenantId(user), body);
  }

  @Patch('opening-balance')
  @Roles(UserRole.LenderAdmin)
  updateOpeningBalance(
    @CurrentUser() user: SessionUser,
    @Body(new ZodValidationPipe(openingBalanceSchema)) body: OpeningBalanceInput,
  ): Promise<TenantSettings> {
    return this.settings.updateOpeningBalance(requireTenantId(user), body.openingBalance);
  }

  @Get('products')
  @Roles(UserRole.LenderAdmin, UserRole.LenderStaff)
  listProducts(@CurrentUser() user: SessionUser): Promise<LoanProduct[]> {
    return this.settings.listProducts(requireTenantId(user));
  }

  @Post('products')
  @HttpCode(HttpStatus.CREATED)
  @Roles(UserRole.LenderAdmin)
  createProduct(
    @CurrentUser() user: SessionUser,
    @Body(new ZodValidationPipe(loanProductSchema)) body: LoanProductInput,
  ): Promise<LoanProduct> {
    return this.settings.createProduct(requireTenantId(user), body);
  }

  @Patch('products/:id')
  @Roles(UserRole.LenderAdmin)
  updateProduct(
    @CurrentUser() user: SessionUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateLoanProductSchema)) body: UpdateLoanProductInput,
  ): Promise<LoanProduct> {
    return this.settings.updateProduct(requireTenantId(user), id, body);
  }

  @Delete('products/:id')
  @Roles(UserRole.LenderAdmin)
  deleteProduct(
    @CurrentUser() user: SessionUser,
    @Param('id') id: string,
  ): Promise<{ ok: true }> {
    return this.settings.deleteProduct(requireTenantId(user), id);
  }

  @Get('levies')
  @Roles(UserRole.LenderAdmin)
  levies(@CurrentUser() user: SessionUser): Promise<LevyReport> {
    return this.settings.leviesReport(requireTenantId(user));
  }
}
