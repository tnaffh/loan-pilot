import { LoanStatus, PaymentMethod, RepaymentStatus } from '@loan-pilot/domain';
import {
  bookAt,
  bookValueAt,
  buildLedgers,
  creditsInPeriod,
  onBookAt,
  outstandingAt,
  writeOffsInPeriod,
  type ReportLoanRow,
  type ReportPaymentRow,
  type ReportScheduleRow,
} from './reports.reconstruction';

const utc = (iso: string): Date => new Date(`${iso}T00:00:00.000Z`);

const loan = (over: Partial<ReportLoanRow> = {}): ReportLoanRow => ({
  id: 'loan_1',
  borrowerId: 'borrower_1',
  status: LoanStatus.Active,
  total: 130_000,
  principal: 100_000,
  financeCharge: 30_000,
  instalmentsTotal: 1,
  disbursedAt: utc('2026-01-10'),
  closedAt: null,
  ...over,
});

const payment = (over: Partial<ReportPaymentRow> = {}): ReportPaymentRow => ({
  loanId: 'loan_1',
  paidAt: utc('2026-02-10'),
  amount: 130_000,
  method: PaymentMethod.DebitOrder,
  ...over,
});

const scheduleItem = (over: Partial<ReportScheduleRow> = {}): ReportScheduleRow => ({
  loanId: 'loan_1',
  amount: 130_000,
  paidAt: utc('2026-02-10'),
  status: RepaymentStatus.Paid,
  ...over,
});

describe('buildLedgers', () => {
  it('rebuilds a book value that moves as repayments land', () => {
    const ledgers = buildLedgers({
      loans: [loan()],
      payments: [payment({ amount: 50_000, paidAt: utc('2026-02-10') })],
      scheduleItems: [],
    });

    // Before the payment the whole total is outstanding; after it, the balance.
    expect(bookValueAt(ledgers.values(), utc('2026-02-01'))).toBe(130_000);
    expect(bookValueAt(ledgers.values(), utc('2026-03-01'))).toBe(80_000);
  });

  it('leaves a loan off the book before it was disbursed', () => {
    const ledgers = buildLedgers({ loans: [loan()], payments: [], scheduleItems: [] });
    expect(bookValueAt(ledgers.values(), utc('2026-01-01'))).toBe(0);
  });

  it('never counts a cancelled loan, which advanced no money', () => {
    const ledgers = buildLedgers({
      loans: [loan({ status: LoanStatus.Cancelled })],
      payments: [],
      scheduleItems: [],
    });
    expect(bookValueAt(ledgers.values(), utc('2026-06-01'))).toBe(0);
  });

  it('ages an imported loan that has no schedule rows at all', () => {
    // The register import creates loans without RepaymentScheduleItem rows, so
    // anything reading stored schedule status would report zero arrears here.
    const ledgers = buildLedgers({
      loans: [loan({ instalmentsTotal: 1, disbursedAt: utc('2026-01-10') })],
      payments: [],
      scheduleItems: [],
    });
    const entries = bookAt(ledgers.values(), utc('2026-04-01'));
    expect(entries).toHaveLength(1);
    expect(entries[0]?.outstandingCents).toBe(130_000);
    // Due 2026-02-10, so 50 days late on 2026-04-01.
    expect(entries[0]?.ageing.daysLate).toBe(50);
  });

  it('counts a settlement once when both a payment and its schedule rows exist', () => {
    const ledgers = buildLedgers({
      loans: [loan()],
      payments: [payment({ amount: 130_000 })],
      scheduleItems: [scheduleItem({ amount: 130_000 })],
    });
    const ledger = ledgers.get('loan_1');
    expect(ledger?.credits).toHaveLength(1);
    expect(bookValueAt(ledgers.values(), utc('2026-03-01'))).toBe(0);
  });

  it('sums a loan repaid through both dashboard paths', () => {
    // One instalment marked paid on the loan page, one payment through the
    // dialog: 30,000 + 40,000 must be credited, not the larger of the two.
    const ledgers = buildLedgers({
      loans: [loan()],
      payments: [payment({ amount: 40_000, paidAt: utc('2026-03-10') })],
      scheduleItems: [scheduleItem({ amount: 30_000, paidAt: utc('2026-02-10') })],
    });
    const ledger = ledgers.get('loan_1');
    expect(ledger).toBeDefined();
    if (ledger) {
      expect(outstandingAt(ledger, utc('2026-04-01'))).toBe(60_000);
    }
  });

  it('ignores schedule rows that are still due', () => {
    const ledgers = buildLedgers({
      loans: [loan()],
      payments: [],
      scheduleItems: [scheduleItem({ status: RepaymentStatus.Due, paidAt: null })],
    });
    expect(bookValueAt(ledgers.values(), utc('2026-06-01'))).toBe(130_000);
  });
});

