/**
 * Money helpers. Every monetary value in LoanPilot is stored and computed as an
 * integer number of Namibian Dollar (N$) cents to avoid floating-point drift.
 */

export type Cents = number;

/** Convert a major-unit Namibian Dollar amount (e.g. 5000) to integer cents. */
export const toCents = (majorUnits: number): Cents => Math.round(majorUnits * 100);

/** Convert integer cents back to a major-unit number (e.g. 650000 -> 6500). */
export const fromCents = (cents: Cents): number => cents / 100;

const formatter = new Intl.NumberFormat('en-NA', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

/** Format integer cents as a display string, e.g. 650000 -> "N$ 6,500". */
export const formatNad = (cents: Cents): string => `N$ ${formatter.format(Math.round(fromCents(cents)))}`;

/**
 * Split a total amount of cents into `count` integer instalments. The remainder
 * is added to the final instalment so the parts always sum back to the total.
 */
export const splitInstalments = (totalCents: Cents, count: number): Cents[] => {
  if (count <= 0) {
    throw new RangeError('Instalment count must be a positive integer');
  }
  const base = Math.floor(totalCents / count);
  const remainder = totalCents - base * count;
  return Array.from({ length: count }, (_unused, index) =>
    index === count - 1 ? base + remainder : base,
  );
};
