import {
  amortisedUnearnedInterest,
  priceLoan,
  quoteAmortised,
  renewalPosition,
  MAX_AMORTISED_TERM_MONTHS,
} from './interest-methods';
import type { RenewalInput } from './interest-methods';
import { quote } from './loan-math';
import { toCents } from './money';
import { addMonths } from './dates';
import { InterestMethod, LoanType, RenewalBasis } from './enums';

const firstDueAt = new Date('2026-02-15T00:00:00.000Z');
const daysAfter = (date: Date, days: number): Date => new Date(date.getTime() + days * 86_400_000);

// N$100,000 at 30% with no fees: N$130,000 falls due on the first due date.
const renewalInput = (overrides: Partial<RenewalInput>): RenewalInput => ({
  totalCents: toCents(130000),
  principalDebtCents: toCents(100000),
  rate: 0.3,
  basis: RenewalBasis.Principal,
  firstDueAt,
  graceDays: 3,
  payments: [],
  asOf: firstDueAt,
  ...overrides,
});

describe('renewalPosition', () => {
  it('adds nothing before the first due date has passed its grace days', () => {
    const result = renewalPosition(renewalInput({ asOf: daysAfter(firstDueAt, 3) }));

    expect(result.renewals).toHaveLength(0);
    expect(result.totalCents).toBe(toCents(130000));
    expect(result.owedCents).toBe(toCents(130000));
    expect(result.nextDueAt).toEqual(firstDueAt);
  });

  it('renews once the grace days are over, dated on the due date', () => {
    const result = renewalPosition(renewalInput({ asOf: daysAfter(firstDueAt, 4) }));

    expect(result.renewals).toHaveLength(1);
    expect(result.renewals[0]?.renewedAt).toEqual(firstDueAt);
    expect(result.renewals[0]?.chargeCents).toBe(toCents(30000));
    expect(result.totalCents).toBe(toCents(160000));
    expect(result.nextDueAt).toEqual(addMonths(firstDueAt, 1));
  });

  it('charges the rate on the amount borrowed each month (principal basis)', () => {
    // 130,000 → 160,000 → 190,000.
    const result = renewalPosition(renewalInput({ asOf: daysAfter(addMonths(firstDueAt, 1), 4) }));

    expect(result.renewals.map((r) => r.chargeCents)).toEqual([toCents(30000), toCents(30000)]);
    expect(result.totalCents).toBe(toCents(190000));
    expect(result.owedCents).toBe(toCents(190000));
    expect(result.nextDueAt).toEqual(addMonths(firstDueAt, 2));
  });

  it('charges the rate on everything owed each month (balance basis)', () => {
    // 130,000 → 169,000 → 219,700.
    const result = renewalPosition(
      renewalInput({
        basis: RenewalBasis.Balance,
        asOf: daysAfter(addMonths(firstDueAt, 1), 4),
      }),
    );

    expect(result.renewals.map((r) => r.chargeCents)).toEqual([toCents(39000), toCents(50700)]);
    expect(result.totalCents).toBe(toCents(219700));
  });

  it('does not renew a loan paid in full inside the grace days', () => {
    const result = renewalPosition(
      renewalInput({
        payments: [{ paidAt: daysAfter(firstDueAt, 2), amountCents: toCents(130000) }],
        asOf: daysAfter(firstDueAt, 60),
      }),
    );

    expect(result.renewals).toHaveLength(0);
    expect(result.owedCents).toBe(0);
  });

  it('keeps the amount rolling when the borrower pays each month’s charge', () => {
    // Pays the 30,000 charge each month: always owes 130,000 at the next due date.
    const result = renewalPosition(
      renewalInput({
        payments: [
          { paidAt: firstDueAt, amountCents: toCents(30000) },
          { paidAt: addMonths(firstDueAt, 1), amountCents: toCents(30000) },
        ],
        asOf: daysAfter(addMonths(firstDueAt, 1), 4),
      }),
    );

    expect(result.renewals.map((r) => r.baseCents)).toEqual([toCents(100000), toCents(100000)]);
    expect(result.totalCents).toBe(toCents(190000));
    expect(result.owedCents).toBe(toCents(130000));
  });

  it('charges only what is left of the amount borrowed after a part payment', () => {
    // 80,000 paid → 50,000 owed → charge 30% of 50,000.
    const result = renewalPosition(
      renewalInput({
        payments: [{ paidAt: firstDueAt, amountCents: toCents(80000) }],
        asOf: daysAfter(firstDueAt, 4),
      }),
    );

    expect(result.renewals[0]?.baseCents).toBe(toCents(50000));
    expect(result.renewals[0]?.chargeCents).toBe(toCents(15000));
    expect(result.owedCents).toBe(toCents(65000));
  });

  it('stops renewing once the loan is paid off', () => {
    const result = renewalPosition(
      renewalInput({
        payments: [{ paidAt: daysAfter(firstDueAt, 10), amountCents: toCents(160000) }],
        asOf: daysAfter(firstDueAt, 200),
      }),
    );

    expect(result.renewals).toHaveLength(1);
    expect(result.owedCents).toBe(0);
  });

  it('caps the renewal rate at the 30% ceiling', () => {
    const result = renewalPosition(renewalInput({ rate: 0.9, asOf: daysAfter(firstDueAt, 4) }));

    expect(result.renewals[0]?.chargeCents).toBe(toCents(30000));
  });

  it('gives the same answer however often it is run', () => {
    const input = renewalInput({ asOf: daysAfter(firstDueAt, 100) });

    expect(renewalPosition(input)).toEqual(renewalPosition(input));
  });
});

