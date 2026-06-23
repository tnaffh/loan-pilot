import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  UserRole,
  createIncomeSchema,
  type CreateIncomeInput,
  type SessionUser,
} from '@loan-pilot/domain';
import type { Income } from '@prisma/client';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { requireTenantId } from '../common/tenant';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { IncomeService, type IncomeTotals } from './income.service';

@Controller('income')
@UseGuards(JwtAuthGuard, RolesGuard)
export class IncomeController {
  constructor(private readonly income: IncomeService) {}

  @Get()
  @Roles(UserRole.LenderAdmin, UserRole.LenderStaff)
  list(@CurrentUser() user: SessionUser, @Query('period') period?: string): Promise<Income[]> {
    return this.income.findAllForTenant(requireTenantId(user), period);
  }

  @Get('totals')
  @Roles(UserRole.LenderAdmin, UserRole.LenderStaff)
  totals(@CurrentUser() user: SessionUser): Promise<IncomeTotals> {
    return this.income.totals(requireTenantId(user));
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Roles(UserRole.LenderAdmin)
  create(
    @CurrentUser() user: SessionUser,
    @Body(new ZodValidationPipe(createIncomeSchema)) body: CreateIncomeInput,
  ): Promise<Income> {
    return this.income.create(requireTenantId(user), body);
  }
}
