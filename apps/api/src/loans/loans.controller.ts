import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  UserRole,
  cancelLoanSchema,
  createLoanSchema,
  isBorrower,
  loanQuoteSchema,
  recordRepaymentSchema,
  settleLoanSchema,
  updateLoanSchema,
  writeOffLoanSchema,
  type CancelLoanInput,
  type CreateLoanInput,
  type LoanQuote,
  type LoanQuoteInput,
  type RecordRepaymentInput,
  type SessionUser,
  type SettleLoanInput,
  type UpdateLoanInput,
  type WriteOffLoanInput,
} from '@loan-pilot/domain';
import type { Loan } from '@prisma/client';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { requireTenantId } from '../common/tenant';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import {
  LoansService,
  type LoanStatement,
  type LoanWithBorrower,
  type LoanWithDetails,
} from './loans.service';

@Controller('loans')
@UseGuards(JwtAuthGuard, RolesGuard)
export class LoansController {
  constructor(private readonly loans: LoansService) {}

  @Post('quote')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.LenderAdmin, UserRole.LenderStaff)
  quote(@Body(new ZodValidationPipe(loanQuoteSchema)) body: LoanQuoteInput): LoanQuote {
    return this.loans.quotePreview(body);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Roles(UserRole.LenderAdmin, UserRole.LenderStaff)
  create(
    @CurrentUser() user: SessionUser,
    @Body(new ZodValidationPipe(createLoanSchema)) body: CreateLoanInput,
  ): Promise<Loan> {
    return this.loans.create(requireTenantId(user), body);
  }

  @Get()
  @Roles(UserRole.LenderAdmin, UserRole.LenderStaff, UserRole.Borrower)
  list(@CurrentUser() user: SessionUser): Promise<LoanWithBorrower[]> {
    if (isBorrower(user.role)) {
      return this.loans.findAllForBorrowerUser(user.id);
    }
    return this.loans.findAllForTenant(requireTenantId(user));
  }

  @Get(':id')
  @Roles(UserRole.LenderAdmin, UserRole.LenderStaff, UserRole.Borrower)
  findOne(@CurrentUser() user: SessionUser, @Param('id') id: string): Promise<LoanWithDetails> {
    if (isBorrower(user.role)) {
      return this.loans.findOneForBorrowerUser(user.id, id);
    }
    return this.loans.findOne(requireTenantId(user), id);
  }

  @Patch(':id')
  @Roles(UserRole.LenderAdmin)
  update(
    @CurrentUser() user: SessionUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateLoanSchema)) body: UpdateLoanInput,
  ): Promise<Loan> {
    return this.loans.update(requireTenantId(user), user, id, body);
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.CREATED)
  @Roles(UserRole.LenderAdmin)
  cancel(
    @CurrentUser() user: SessionUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(cancelLoanSchema)) body: CancelLoanInput,
  ): Promise<Loan> {
    return this.loans.cancel(requireTenantId(user), user, id, body);
  }

  @Post(':id/repayments')
  @HttpCode(HttpStatus.CREATED)
  @Roles(UserRole.LenderAdmin, UserRole.LenderStaff)
  recordRepayment(
    @CurrentUser() user: SessionUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(recordRepaymentSchema)) body: RecordRepaymentInput,
  ): Promise<Loan> {
    return this.loans.recordRepayment(requireTenantId(user), id, body);
  }

  @Post(':id/settle')
  @HttpCode(HttpStatus.CREATED)
  @Roles(UserRole.LenderAdmin, UserRole.LenderStaff)
  settle(
    @CurrentUser() user: SessionUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(settleLoanSchema)) body: SettleLoanInput,
  ): Promise<Loan> {
    return this.loans.settle(requireTenantId(user), id, body);
  }

  @Post(':id/write-off')
  @HttpCode(HttpStatus.CREATED)
  @Roles(UserRole.LenderAdmin)
  writeOff(
    @CurrentUser() user: SessionUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(writeOffLoanSchema)) body: WriteOffLoanInput,
  ): Promise<Loan> {
    return this.loans.writeOff(requireTenantId(user), id, body);
  }

  @Get(':id/statement')
  @Roles(UserRole.LenderAdmin, UserRole.LenderStaff, UserRole.Borrower)
  statement(@CurrentUser() user: SessionUser, @Param('id') id: string): Promise<LoanStatement> {
    if (isBorrower(user.role)) {
      return this.loans.statementForBorrowerUser(user.id, id);
    }
    return this.loans.statement(requireTenantId(user), id);
  }
}
