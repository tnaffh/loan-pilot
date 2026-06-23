import type { Cents } from './money';
import { splitInstalments } from './money';
import { completeMonthsBetween, daysBetween } from './dates';
import { LoanType } from './enums';

/**
 * NAMFISA / Namibian Microlending Act, 2018 constraints used in pricing:
 * - The month-1 finance charge may not exceed 30% of the principal debt.
 * - The loan term covered by this product may not exceed 5 months.
 * - The monthly rate (term growth after month 1, and default interest on overdue
 *   instalments) may not exceed 5% per month.
 */
export const MAX_FINANCE_CHARGE_RATE = 0.3;
export const MAX_TERM_MONTHS = 5;
export const MAX_MONTHLY_RATE = 0.05;
/** @deprecated retained for the legacy capped penalty helper; use {@link assessArrears}. */
export const MAX_PENALTY_RATE_PER_MONTH = 0.05;
/** @deprecated default interest is no longer capped at 3 months. */
export const MAX_PENALTY_MONTHS = 3;

/** Default NAMFISA levy: 1.03% of the loan amount, remitted to NAMFISA annually. */
export const DEFAULT_NAMFISA_LEVY_RATE = 0.0103;
/** Default stamp duty: a flat N$5 per loan agreement (in cents). */
export const DEFAULT_STAMP_DUTY_CENTS = 500;

/** Default total finance-charge rate (of principal debt) by loan type. */
const FINANCE_CHARGE_RATE: Record<LoanType, number> = {
  [LoanType.Payday]: 0.3,
  [LoanType.Business]: 0.3,
  [LoanType.Collateral]: 0.25,
};

/**
 * The lender's fee configuration. Levies and insurance are expressed as a
 * fraction of the loan amount; stamp duty and the insurance flat component are
 * absolute cent amounts.
 */
export interface FeeSettings {
  /** NAMFISA levy as a fraction of the loan amount (e.g. 0.0103 = 1.03%). */
  readonly namfisaLevyRate: number;
  /** Flat stamp duty in cents. */
  readonly stampDutyCents: Cents;
  /** Insurance as a fraction of the loan amount (0 = off). */
  readonly insuranceRate: number;
  /** Flat insurance component in cents (0 = off). */
  readonly insuranceFlatCents: Cents;
  /** Monthly rate for term growth after month 1 and default interest (≤ 5%). */
  readonly monthlyRate: number;
}

/** Sensible defaults used until a lender configures its own fee settings. */
export const DEFAULT_FEE_SETTINGS: FeeSettings = {
  namfisaLevyRate: DEFAULT_NAMFISA_LEVY_RATE,
  stampDutyCents: DEFAULT_STAMP_DUTY_CENTS,
  insuranceRate: 0,
  insuranceFlatCents: 0,
  monthlyRate: MAX_MONTHLY_RATE,
};

/** The resolved per-loan fee amounts (all in cents). */
export interface LoanFees {
  readonly namfisaLevyCents: Cents;
  readonly stampDutyCents: Cents;
  readonly insuranceCents: Cents;
  readonly bankChargesCents: Cents;
}

/**
 * Resolve the absolute per-loan fee amounts from the lender's fee settings and
 * the loan amount. Bank charges are a flat, loan-specific add-on (not derived
 * from a rate), so they pass straight through.
 */
export const computeFees = (
  principalCents: Cents,
  settings: FeeSettings,
  bankChargesCents: Cents = 0,
): LoanFees => ({
  namfisaLevyCents: Math.round(principalCents * settings.namfisaLevyRate),
  stampDutyCents: settings.stampDutyCents,
  insuranceCents: Math.round(principalCents * settings.insuranceRate) + settings.insuranceFlatCents,
  bankChargesCents,
});

export interface ScheduleItem {
  readonly number: number;
  readonly amountCents: Cents;
}

export interface LoanQuote {
  /** The cash advanced to the borrower. */
  readonly principalCents: Cents;
  readonly namfisaLevyCents: Cents;
  readonly stampDutyCents: Cents;
  readonly insuranceCents: Cents;
  readonly bankChargesCents: Cents;
  /** principal + stamp duty + insurance + NAMFISA levy — the interest-bearing base. */
  readonly principalDebtCents: Cents;
  /** The interest rate actually applied (after the NAMFISA cap). */
  readonly interestRate: number;
  /** Interest = interestRate × principal debt. */
  readonly financeChargeCents: Cents;
  /** principal debt + finance charge + bank charges. */
  readonly totalCents: Cents;
  readonly termMonths: number;
  readonly instalmentCents: Cents;
  readonly schedule: readonly ScheduleItem[];
}

export interface QuoteInput {
  /** The cash advanced to the borrower, in cents. */
  readonly principalCents: Cents;
  readonly termMonths: number;
  readonly type: LoanType;
  /** Optional override of the month-1 origination rate; always capped at 30%. */
  readonly interestRate?: number;
  /** Monthly compounding rate for months 2..n; default 5%, capped at 5%. */
  readonly monthlyRate?: number;
  /** Resolved fee amounts (e.g. from {@link computeFees}); omitted fees are 0. */
  readonly fees?: Partial<LoanFees>;
}

