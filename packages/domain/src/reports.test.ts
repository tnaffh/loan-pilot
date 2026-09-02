import {
  AGEING_BUCKETS,
  LOAN_COUNT_BANDS,
  LOAN_VALUE_BANDS,
  TERM_BANDS,
  ageAt,
  ageingBucketFor,
  bandKeyFor,
  creditsUpTo,
  effectiveClosedAt,
  formatMonthLabel,
  formatQuarterLabel,
  impliedSchedule,
  monthKeyOf,
  monthRange,
  namfisaCollectionMethod,
  normaliseGender,
  purposeFallbackForLoanType,
  quarterDueDate,
  quarterEndDate,
  quarterKeyOf,
  quarterRange,
  recentQuarterKeys,
  reconcileCredits,
  termBandKeyFor,
} from './reports';
import { LoanPurpose, LoanStatus, LoanType, PaymentMethod } from './enums';

const utc = (iso: string): Date => new Date(`${iso}T00:00:00.000Z`);

describe('period math', () => {
  it('buckets dates into months and quarters in UTC', () => {
    expect(monthKeyOf(utc('2026-02-14'))).toBe('2026-02');
    expect(quarterKeyOf(utc('2026-02-14'))).toBe('2026-Q1');
    expect(quarterKeyOf(utc('2026-04-01'))).toBe('2026-Q2');
    // Last instant of Q1 still belongs to Q1.
    expect(quarterKeyOf(new Date('2026-03-31T23:59:59.999Z'))).toBe('2026-Q1');
  });

  it('produces half-open ranges that abut without overlapping', () => {
    const q1 = quarterRange('2026-Q1');
    const q2 = quarterRange('2026-Q2');
    expect(q1?.start.toISOString()).toBe('2026-01-01T00:00:00.000Z');
    expect(q1?.end.toISOString()).toBe('2026-04-01T00:00:00.000Z');
    expect(q1?.end.getTime()).toBe(q2?.start.getTime());
  });

  it('rolls the year over at Q4 and for the month picker', () => {
    expect(quarterRange('2026-Q4')?.end.toISOString()).toBe('2027-01-01T00:00:00.000Z');
    expect(monthRange('2026-12')?.end.toISOString()).toBe('2027-01-01T00:00:00.000Z');
    expect(recentQuarterKeys(3, utc('2026-02-14'))).toEqual(['2026-Q1', '2025-Q4', '2025-Q3']);
  });

  it('matches the form’s own end and due dates', () => {
    // The attached return: Q2 2026 ends 30/06/2026 and is due 31/07/2026.
    expect(quarterEndDate('2026-Q2')?.toISOString().slice(0, 10)).toBe('2026-06-30');
    expect(quarterDueDate('2026-Q2')?.toISOString().slice(0, 10)).toBe('2026-07-31');
    // Q1 2026 ends 31/03/2026, due 30/04/2026.
    expect(quarterEndDate('2026-Q1')?.toISOString().slice(0, 10)).toBe('2026-03-31');
    expect(quarterDueDate('2026-Q1')?.toISOString().slice(0, 10)).toBe('2026-04-30');
    // Q4 rolls into the next year.
    expect(quarterDueDate('2026-Q4')?.toISOString().slice(0, 10)).toBe('2027-01-31');
  });

  it('rejects malformed keys rather than guessing', () => {
    expect(monthRange('2026-13')).toBeNull();
    expect(quarterRange('2026-Q5')).toBeNull();
    expect(quarterRange('nonsense')).toBeNull();
  });

  it('formats labels', () => {
    expect(formatMonthLabel('2026-02')).toBe('February 2026');
    expect(formatQuarterLabel('2026-Q2')).toBe('Q2 2026');
  });
});

