import {
  Ban,
  Banknote,
  CheckCircle2,
  CircleDot,
  FileText,
  Search,
  XCircle,
  type LucideIcon,
} from 'lucide-react';
import type { ActivityEvent, ActivityKind } from '@loan-pilot/domain';
import { formatDate } from '@/lib/format';
import { cn } from '@/lib/utils';

const ICONS: Record<ActivityKind, LucideIcon> = {
  submitted: FileText,
  reviewed: Search,
  approved: CheckCircle2,
  declined: XCircle,
  disbursed: Banknote,
  payment: CircleDot,
  settled: CheckCircle2,
  written_off: Ban,
  cancelled: XCircle,
};

const TONES: Record<ActivityKind, string> = {
  submitted: 'text-muted-foreground',
  reviewed: 'text-blue-600 dark:text-blue-400',
  approved: 'text-emerald-600 dark:text-emerald-400',
  declined: 'text-destructive',
  disbursed: 'text-foreground',
  payment: 'text-emerald-600 dark:text-emerald-400',
  settled: 'text-emerald-600 dark:text-emerald-400',
  written_off: 'text-destructive',
  cancelled: 'text-destructive',
};

/** Vertical activity timeline rendered from derived ActivityEvent[] (most recent first). */
export const ActivityTimeline = ({ events }: { events: ActivityEvent[] }) => {
  if (events.length === 0) {
    return <p className="text-sm text-muted-foreground">No activity yet.</p>;
  }
  return (
    <ol className="space-y-4">
      {events.map((event, index) => {
        const Icon = ICONS[event.kind];
        return (
          <li key={`${event.kind}-${event.at}-${index}`} className="flex gap-3">
            <div className="flex flex-col items-center">
              <span className={cn('flex size-7 items-center justify-center rounded-full bg-muted', TONES[event.kind])}>
                <Icon className="size-4" />
              </span>
              {index < events.length - 1 ? <span className="mt-1 w-px flex-1 bg-border" /> : null}
            </div>
            <div className="pb-1">
              <p className="text-sm font-medium leading-tight">{event.label}</p>
              <p className="text-xs text-muted-foreground">
                {event.at ? formatDate(event.at) : 'Date unknown'}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
};
