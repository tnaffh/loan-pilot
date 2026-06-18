import { buildApplicationActivity, buildLoanActivity, sortActivity } from './activity';
import { ApplicationStatus } from './enums';
import { toCents } from './money';

describe('buildApplicationActivity', () => {
  it('records submission only while pending', () => {
    const events = buildApplicationActivity({
      status: ApplicationStatus.Pending,
      submittedAt: '2026-01-01T08:00:00.000Z',
    });
    expect(events).toHaveLength(1);
    expect(events[0]?.kind).toBe('submitted');
  });

  it('adds an approval event with the quoted total', () => {
    const events = buildApplicationActivity({
      status: ApplicationStatus.Approved,
      submittedAt: '2026-01-01T08:00:00.000Z',
      decidedAt: '2026-01-02T08:00:00.000Z',
      quotedTotal: toCents(1300),
    });
    expect(events[0]?.kind).toBe('approved'); // most-recent first
    expect(events[0]?.amount).toBe(toCents(1300));
  });

  it('includes the decline reason', () => {
    const events = buildApplicationActivity({
      status: ApplicationStatus.Declined,
      submittedAt: '2026-01-01T08:00:00.000Z',
      decidedAt: '2026-01-02T08:00:00.000Z',
      declineReason: 'Affordability',
    });
    expect(events[0]?.label).toContain('Affordability');
  });
});

describe('buildLoanActivity', () => {
  it('orders disbursement, payments and settlement most-recent first', () => {
    const events = buildLoanActivity(
      {
        status: 'settled',
        disbursedAt: '2026-01-01T00:00:00.000Z',
        createdAt: '2026-01-01T00:00:00.000Z',
        closedAt: '2026-03-01T00:00:00.000Z',
        balance: 0,
      },
      [{ paidAt: '2026-02-01T00:00:00.000Z', amount: toCents(1300) }],
    );
    expect(events.map((e) => e.kind)).toEqual(['settled', 'payment', 'disbursed']);
  });
});

describe('sortActivity', () => {
  it('sorts timestamped events descending', () => {
    const sorted = sortActivity([
      { kind: 'disbursed', at: '2026-01-01T00:00:00.000Z', label: 'a' },
      { kind: 'payment', at: '2026-02-01T00:00:00.000Z', label: 'b' },
    ]);
    expect(sorted[0]?.label).toBe('b');
  });
});
