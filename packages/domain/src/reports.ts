/**
 * Regulatory reporting: the period math and classification buckets behind the
 * NAMFISA quarterly COA return and the lender's monthly management report.
 *
 * Everything here is pure and framework-free so the same rules produce the
 * figures on the API and label them in the dashboard. The bucket definitions
 * mirror the NAMFISA form exactly — including the fact that it uses one set of
 * amount bands for values (Part 15) and a different, finer set for counts
 * (Part 7.2). Do not "tidy" them into one list.
 */

import { LoanPurpose, LoanStatus, LoanType, PaymentMethod } from './enums';
import { addMonths, daysBetween } from './dates';
import { splitInstalments, type Cents } from './money';

/**
 * The *values* of a domain enum, as they arrive from Prisma and over the wire.
 *
 * Prisma generates string-literal unions where the domain declares TypeScript
 * enums, and a string literal is not assignable to an enum member. Reporting
 * reads straight off the database, so it types those fields by value union —
 * still comparable to `LoanStatus.Active` and friends, with no casts.
 */
export type LoanStatusValue = `${LoanStatus}`;
export type LoanTypeValue = `${LoanType}`;
export type PaymentMethodValue = `${PaymentMethod}`;
export type LoanPurposeValue = `${LoanPurpose}`;

// ── Reporting periods ────────────────────────────────────────────────────────

