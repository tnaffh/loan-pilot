import { Injectable, NotFoundException } from '@nestjs/common';
import type { Payment, Prisma } from '@prisma/client';
import { toCents, type CreatePaymentInput } from '@loan-pilot/domain';
import { PrismaService } from '../prisma/prisma.service';
import { LoanCalculationService } from '../loans/loan-calculation.service';

export type PaymentWithLoan = Prisma.PaymentGetPayload<{
  include: {
    loan: {
      select: {
        id: true;
        externalRef: true;
        borrower: { select: { id: true; firstName: true; lastName: true } };
      };
    };
  };
}>;

@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly calculation: LoanCalculationService,
  ) {}

  /** List payments for a tenant, most recent first; optionally scoped to one loan. */
  findAllForTenant(tenantId: string, loanId?: string): Promise<PaymentWithLoan[]> {
    return this.prisma.payment.findMany({
      where: { tenantId, ...(loanId ? { loanId } : {}) },
      include: {
        loan: {
          select: {
            id: true,
            externalRef: true,
            borrower: { select: { id: true, firstName: true, lastName: true } },
          },
        },
      },
      orderBy: { paidAt: 'desc' },
    });
  }

  /**
   * Record an actual payment against a loan and recalculate the loan: renewals
   * (a monthly-renewal loan paid inside its grace days does not renew), then
   * balance, status and schedule progress. `amount` arrives in major N$ units.
   */
  async create(tenantId: string, input: CreatePaymentInput): Promise<Payment> {
    const loan = await this.prisma.loan.findFirst({
      where: { id: input.loanId, tenantId },
    });

    if (!loan) {
      throw new NotFoundException('Loan not found');
    }

    const amount = toCents(input.amount);
    const payment = await this.prisma.payment.create({
      data: {
        tenant: { connect: { id: tenantId } },
        loan: { connect: { id: loan.id } },
        paidAt: new Date(input.paidAt),
        amount,
        method: input.method,
        badDebt: input.badDebt ?? false,
        note: input.note || null,
      },
    });

    await this.calculation.refresh(loan.id);

    return payment;
  }
}
