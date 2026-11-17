import type { Cents } from './money';
import { addMonths } from './dates';
import { InterestMethod, RenewalBasis } from './enums';
import { MAX_FINANCE_CHARGE_RATE, quote } from './loan-math';
import type { LoanFees, LoanQuote, QuoteInput, ScheduleItem } from './loan-math';

/**
 * Calculation methods beyond the original payday pricing in `loan-math.ts`:
 *
 * - **Monthly renewal** — a 1-month loan that, while unpaid, renews at its
 *   origination rate every month ({@link renewalPosition}).
 * - **Term loan** — bank-style reducing balance at a yearly rate, equal monthly
 *   instalments ({@link quoteAmortised}).
 *
 * Everything here is a pure derivation from a loan's origination inputs and its
 * payments, so a loan can be switched between methods and recalculated at will.
 */

/** Hard ceiling on a term loan's length; lenders set their own maximum below it. */
export const MAX_AMORTISED_TERM_MONTHS = 120;
/** Sanity ceiling on a yearly rate (BoN rate, margin, or their sum). */
export const MAX_ANNUAL_RATE = 1;
/** Longest grace period before an unpaid monthly-renewal loan renews. */
export const MAX_RENEWAL_GRACE_DAYS = 31;
/** A monthly-renewal loan always runs one month at a time. */
export const RENEWAL_TERM_MONTHS = 1;

export const DEFAULT_MAX_LONG_TERM_MONTHS = 60;
export const DEFAULT_RENEWAL_GRACE_DAYS = 3;

export const INTEREST_METHOD_LABEL: Record<InterestMethod, string> = {
  [InterestMethod.Payday]: 'Payday',
  [InterestMethod.MonthlyRenewal]: 'Monthly renewal',
  [InterestMethod.TermLoan]: 'Term loan',
};

export const INTEREST_METHOD_HINT: Record<InterestMethod, string> = {
  [InterestMethod.Payday]:
    'The finance rate in month 1, then the monthly rate for later months and on late instalments.',
  [InterestMethod.MonthlyRenewal]:
    'A one-month loan that renews at the finance rate every month it stays unpaid.',
  [InterestMethod.TermLoan]:
    'Bank-style: BoN rate plus a margin per year, equal instalments on a reducing balance.',
};

export const RENEWAL_BASIS_LABEL: Record<RenewalBasis, string> = {
  [RenewalBasis.Principal]: 'On the amount borrowed',
  [RenewalBasis.Balance]: 'On the full balance',
};

const MS_PER_DAY = 86_400_000;
/** Far more renewals than any real loan; only guards against a runaway loop. */
const MAX_RENEWALS = 1200;

const clamp = (value: number, min: number, max: number): number =>
  Math.min(Math.max(value, min), max);

// ---------------------------------------------------------------------------
// Monthly renewal
// ---------------------------------------------------------------------------

export interface RenewalPayment {
  readonly paidAt: Date;
  readonly amountCents: Cents;
}

export interface RenewalInput {
  /** The origination total (1-month quote, bank charges included). */
  readonly totalCents: Cents;
  /** principal + levy + stamp duty + insurance: the "amount borrowed". */
  readonly principalDebtCents: Cents;
  /** The monthly renewal rate (the loan's finance rate); capped at 30%. */
  readonly rate: number;
  readonly basis: RenewalBasis;
  /** The loan's first due date (one month after disbursement). */
  readonly firstDueAt: Date;
  /** Days after a due date the borrower may still pay without a renewal. */
  readonly graceDays: number;
  /** Money received against the loan (bad-debt/waived amounts excluded by the caller). */
  readonly payments: readonly RenewalPayment[];
  readonly asOf: Date;
}

export interface Renewal {
  readonly number: number;
  /** The due date the loan was renewed on. */
  readonly renewedAt: Date;
  /** The amount the rate was charged on. */
  readonly baseCents: Cents;
  readonly chargeCents: Cents;
  readonly newDueAt: Date;
}

export interface RenewalPosition {
  readonly renewals: readonly Renewal[];
  /** Sum of all renewal charges. */
  readonly chargesCents: Cents;
  /** Origination total + renewal charges. */
  readonly totalCents: Cents;
  /** What is still owed as of `asOf` (never negative). */
  readonly owedCents: Cents;
  /** When the current month falls due. */
  readonly nextDueAt: Date;
}

const paidBefore = (payments: readonly RenewalPayment[], before: Date): Cents =>
  payments.reduce(
    (sum, payment) =>
      payment.paidAt.getTime() < before.getTime() ? sum + payment.amountCents : sum,
    0,
  );

