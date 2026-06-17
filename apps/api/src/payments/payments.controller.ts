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
  createPaymentSchema,
  type CreatePaymentInput,
  type SessionUser,
} from '@loan-pilot/domain';
import type { Payment } from '@prisma/client';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { requireTenantId } from '../common/tenant';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { PaymentsService, type PaymentWithLoan } from './payments.service';

@Controller('payments')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Get()
  @Roles(UserRole.LenderAdmin, UserRole.LenderStaff)
  list(
    @CurrentUser() user: SessionUser,
    @Query('loanId') loanId?: string,
  ): Promise<PaymentWithLoan[]> {
    return this.payments.findAllForTenant(requireTenantId(user), loanId);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Roles(UserRole.LenderAdmin, UserRole.LenderStaff)
  create(
    @CurrentUser() user: SessionUser,
    @Body(new ZodValidationPipe(createPaymentSchema)) body: CreatePaymentInput,
  ): Promise<Payment> {
    return this.payments.create(requireTenantId(user), body);
  }
}
