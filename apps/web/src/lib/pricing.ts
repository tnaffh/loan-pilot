import { quoteWithPricing, type PricingConfig } from '@loan-pilot/domain';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api';

export type { PricingConfig };

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

/** Price a loan for the calculator; shared with the mobile app via the domain. */
export const computeQuote = quoteWithPricing;
