import { Badge } from '@/components/ui/badge';

type Variant = 'default' | 'secondary' | 'destructive' | 'outline';

/** Maps loan / application / affordability / repayment statuses to a Badge variant. */
const VARIANTS: Record<string, Variant> = {
  // LoanStatus
  active: 'secondary',
  arrears: 'destructive',
  partly_paid: 'outline',
  settled: 'default',
  written_off: 'destructive',
  closed: 'outline',
  // ApplicationStatus
  pending: 'outline',
  review: 'secondary',
  approved: 'default',
  declined: 'destructive',
  // AffordabilityResult
  pass: 'default',
  fail: 'destructive',
  // RepaymentStatus
  paid: 'default',
  due: 'outline',
  overdue: 'destructive',
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

export const StatusBadge = ({ value }: { value: string }) => (
  <Badge variant={VARIANTS[value] ?? 'outline'}>{LABELS[value] ?? value}</Badge>
);
