import { Injectable, NotFoundException } from '@nestjs/common';
import type { Payment, Prisma } from '@prisma/client';
import { LoanStatus, toCents, type CreatePaymentInput } from '@loan-pilot/domain';
import { PrismaService } from '../prisma/prisma.service';
import { deriveScheduleProgress } from './schedule-progress';

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

  /**
   * Recompute a loan's balance, status and schedule progress from its payments.
   *
   * Schedule progress is derived here rather than tracked separately: recording a
   * payment used to update only balance and status, so a loan paid this way kept
   * every instalment flagged `due` with `instalmentsPaid` at 0. That is not just
   * cosmetic — arrears are assessed live off the schedule, so a paid instalment
   * still reads as overdue and starts accruing default interest once it is a full
   * month past due. Deriving both from the same payment history keeps them in step,
   * and makes this idempotent so it can be re-run to repair existing loans.
   */
  private async recomputeLoan(loanId: string): Promise<void> {
    const loan = await this.prisma.loan.findUnique({ where: { id: loanId } });
    if (!loan) {
      return;
    }
    const [payments, schedule] = await Promise.all([
      this.prisma.payment.findMany({
        where: { loanId },
        orderBy: { paidAt: 'asc' },
        select: { amount: true, paidAt: true },
      }),
      this.prisma.repaymentScheduleItem.findMany({
        where: { loanId },
        orderBy: { number: 'asc' },
      }),
    ]);

    const collected = payments.reduce((sum, payment) => sum + payment.amount, 0);
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

    const progress = deriveScheduleProgress(schedule, payments);

    await this.prisma.$transaction([
      this.prisma.loan.update({
        where: { id: loanId },
        data: {
          balance,
          status,
          instalmentsPaid: progress.instalmentsPaid,
          nextDueAt: progress.nextDueAt,
          daysLate: progress.daysLate,
        },
      }),
      ...progress.changedRows.map((row) =>
        this.prisma.repaymentScheduleItem.update({
          where: { id: row.id },
          data: { status: row.status, paidAt: row.paidAt },
        }),
      ),
    ]);
  }
}