/** A half-open period `[start, end)`. */
export interface DateRange {
  readonly start: Date;
  readonly end: Date;
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/** The `YYYY-MM` bucket key a date falls in (UTC). */
export const monthKeyOf = (date: Date): string =>
  `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;

/** Parse a `YYYY-MM` key, or null when malformed. */
export const parseMonthKey = (key: string): { year: number; month: number } | null => {
  const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(key.trim());
  return match ? { year: Number(match[1]), month: Number(match[2]) } : null;
};

/** The UTC `[start, end)` range of a `YYYY-MM` key, or null when malformed. */
export const monthRange = (key: string): DateRange | null => {
  const parsed = parseMonthKey(key);
  if (!parsed) {
    return null;
  }
  return {
    start: new Date(Date.UTC(parsed.year, parsed.month - 1, 1)),
    end: new Date(Date.UTC(parsed.year, parsed.month, 1)),
  };
};

/** Format a `YYYY-MM` key for display, e.g. "February 2026". */
export const formatMonthLabel = (key: string): string => {
  const parsed = parseMonthKey(key);
  return parsed ? `${MONTH_NAMES[parsed.month - 1] ?? key} ${parsed.year}` : key;
};

/** The `YYYY-Qn` calendar quarter a date falls in (UTC). */
export const quarterKeyOf = (date: Date): string =>
  `${date.getUTCFullYear()}-Q${Math.floor(date.getUTCMonth() / 3) + 1}`;

/** Parse a `YYYY-Qn` key, or null when malformed. */
export const parseQuarterKey = (key: string): { year: number; quarter: number } | null => {
  const match = /^(\d{4})-Q([1-4])$/.exec(key.trim().toUpperCase());
  return match ? { year: Number(match[1]), quarter: Number(match[2]) } : null;
};

/** The UTC `[start, end)` range of a `YYYY-Qn` key, or null when malformed. */
export const quarterRange = (key: string): DateRange | null => {
  const parsed = parseQuarterKey(key);
  if (!parsed) {
    return null;
  }
  return {
    start: new Date(Date.UTC(parsed.year, (parsed.quarter - 1) * 3, 1)),
    end: new Date(Date.UTC(parsed.year, parsed.quarter * 3, 1)),
  };
};

const DAY_MS = 86_400_000;

/**
 * The quarter's inclusive last day — the form's "Form End Date" (Q2 → 30 June).
 * Returns null when the key is malformed.
 */
export const quarterEndDate = (key: string): Date | null => {
  const range = quarterRange(key);
  return range ? new Date(range.end.getTime() - DAY_MS) : null;
};

/**
 * The filing deadline: the last day of the month after the quarter ends
 * (Q2 ending 30 June → 31 July), matching NAMFISA's "Form Due Date".
 */
export const quarterDueDate = (key: string): Date | null => {
  const parsed = parseQuarterKey(key);
  if (!parsed) {
    return null;
  }
  // First of the month two months after the quarter's last month, less a day.
  return new Date(Date.UTC(parsed.year, parsed.quarter * 3 + 1, 1) - DAY_MS);
};

/** Format a `YYYY-Qn` key for display, e.g. "Q2 2026". */
export const formatQuarterLabel = (key: string): string => {
  const parsed = parseQuarterKey(key);
  return parsed ? `Q${parsed.quarter} ${parsed.year}` : key;
};

/** The `count` most recent `YYYY-MM` keys, newest first, ending with `from`'s month. */
export const recentMonthKeys = (count: number, from: Date = new Date()): string[] =>
  Array.from({ length: Math.max(0, count) }, (_unused, index) =>
    monthKeyOf(new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() - index, 1))),
  );

/** The `count` most recent `YYYY-Qn` keys, newest first, ending with `from`'s quarter. */
export const recentQuarterKeys = (count: number, from: Date = new Date()): string[] =>
  Array.from({ length: Math.max(0, count) }, (_unused, index) =>
    quarterKeyOf(
      new Date(Date.UTC(from.getUTCFullYear(), Math.floor(from.getUTCMonth() / 3) * 3 - index * 3, 1)),
    ),
  );

// ── Amount bands ─────────────────────────────────────────────────────────────

/**
 * One column of a NAMFISA amount-band matrix. Bounds are integer cents and
 * `maxCents` is **inclusive**, so band 1 ends at N$10,000.00 exactly and band 2
 * starts at N$10,000.01 — the form's "N$1 – 10,000" / "N$10,001 – 20,000".
 */
export interface AmountBand {
  readonly key: string;
  readonly label: string;
  /** Compact form for narrow columns (PDF matrix headers). */
  readonly shortLabel: string;
  readonly minCents: Cents;
  /** Inclusive upper bound; null for the open-ended top band. */
  readonly maxCents: Cents | null;
}

const BAND_TO_10K: AmountBand = { key: 'to10k', label: 'N$1 – 10,000', shortLabel: 'N$1–10k', minCents: 1, maxCents: 1_000_000 };
const BAND_TO_20K: AmountBand = { key: 'to20k', label: 'N$10,001 – 20,000', shortLabel: 'N$10–20k', minCents: 1_000_001, maxCents: 2_000_000 };
const BAND_TO_30K: AmountBand = { key: 'to30k', label: 'N$20,001 – 30,000', shortLabel: 'N$20–30k', minCents: 2_000_001, maxCents: 3_000_000 };
const BAND_TO_40K: AmountBand = { key: 'to40k', label: 'N$30,001 – 40,000', shortLabel: 'N$30–40k', minCents: 3_000_001, maxCents: 4_000_000 };
const BAND_TO_50K: AmountBand = { key: 'to50k', label: 'N$40,001 – 50,000', shortLabel: 'N$40–50k', minCents: 4_000_001, maxCents: 5_000_000 };

/** Part 15 (3.4.7) — value matrices. Six bands; everything over N$50,000 in one. */
export const LOAN_VALUE_BANDS: readonly AmountBand[] = [
  BAND_TO_10K,
  BAND_TO_20K,
  BAND_TO_30K,
  BAND_TO_40K,
  BAND_TO_50K,
  { key: 'above50k', label: 'More than N$50,000', shortLabel: '> N$50k', minCents: 5_000_001, maxCents: null },
];

/** Part 7.2 — count matrices. Seven bands; the top of the value set is split at N$100,000. */
export const LOAN_COUNT_BANDS: readonly AmountBand[] = [
  BAND_TO_10K,
  BAND_TO_20K,
  BAND_TO_30K,
  BAND_TO_40K,
  BAND_TO_50K,
  { key: 'to100k', label: 'N$50,001 – 100,000', shortLabel: 'N$50–100k', minCents: 5_000_001, maxCents: 10_000_000 },
  { key: 'above100k', label: 'More than N$100,000', shortLabel: '> N$100k', minCents: 10_000_001, maxCents: null },
];

/** The band a cent amount falls in, or null when it is zero/negative. */
export const bandKeyFor = (bands: readonly AmountBand[], cents: Cents): string | null =>
  bands.find((band) => cents >= band.minCents && (band.maxCents === null || cents <= band.maxCents))
    ?.key ?? null;

// ── Term bands ───────────────────────────────────────────────────────────────

/**
 * A repayment-term column. The form labels the same buckets differently in the
 * financial part (Part 14, "Length of period from 6 months") and the
 * non-financial part (Part 7.1, "from 6 months < 12 months"), so both are kept.
 */
export interface TermBand {
  readonly key: string;
  readonly months: number;
  /** Part 14 wording. */
  readonly valueLabel: string;
  /** Part 7.1 wording. */
  readonly countLabel: string;
}

export const TERM_BANDS: readonly TermBand[] = [
  { key: 'm1', months: 1, valueLabel: '1 month', countLabel: '1 to 30 days' },
  { key: 'm2', months: 2, valueLabel: '2 months', countLabel: '2 months' },
  { key: 'm3', months: 3, valueLabel: '3 months', countLabel: '3 months' },
  { key: 'm4', months: 4, valueLabel: '4 months', countLabel: '4 months' },
  { key: 'm5', months: 5, valueLabel: '5 months', countLabel: '5 months' },
  { key: 'm6', months: 6, valueLabel: '6 months', countLabel: '6 to 11 months' },
  { key: 'm12', months: 12, valueLabel: '12 months', countLabel: '12 to 23 months' },
  { key: 'm24', months: 24, valueLabel: '24 months', countLabel: '24 to 35 months' },
  { key: 'm36', months: 36, valueLabel: '36 months', countLabel: '36 to 47 months' },
  { key: 'm48', months: 48, valueLabel: '48 months', countLabel: '48 to 59 months' },
  { key: 'm60', months: 60, valueLabel: '60 months', countLabel: '60 months and over' },
];

/**
 * The term band a loan falls in. Terms of 1–5 months map to their exact column;
 * longer terms fall into the band they reach but do not exceed (an 8-month loan
 * is reported under "6 months", a 14-month loan under "12 months").
 */
export const termBandKeyFor = (months: number): string => {
  const match = [...TERM_BANDS].reverse().find((band) => months >= band.months);
  return match?.key ?? 'm1';
};

// ── Arrears ageing ───────────────────────────────────────────────────────────

export interface AgeingBucket {
  readonly key: string;
  readonly label: string;
  readonly minDays: number;
  /** Inclusive upper bound in days; null for the open-ended bucket. */
  readonly maxDays: number | null;
}

/** Part 14's closing-book split. "Current" means less than 30 days past due. */
export const AGEING_BUCKETS: readonly AgeingBucket[] = [
  { key: 'current', label: 'Current', minDays: 0, maxDays: 29 },
  { key: 'd30', label: 'In arrears 30 – 60 days', minDays: 30, maxDays: 59 },
  { key: 'd60', label: 'In arrears 60 – 90 days', minDays: 60, maxDays: 89 },
  { key: 'd90', label: 'In arrears 90 – 120 days', minDays: 90, maxDays: 119 },
  { key: 'd120', label: 'In arrears more than 120 days', minDays: 120, maxDays: null },
];

/** The ageing bucket for a number of days past due. */
export const ageingBucketFor = (daysLate: number): string => {
  const days = Math.max(0, daysLate);
  return (
    AGEING_BUCKETS.find(
      (bucket) => days >= bucket.minDays && (bucket.maxDays === null || days <= bucket.maxDays),
    )?.key ?? 'current'
  );
};

// ── Normalisation ────────────────────────────────────────────────────────────

/** The gender split the return reports on. `unknown` covers borrowers with none recorded. */
export type ReportGender = 'male' | 'female' | 'other' | 'unknown';

export const REPORT_GENDERS: readonly ReportGender[] = ['male', 'female', 'other', 'unknown'];

/**
 * Normalise a stored gender to the reporting split. Tolerant of the casing
 * variations in imported registers ("MALE", "Female") and treats blank/absent
 * as `unknown` rather than silently folding it into a reported category.
 */
export const normaliseGender = (raw: string | null | undefined): ReportGender => {
  const value = (raw ?? '').trim().toLowerCase();
  if (value === 'male' || value === 'm') {
    return 'male';
  }
  if (value === 'female' || value === 'f') {
    return 'female';
  }
  return value.length === 0 ? 'unknown' : 'other';
};

/** Part 7.3's collection methods. */
export type CollectionMethod = 'payroll' | 'debit_order' | 'cash' | 'other';

export const COLLECTION_METHOD_LABELS: Record<CollectionMethod, string> = {
  payroll: 'Payroll deduction',
  debit_order: 'Debit order deduction',
  cash: 'Cash collection',
  other: 'Other methods of collection',
};

/** Map a recorded payment method onto the four the return recognises. */
export const namfisaCollectionMethod = (method: PaymentMethodValue): CollectionMethod => {
  if (method === PaymentMethod.Payroll) {
    return 'payroll';
  }
  if (method === PaymentMethod.DebitOrder) {
    return 'debit_order';
  }
  return method === PaymentMethod.Cash ? 'cash' : 'other';
};

export const LOAN_PURPOSE_LABELS: Record<LoanPurpose, string> = {
  [LoanPurpose.Business]: 'Business',
  [LoanPurpose.Housing]: 'Housing',
  [LoanPurpose.Education]: 'Education',
  [LoanPurpose.Furniture]: 'Furniture',
  [LoanPurpose.Consumption]: 'Consumption',
  [LoanPurpose.Other]: 'Other uses',
};

/**
 * The purpose to report for a loan that predates the purpose field (imported
 * and historical rows). Business loans report as business; everything else is
 * consumption, which is what a payday or collateral advance is.
 */
export const purposeFallbackForLoanType = (type: LoanTypeValue): LoanPurpose =>
  type === LoanType.Business ? LoanPurpose.Business : LoanPurpose.Consumption;

/** Loan statuses that are still on the book (not cancelled, settled or written off). */
export const OPEN_LOAN_STATUSES: readonly LoanStatusValue[] = [
  LoanStatus.Active,
  LoanStatus.Arrears,
  LoanStatus.PartlyPaid,
];

/** True while a loan is still on the active book. */
export const isOpenLoanStatus = (status: LoanStatusValue): boolean =>
  OPEN_LOAN_STATUSES.includes(status);

// ── Historical reconstruction ────────────────────────────────────────────────

/** Money credited to a loan at a point in time, from either repayment path. */
export interface LoanCredit {
  readonly at: Date;
  readonly amountCents: Cents;
  /** null for schedule-derived credits, whose collection method was never recorded. */
  readonly method: PaymentMethodValue | null;
}

/**
 * Merge a loan's two repayment records into one credit ledger.
 *
 * Three writers touch repayment state, and they disagree:
 *   - `PaymentsService.create` writes a Payment row and no schedule row;
 *   - `LoansService.recordRepayment` marks a schedule item paid and writes no Payment row;
 *   - `LoansService.settle` writes both, using the *same* `paidAt` instant for each.
 *
 * So a paid schedule item is genuine new money **unless** a payment on the same
 * loan shares its exact timestamp, which only happens inside `settle`. Matching
 * on the instant — rather than taking the larger of the two totals — is what
 * makes a loan repaid through both dashboard paths add up instead of collapsing
 * to whichever side happened to be bigger.
 */
export const reconcileCredits = ({
  payments,
  paidScheduleItems,
}: {
  readonly payments: readonly {
    readonly paidAt: Date;
    readonly amountCents: Cents;
    readonly method: PaymentMethodValue;
  }[];
  readonly paidScheduleItems: readonly { readonly paidAt: Date | null; readonly amountCents: Cents }[];
}): LoanCredit[] => {
  const paymentInstants: ReadonlySet<number> = new Set(
    payments.map((payment) => payment.paidAt.getTime()),
  );
  const fromPayments = payments.map((payment) => ({
    at: payment.paidAt,
    amountCents: payment.amountCents,
    method: payment.method,
  }));
  const fromSchedule = paidScheduleItems
    .filter((item): item is { paidAt: Date; amountCents: Cents } => item.paidAt !== null)
    // Settle's bookkeeping duplicate — the payment already carries this money.
    .filter((item) => !paymentInstants.has(item.paidAt.getTime()))
    .map((item) => ({ at: item.paidAt, amountCents: item.amountCents, method: null }));

  return [...fromPayments, ...fromSchedule].sort((a, b) => a.at.getTime() - b.at.getTime());
};

/** Total credited to a loan strictly before `asOf`. */
export const creditsUpTo = (credits: readonly LoanCredit[], asOf: Date): Cents =>
  credits.reduce(
    (sum, credit) => (credit.at.getTime() < asOf.getTime() ? sum + credit.amountCents : sum),
    0,
  );

/**
 * When a loan actually left the book.
 *
 * `closedAt` is authoritative when set, but only `settle()` and `writeOff()`
 * set it — `recordRepayment`, `PaymentsService.recomputeLoan` and the register
 * import all leave it null on loans they close. For those, the last money that
 * moved is the closure date; a terminal loan with no credits at all falls back
 * to its disbursement date so it does not linger on the book forever.
 */
export const effectiveClosedAt = (
  loan: {
    readonly status: LoanStatusValue;
    readonly closedAt: Date | null;
    readonly disbursedAt: Date | null;
  },
  credits: readonly LoanCredit[],
): Date | null => {
  if (loan.closedAt) {
    return loan.closedAt;
  }
  const terminal =
    loan.status === LoanStatus.Settled ||
    loan.status === LoanStatus.Closed ||
    loan.status === LoanStatus.WrittenOff;
  if (!terminal) {
    return null;
  }
  const last = credits.reduce<Date | null>(
    (latest, credit) => (latest === null || credit.at.getTime() > latest.getTime() ? credit.at : latest),
    null,
  );
  return last ?? loan.disbursedAt;
};

export interface ScheduledInstalment {
  readonly number: number;
  readonly dueAt: Date;
  readonly amountCents: Cents;
}

/**
 * Rebuild a loan's instalment schedule from its own terms, rather than reading
 * `RepaymentScheduleItem` rows.
 *
 * This is deliberate: imported loans carry no schedule rows at all, and stored
 * rows go stale because the two repayment paths do not both maintain them. The
 * loan's own disbursement date, instalment count and total are always present,
 * so deriving from them is the only method that works uniformly across the book.
 */
export const impliedSchedule = ({
  disbursedAt,
  instalmentsTotal,
  totalCents,
}: {
  readonly disbursedAt: Date;
  readonly instalmentsTotal: number;
  readonly totalCents: Cents;
}): ScheduledInstalment[] => {
  const count = Math.max(1, Math.round(instalmentsTotal));
  return splitInstalments(totalCents, count).map((amountCents, index) => ({
    number: index + 1,
    dueAt: addMonths(disbursedAt, index + 1),
    amountCents,
  }));
};

export interface AgeingResult {
  /** Still owed against the schedule at `asOf`, floored at zero. */
  readonly outstandingCents: Cents;
  /** Days past due of the *earliest* instalment still short at `asOf`. */
  readonly daysLate: number;
  /** The shortfall across every instalment already due at `asOf`. */
  readonly overdueCents: Cents;
}

/**
 * Age a loan at a point in time by allocating everything repaid against the
 * schedule in due order. The earliest instalment left short sets `daysLate`,
 * which is what the ageing buckets key off.
 */
export const ageAt = ({
  schedule,
  amountRepaidCents,
  asOf,
}: {
  readonly schedule: readonly ScheduledInstalment[];
  readonly amountRepaidCents: Cents;
  readonly asOf: Date;
}): AgeingResult => {
  const scheduledTotal = schedule.reduce((sum, item) => sum + item.amountCents, 0);
  const repaid = Math.max(0, Math.min(amountRepaidCents, scheduledTotal));
  // `const` object rather than reassigned locals — the project bans `let`.
  const state = { unallocated: repaid, overdue: 0, daysLate: 0 };

  for (const item of schedule) {
    const covered = Math.min(state.unallocated, item.amountCents);
    state.unallocated -= covered;
    const shortfall = item.amountCents - covered;
    if (shortfall > 0 && item.dueAt.getTime() < asOf.getTime()) {
      state.overdue += shortfall;
      state.daysLate = Math.max(state.daysLate, daysBetween(item.dueAt, asOf));
    }
  }

  return {
    outstandingCents: scheduledTotal - repaid,
    daysLate: state.daysLate,
    overdueCents: state.overdue,
  };
};

// ── Operator-supplied figures ────────────────────────────────────────────────

/** Whether a manual field is a money amount (captured in N$) or a plain count. */
export type ManualFieldKind = 'money' | 'count';

export interface ManualField {
  readonly key: string;
  readonly label: string;
  /** The form part the figure belongs to, for grouping the edit form. */
  readonly part: string;
  readonly kind: ManualFieldKind;
  readonly hint?: string;
}

/**
 * The return's fields that the loan register cannot answer — complaints, branch
 * counts, provisioning judgements and the accounting liabilities that live in
 * the general ledger, not here. They are captured once per quarter and saved so
 * the return is complete and reproducible.
 *
 * Money fields are captured in whole N$ and stored as cents like everything else.
 */
export const NAMFISA_MANUAL_FIELDS: readonly ManualField[] = [
  // Part 7.1 — complaints statistics
  { key: 'complaintsLodged', label: 'Complaints lodged', part: 'Part 7.1 — Complaints', kind: 'count' },
  { key: 'complaintsForEntity', label: 'Resolved in favour of the regulated entity', part: 'Part 7.1 — Complaints', kind: 'count' },
  { key: 'complaintsForComplainant', label: 'Resolved in favour of the complainant', part: 'Part 7.1 — Complaints', kind: 'count' },
  { key: 'complaintsUnresolved', label: 'Unresolved complaints', part: 'Part 7.1 — Complaints', kind: 'count' },

  // Part 14 — bad-debt provisioning and rescheduling
  {
    key: 'openingBadDebtProvision',
    label: 'Provision for bad debts, beginning of period',
    part: 'Part 14 — Bad debts & rescheduling',
    kind: 'money',
    hint: 'Carried from the previous quarter’s closing provision.',
  },
  {
    key: 'badDebtProvisionRaised',
    label: 'Provision for bad debts raised during the period',
    part: 'Part 14 — Bad debts & rescheduling',
    kind: 'money',
  },
  {
    key: 'rescheduledValue',
    label: 'Value of loans rescheduled during the period',
    part: 'Part 14 — Bad debts & rescheduling',
    kind: 'money',
    hint: 'LoanPilot does not yet model rescheduling, so this is captured by hand.',
  },
  {
    key: 'rescheduledCount',
    label: 'Number of loans rescheduled',
    part: 'Part 14 — Bad debts & rescheduling',
    kind: 'count',
  },

  // Part 7.3 — outlets and other business
  { key: 'outlets', label: 'Number of outlets (branches)', part: 'Part 7.3 — Operations', kind: 'count' },
  { key: 'businessSaleOfFurniture', label: 'Involvement: sale of furniture', part: 'Part 7.3 — Operations', kind: 'count' },
  { key: 'businessCashConverting', label: 'Involvement: cash converting', part: 'Part 7.3 — Operations', kind: 'count' },
  { key: 'businessInsurance', label: 'Involvement: insurance', part: 'Part 7.3 — Operations', kind: 'count' },
  { key: 'businessDebtCollection', label: 'Involvement: debt collection', part: 'Part 7.3 — Operations', kind: 'count' },

  // Part D3 — other income
  { key: 'badDebtsRecovered', label: 'Bad debts recovered', part: 'Part D3 — Other income', kind: 'money' },
  { key: 'otherIncomeAdjustment', label: 'Other income not recorded in LoanPilot', part: 'Part D3 — Other income', kind: 'money' },

  // Part 1.1 — current liabilities from the general ledger
  { key: 'liabilityStaffCosts', label: 'Staff costs payable', part: 'Part 1.1 — Current liabilities', kind: 'money' },
  { key: 'liabilityExternalAudit', label: 'External audit fees payable', part: 'Part 1.1 — Current liabilities', kind: 'money' },
  { key: 'liabilityNamfisaPenalties', label: 'NAMFISA penalties payable', part: 'Part 1.1 — Current liabilities', kind: 'money' },
  { key: 'liabilityTransactionLevy', label: 'Transaction levy payable', part: 'Part 1.1 — Current liabilities', kind: 'money' },
  { key: 'liabilityVat', label: 'VAT payable', part: 'Part 1.1 — Current liabilities', kind: 'money' },
  { key: 'liabilityAccruedExpenses', label: 'Accrued expenses', part: 'Part 1.1 — Current liabilities', kind: 'money' },
  { key: 'liabilitySundryCreditors', label: 'Sundry creditors / suppliers', part: 'Part 1.1 — Current liabilities', kind: 'money' },
  { key: 'liabilityIncomeTax', label: 'Income tax liability', part: 'Part 1.1 — Current liabilities', kind: 'money' },
];

const MANUAL_FIELD_KEYS: ReadonlySet<string> = new Set(
  NAMFISA_MANUAL_FIELDS.map((field) => field.key),
);

/** Narrow an arbitrary string to a known manual-figure key. */
export const isManualFieldKey = (value: string): boolean => MANUAL_FIELD_KEYS.has(value);

/** Money manual fields are stored in cents; counts are stored as-is. */
export const isManualMoneyField = (key: string): boolean =>
  NAMFISA_MANUAL_FIELDS.find((field) => field.key === key)?.kind === 'money';

/** Operator-supplied figures, keyed by {@link NAMFISA_MANUAL_FIELDS} key. */
export type RegulatoryFigures = Record<string, number>;

/** Read a figure, defaulting absent entries to zero. */
export const figure = (figures: RegulatoryFigures, key: string): number => figures[key] ?? 0;

// ── Report payloads ──────────────────────────────────────────────────────────

export interface ReportPeriodInfo {
  readonly key: string;
  readonly label: string;
  /** Inclusive first day, `YYYY-MM-DD`. */
  readonly startDate: string;
  /** Inclusive last day, `YYYY-MM-DD`. */
  readonly endDate: string;
  /** Filing deadline for quarterly periods; null for months. */
  readonly dueDate: string | null;
}

export interface ReportLender {
  readonly name: string;
  readonly licenceNo: string | null;
}

/** One row of a gender × band matrix. `bands` is keyed by {@link AmountBand.key}. */
export interface BandedRow {
  readonly bands: Record<string, number>;
  readonly total: number;
}

export interface BandedMatrix {
  readonly bands: readonly AmountBand[];
  readonly male: BandedRow;
  readonly female: BandedRow;
  readonly other: BandedRow;
  readonly unknown: BandedRow;
  readonly total: BandedRow;
}

export interface TermBucket {
  readonly key: string;
  readonly label: string;
  readonly months: number;
  readonly value: number;
}

export interface LabelledValue {
  readonly key: string;
  readonly label: string;
  readonly value: number;
}

/** Part 14 (3.4.6) — additional financial information. */
export interface QuarterlyFinancialPart {
  readonly openingBookValue: Cents;
  readonly closingBookValue: Cents;
  readonly disbursedTotal: Cents;
  readonly disbursementsByTerm: readonly TermBucket[];
  readonly feesCharged: {
    readonly namfisaLevies: Cents;
    readonly stampDuties: Cents;
    readonly insurance: Cents;
    readonly otherFees: Cents;
    readonly total: Cents;
  };
  readonly interestOnOutstanding: Cents;
  readonly repayments: {
    readonly payroll: Cents;
    readonly debitOrder: Cents;
    readonly cash: Cents;
    readonly other: Cents;
    readonly total: Cents;
  };
  readonly badDebts: {
    readonly openingProvision: Cents;
    readonly writtenOffInPeriod: Cents;
    readonly provisionRaised: Cents;
    readonly closingProvision: Cents;
  };
  readonly rescheduledValue: Cents;
  readonly ageing: readonly LabelledValue[];
}

/** Parts 7.1 and 7.3 — non-financial information. */
export interface QuarterlyNonFinancialPart {
  readonly complaints: {
    readonly lodged: number;
    readonly resolved: number;
    readonly forEntity: number;
    readonly forComplainant: number;
    readonly unresolved: number;
  };
  readonly debtorsOutstanding: number;
  readonly loansDisbursed: number;
  readonly activeClients: number;
  readonly loansOutstanding: { readonly current: number; readonly arrears: number; readonly total: number };
  readonly disbursementsByTerm: readonly TermBucket[];
  readonly loansByPurpose: readonly LabelledValue[];
  readonly loansByCollectionMethod: readonly LabelledValue[];
  readonly writtenOffCount: number;
  readonly rescheduledCount: number;
  readonly security: { readonly secured: number; readonly unsecured: number };
  readonly outlets: number;
  readonly otherBusiness: readonly LabelledValue[];
}

/**
 * How far the derived book value agrees with the sum of stored loan balances.
 * A non-zero variance means the two repayment paths have diverged on some loan;
 * it is reported rather than hidden.
 */
export interface BookReconciliation {
  readonly derived: Cents;
  readonly stored: Cents;
  readonly variance: Cents;
}

/** How much of the period's data can actually answer the gender/purpose splits. */
export interface ReportCoverage {
  readonly loansInPeriod: number;
  readonly loansMissingGender: number;
  readonly loansMissingPurpose: number;
}

/**
 * A caveat the report carries about its own completeness. Computed server-side
 * so the on-screen banner and the PDF worksheet's footnotes say the same thing —
 * a return that discloses its own gaps is defensible; one that hides them is not.
 */
export interface ReportWarning {
  readonly code:
    | 'gender_coverage'
    | 'purpose_coverage'
    | 'reschedule_unmodelled'
    | 'unreconciled_repayments'
    | 'book_reconciliation'
    | 'income_basis'
    | 'manual_missing';
  readonly severity: 'warning' | 'info';
  readonly message: string;
}

export interface QuarterlyReturn {
  readonly period: ReportPeriodInfo;
  readonly lender: ReportLender;
  readonly financial: QuarterlyFinancialPart;
  /**
   * Part 15 (3.4.7) — values in cents.
   *
   * The two matrices count different things, which the lender's approved
   * 2026-Q1 filing makes explicit: `loansByGender` sums one row per **loan**
   * disbursed in the quarter, banded by loan amount, while `salariesByGender`
   * sums one row per **distinct borrower**, banded by that borrower's salary.
   * In that filing the loan matrix totalled 61 rows and the salary matrix 56 —
   * five borrowers took a second loan. Do not derive one from the other.
   */
  readonly valueMatrices: {
    readonly loansByGender: BandedMatrix;
    readonly salariesByGender: BandedMatrix;
  };
  readonly nonFinancial: QuarterlyNonFinancialPart;
  /** Part 7.2 — the same two populations as {@link valueMatrices}, counted. */
  readonly countMatrices: {
    readonly loansByGender: BandedMatrix;
    readonly salariesByGender: BandedMatrix;
  };
  /** Part D3 — other income. */
  readonly income: {
    readonly interestOnLoans: Cents;
    readonly defaultInterest: Cents;
    readonly badDebtsRecovered: Cents;
    readonly otherIncome: Cents;
    readonly total: Cents;
  };
  /** Part 1.1 — current liabilities. */
  readonly liabilities: {
    readonly namfisaLevy: Cents;
    readonly stampDuty: Cents;
    readonly other: readonly LabelledValue[];
    readonly total: Cents;
  };
  readonly manual: RegulatoryFigures;
  readonly reconciliation: BookReconciliation;
  readonly coverage: ReportCoverage;
  readonly warnings: readonly ReportWarning[];
}

export interface MonthlyReportLoanRow {
  readonly loanId: string;
  readonly clientNo: string | null;
  readonly borrowerName: string;
  readonly idNumber: string;
  readonly phone: string;
  readonly gender: ReportGender;
  readonly monthlyIncome: Cents;
  readonly principal: Cents;
  readonly financeCharge: Cents;
  readonly interestRate: number;
  readonly bankCharges: Cents;
  readonly namfisaLevy: Cents;
  readonly stampDuty: Cents;
  readonly insurance: Cents;
  readonly total: Cents;
  readonly instalment: Cents;
  readonly termMonths: number;
  readonly balance: Cents;
  readonly status: LoanStatusValue;
  readonly disbursedAt: string | null;
}

export interface MonthlyReportSummary {
  readonly openingBookValue: Cents;
  readonly closingBookValue: Cents;
  readonly loansDisbursed: number;
  readonly disbursedValue: Cents;
  readonly interestBooked: Cents;
  readonly expectedRepayable: Cents;
  readonly collected: Cents;
  readonly collectionsByMethod: readonly LabelledValue[];
  readonly expenses: Cents;
  readonly drawings: Cents;
  readonly otherIncome: Cents;
  readonly capitalIn: Cents;
  readonly namfisaLevies: Cents;
  readonly stampDuties: Cents;
  readonly insurance: Cents;
  readonly bankCharges: Cents;
  readonly availableFunds: Cents;
  readonly totalCapital: Cents;
  readonly arrearsLoans: number;
  readonly arrearsValue: Cents;
  /** Collected − disbursed − operating expenses for the month. */
  readonly netCashMovement: Cents;
}

export interface MonthlyReport {
  readonly period: ReportPeriodInfo;
  readonly lender: ReportLender;
  readonly summary: MonthlyReportSummary;
  readonly loans: readonly MonthlyReportLoanRow[];
  readonly expenseBreakdown: readonly LabelledValue[];
  readonly reconciliation: BookReconciliation;
  readonly warnings: readonly ReportWarning[];
}

/**
 * Borrowers whose gender is not recorded, so the operator can clear the backlog
 * that keeps Parts 15 and 7.2 under-reporting. Gender is only captured at intake
 * from now on; every borrower predating that needs correcting by hand.
 */
export interface ReportDataQuality {
  readonly borrowersTotal: number;
  readonly borrowersMissingGender: number;
  /** A capped list to work through, newest borrower first. */
  readonly sample: readonly {
    readonly id: string;
    readonly name: string;
    readonly idNumber: string;
  }[];
}

/** The month and quarter keys a tenant has data for, newest first. */
export interface AvailablePeriods {
  readonly months: readonly { readonly key: string; readonly label: string }[];
  readonly quarters: readonly { readonly key: string; readonly label: string }[];
}