/**
 * Derive a monthly-renewal loan's position as of a date. Walking from the first
 * due date: on each due date, if anything is still owed once the grace days have
 * passed, the loan renews for another month — a charge of `rate` × the basis is
 * added (dated on the due date) and the due date moves a month on.
 *
 * - `principal` basis charges the amount borrowed that is still unpaid, so a
 *   borrower who pays each month's charge keeps owing the same amount.
 * - `balance` basis charges everything owed, earlier charges included.
 *
 * Payments made up to the end of the grace period count before that renewal is
 * decided. Nothing is stored here; callers persist the result.
 */
export const renewalPosition = ({
  totalCents,
  principalDebtCents,
  rate,
  basis,
  firstDueAt,
  graceDays,
  payments,
  asOf,
}: RenewalInput): RenewalPosition => {
  const renewalRate = clamp(rate, 0, MAX_FINANCE_CHARGE_RATE);
  const grace = clamp(Math.floor(graceDays), 0, MAX_RENEWAL_GRACE_DAYS);

  const walk = (renewals: readonly Renewal[], chargesCents: Cents): readonly Renewal[] => {
    const dueAt = addMonths(firstDueAt, renewals.length);
    // Exclusive end of the grace period: the start of the day after the last grace day.
    const graceEnds = new Date(dueAt.getTime() + (grace + 1) * MS_PER_DAY);

    if (asOf.getTime() < graceEnds.getTime() || renewals.length >= MAX_RENEWALS) {
      return renewals;
    }

    const owedCents = totalCents + chargesCents - paidBefore(payments, graceEnds);

    if (owedCents <= 0) {
      return renewals;
    }

    const baseCents =
      basis === RenewalBasis.Balance ? owedCents : Math.min(principalDebtCents, owedCents);
    const chargeCents = Math.round(baseCents * renewalRate);
    const renewal: Renewal = {
      number: renewals.length + 1,
      renewedAt: dueAt,
      baseCents,
      chargeCents,
      newDueAt: addMonths(firstDueAt, renewals.length + 1),
    };

    return walk([...renewals, renewal], chargesCents + chargeCents);
  };

  const renewals = walk([], 0);
  const chargesCents = renewals.reduce((sum, renewal) => sum + renewal.chargeCents, 0);
  const grownTotalCents = totalCents + chargesCents;
  const paidCents = payments.reduce(
    (sum, payment) =>
      payment.paidAt.getTime() <= asOf.getTime() ? sum + payment.amountCents : sum,
    0,
  );

  return {
    renewals,
    chargesCents,
    totalCents: grownTotalCents,
    owedCents: Math.max(0, grownTotalCents - paidCents),
    nextDueAt: addMonths(firstDueAt, renewals.length),
  };
};

// ---------------------------------------------------------------------------
// Term loan (reducing balance)
// ---------------------------------------------------------------------------

export interface AmortisedQuoteInput {
  /** The cash advanced to the borrower, in cents. */
  readonly principalCents: Cents;
  readonly termMonths: number;
  /** Yearly rate as a fraction (BoN rate + margin), e.g. 0.155 = 15.5% p.a. */
  readonly annualRate: number;
  /** Resolved fee amounts; omitted fees are 0. */
  readonly fees?: Partial<LoanFees>;
  /** The lender's own maximum term; defaults to the hard ceiling. */
  readonly maxTermMonths?: number;
}

interface AmortisedRow {
  readonly interestCents: Cents;
  readonly principalCents: Cents;
}

/**
 * Price a term loan the way a bank does. The principal debt (loan amount grossed
 * up by stamp duty, insurance and the NAMFISA levy, as in {@link quote}) is
 * repaid in equal monthly instalments; each month's interest is the yearly rate
 * ÷ 12 on the balance still owed, and the final instalment clears the remaining
 * cents. Flat bank charges earn no interest and are added to the first instalment.
 *
 * In the returned quote `interestRate` is the yearly rate, `financeChargeCents`
 * the total interest over the term, and `instalmentCents` the regular instalment
 * (before bank charges).
 */
