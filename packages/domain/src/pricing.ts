import { LoanType } from './enums';
import { toCents } from './money';
import { computeFees, quote, type FeeSettings, type LoanQuote } from './loan-math';

/**
 * The tenant's active rate per loan type plus its fee settings, as served by the
 * public `GET /applications/pricing`. A `null` rate means no active product —
 * `quote()` then applies the loan type's standard rate.
 */
export interface PricingConfig {
  rates: Record<LoanType, number | null>;
  feeSettings: FeeSettings;
}

/**
 * Price a loan for an applicant-facing calculator (website and mobile app). With
 * a config, grosses up by the tenant's fees and uses its active rate exactly as
 * the API does; without one, falls back to the fee-less, default-rate quote so
 * the calculator still renders when pricing can't be fetched.
 */
export const quoteWithPricing = (
  config: PricingConfig | null,
  input: { amount: number; termMonths: number; type: LoanType },
): LoanQuote => {
  const principalCents = toCents(input.amount);
  if (!config) {
    return quote({ principalCents, termMonths: input.termMonths, type: input.type });
  }
  return quote({
    principalCents,
    termMonths: input.termMonths,
    type: input.type,
    interestRate: config.rates[input.type] ?? undefined,
    monthlyRate: config.feeSettings.monthlyRate,
    fees: computeFees(principalCents, config.feeSettings),
  });
};
