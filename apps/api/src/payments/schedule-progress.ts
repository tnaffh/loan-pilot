import { RepaymentStatus, daysBetween } from '@loan-pilot/domain';

export interface PaymentRow {
  readonly amount: number;
  readonly paidAt: Date;
}

export interface ScheduleRow {
  readonly id: string;
  readonly amount: number;
  readonly dueAt: Date;
  readonly status: string;
  readonly paidAt: Date | null;
}

export interface ScheduleRowChange {
  readonly id: string;
  readonly status: RepaymentStatus;
  readonly paidAt: Date | null;
}

export interface ScheduleProgress {
  readonly instalmentsPaid: number;
  readonly nextDueAt: Date | null;
  readonly daysLate: number;
  /** Only the rows whose status or paid date actually differ from what is stored. */
  readonly changedRows: readonly ScheduleRowChange[];
}

/** Null-safe timestamp equality, so unchanged rows are not rewritten. */
const sameTime = (a: Date | null, b: Date | null): boolean =>
  a === null || b === null ? a === b : a.getTime() === b.getTime();

/**
 * Derive schedule progress from a loan's payment history.
 *
 * Instalments are covered in order from the oldest payment forward: an instalment
 * counts as paid once cumulative receipts cover everything up to and including it,
 * and is dated by the payment that completed that cover. Coverage is therefore a
 * prefix — the count of paid instalments is the index of the first uncovered one.
 *
 * Pure and idempotent, so the same function serves both the live recompute and the
 * backfill that repairs loans recorded before schedule progress was derived here.
 */
export const deriveScheduleProgress = (
  schedule: readonly ScheduleRow[],
  payments: readonly PaymentRow[],
  now: Date = new Date(),
): ScheduleProgress => {
  // Running totals on both sides: what each instalment cumulatively requires, and
  // what the payments cumulatively provide. An instalment is covered by the first
  // payment whose running total reaches its threshold — which is also the payment
  // that dates it. Expressed as prefix sums to keep the walk free of mutable state.
  const required = schedule.reduce<number[]>(
    (acc, item) => [...acc, (acc[acc.length - 1] ?? 0) + item.amount],
    [],
  );
  const provided = payments.reduce<number[]>(
    (acc, payment) => [...acc, (acc[acc.length - 1] ?? 0) + payment.amount],
    [],
  );

  const resolved = schedule.map((item, index) => {
    const threshold = required[index] ?? 0;
    const coveredBy = provided.findIndex((total) => total >= threshold);
    const paid = coveredBy !== -1;
    return {
      id: item.id,
      paid,
      paidAt: paid ? (payments[coveredBy]?.paidAt ?? null) : null,
      status: paid
        ? RepaymentStatus.Paid
        : item.dueAt < now
          ? RepaymentStatus.Overdue
          : RepaymentStatus.Due,
      currentStatus: item.status,
      currentPaidAt: item.paidAt,
    };
  });

  const instalmentsPaid = resolved.filter((item) => item.paid).length;
  const firstUnpaid = schedule[instalmentsPaid];

  return {
    instalmentsPaid,
    nextDueAt: firstUnpaid?.dueAt ?? null,
    daysLate: firstUnpaid && firstUnpaid.dueAt < now ? daysBetween(firstUnpaid.dueAt, now) : 0,
    changedRows: resolved
      .filter(
        (item) => item.status !== item.currentStatus || !sameTime(item.paidAt, item.currentPaidAt),
      )
      .map(({ id, status, paidAt }) => ({ id, status, paidAt })),
  };
};
