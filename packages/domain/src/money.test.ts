import { toCents, fromCents, formatNad, splitInstalments } from './money';

describe('money helpers', () => {
  it('round-trips between major units and cents', () => {
    expect(toCents(6500)).toBe(650000);
    expect(fromCents(650000)).toBe(6500);
  });

  it('formats cents as Namibian Dollars', () => {
    expect(formatNad(650000)).toBe('N$ 6,500');
  });

  it('splits totals into instalments that sum back to the total', () => {
    const parts = splitInstalments(1000, 3);
    expect(parts).toEqual([333, 333, 334]);
    expect(parts.reduce((a, b) => a + b, 0)).toBe(1000);
  });

  it('rejects a non-positive instalment count', () => {
    expect(() => splitInstalments(1000, 0)).toThrow(RangeError);
  });
});
