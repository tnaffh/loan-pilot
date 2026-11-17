import {
  InterestMethod,
  LoanStatus,
  RepaymentStatus,
  addMonths,
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
  /** Remainder waived when the loan was settled (0 when none). */
  readonly waived: Cents;
  /** How the loan is calculated; absent = payday. */
  readonly interestMethod?: string;
  /**
   * Monthly-renewal loans: each renewal charge and the date it was added.
   * `total` includes them all, so a past balance backs the later ones out.
   */
  readonly renewals?: readonly ReportRenewalRow[];
}

export interface ReportRenewalRow {
  readonly renewedAt: Date;
  readonly charge: Cents;
  readonly newDueAt: Date;
}

/** A stored instalment of a term loan (its schedule is not an equal split). */
export interface ReportTermScheduleRow {
  readonly loanId: string;
  readonly number: number;
  readonly dueAt: Date;
  readonly amount: Cents;
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
  termSchedules = [],
}: {
  readonly loans: readonly TLoan[];
  readonly payments: readonly ReportPaymentRow[];
  readonly scheduleItems: readonly ReportScheduleRow[];
  /** Stored schedules of term loans; every other loan's schedule is implied. */
  readonly termSchedules?: readonly ReportTermScheduleRow[];
}): Map<string, LoanLedger<TLoan>> => {
  const termRowsByLoan = new Map<string, ReportTermScheduleRow[]>();

  for (const row of termSchedules) {
    const bucket = termRowsByLoan.get(row.loanId);

    if (bucket) {
      bucket.push(row);
    } else {
      termRowsByLoan.set(row.loanId, [row]);
    }
  }

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

    // A term loan's instalments are not an equal split of its total, so its
    // stored schedule is used. Payday loans keep the implied schedule (imported
    // loans have no rows at all); monthly-renewal loans are aged by `scheduleAt`.
    const termRows =
      loan.interestMethod === InterestMethod.TermLoan ? (termRowsByLoan.get(loan.id) ?? []) : [];
    const implied = loan.disbursedAt
      ? impliedSchedule({
          disbursedAt: loan.disbursedAt,
          instalmentsTotal: loan.instalmentsTotal,
          totalCents: loan.total,
        })
      : [];

    ledgers.set(loan.id, {
      loan,
      credits,
      closedAt: effectiveClosedAt(loan, credits),
      schedule:
        termRows.length > 0
          ? [...termRows]
              .sort((a, b) => a.number - b.number)
              .map((row) => ({ number: row.number, dueAt: row.dueAt, amountCents: row.amount }))
          : implied,
    });
  }

  return ledgers;
};

/** Renewal charges added to a monthly-renewal loan on or after `asOf` (0 for other loans). */
export const renewalChargesAfter = (loan: ReportLoanRow, asOf: Date): Cents =>
  (loan.renewals ?? []).reduce(
    (sum, renewal) => (renewal.renewedAt.getTime() >= asOf.getTime() ? sum + renewal.charge : sum),
    0,
  );

/** Renewal charges added within `[start, end)`, across every loan. */
export const renewalChargesInPeriod = (
  ledgers: Iterable<LoanLedger>,
  start: Date,
  end: Date,
): Cents => {
  const state = { total: 0 };

  for (const { loan } of ledgers) {
    for (const renewal of loan.renewals ?? []) {
      const at = renewal.renewedAt.getTime();

      if (at >= start.getTime() && at < end.getTime()) {
        state.total += renewal.charge;
      }
    }
  }

  return state.total;
};

/** A loan's total repayable as it stood at `asOf` (later renewals backed out). */
export const totalAt = (loan: ReportLoanRow, asOf: Date): Cents =>
  loan.total - renewalChargesAfter(loan, asOf);

/**
 * The schedule a loan was on at `asOf`. A monthly-renewal loan has one
 * instalment — everything owed — due on the due date in force at that time.
 */
const scheduleAt = (ledger: LoanLedger, asOf: Date): readonly ScheduledInstalment[] => {
  const { loan } = ledger;

  if (loan.interestMethod !== InterestMethod.MonthlyRenewal || !loan.disbursedAt) {
    return ledger.schedule;
  }

  const lastRenewal = (loan.renewals ?? [])
    .filter((renewal) => renewal.renewedAt.getTime() < asOf.getTime())
    .reduce<ReportRenewalRow | null>(
      (latest, renewal) =>
        latest === null || renewal.renewedAt.getTime() > latest.renewedAt.getTime()
          ? renewal
          : latest,
      null,
    );

  return [
    {
      number: 1,
      dueAt: lastRenewal ? lastRenewal.newDueAt : addMonths(loan.disbursedAt, 1),
      amountCents: totalAt(loan, asOf),
    },
  ];
};

/** What is still owed on a loan at `asOf`, floored at zero. */
export const outstandingAt = (ledger: LoanLedger, asOf: Date): Cents =>
  Math.max(0, totalAt(ledger.loan, asOf) - creditsUpTo(ledger.credits, asOf));

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
        schedule: scheduleAt(ledger, asOf),
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
 * Bad debt recognised within `[start, end)`: loans written off, valued at what
 * they still owed when they left the book, plus remainders waived when a loan
 * was settled (`Loan.waived`). Both are what the return's bad-debt movement
 * wants; a settled-with-waiver loan is the lender's way of saying "nearly all
 * repaid, the rest is bad debt" without branding the borrower a defaulter.
 */
export const writeOffsInPeriod = <TLoan extends ReportLoanRow>(
  ledgers: Iterable<LoanLedger<TLoan>>,
  start: Date,
  end: Date,
): { readonly ledger: LoanLedger<TLoan>; readonly amountCents: Cents }[] => {
  const written: { ledger: LoanLedger<TLoan>; amountCents: Cents }[] = [];

  for (const ledger of ledgers) {
    const { loan, closedAt } = ledger;

    if (closedAt === null) {
      continue;
    }

    if (closedAt.getTime() < start.getTime() || closedAt.getTime() >= end.getTime()) {
      continue;
    }

    if (loan.status === LoanStatus.WrittenOff) {
      written.push({ ledger, amountCents: outstandingAt(ledger, closedAt) });
    } else if (loan.status === LoanStatus.Settled && loan.waived > 0) {
      written.push({ ledger, amountCents: loan.waived });
    }
  }

  return written;
};