describe('amount bands', () => {
  it('keeps the value and count sets structurally distinct', () => {
    // The form really does use two different sets; a "tidy-up" that merges them
    // would silently corrupt one of the parts.
    expect(LOAN_VALUE_BANDS).toHaveLength(6);
    expect(LOAN_COUNT_BANDS).toHaveLength(7);
    expect(LOAN_VALUE_BANDS.slice(0, 5)).toEqual(LOAN_COUNT_BANDS.slice(0, 5));
  });

  it('splits exactly on the form’s boundaries', () => {
    expect(bandKeyFor(LOAN_VALUE_BANDS, 1_000_000)).toBe('to10k'); // N$10,000.00
    expect(bandKeyFor(LOAN_VALUE_BANDS, 1_000_001)).toBe('to20k'); // N$10,000.01
    expect(bandKeyFor(LOAN_VALUE_BANDS, 5_000_000)).toBe('to50k'); // N$50,000.00
    expect(bandKeyFor(LOAN_VALUE_BANDS, 5_000_001)).toBe('above50k');
  });

  it('splits the top band only for counts', () => {
    // A N$75,000 loan: one band in Part 15, a finer one in Part 7.2.
    expect(bandKeyFor(LOAN_VALUE_BANDS, 7_500_000)).toBe('above50k');
    expect(bandKeyFor(LOAN_COUNT_BANDS, 7_500_000)).toBe('to100k');
    expect(bandKeyFor(LOAN_COUNT_BANDS, 10_000_000)).toBe('to100k');
    expect(bandKeyFor(LOAN_COUNT_BANDS, 10_000_001)).toBe('above100k');
  });

  it('refuses to band a zero or negative amount', () => {
    expect(bandKeyFor(LOAN_VALUE_BANDS, 0)).toBeNull();
    expect(bandKeyFor(LOAN_VALUE_BANDS, -100)).toBeNull();
  });

  it('leaves no gap between adjacent bands', () => {
    for (const bands of [LOAN_VALUE_BANDS, LOAN_COUNT_BANDS]) {
      bands.forEach((band, index) => {
        const next = bands[index + 1];
        if (next && band.maxCents !== null) {
          expect(next.minCents).toBe(band.maxCents + 1);
        }
      });
    }
  });
});

describe('term bands', () => {
  it('maps exact short terms to their own column', () => {
    expect(termBandKeyFor(1)).toBe('m1');
    expect(termBandKeyFor(5)).toBe('m5');
    expect(termBandKeyFor(6)).toBe('m6');
  });

  it('reports a longer term under the band it reaches but does not exceed', () => {
    expect(termBandKeyFor(8)).toBe('m6');
    expect(termBandKeyFor(11)).toBe('m6');
    expect(termBandKeyFor(12)).toBe('m12');
    expect(termBandKeyFor(23)).toBe('m12');
    expect(termBandKeyFor(60)).toBe('m60');
    expect(termBandKeyFor(72)).toBe('m60');
  });

  it('never drops a loan with a nonsense term', () => {
    expect(termBandKeyFor(0)).toBe('m1');
    expect(TERM_BANDS.map((band) => band.key)).toContain(termBandKeyFor(-3));
  });
});

describe('ageing buckets', () => {
  it('treats under 30 days as current and splits on the form’s edges', () => {
    expect(ageingBucketFor(0)).toBe('current');
    expect(ageingBucketFor(29)).toBe('current');
    expect(ageingBucketFor(30)).toBe('d30');
    expect(ageingBucketFor(59)).toBe('d30');
    expect(ageingBucketFor(60)).toBe('d60');
    expect(ageingBucketFor(89)).toBe('d60');
    expect(ageingBucketFor(90)).toBe('d90');
    expect(ageingBucketFor(119)).toBe('d90');
    expect(ageingBucketFor(120)).toBe('d120');
    expect(ageingBucketFor(400)).toBe('d120');
  });

  it('covers every bucket exactly once', () => {
    expect(AGEING_BUCKETS).toHaveLength(5);
    expect(new Set(AGEING_BUCKETS.map((bucket) => bucket.key)).size).toBe(5);
  });
});

describe('normaliseGender', () => {
  it('tolerates the casing variations in imported registers', () => {
    expect(normaliseGender('Male')).toBe('male');
    expect(normaliseGender('MALE')).toBe('male');
    expect(normaliseGender(' female ')).toBe('female');
    expect(normaliseGender('F')).toBe('female');
  });

  it('keeps "not recorded" distinct from "Other"', () => {
    // Reporting a blank as male or female would be inventing regulatory data.
    expect(normaliseGender(null)).toBe('unknown');
    expect(normaliseGender(undefined)).toBe('unknown');
    expect(normaliseGender('')).toBe('unknown');
    expect(normaliseGender('   ')).toBe('unknown');
    expect(normaliseGender('Other')).toBe('other');
  });
});

