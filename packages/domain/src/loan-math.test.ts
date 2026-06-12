import { quote, penaltyInterest, MAX_FINANCE_CHARGE_RATE } from './loan-math';
import { toCents } from './money';
import { LoanType } from './enums';

describe('quote', () => {
  it('prices a 1-month payday loan at a 30% finance charge', () => {
    const result = quote({ principalCents: toCents(5000), termMonths: 1, type: LoanType.Payday });
    expect(result.financeChargeCents).toBe(toCents(1500));
    expect(result.totalCents).toBe(toCents(6500));
    expect(result.instalmentCents).toBe(toCents(6500));
    expect(result.schedule).toHaveLength(1);
  });

  it('splits a 2-month payday loan into equal instalments', () => {
    const result = quote({ principalCents: toCents(8000), termMonths: 2, type: LoanType.Payday });
    expect(result.totalCents).toBe(toCents(10400));
    expect(result.schedule.map((s) => s.amountCents)).toEqual([toCents(5200), toCents(5200)]);
  });

  it('prices collateral loans at 25%', () => {
    const result = quote({
      principalCents: toCents(120000),
      termMonths: 5,
      type: LoanType.Collateral,
    });
    expect(result.totalCents).toBe(toCents(150000));
    expect(result.instalmentCents).toBe(toCents(30000));
  });

  it('caps the finance charge at the NAMFISA 30% ceiling', () => {
    const result = quote({
      principalCents: toCents(10000),
      termMonths: 1,
      type: LoanType.Payday,
      financeChargeRate: 0.9,
    });
    expect(result.financeChargeCents).toBe(toCents(10000) * MAX_FINANCE_CHARGE_RATE);
  });

  it('ensures instalments always sum back to the total', () => {
    const result = quote({ principalCents: toCents(1000), termMonths: 3, type: LoanType.Payday });
    const sum = result.schedule.reduce((acc, s) => acc + s.amountCents, 0);
    expect(sum).toBe(result.totalCents);
  });

  it('rejects terms beyond 5 months', () => {
    expect(() =>
      quote({ principalCents: toCents(5000), termMonths: 6, type: LoanType.Payday }),
    ).toThrow(RangeError);
  });

  it('rejects non-positive principals', () => {
    expect(() => quote({ principalCents: 0, termMonths: 1, type: LoanType.Payday })).toThrow(
      RangeError,
    );
  });
});

describe('penaltyInterest', () => {
  it('charges 5% per month', () => {
    expect(penaltyInterest(toCents(10000), 1)).toBe(toCents(500));
  });

  it('caps at 3 months', () => {
    expect(penaltyInterest(toCents(10000), 6)).toBe(toCents(1500));
  });

  it('is zero when not late', () => {
    expect(penaltyInterest(toCents(10000), 0)).toBe(0);
  });
});