export const quoteAmortised = ({
  principalCents,
  termMonths,
  annualRate,
  fees,
  maxTermMonths = MAX_AMORTISED_TERM_MONTHS,
}: AmortisedQuoteInput): LoanQuote => {
  if (!Number.isInteger(principalCents) || principalCents <= 0) {
    throw new RangeError('principalCents must be a positive integer');
  }

  const maxTerm = clamp(Math.floor(maxTermMonths), 1, MAX_AMORTISED_TERM_MONTHS);

  if (!Number.isInteger(termMonths) || termMonths < 1 || termMonths > maxTerm) {
    throw new RangeError(`termMonths must be an integer between 1 and ${maxTerm}`);
  }

  if (!Number.isFinite(annualRate)) {
    throw new RangeError('annualRate must be a number');
  }

  const namfisaLevyCents = fees?.namfisaLevyCents ?? 0;
  const stampDutyCents = fees?.stampDutyCents ?? 0;
  const insuranceCents = fees?.insuranceCents ?? 0;
  const bankChargesCents = fees?.bankChargesCents ?? 0;

  const principalDebtCents = principalCents + namfisaLevyCents + stampDutyCents + insuranceCents;
  const yearlyRate = clamp(annualRate, 0, MAX_ANNUAL_RATE);
  const monthlyRate = yearlyRate / 12;

  const levelCents =
    monthlyRate === 0
      ? Math.floor(principalDebtCents / termMonths)
      : Math.round(
          (principalDebtCents * monthlyRate) / (1 - Math.pow(1 + monthlyRate, -termMonths)),
        );

  const rows = Array.from({ length: termMonths }).reduce<{
    readonly balanceCents: Cents;
    readonly rows: readonly AmortisedRow[];
  }>(
    (acc, _unused, index) => {
      const interestCents = Math.round(acc.balanceCents * monthlyRate);
      const isLast = index === termMonths - 1;
      const principalPortion = isLast
        ? acc.balanceCents
        : clamp(levelCents - interestCents, 0, acc.balanceCents);

      return {
        balanceCents: acc.balanceCents - principalPortion,
        rows: [...acc.rows, { interestCents, principalCents: principalPortion }],
      };
    },
    { balanceCents: principalDebtCents, rows: [] },
  ).rows;

  const financeChargeCents = rows.reduce((sum, row) => sum + row.interestCents, 0);
  const schedule: ScheduleItem[] = rows.map((row, index) => ({
    number: index + 1,
    amountCents: row.principalCents + row.interestCents + (index === 0 ? bankChargesCents : 0),
    interestCents: row.interestCents,
    principalCents: row.principalCents,
  }));
  const firstRow = rows[0];

  return {
    principalCents,
    namfisaLevyCents,
    stampDutyCents,
    insuranceCents,
    bankChargesCents,
    principalDebtCents,
    interestRate: yearlyRate,
    financeChargeCents,
    totalCents: principalDebtCents + financeChargeCents + bankChargesCents,
    termMonths,
    instalmentCents: firstRow ? firstRow.principalCents + firstRow.interestCents : 0,
    schedule,
  };
};

export interface AmortisedScheduleItem {
  readonly dueAt: Date;
  readonly interestCents: Cents;
  /** Paid or waived instalments are never rebated. */
  readonly settled: boolean;
}

/**
 * Interest a term loan has not yet earned as of a date: the interest portions of
 * unpaid instalments whose month has not started (due more than a month ahead).
 * An early settlement rebates this, so the borrower pays the outstanding
 * principal plus interest up to the end of the current month only.
 */
export const amortisedUnearnedInterest = (
  schedule: readonly AmortisedScheduleItem[],
  asOf: Date,
): Cents => {
  const currentPeriodEnds = addMonths(asOf, 1);

  return schedule.reduce(
    (sum, item) =>
      !item.settled && item.dueAt.getTime() > currentPeriodEnds.getTime()
        ? sum + item.interestCents
        : sum,
    0,
  );
};

// ---------------------------------------------------------------------------
// Dispatcher
// ---------------------------------------------------------------------------

export interface PriceLoanInput extends QuoteInput {
  readonly method: InterestMethod;
  /** Term loans: the yearly rate (BoN rate + margin). Required for that method. */
  readonly annualRate?: number;
  /** Term loans: the lender's maximum term. */
  readonly maxTermMonths?: number;
}

/**
 * Price a loan at origination under the given method. Payday and monthly-renewal
 * loans both use {@link quote} (a monthly-renewal loan is a 1-month payday loan
 * until it renews); term loans use {@link quoteAmortised}.
 */
export const priceLoan = ({
  method,
  annualRate,
  maxTermMonths,
  ...input
}: PriceLoanInput): LoanQuote => {
  if (method === InterestMethod.TermLoan) {
    if (annualRate === undefined) {
      throw new RangeError('A term loan needs a yearly rate');
    }

    return quoteAmortised({
      principalCents: input.principalCents,
      termMonths: input.termMonths,
      annualRate,
      fees: input.fees,
      maxTermMonths,
    });
  }

  if (method === InterestMethod.MonthlyRenewal && input.termMonths !== RENEWAL_TERM_MONTHS) {
    throw new RangeError('A monthly renewal loan has a 1-month term');
  }

  return quote(input);
};