describe('classification', () => {
  it('maps every payment method to a NAMFISA collection method', () => {
    // Exhaustive: adding a PaymentMethod without classifying it fails here.
    for (const method of Object.values(PaymentMethod)) {
      expect(['payroll', 'debit_order', 'cash', 'other']).toContain(
        namfisaCollectionMethod(method),
      );
    }
    expect(namfisaCollectionMethod(PaymentMethod.Payroll)).toBe('payroll');
    expect(namfisaCollectionMethod(PaymentMethod.DebitOrder)).toBe('debit_order');
    expect(namfisaCollectionMethod(PaymentMethod.Cash)).toBe('cash');
    expect(namfisaCollectionMethod(PaymentMethod.Eft)).toBe('other');
    expect(namfisaCollectionMethod(PaymentMethod.Revolved)).toBe('other');
  });

  it('falls back to the purpose the lender actually files', () => {
    // The approved 2026-Q1 return classified the whole payday book as consumption.
    expect(purposeFallbackForLoanType(LoanType.Payday)).toBe(LoanPurpose.Consumption);
    expect(purposeFallbackForLoanType(LoanType.Collateral)).toBe(LoanPurpose.Consumption);
    expect(purposeFallbackForLoanType(LoanType.Business)).toBe(LoanPurpose.Business);
  });
});

describe('reconcileCredits', () => {
  const payment = (iso: string, amountCents: number, method = PaymentMethod.Cash) => ({
    paidAt: utc(iso),
    amountCents,
    method,
  });
  const item = (iso: string | null, amountCents: number) => ({
    paidAt: iso === null ? null : utc(iso),
    amountCents,
  });

  it('uses payment rows alone for an imported loan with no schedule', () => {
    const credits = reconcileCredits({
      payments: [payment('2026-01-10', 5_000), payment('2026-02-10', 5_000)],
      paidScheduleItems: [],
    });
    expect(credits).toHaveLength(2);
    expect(creditsUpTo(credits, utc('2026-03-01'))).toBe(10_000);
  });

  it('counts schedule items when recordRepayment wrote no payment row', () => {
    const credits = reconcileCredits({
      payments: [],
      paidScheduleItems: [item('2026-01-10', 5_000), item('2026-02-10', 5_000)],
    });
    expect(credits).toHaveLength(2);
    expect(credits.every((credit) => credit.method === null)).toBe(true);
    expect(creditsUpTo(credits, utc('2026-03-01'))).toBe(10_000);
  });

  it('counts settle() once, not twice', () => {
    // settle() writes a payment AND marks every remaining item with the same
    // instant. Counting both would double the collection.
    const credits = reconcileCredits({
      payments: [payment('2026-02-10', 12_000)],
      paidScheduleItems: [item('2026-02-10', 5_000), item('2026-02-10', 5_000)],
    });
    expect(credits).toHaveLength(1);
    expect(creditsUpTo(credits, utc('2026-03-01'))).toBe(12_000);
  });

  it('sums both paths when a loan was repaid through each — the case max() loses', () => {
    // Two instalments marked paid on the loan page (schedule only), then a
    // payment recorded through the dialog (payment row only). The true total is
    // 8,000; taking the larger of the two sides would report 5,000 and overstate
    // the loan book by 3,000.
    const credits = reconcileCredits({
      payments: [payment('2026-03-10', 5_000)],
      paidScheduleItems: [item('2026-01-10', 1_500), item('2026-02-10', 1_500)],
    });
    expect(creditsUpTo(credits, utc('2026-04-01'))).toBe(8_000);
    expect(creditsUpTo(credits, utc('2026-04-01'))).toBeGreaterThan(5_000);
  });

  it('ignores schedule items that were never given a paid date', () => {
    const credits = reconcileCredits({
      payments: [],
      paidScheduleItems: [item(null, 5_000)],
    });
    expect(credits).toHaveLength(0);
  });

  it('orders credits chronologically and respects the asOf cut-off', () => {
    const credits = reconcileCredits({
      payments: [payment('2026-03-10', 300), payment('2026-01-10', 100)],
      paidScheduleItems: [item('2026-02-10', 200)],
    });
    expect(credits.map((credit) => credit.amountCents)).toEqual([100, 200, 300]);
    expect(creditsUpTo(credits, utc('2026-03-10'))).toBe(300);
    expect(creditsUpTo(credits, utc('2026-03-11'))).toBe(600);
  });
});

