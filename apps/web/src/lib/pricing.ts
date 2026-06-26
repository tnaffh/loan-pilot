import {
  computeFees,
  quote,
  toCents,
  type FeeSettings,
  type LoanQuote,
  type LoanType,
} from '@loan-pilot/domain';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api';

/**
 * The tenant's active rate per loan type plus its fee settings, fetched once so
 * the marketing calculators can gross loans up exactly as the API does. A `null`
 * rate means no active product — the domain `quote()` then applies the loan
 * type's standard rate.
 */
export interface PricingConfig {
  rates: Record<LoanType, number | null>;
  feeSettings: FeeSettings;
}

/** Load the public pricing config. Returns null on any failure so callers can
 * fall back to a fee-less estimate rather than break the page. */
export const fetchPricingConfig = async (): Promise<PricingConfig | null> => {
  try {
    const response = await fetch(`${API_URL}/applications/pricing`);
    if (!response.ok) {
      return null;
    }
    const config: PricingConfig = await response.json();
    return config;
  } catch {
    return null;
  }
};

/**
 * Price a loan for the calculator. With a config, grosses up by the tenant's
 * fees and uses its active rate; without one, falls back to the fee-less,
 * default-rate quote so the calculator still renders.
 */
export const computeQuote = (
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
