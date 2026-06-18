import type { LucideIcon } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';

type Tone = 'brand' | 'green' | 'red' | 'amber';

/** Subtle tinted icon chip per tone; falls back to neutral muted. */
const TONE_CLASS: Record<Tone, string> = {
  brand: 'bg-primary/10 text-primary',
  green: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  red: 'bg-red-500/10 text-red-600 dark:text-red-400',
  amber: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
};

export interface StatCardProps {
  label: string;
  value: string;
  icon: LucideIcon;
  tone?: Tone;
  hint?: string;
  delta?: { text: string; dir: 'up' | 'down' };
}

/** KPI card: label + tinted icon, large value, optional footer hint/delta. */
export const StatCard = ({ label, value, icon: Icon, tone, hint, delta }: StatCardProps) => (
  <Card className="gap-0 p-5">
    <div className="flex items-start justify-between gap-3">
      <span className="text-sm font-medium text-muted-foreground">{label}</span>
      <span
        className={cn(
          'flex size-9 items-center justify-center rounded-md',
          tone ? TONE_CLASS[tone] : 'bg-muted text-muted-foreground',
        )}
      >
        <Icon className="size-[18px]" />
      </span>
    </div>
    <div className="mt-3 font-heading text-[29px] leading-none font-semibold tracking-tight tabular-nums">
      {value}
    </div>
    {(hint || delta) && (
      <div className="mt-2 flex items-center gap-1.5 text-[12.5px] text-muted-foreground">
        {delta && (
          <span
            className={cn(
              'font-semibold',
              delta.dir === 'down' ? 'text-destructive' : 'text-foreground',
            )}
          >
            {delta.text}
          </span>
        )}
        {hint}
      </div>
    )}
  </Card>
);
