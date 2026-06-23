import {
  quote,
  penaltyInterest,
  assessArrears,
  computeFees,
  MAX_FINANCE_CHARGE_RATE,
  MAX_MONTHLY_RATE,
  DEFAULT_FEE_SETTINGS,
} from './loan-math';
import { toCents } from './money';
import { addMonths } from './dates';
import { LoanType } from './enums';

describe('quote', () => {
  it('prices a 1-month payday loan at a 30% finance charge', () => {
    const result = quote({ principalCents: toCents(5000), termMonths: 1, type: LoanType.Payday });
    expect(result.financeChargeCents).toBe(toCents(1500));
    expect(result.totalCents).toBe(toCents(6500));
    expect(result.instalmentCents).toBe(toCents(6500));
    expect(result.schedule).toHaveLength(1);
  });

  it('compounds the monthly rate over a 2-month term and splits into equal instalments', () => {
    // 30% origination then +5% for month 2: 8000 ×1.30 ×1.05 = 10,920.
    const result = quote({ principalCents: toCents(8000), termMonths: 2, type: LoanType.Payday });
    expect(result.totalCents).toBe(toCents(10920));
    expect(result.schedule.map((s) => s.amountCents)).toEqual([toCents(5460), toCents(5460)]);
  });

  it('prices a 5-month collateral loan at 25% origination + 5%/month compounding', () => {
    // 120,000 ×1.25 ×1.05^4 = 182,325.9375 → rounded to 182,325.94.
    const result = quote({
      principalCents: toCents(120000),
      termMonths: 5,
      type: LoanType.Collateral,
    });
    expect(result.totalCents).toBe(18232594);
    expect(result.interestRate).toBe(0.25);
    const sum = result.schedule.reduce((acc, s) => acc + s.amountCents, 0);
    expect(sum).toBe(result.totalCents);
  });

  it('caps the finance charge at the NAMFISA 30% ceiling', () => {
    const result = quote({
      principalCents: toCents(10000),
      termMonths: 1,
      type: LoanType.Payday,
      interestRate: 0.9,
    });
    expect(result.financeChargeCents).toBe(toCents(10000) * MAX_FINANCE_CHARGE_RATE);
  });

  it('supports a promotional 0% interest rate', () => {
    const result = quote({
      principalCents: toCents(5000),
      termMonths: 1,
      type: LoanType.Payday,
      interestRate: 0,
    });
    expect(result.financeChargeCents).toBe(0);
    expect(result.totalCents).toBe(toCents(5000));
  });

  it('grosses the loan up by fees before charging interest (matches the NAMFISA worked example)', () => {
    const fees = computeFees(toCents(1000), DEFAULT_FEE_SETTINGS);
    const result = quote({ principalCents: toCents(1000), termMonths: 1, type: LoanType.Payday, fees });
    // 1.03% levy on N$1,000 = N$10.30, plus N$5 stamp duty.
    expect(result.namfisaLevyCents).toBe(toCents(10.3));
    expect(result.stampDutyCents).toBe(toCents(5));
    expect(result.principalDebtCents).toBe(toCents(1015.3));
    expect(result.financeChargeCents).toBe(toCents(304.59));
    expect(result.totalCents).toBe(toCents(1319.89));
  });

  it('adds bank charges to the total without charging interest on them', () => {
    const result = quote({
      principalCents: toCents(1000),
      termMonths: 1,
      type: LoanType.Payday,
      fees: { bankChargesCents: toCents(20) },
    });
    expect(result.principalDebtCents).toBe(toCents(1000));
    expect(result.financeChargeCents).toBe(toCents(300));
    expect(result.totalCents).toBe(toCents(1320));
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

  it('honours an explicit monthly rate and matches the default of 5%', () => {
    const explicit = quote({
      principalCents: toCents(8000),
      termMonths: 2,
      type: LoanType.Payday,
      monthlyRate: 0.05,
    });
    const implicit = quote({ principalCents: toCents(8000), termMonths: 2, type: LoanType.Payday });
    expect(explicit.totalCents).toBe(implicit.totalCents);
    expect(explicit.totalCents).toBe(toCents(10920));
  });

  it('clamps the monthly rate to the 5% NAMFISA ceiling', () => {
    const capped = quote({
      principalCents: toCents(8000),
      termMonths: 2,
      type: LoanType.Payday,
      monthlyRate: 0.2,
    });
    expect(capped.totalCents).toBe(toCents(10920)); // same as 5%
  });

  it('still compounds the monthly rate on a 0% promotional term loan', () => {
    // origination 0%, but +5%/month for months 2 and 3: 1000 ×1.05^2 = 1,102.50.
    const result = quote({
      principalCents: toCents(1000),
      termMonths: 3,
      type: LoanType.Payday,
      interestRate: 0,
    });
    expect(result.interestRate).toBe(0);
    expect(result.totalCents).toBe(toCents(1102.5));
  });

  it('prices a 1-month loan identically to a flat origination charge (regression)', () => {
    for (const amount of [500, 1234, 5000, 99999]) {
      const result = quote({ principalCents: toCents(amount), termMonths: 1, type: LoanType.Payday });
      expect(result.financeChargeCents).toBe(Math.round(toCents(amount) * 0.3));
      expect(result.totalCents).toBe(toCents(amount) + Math.round(toCents(amount) * 0.3));
    }
  });
});

describe('assessArrears', () => {
  const due = (monthsAgo: number, amount: number, paid = false) => ({
    amountCents: toCents(amount),
    dueAt: addMonths(new Date('2026-06-01'), -monthsAgo),
    paid,
  });
  const asOf = new Date('2026-06-01');

  it('is zero when nothing is overdue', () => {
    const result = assessArrears([{ amountCents: toCents(500), dueAt: addMonths(asOf, 1), paid: false }], asOf);
    expect(result.defaultInterestCents).toBe(0);
    expect(result.overdueCents).toBe(0);
    expect(result.daysLate).toBe(0);
  });

  it('charges 5% for one complete month overdue', () => {
    const result = assessArrears([due(1, 1000)], asOf);
    expect(result.defaultInterestCents).toBe(toCents(50));
    expect(result.overdueCents).toBe(toCents(1000));
    expect(result.monthsLateMax).toBe(1);
  });

  it('compounds and is uncapped beyond 3 months', () => {
    // 1000 × (1.05^4 − 1) = 215.5...
    const result = assessArrears([due(4, 1000)], asOf);
    expect(result.defaultInterestCents).toBe(Math.round(toCents(1000) * (Math.pow(1.05, 4) - 1)));
    expect(result.monthsLateMax).toBe(4);
  });

  it('excludes paid and not-yet-due instalments', () => {
    const result = assessArrears(
      [due(2, 1000, true), { amountCents: toCents(1000), dueAt: addMonths(asOf, 1), paid: false }],
      asOf,
    );
    expect(result.defaultInterestCents).toBe(0);
    expect(result.overdueCents).toBe(0);
  });

  it('accrues no default interest for a partial month overdue', () => {
    const result = assessArrears(
      [{ amountCents: toCents(1000), dueAt: addMonths(asOf, 0), paid: false }],
      addMonths(asOf, 0), // same instant → not overdue
    );
    expect(result.defaultInterestCents).toBe(0);
    const twentyDays = new Date('2026-06-21');
    const partial = assessArrears(
      [{ amountCents: toCents(1000), dueAt: new Date('2026-06-01'), paid: false }],
      twentyDays,
    );
    expect(partial.overdueCents).toBe(toCents(1000));
    expect(partial.daysLate).toBe(20);
    expect(partial.defaultInterestCents).toBe(0);
  });

  it('sums default interest across multiple overdue instalments', () => {
    const result = assessArrears([due(2, 1000), due(1, 1000)], asOf);
    const expected =
      Math.round(toCents(1000) * (Math.pow(1.05, 2) - 1)) + Math.round(toCents(1000) * 0.05);
    expect(result.defaultInterestCents).toBe(expected);
  });

  it('clamps the monthly rate to 5%', () => {
    const result = assessArrears([due(1, 1000)], asOf, MAX_MONTHLY_RATE * 4);
    expect(result.defaultInterestCents).toBe(toCents(50));
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
