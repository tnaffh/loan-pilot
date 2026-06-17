import { Injectable, NotFoundException } from '@nestjs/common';
import type { Payment, Prisma } from '@prisma/client';
import { LoanStatus, toCents, type CreatePaymentInput } from '@loan-pilot/domain';
import { PrismaService } from '../prisma/prisma.service';

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
  constructor(private readonly prisma: PrismaService) {}

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
   * Record an actual payment against a loan and recompute the loan balance and
   * status. `amount` arrives in major N$ units.
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

    await this.recomputeLoan(loan.id);
    return payment;
  }

  /** Recompute a loan's balance and status from the sum of its payments. */
  private async recomputeLoan(loanId: string): Promise<void> {
    const loan = await this.prisma.loan.findUnique({ where: { id: loanId } });
    if (!loan) {
      return;
    }
    const paid = await this.prisma.payment.aggregate({
      where: { loanId },
      _sum: { amount: true },
    });
    const collected = paid._sum.amount ?? 0;
    const balance = Math.max(0, loan.total - collected);

    // Don't override a manually written-off loan; otherwise derive from balance.
    const status =
      loan.status === LoanStatus.WrittenOff
        ? loan.status
        : balance <= 0
          ? LoanStatus.Settled
          : collected > 0
            ? LoanStatus.PartlyPaid
            : loan.status;

    await this.prisma.loan.update({
      where: { id: loanId },
      data: { balance, status },
    });
  }
}
