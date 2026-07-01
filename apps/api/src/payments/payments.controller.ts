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
  createPaymentSchema,
  type CreatePaymentInput,
  type SessionUser,
} from '@loan-pilot/domain';
import type { Payment } from '@prisma/client';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { requireTenantId } from '../common/tenant';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { RequirePermissions } from '../auth/permissions.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { PaymentsService, type PaymentWithLoan } from './payments.service';

@Controller('payments')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Get()
  @RequirePermissions('payments:read')
  list(
    @CurrentUser() user: SessionUser,
    @Query('loanId') loanId?: string,
  ): Promise<PaymentWithLoan[]> {
    return this.payments.findAllForTenant(requireTenantId(user), loanId);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions('payments:write')
  create(
    @CurrentUser() user: SessionUser,
    @Body(new ZodValidationPipe(createPaymentSchema)) body: CreatePaymentInput,
  ): Promise<Payment> {
    return this.payments.create(requireTenantId(user), body);
  }
}