/**
 * Produce a compliant loan quote. The *principal debt* (loan amount grossed up by
 * stamp duty, insurance and the NAMFISA levy) grows by the origination rate in
 * month 1 (capped at the NAMFISA 30% ceiling), then compounds at the monthly rate
 * (≤5%) for each remaining term month. The total repayable is that grown amount
 * plus any flat bank charges, split into equal monthly instalments. A 1-month
 * loan is priced exactly as `principal debt × (1 + origination rate)`.
 */
export const quote = ({
  principalCents,
  termMonths,
  type,
  interestRate,
  monthlyRate,
  fees,
}: QuoteInput): LoanQuote => {
  if (!Number.isInteger(principalCents) || principalCents <= 0) {
    throw new RangeError('principalCents must be a positive integer');
  }
  if (!Number.isInteger(termMonths) || termMonths < 1 || termMonths > MAX_TERM_MONTHS) {
    throw new RangeError(`termMonths must be an integer between 1 and ${MAX_TERM_MONTHS}`);
  }

  const namfisaLevyCents = fees?.namfisaLevyCents ?? 0;
  const stampDutyCents = fees?.stampDutyCents ?? 0;
  const insuranceCents = fees?.insuranceCents ?? 0;
  const bankChargesCents = fees?.bankChargesCents ?? 0;

  const principalDebtCents = principalCents + namfisaLevyCents + stampDutyCents + insuranceCents;

  const requestedRate = interestRate ?? FINANCE_CHARGE_RATE[type];
  const origRate = Math.min(Math.max(requestedRate, 0), MAX_FINANCE_CHARGE_RATE);
  const mRate = Math.min(Math.max(monthlyRate ?? MAX_MONTHLY_RATE, 0), MAX_MONTHLY_RATE);

  // Month 1 keeps today's exact arithmetic; later months compound at the monthly
  // rate. financeCharge is derived by subtraction so the total invariant holds.
  const month1Cents = principalDebtCents + Math.round(principalDebtCents * origRate);
  const grownCents = Math.round(month1Cents * Math.pow(1 + mRate, termMonths - 1));
  const financeChargeCents = grownCents - principalDebtCents;
  const totalCents = grownCents + bankChargesCents;
  const parts = splitInstalments(totalCents, termMonths);

  return {
    principalCents,
    namfisaLevyCents,
    stampDutyCents,
    insuranceCents,
    bankChargesCents,
    principalDebtCents,
    interestRate: origRate,
    financeChargeCents,
    totalCents,
    termMonths,
    instalmentCents: parts[0] ?? totalCents,
    schedule: parts.map((amountCents, index) => ({ number: index + 1, amountCents })),
  };
};

/**
 * Compute compliant penalty interest on an overdue balance. Capped at 5% per
 * month and at most 3 months, per the loan agreement.
 *
 * @deprecated Superseded by {@link assessArrears}, which compounds per overdue
 * instalment and is not capped at 3 months. Retained for backward compatibility.
 */
export const penaltyInterest = (outstandingCents: Cents, monthsLate: number): Cents => {
  const cappedMonths = Math.min(Math.max(monthsLate, 0), MAX_PENALTY_MONTHS);
  return Math.round(outstandingCents * MAX_PENALTY_RATE_PER_MONTH * cappedMonths);
};

/** A schedule instalment, reduced to what {@link assessArrears} needs. */
export interface ArrearsScheduleItem {
  readonly amountCents: Cents;
  readonly dueAt: Date;
  readonly paid: boolean;
}

export interface ArrearsAssessment {
  /** Sum of unpaid instalments whose due date has passed. */
  readonly overdueCents: Cents;
  /** Compounded default interest accrued on those overdue instalments. */
  readonly defaultInterestCents: Cents;
  /** Days past due of the most-overdue unpaid instalment (0 if none overdue). */
  readonly daysLate: number;
  /** Complete months past due of the most-overdue unpaid instalment. */
  readonly monthsLateMax: number;
}

/**
 * Assess a loan's arrears as of a given date. Default interest accrues at the
 * monthly rate (≤5%), compounding per complete month overdue and uncapped in
 * months, charged on *each* overdue unpaid instalment — instalments that are paid
 * or not yet due never accrue it. Partial months accrue nothing.
 */
export const assessArrears = (
  schedule: readonly ArrearsScheduleItem[],
  asOf: Date,
  monthlyRate: number = MAX_MONTHLY_RATE,
): ArrearsAssessment => {
  const mRate = Math.min(Math.max(monthlyRate, 0), MAX_MONTHLY_RATE);

  return schedule.reduce<ArrearsAssessment>(
    (acc, item) => {
      if (item.paid || item.dueAt >= asOf) {
        return acc;
      }
      const monthsLate = completeMonthsBetween(item.dueAt, asOf);
      const defaultInterestCents =
        monthsLate >= 1 ? Math.round(item.amountCents * (Math.pow(1 + mRate, monthsLate) - 1)) : 0;
      return {
        overdueCents: acc.overdueCents + item.amountCents,
        defaultInterestCents: acc.defaultInterestCents + defaultInterestCents,
        daysLate: Math.max(acc.daysLate, daysBetween(item.dueAt, asOf)),
        monthsLateMax: Math.max(acc.monthsLateMax, monthsLate),
      };
    },
    { overdueCents: 0, defaultInterestCents: 0, daysLate: 0, monthsLateMax: 0 },
  );
};