describe('effectiveClosedAt', () => {
  const credits = reconcileCredits({
    payments: [{ paidAt: utc('2026-02-10'), amountCents: 5_000, method: PaymentMethod.Cash }],
    paidScheduleItems: [],
  });

  it('trusts closedAt when a service set it', () => {
    const closed = effectiveClosedAt(
      { status: LoanStatus.Settled, closedAt: utc('2026-03-01'), disbursedAt: utc('2026-01-01') },
      credits,
    );
    expect(closed?.toISOString().slice(0, 10)).toBe('2026-03-01');
  });

  it('falls back to the last credit when closedAt was never written', () => {
    // recordRepayment, recomputeLoan and the importer all settle loans without
    // setting closedAt; without this the loan would sit on the book forever.
    const closed = effectiveClosedAt(
      { status: LoanStatus.Settled, closedAt: null, disbursedAt: utc('2026-01-01') },
      credits,
    );
    expect(closed?.toISOString().slice(0, 10)).toBe('2026-02-10');
  });

  it('falls back to disbursement for a terminal loan that never took a payment', () => {
    const closed = effectiveClosedAt(
      { status: LoanStatus.WrittenOff, closedAt: null, disbursedAt: utc('2026-01-01') },
      [],
    );
    expect(closed?.toISOString().slice(0, 10)).toBe('2026-01-01');
  });

  it('leaves an open loan open', () => {
    expect(
      effectiveClosedAt(
        { status: LoanStatus.Active, closedAt: null, disbursedAt: utc('2026-01-01') },
        credits,
      ),
    ).toBeNull();
  });
});

describe('impliedSchedule', () => {
  it('always sums back to the loan total, even when indivisible', () => {
    const schedule = impliedSchedule({
      disbursedAt: utc('2026-01-15'),
      instalmentsTotal: 3,
      totalCents: 100_003,
    });
    expect(schedule).toHaveLength(3);
    expect(schedule.reduce((sum, item) => sum + item.amountCents, 0)).toBe(100_003);
  });

  it('falls due monthly from the disbursement date', () => {
    const schedule = impliedSchedule({
      disbursedAt: utc('2026-01-15'),
      instalmentsTotal: 3,
      totalCents: 300,
    });
    expect(schedule.map((item) => item.dueAt.toISOString().slice(0, 10))).toEqual([
      '2026-02-15',
      '2026-03-15',
      '2026-04-15',
    ]);
  });

  it('never produces an empty schedule', () => {
    expect(impliedSchedule({ disbursedAt: utc('2026-01-15'), instalmentsTotal: 0, totalCents: 500 }))
      .toHaveLength(1);
  });
});

describe('ageAt', () => {
  const schedule = impliedSchedule({
    disbursedAt: utc('2026-01-01'),
    instalmentsTotal: 5,
    totalCents: 500_000, // 5 x N$1,000
  });

  it('ages from the oldest instalment still short', () => {
    // N$2,500 collected covers instalments 1 and 2; instalment 3 fell due
    // 2026-04-01 and is 44 days late on 2026-05-15.
    const result = ageAt({ schedule, amountRepaidCents: 250_000, asOf: utc('2026-05-15') });
    expect(result.outstandingCents).toBe(250_000);
    expect(result.daysLate).toBe(44);
    expect(ageingBucketFor(result.daysLate)).toBe('d30');
  });

  it('reports a fully-paid loan as current with nothing outstanding', () => {
    const result = ageAt({ schedule, amountRepaidCents: 500_000, asOf: utc('2026-07-01') });
    expect(result.outstandingCents).toBe(0);
    expect(result.daysLate).toBe(0);
    expect(result.overdueCents).toBe(0);
  });

  it('does not age instalments that are not yet due', () => {
    const result = ageAt({ schedule, amountRepaidCents: 0, asOf: utc('2026-01-15') });
    expect(result.daysLate).toBe(0);
    expect(result.overdueCents).toBe(0);
    expect(result.outstandingCents).toBe(500_000);
  });

  it('accumulates the shortfall across every overdue instalment', () => {
    const result = ageAt({ schedule, amountRepaidCents: 150_000, asOf: utc('2026-04-02') });
    // Instalments 1–3 are due; N$1,500 covers 1 and half of 2.
    expect(result.overdueCents).toBe(150_000);
    expect(result.daysLate).toBe(32); // instalment 2, due 2026-03-01
  });

  it('clamps an overpayment rather than reporting a negative book', () => {
    // settle() pays balance + default interest, which exceeds the schedule.
    const result = ageAt({ schedule, amountRepaidCents: 600_000, asOf: utc('2026-07-01') });
    expect(result.outstandingCents).toBe(0);
  });
});
