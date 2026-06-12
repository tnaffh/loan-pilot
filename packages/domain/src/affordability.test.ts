import { assessAffordability } from './affordability';
import { toCents } from './money';
import { AffordabilityResult } from './enums';

describe('assessAffordability', () => {
  it('passes when the borrower keeps at least 50% of income', () => {
    const result = assessAffordability({
      monthlyIncomeCents: toCents(20000),
      instalmentCents: toCents(8000),
    });
    expect(result.result).toBe(AffordabilityResult.Pass);
    expect(result.ratio).toBe(0.4);
    expect(result.disposableIncomeCents).toBe(toCents(12000));
  });

  it('flags for review between 50% and 60%', () => {
    const result = assessAffordability({
      monthlyIncomeCents: toCents(10000),
      instalmentCents: toCents(5500),
    });
    expect(result.result).toBe(AffordabilityResult.Review);
  });

  it('fails above 60%', () => {
    const result = assessAffordability({
      monthlyIncomeCents: toCents(10000),
      instalmentCents: toCents(9500),
    });
    expect(result.result).toBe(AffordabilityResult.Fail);
  });

  it('accounts for existing obligations', () => {
    const result = assessAffordability({
      monthlyIncomeCents: toCents(20000),
      existingObligationsCents: toCents(7000),
      instalmentCents: toCents(5000),
    });
    expect(result.result).toBe(AffordabilityResult.Review);
  });

  it('fails when income is zero', () => {
    const result = assessAffordability({ monthlyIncomeCents: 0, instalmentCents: toCents(1000) });
    expect(result.result).toBe(AffordabilityResult.Fail);
  });
});
