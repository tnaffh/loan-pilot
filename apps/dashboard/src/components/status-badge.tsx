import {
  Activity,
  AlertTriangle,
  Ban,
  CheckCircle2,
  CircleDashed,
  Clock,
  HandCoins,
  Hourglass,
  Lock,
  Search,
  XCircle,
  type LucideIcon,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

type Tone = 'green' | 'amber' | 'red' | 'blue' | 'zinc';

const TONE_CLASS: Record<Tone, string> = {
  green: 'border-transparent bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
  amber: 'border-transparent bg-amber-500/10 text-amber-700 dark:text-amber-400',
  red: 'border-transparent bg-red-500/10 text-red-700 dark:text-red-400',
  blue: 'border-transparent bg-blue-500/10 text-blue-700 dark:text-blue-400',
  zinc: 'border-transparent bg-muted text-muted-foreground',
};

interface StatusMeta {
  label: string;
  tone: Tone;
  icon: LucideIcon;
}

/** Status → label, colour tone and icon. Covers loan / application / affordability / repayment. */
const STATUS: Record<string, StatusMeta> = {
  // LoanStatus
  active: { label: 'Active', tone: 'green', icon: Activity },
  arrears: { label: 'In arrears', tone: 'red', icon: AlertTriangle },
  partly_paid: { label: 'Partly paid', tone: 'amber', icon: CircleDashed },
  settled: { label: 'Settled', tone: 'blue', icon: CheckCircle2 },
  written_off: { label: 'Written off', tone: 'zinc', icon: Ban },
  cancelled: { label: 'Cancelled', tone: 'zinc', icon: XCircle },
  closed: { label: 'Closed', tone: 'zinc', icon: Lock },
  // ApplicationStatus
  pending: { label: 'Pending', tone: 'amber', icon: Hourglass },
  review: { label: 'Review', tone: 'blue', icon: Search },
  approved: { label: 'Approved', tone: 'green', icon: CheckCircle2 },
  declined: { label: 'Declined', tone: 'red', icon: XCircle },
  // AffordabilityResult
  pass: { label: 'Pass', tone: 'green', icon: CheckCircle2 },
  fail: { label: 'Fail', tone: 'red', icon: XCircle },
  // RepaymentStatus
  paid: { label: 'Paid', tone: 'green', icon: CheckCircle2 },
  due: { label: 'Due', tone: 'zinc', icon: Clock },
  overdue: { label: 'Overdue', tone: 'red', icon: AlertTriangle },
  // ExpenseKind
  expense: { label: 'Expense', tone: 'zinc', icon: HandCoins },
  drawing: { label: 'Drawing', tone: 'amber', icon: HandCoins },
  // UserStatus (active is shared with LoanStatus above)
  invited: { label: 'Invited', tone: 'amber', icon: Hourglass },
  disabled: { label: 'Disabled', tone: 'zinc', icon: Ban },
};

interface StatusBadgeProps {
  value: string;
  /** Hide the leading icon for tight layouts. */
  iconless?: boolean;
  className?: string;
}

export const StatusBadge = ({ value, iconless, className }: StatusBadgeProps) => {
  const meta = STATUS[value];
  if (!meta) {
    return (
      <Badge variant="outline" className={className}>
        {value}
      </Badge>
    );
  }
  const Icon = meta.icon;
  return (
    <Badge className={cn(TONE_CLASS[meta.tone], className)}>
      {iconless ? null : <Icon />}
      {meta.label}
    </Badge>
  );
};
