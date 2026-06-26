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
  UserRole,
  createInvestmentSchema,
  type CreateInvestmentInput,
  type SessionUser,
} from '@loan-pilot/domain';
import type { Investment } from '@prisma/client';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { requireTenantId } from '../common/tenant';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { InvestmentsService, type InvestmentTotals } from './investments.service';

@Controller('investments')
@UseGuards(JwtAuthGuard, RolesGuard)
export class InvestmentsController {
  constructor(private readonly investments: InvestmentsService) {}

  @Get()
  @Roles(UserRole.LenderAdmin)
  list(@CurrentUser() user: SessionUser): Promise<Investment[]> {
    return this.investments.findAllForTenant(requireTenantId(user));
  }

  @Get('totals')
  @Roles(UserRole.LenderAdmin)
  totals(@CurrentUser() user: SessionUser): Promise<InvestmentTotals> {
    return this.investments.totals(requireTenantId(user));
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Roles(UserRole.LenderAdmin)
  create(
    @CurrentUser() user: SessionUser,
    @Body(new ZodValidationPipe(createInvestmentSchema)) body: CreateInvestmentInput,
  ): Promise<Investment> {
    return this.investments.create(requireTenantId(user), body);
  }
}
