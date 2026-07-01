import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  createInvestmentSchema,
  type CreateInvestmentInput,
  type SessionUser,
} from '@loan-pilot/domain';
import type { Investment } from '@prisma/client';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { requireTenantId } from '../common/tenant';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { RequirePermissions } from '../auth/permissions.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { InvestmentsService, type InvestmentTotals } from './investments.service';

@Controller('investments')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class InvestmentsController {
  constructor(private readonly investments: InvestmentsService) {}

  @Get()
  @RequirePermissions('finance:read')
  list(@CurrentUser() user: SessionUser): Promise<Investment[]> {
    return this.investments.findAllForTenant(requireTenantId(user));
  }

  @Get('totals')
  @RequirePermissions('finance:read')
  totals(@CurrentUser() user: SessionUser): Promise<InvestmentTotals> {
    return this.investments.totals(requireTenantId(user));
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions('finance:write')
  create(
    @CurrentUser() user: SessionUser,
    @Body(new ZodValidationPipe(createInvestmentSchema)) body: CreateInvestmentInput,
  ): Promise<Investment> {
    return this.investments.create(requireTenantId(user), body);
  }
}
