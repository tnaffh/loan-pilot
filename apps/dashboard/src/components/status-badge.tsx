import { cn } from '@/lib/utils';

type BadgeTone = 'positive' | 'neutral' | 'caution' | 'negative';

/** Status values from loans, applications, affordability and schedules. */
const TONES: Record<string, BadgeTone> = {
  // LoanStatus
  active: 'positive',
  arrears: 'negative',
  partly_paid: 'caution',
  settled: 'neutral',
  written_off: 'negative',
  closed: 'neutral',
  // ApplicationStatus
  pending: 'caution',
  review: 'caution',
  approved: 'positive',
  declined: 'negative',
  // AffordabilityResult
  pass: 'positive',
  fail: 'negative',
  // RepaymentStatus
  paid: 'positive',
  due: 'caution',
  overdue: 'negative',
};

const TONE_CLASSES: Record<BadgeTone, string> = {
  positive: 'bg-ok-soft text-ok',
  neutral: 'bg-muted text-muted-foreground',
  caution: 'bg-warn-soft text-warn',
  negative: 'bg-bad-soft text-bad',
};

const LABELS: Record<string, string> = {
  active: 'Active',
  arrears: 'In arrears',
  partly_paid: 'Partly paid',
  settled: 'Settled',
  written_off: 'Written off',
  closed: 'Closed',
  pending: 'Pending',
  review: 'Review',
  approved: 'Approved',
  declined: 'Declined',
  pass: 'Pass',
  fail: 'Fail',
  paid: 'Paid',
  due: 'Due',
  overdue: 'Overdue',
};

export const StatusBadge = ({ value }: { value: string }) => {
  const tone = TONES[value] ?? 'neutral';
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold',
        TONE_CLASSES[tone],
      )}
    >
      <span className="size-1.5 rounded-full bg-current" />
      {LABELS[value] ?? value}
    </span>
  );
};
