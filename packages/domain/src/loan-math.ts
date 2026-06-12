import type { Cents } from './money';
import { splitInstalments } from './money';
import { LoanType } from './enums';

/**
 * NAMFISA / Namibian Microlending Act, 2018 constraints used in pricing:
 * - Finance charges may not exceed 30% of the principal debt.
 * - The loan term covered by this product may not exceed 5 months.
 * - Penalty interest may not exceed 5% per month for at most 3 months.
 */
export const MAX_FINANCE_CHARGE_RATE = 0.3;
export const MAX_TERM_MONTHS = 5;
export const MAX_PENALTY_RATE_PER_MONTH = 0.05;
export const MAX_PENALTY_MONTHS = 3;

/** Default total finance-charge rate (of principal) by loan type. */
const FINANCE_CHARGE_RATE: Record<LoanType, number> = {
  [LoanType.Payday]: 0.3,
  [LoanType.Business]: 0.3,
  [LoanType.Collateral]: 0.25,
};

export interface ScheduleItem {
  readonly number: number;
  readonly amountCents: Cents;
}

export interface LoanQuote {
  readonly principalCents: Cents;
  readonly financeChargeCents: Cents;
  readonly totalCents: Cents;
  readonly termMonths: number;
  readonly instalmentCents: Cents;
  readonly schedule: readonly ScheduleItem[];
}

export interface QuoteInput {
  readonly principalCents: Cents;
  readonly termMonths: number;
  readonly type: LoanType;
  /** Optional override of the finance-charge rate; always capped at 30%. */
  readonly financeChargeRate?: number;
}

/**
 * Produce a compliant loan quote: the total finance charge, the per-month
 * instalment and the repayment schedule. The finance charge is a flat
 * percentage of the principal, capped at the NAMFISA 30% ceiling.
 */
export const quote = ({
  principalCents,
  termMonths,
  type,
  financeChargeRate,
}: QuoteInput): LoanQuote => {
  if (!Number.isInteger(principalCents) || principalCents <= 0) {
    throw new RangeError('principalCents must be a positive integer');
  }
  if (!Number.isInteger(termMonths) || termMonths < 1 || termMonths > MAX_TERM_MONTHS) {
    throw new RangeError(`termMonths must be an integer between 1 and ${MAX_TERM_MONTHS}`);
  }

  const requestedRate = financeChargeRate ?? FINANCE_CHARGE_RATE[type];
  const rate = Math.min(requestedRate, MAX_FINANCE_CHARGE_RATE);
  const financeChargeCents = Math.round(principalCents * rate);
  const totalCents = principalCents + financeChargeCents;
  const parts = splitInstalments(totalCents, termMonths);

  return {
    principalCents,
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
 */
export const penaltyInterest = (outstandingCents: Cents, monthsLate: number): Cents => {
  const cappedMonths = Math.min(Math.max(monthsLate, 0), MAX_PENALTY_MONTHS);
  return Math.round(outstandingCents * MAX_PENALTY_RATE_PER_MONTH * cappedMonths);
};
