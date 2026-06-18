/**
 * Activity timelines, derived purely from the timestamps the records already
 * carry — there is no separate audit log (yet). These builders are
 * framework-free and take minimal plain shapes so both the API (from Prisma
 * rows) and tests can call them. All money is integer NAD cents.
 */
import { ApplicationStatus } from './enums';
import { formatNad } from './money';

export type ActivityKind =
  | 'submitted'
  | 'reviewed'
  | 'approved'
  | 'declined'
  | 'disbursed'
  | 'payment'
  | 'settled'
  | 'written_off';

export interface ActivityEvent {
  kind: ActivityKind;
  /** ISO timestamp the event occurred at. */
  at: string;
  label: string;
  /** Money involved (cents), when relevant — e.g. a payment or disbursement. */
  amount?: number;
}

/** Most-recent first; events without a timestamp sort last. */
export const sortActivity = (events: ActivityEvent[]): ActivityEvent[] =>
  [...events].sort((a, b) => (b.at ?? '').localeCompare(a.at ?? ''));

const iso = (value: Date | string | null | undefined): string | null => {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : value;
};

export interface ApplicationActivityInput {
  status: string;
  submittedAt: Date | string;
  decidedAt?: Date | string | null;
  declineReason?: string | null;
  quotedTotal?: number | null;
}

/** Submitted → (reviewed) → approved/declined, from the application's stamps. */
export const buildApplicationActivity = (app: ApplicationActivityInput): ActivityEvent[] => {
  const events: ActivityEvent[] = [
    { kind: 'submitted', at: iso(app.submittedAt) ?? '', label: 'Application submitted' },
  ];
  const decidedAt = iso(app.decidedAt);
  if (decidedAt) {
    if (app.status === ApplicationStatus.Review) {
      events.push({ kind: 'reviewed', at: decidedAt, label: 'Moved to review' });
    } else if (app.status === ApplicationStatus.Approved) {
      events.push({
        kind: 'approved',
        at: decidedAt,
        label: 'Approved & loan disbursed',
        amount: app.quotedTotal ?? undefined,
      });
    } else if (app.status === ApplicationStatus.Declined) {
      events.push({
        kind: 'declined',
        at: decidedAt,
        label: app.declineReason ? `Declined — ${app.declineReason}` : 'Declined',
      });
    }
  }
  return sortActivity(events);
};

export interface LoanActivityInput {
  status: string;
  disbursedAt?: Date | string | null;
  createdAt: Date | string;
  closedAt?: Date | string | null;
  writeOffReason?: string | null;
  balance: number;
}

export interface PaymentActivityInput {
  paidAt: Date | string | null;
  amount: number;
  badDebt?: boolean;
}

/** Disbursed → each payment → settled / written-off, from loan + payment rows. */
export const buildLoanActivity = (
  loan: LoanActivityInput,
  payments: PaymentActivityInput[],
): ActivityEvent[] => {
  const events: ActivityEvent[] = [
    {
      kind: 'disbursed',
      at: iso(loan.disbursedAt) ?? iso(loan.createdAt) ?? '',
      label: 'Loan disbursed',
    },
  ];

  for (const payment of payments) {
    events.push({
      kind: 'payment',
      at: iso(payment.paidAt) ?? '',
      label: payment.badDebt
        ? `Payment received (${formatNad(payment.amount)}) — bad debt`
        : `Payment received (${formatNad(payment.amount)})`,
      amount: payment.amount,
    });
  }

  const closedAt = iso(loan.closedAt);
  if (loan.status === 'settled') {
    events.push({ kind: 'settled', at: closedAt ?? '', label: 'Loan settled' });
  } else if (loan.status === 'written_off') {
    events.push({
      kind: 'written_off',
      at: closedAt ?? '',
      label: loan.writeOffReason ? `Written off — ${loan.writeOffReason}` : 'Written off',
    });
  }

  return sortActivity(events);
};