describe('quoteAmortised', () => {
  it('prices equal instalments on a reducing balance', () => {
    // N$100,000 over 12 months at 15.5% p.a. → PMT 9,049.44.
    const result = quoteAmortised({
      principalCents: toCents(100000),
      termMonths: 12,
      annualRate: 0.155,
    });

    expect(result.instalmentCents).toBe(904944);
    expect(result.schedule).toHaveLength(12);
    expect(result.schedule[0]?.interestCents).toBe(129167);
    expect(result.interestRate).toBe(0.155);
  });

  it('repays exactly the principal debt and totals principal + interest', () => {
    const result = quoteAmortised({
      principalCents: toCents(250000),
      termMonths: 36,
      annualRate: 0.1475,
      fees: { namfisaLevyCents: 257500, stampDutyCents: 500 },
    });
    const principalPaid = result.schedule.reduce((sum, s) => sum + (s.principalCents ?? 0), 0);
    const interestPaid = result.schedule.reduce((sum, s) => sum + (s.interestCents ?? 0), 0);
    const instalments = result.schedule.reduce((sum, s) => sum + s.amountCents, 0);

    expect(principalPaid).toBe(result.principalDebtCents);
    expect(interestPaid).toBe(result.financeChargeCents);
    expect(instalments).toBe(result.totalCents);
  });

  it('keeps every instalment but the last equal', () => {
    const result = quoteAmortised({
      principalCents: toCents(100000),
      termMonths: 12,
      annualRate: 0.155,
    });
    const regular = result.schedule.slice(0, -1).map((s) => s.amountCents);
    const last = result.schedule.at(-1)?.amountCents ?? 0;

    expect(new Set(regular).size).toBe(1);
    expect(Math.abs(last - result.instalmentCents)).toBeLessThan(100);
  });

  it('splits the principal debt equally at a 0% rate', () => {
    const result = quoteAmortised({ principalCents: toCents(1000), termMonths: 3, annualRate: 0 });

    expect(result.financeChargeCents).toBe(0);
    expect(result.schedule.map((s) => s.amountCents)).toEqual([33333, 33333, 33334]);
  });

  it('adds bank charges to the first instalment without interest', () => {
    const plain = quoteAmortised({ principalCents: toCents(5000), termMonths: 6, annualRate: 0.2 });
    const charged = quoteAmortised({
      principalCents: toCents(5000),
      termMonths: 6,
      annualRate: 0.2,
      fees: { bankChargesCents: 2500 },
    });

    expect(charged.financeChargeCents).toBe(plain.financeChargeCents);
    expect(charged.totalCents).toBe(plain.totalCents + 2500);
    expect(charged.schedule[0]?.amountCents).toBe((plain.schedule[0]?.amountCents ?? 0) + 2500);
  });

  it('rejects a term beyond the lender maximum or the hard ceiling', () => {
    const base = { principalCents: toCents(5000), annualRate: 0.15 };

    expect(() => quoteAmortised({ ...base, termMonths: 61, maxTermMonths: 60 })).toThrow(
      RangeError,
    );
    expect(() => quoteAmortised({ ...base, termMonths: MAX_AMORTISED_TERM_MONTHS + 1 })).toThrow(
      RangeError,
    );
    expect(() => quoteAmortised({ ...base, termMonths: 0 })).toThrow(RangeError);
  });
});

describe('amortisedUnearnedInterest', () => {
  const disbursedAt = new Date('2026-01-10T00:00:00.000Z');
  const schedule = [1, 2, 3, 4].map((n) => ({
    dueAt: addMonths(disbursedAt, n),
    interestCents: 1000 * (5 - n),
    settled: false,
  }));

  it('rebates the interest of months that have not started', () => {
    // Mid month 2: months 3 and 4 have not started → 2,000 + 1,000.
    const asOf = new Date('2026-02-20T00:00:00.000Z');

    expect(amortisedUnearnedInterest(schedule, asOf)).toBe(3000);
  });

  it('rebates nothing in the final month or for settled instalments', () => {
    expect(amortisedUnearnedInterest(schedule, new Date('2026-04-20T00:00:00.000Z'))).toBe(0);
    expect(
      amortisedUnearnedInterest(
        schedule.map((item) => ({ ...item, settled: true })),
        disbursedAt,
      ),
    ).toBe(0);
  });
});

describe('priceLoan', () => {
  const input = { principalCents: toCents(8000), termMonths: 3, type: LoanType.Payday };

  it('prices a payday loan exactly as quote() does', () => {
    expect(priceLoan({ ...input, method: InterestMethod.Payday })).toEqual(quote(input));
  });

  it('prices a monthly renewal loan as a 1-month quote and rejects longer terms', () => {
    const oneMonth = { ...input, termMonths: 1 };

    expect(priceLoan({ ...oneMonth, method: InterestMethod.MonthlyRenewal })).toEqual(
      quote(oneMonth),
    );
    expect(() => priceLoan({ ...input, method: InterestMethod.MonthlyRenewal })).toThrow(
      RangeError,
    );
  });

  it('prices a term loan on a reducing balance and needs a yearly rate', () => {
    const result = priceLoan({
      ...input,
      termMonths: 24,
      method: InterestMethod.TermLoan,
      annualRate: 0.15,
    });

    expect(result.schedule).toHaveLength(24);
    expect(() => priceLoan({ ...input, method: InterestMethod.TermLoan })).toThrow(RangeError);
  });
});