describe('onBookAt', () => {
  it('takes a settled loan off the book once it is repaid', () => {
    const ledgers = buildLedgers({
      loans: [loan({ status: LoanStatus.Settled, closedAt: null })],
      payments: [payment({ amount: 130_000, paidAt: utc('2026-02-10') })],
      scheduleItems: [],
    });
    const ledger = ledgers.get('loan_1');
    expect(ledger).toBeDefined();
    if (ledger) {
      expect(onBookAt(ledger, utc('2026-02-01'))).toBe(true);
      expect(onBookAt(ledger, utc('2026-03-01'))).toBe(false);
    }
  });

  it('keeps a written-off loan on the book only until it was written off', () => {
    // writeOff() does not zero the balance, so a naive SUM(balance) would carry
    // this loan forever.
    const ledgers = buildLedgers({
      loans: [
        loan({ status: LoanStatus.WrittenOff, closedAt: utc('2026-03-15'), instalmentsTotal: 1 }),
      ],
      payments: [],
      scheduleItems: [],
    });
    expect(bookValueAt(ledgers.values(), utc('2026-03-01'))).toBe(130_000);
    expect(bookValueAt(ledgers.values(), utc('2026-04-01'))).toBe(0);
  });
});

describe('writeOffsInPeriod', () => {
  it('values a write-off at what was still owed when it left the book', () => {
    const ledgers = buildLedgers({
      loans: [loan({ status: LoanStatus.WrittenOff, closedAt: utc('2026-03-15') })],
      payments: [payment({ amount: 30_000, paidAt: utc('2026-02-10') })],
      scheduleItems: [],
    });
    const written = writeOffsInPeriod(ledgers.values(), utc('2026-03-01'), utc('2026-04-01'));
    expect(written).toHaveLength(1);
    expect(written[0]?.amountCents).toBe(100_000);
  });

  it('excludes write-offs from other periods', () => {
    const ledgers = buildLedgers({
      loans: [loan({ status: LoanStatus.WrittenOff, closedAt: utc('2026-05-15') })],
      payments: [],
      scheduleItems: [],
    });
    expect(writeOffsInPeriod(ledgers.values(), utc('2026-03-01'), utc('2026-04-01'))).toHaveLength(0);
  });
});

describe('creditsInPeriod', () => {
  it('returns only credits inside the half-open window', () => {
    const ledgers = buildLedgers({
      loans: [loan()],
      payments: [
        payment({ amount: 1_000, paidAt: utc('2026-02-28') }),
        payment({ amount: 2_000, paidAt: utc('2026-03-01') }),
        payment({ amount: 4_000, paidAt: utc('2026-03-31') }),
        payment({ amount: 8_000, paidAt: utc('2026-04-01') }),
      ],
      scheduleItems: [],
    });
    const credits = creditsInPeriod(ledgers.values(), utc('2026-03-01'), utc('2026-04-01'));
    expect(credits.reduce((sum, credit) => sum + credit.amountCents, 0)).toBe(6_000);
  });
});
