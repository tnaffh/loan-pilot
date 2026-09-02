import {
  LoanStatus,
  RepaymentStatus,
  ageAt,
  creditsUpTo,
  effectiveClosedAt,
  impliedSchedule,
  reconcileCredits,
  type AgeingResult,
  type Cents,
  type LoanCredit,
  type LoanStatusValue,
  type PaymentMethodValue,
  type ScheduledInstalment,
} from '@loan-pilot/domain';

/**
 * Rebuilding the loan book at a point in time.
 *
 * `Loan.balance` is a *current* figure, and an inconsistent one: `recordRepayment`
 * decrements it while `PaymentsService.recomputeLoan` overwrites it from the sum
 * of payments, and a written-off loan keeps its balance rather than being zeroed.
 * None of that can answer "what was the book worth on 31 March", which is the
 * first line of the NAMFISA return. So the book is rebuilt from the credit
 * ledger instead — see `reconcileCredits` in @loan-pilot/domain for how the two
 * repayment paths are merged without double-counting settlements.
 */

/** The loan fields the reports need. Kept narrow so the query stays cheap. */
export interface ReportLoanRow {
  readonly id: string;
  readonly borrowerId: string;
  readonly status: LoanStatusValue;
  readonly total: Cents;
  readonly principal: Cents;
  readonly financeCharge: Cents;
  readonly instalmentsTotal: number;
  readonly disbursedAt: Date | null;
  readonly closedAt: Date | null;
}

export interface ReportPaymentRow {
  readonly loanId: string;
  readonly paidAt: Date;
  readonly amount: Cents;
  readonly method: PaymentMethodValue;
}

export interface ReportScheduleRow {
  readonly loanId: string;
  readonly amount: Cents;
  readonly paidAt: Date | null;
  readonly status: `${RepaymentStatus}`;
}

/** A loan with its reconciled credit history and derived closure date. */
export interface LoanLedger<TLoan extends ReportLoanRow = ReportLoanRow> {
  readonly loan: TLoan;
  readonly credits: readonly LoanCredit[];
  /** When the loan left the book, derived where `closedAt` was never written. */
  readonly closedAt: Date | null;
  readonly schedule: readonly ScheduledInstalment[];
}

/**
 * Join loans to their payments and paid schedule items, producing one ledger per
 * loan. Grouping is done in memory (two passes over the child rows) rather than
 * with per-loan queries, so the whole report costs three queries regardless of
 * book size.
 */
export const buildLedgers = <TLoan extends ReportLoanRow>({
  loans,
  payments,
  scheduleItems,
}: {
  readonly loans: readonly TLoan[];
  readonly payments: readonly ReportPaymentRow[];
  readonly scheduleItems: readonly ReportScheduleRow[];
}): Map<string, LoanLedger<TLoan>> => {
  const paymentsByLoan = new Map<string, ReportPaymentRow[]>();
  for (const payment of payments) {
    const bucket = paymentsByLoan.get(payment.loanId);
    if (bucket) {
      bucket.push(payment);
    } else {
      paymentsByLoan.set(payment.loanId, [payment]);
    }
  }

  const itemsByLoan = new Map<string, ReportScheduleRow[]>();
  for (const item of scheduleItems) {
    if (item.status !== RepaymentStatus.Paid) {
      continue;
    }
    const bucket = itemsByLoan.get(item.loanId);
    if (bucket) {
      bucket.push(item);
    } else {
      itemsByLoan.set(item.loanId, [item]);
    }
  }

  const ledgers = new Map<string, LoanLedger<TLoan>>();
  for (const loan of loans) {
    const credits = reconcileCredits({
      payments: (paymentsByLoan.get(loan.id) ?? []).map((payment) => ({
        paidAt: payment.paidAt,
        amountCents: payment.amount,
        method: payment.method,
      })),
      paidScheduleItems: (itemsByLoan.get(loan.id) ?? []).map((item) => ({
        paidAt: item.paidAt,
        amountCents: item.amount,
      })),
    });
    ledgers.set(loan.id, {
      loan,
      credits,
      closedAt: effectiveClosedAt(loan, credits),
      schedule: loan.disbursedAt
        ? impliedSchedule({
            disbursedAt: loan.disbursedAt,
            instalmentsTotal: loan.instalmentsTotal,
            totalCents: loan.total,
          })
        : [],
    });
  }
  return ledgers;
};

