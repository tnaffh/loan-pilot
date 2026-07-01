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
  createExpenseSchema,
  type CreateExpenseInput,
  type SessionUser,
} from '@loan-pilot/domain';
import type { Expense } from '@prisma/client';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { requireTenantId } from '../common/tenant';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { RequirePermissions } from '../auth/permissions.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { ExpensesService, type ExpenseTotals } from './expenses.service';

@Controller('expenses')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ExpensesController {
  constructor(private readonly expenses: ExpensesService) {}

  @Get()
  @RequirePermissions('finance:read')
  list(@CurrentUser() user: SessionUser, @Query('period') period?: string): Promise<Expense[]> {
    return this.expenses.findAllForTenant(requireTenantId(user), period);
  }

  @Get('totals')
  @RequirePermissions('finance:read')
  totals(@CurrentUser() user: SessionUser): Promise<ExpenseTotals> {
    return this.expenses.totals(requireTenantId(user));
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions('finance:write')
  create(
    @CurrentUser() user: SessionUser,
    @Body(new ZodValidationPipe(createExpenseSchema)) body: CreateExpenseInput,
  ): Promise<Expense> {
    return this.expenses.create(requireTenantId(user), body);
  }
}
