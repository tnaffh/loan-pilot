import { Injectable, Logger } from '@nestjs/common';
import type { Loan, Prisma } from '@prisma/client';
import {
  InterestMethod,
  LoanStatus,
  RenewalBasis,
  addMonths,
  renewalPosition,
  type RenewalPosition,
} from '@loan-pilot/domain';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { deriveScheduleProgress } from '../payments/schedule-progress';

/** The loan columns a renewal derivation reads. */
export type RenewalLoan = Pick<
  Loan,
  | 'id'
  | 'tenantId'
  | 'principal'
  | 'namfisaLevy'
  | 'stampDuty'
  | 'insurance'
  | 'financeCharge'
  | 'total'
  | 'renewalCharges'
  | 'interestRate'
  | 'renewalBasis'
  | 'disbursedAt'
  | 'createdAt'
>;

export interface RenewalState {
  readonly position: RenewalPosition;
  /** Origination finance charge + the renewal charges. */
  readonly financeCharge: number;
}

/** A loan still on the book: only these are recalculated. */
export const isOpenLoan = (status: string): boolean =>
  status === LoanStatus.Active || status === LoanStatus.Arrears || status === LoanStatus.PartlyPaid;

/** The amount borrowed: the interest-bearing base every method prices from. */
export const principalDebtOf = (
  loan: Pick<Loan, 'principal' | 'namfisaLevy' | 'stampDuty' | 'insurance'>,
): number => loan.principal + loan.namfisaLevy + loan.stampDuty + loan.insurance;

/**
 * Derive a monthly-renewal loan's renewals as of a date from its origination
 * figures and payments. Pure: the stored renewal charges are backed out first,
 * so the result is the same however many times the loan has been recalculated.
 */
export const renewalStateFor = (
  loan: RenewalLoan,
  payments: readonly { amount: number; paidAt: Date }[],
  graceDays: number,
  asOf: Date,
): RenewalState => {
  const position = renewalPosition({
    totalCents: loan.total - loan.renewalCharges,
    principalDebtCents: principalDebtOf(loan),
    rate: loan.interestRate,
    basis:
      loan.renewalBasis === RenewalBasis.Balance ? RenewalBasis.Balance : RenewalBasis.Principal,
    firstDueAt: addMonths(loan.disbursedAt ?? loan.createdAt, 1),
    graceDays,
    payments: payments.map((payment) => ({ paidAt: payment.paidAt, amountCents: payment.amount })),
    asOf,
  });

  return {
    position,
    financeCharge: loan.financeCharge - loan.renewalCharges + position.chargesCents,
  };
};

/**
 * Keeps a loan's *derived* figures in step with its origination inputs and its
 * payments. Two layers:
 *
 * 1. Monthly-renewal loans gain a renewal charge for every month they stay
 *    unpaid; those charges (and the moving due date) are re-derived from scratch
 *    and stored, so every other reader of `total` / `balance` stays correct.
 * 2. For every loan, balance, status and schedule progress follow from the total
 *    and the payments received.
 *
 * Everything here is idempotent, so it is safe to run on every read, on every
 * payment, and from the daily job.
 */
@Injectable()
export class LoanCalculationService {
  private readonly logger = new Logger(LoanCalculationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
  ) {}

  /** Bring one loan's derived figures up to date. */
  async refresh(loanId: string, now: Date = new Date()): Promise<void> {
    const loan = await this.prisma.loan.findUnique({ where: { id: loanId } });

    if (!loan) {
      return;
    }

    const current =
      loan.interestMethod === InterestMethod.MonthlyRenewal && isOpenLoan(loan.status)
        ? await this.applyRenewals(loan, now)
        : loan;

    await this.recompute(current, now);
  }

  /**
   * Recalculate every open monthly-renewal loan (all tenants). Run daily so a
   * loan renews on time even when nobody opens it. One failing loan never stops
   * the rest.
   */
  async refreshRenewingLoans(now: Date = new Date()): Promise<number> {
    const loans = await this.prisma.loan.findMany({
      where: {
        interestMethod: InterestMethod.MonthlyRenewal,
        status: { in: [LoanStatus.Active, LoanStatus.Arrears, LoanStatus.PartlyPaid] },
      },
      select: { id: true },
    });

    const results = await Promise.allSettled(loans.map((loan) => this.refresh(loan.id, now)));

    results.forEach((result, index) => {
      if (result.status === 'rejected') {
        this.logger.error(
          `Could not recalculate loan ${loans[index]?.id ?? '?'}: ${String(result.reason)}`,
        );
      }
    });

    return loans.length;
  }