/** What is still owed on a loan at `asOf`, floored at zero. */
export const outstandingAt = (ledger: LoanLedger, asOf: Date): Cents =>
  Math.max(0, ledger.loan.total - creditsUpTo(ledger.credits, asOf));

/**
 * Whether a loan counts towards the book at `asOf`.
 *
 * Cancelled loans never advanced funds, so they are off the book at every date.
 * A loan is on the book from disbursement until it closes, and the zero-balance
 * check catches settled loans whose `closedAt` was never written by the service
 * that closed them.
 */
export const onBookAt = (ledger: LoanLedger, asOf: Date): boolean => {
  const { loan, closedAt } = ledger;
  if (loan.status === LoanStatus.Cancelled || !loan.disbursedAt) {
    return false;
  }
  if (loan.disbursedAt.getTime() >= asOf.getTime()) {
    return false;
  }
  if (closedAt !== null && closedAt.getTime() <= asOf.getTime()) {
    return false;
  }
  return outstandingAt(ledger, asOf) > 0;
};

/** Total value of the loan book at `asOf`. */
export const bookValueAt = (ledgers: Iterable<LoanLedger>, asOf: Date): Cents => {
  const state = { total: 0 };
  for (const ledger of ledgers) {
    if (onBookAt(ledger, asOf)) {
      state.total += outstandingAt(ledger, asOf);
    }
  }
  return state.total;
};

/** Every loan on the book at `asOf`, with what it owes and how late it is. */
export interface BookEntry<TLoan extends ReportLoanRow = ReportLoanRow> {
  readonly ledger: LoanLedger<TLoan>;
  readonly outstandingCents: Cents;
  readonly ageing: AgeingResult;
}

export const bookAt = <TLoan extends ReportLoanRow>(
  ledgers: Iterable<LoanLedger<TLoan>>,
  asOf: Date,
): BookEntry<TLoan>[] => {
  const entries: BookEntry<TLoan>[] = [];
  for (const ledger of ledgers) {
    if (!onBookAt(ledger, asOf)) {
      continue;
    }
    entries.push({
      ledger,
      outstandingCents: outstandingAt(ledger, asOf),
      ageing: ageAt({
        schedule: ledger.schedule,
        amountRepaidCents: creditsUpTo(ledger.credits, asOf),
        asOf,
      }),
    });
  }
  return entries;
};

/** Credits received within `[start, end)`, across every loan. */
export const creditsInPeriod = (
  ledgers: Iterable<LoanLedger>,
  start: Date,
  end: Date,
): LoanCredit[] => {
  const collected: LoanCredit[] = [];
  for (const ledger of ledgers) {
    for (const credit of ledger.credits) {
      const at = credit.at.getTime();
      if (at >= start.getTime() && at < end.getTime()) {
        collected.push(credit);
      }
    }
  }
  return collected;
};

/**
 * Loans written off within `[start, end)`, valued at what they still owed when
 * they left the book — which is the figure the return's bad-debt movement wants.
 */
export const writeOffsInPeriod = <TLoan extends ReportLoanRow>(
  ledgers: Iterable<LoanLedger<TLoan>>,
  start: Date,
  end: Date,
): { readonly ledger: LoanLedger<TLoan>; readonly amountCents: Cents }[] => {
  const written: { ledger: LoanLedger<TLoan>; amountCents: Cents }[] = [];
  for (const ledger of ledgers) {
    const { loan, closedAt } = ledger;
    if (loan.status !== LoanStatus.WrittenOff || closedAt === null) {
      continue;
    }
    if (closedAt.getTime() >= start.getTime() && closedAt.getTime() < end.getTime()) {
      written.push({ ledger, amountCents: outstandingAt(ledger, closedAt) });
    }
  }
  return written;
};