  /**
   * Store a derived renewal state on the loan: the renewal rows, the grown total
   * and finance charge, and a single schedule row for the amount now due on the
   * current due date. Balance and status are left to {@link recompute}.
   */
  async writeRenewalState(
    tx: Prisma.TransactionClient,
    loan: RenewalLoan,
    state: RenewalState,
  ): Promise<Loan> {
    const { position } = state;

    await tx.loanRenewal.deleteMany({ where: { loanId: loan.id } });

    if (position.renewals.length > 0) {
      await tx.loanRenewal.createMany({
        data: position.renewals.map((renewal) => ({
          tenantId: loan.tenantId,
          loanId: loan.id,
          number: renewal.number,
          renewedAt: renewal.renewedAt,
          base: renewal.baseCents,
          rate: loan.interestRate,
          charge: renewal.chargeCents,
          newDueAt: renewal.newDueAt,
        })),
      });
    }

    await tx.repaymentScheduleItem.deleteMany({ where: { loanId: loan.id } });
    await tx.repaymentScheduleItem.create({
      data: {
        loanId: loan.id,
        number: 1,
        amount: position.totalCents,
        dueAt: position.nextDueAt,
      },
    });

    return tx.loan.update({
      where: { id: loan.id },
      data: {
        renewalCharges: position.chargesCents,
        financeCharge: state.financeCharge,
        total: position.totalCents,
        instalment: position.totalCents,
        termMonths: 1,
        instalmentsTotal: 1,
        nextDueAt: position.nextDueAt,
      },
    });
  }

  /** Re-derive a monthly-renewal loan's renewals; writes only when they changed. */
  private async applyRenewals(loan: Loan, now: Date): Promise<Loan> {
    const [payments, { renewalGraceDays }, storedRenewals, schedule] = await Promise.all([
      this.prisma.payment.findMany({
        where: { loanId: loan.id },
        orderBy: { paidAt: 'asc' },
        select: { amount: true, paidAt: true },
      }),
      this.settings.resolveMethodSettings(loan.tenantId),
      this.prisma.loanRenewal.count({ where: { loanId: loan.id } }),
      this.prisma.repaymentScheduleItem.findMany({ where: { loanId: loan.id } }),
    ]);
    const state = renewalStateFor(loan, payments, renewalGraceDays, now);
    const { position } = state;
    const row = schedule[0];
    const unchanged =
      position.chargesCents === loan.renewalCharges &&
      position.renewals.length === storedRenewals &&
      schedule.length === 1 &&
      row?.amount === position.totalCents &&
      row.dueAt.getTime() === position.nextDueAt.getTime();

    if (unchanged) {
      return loan;
    }

    return this.prisma.$transaction((tx) => this.writeRenewalState(tx, loan, state));
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
  private async recompute(loan: Loan, now: Date): Promise<void> {
    const [payments, schedule] = await Promise.all([
      this.prisma.payment.findMany({
        where: { loanId: loan.id },
        orderBy: { paidAt: 'asc' },
        select: { amount: true, paidAt: true },
      }),
      this.prisma.repaymentScheduleItem.findMany({
        where: { loanId: loan.id },
        orderBy: { number: 'asc' },
      }),
    ]);

    const collected = payments.reduce((sum, payment) => sum + payment.amount, 0);
    // A remainder waived on settlement is no longer owed, so it comes off too.
    const balance = Math.max(0, loan.total - collected - loan.waived);

    // Don't override a manually written-off loan; otherwise derive from balance.
    const status =
      loan.status === LoanStatus.WrittenOff
        ? loan.status
        : balance <= 0
          ? LoanStatus.Settled
          : collected > 0
            ? LoanStatus.PartlyPaid
            : loan.status;

    const progress = deriveScheduleProgress(schedule, payments, now);

    await this.prisma.$transaction([
      this.prisma.loan.update({
        where: { id: loan.id },
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
