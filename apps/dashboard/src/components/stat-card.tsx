import type { LucideIcon } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';

/** Retained for API compatibility; colour is neutral in the vanilla shadcn theme. */
type Tone = 'brand' | 'green' | 'red' | 'amber';

export interface StatCardProps {
  label: string;
  value: string;
  icon: LucideIcon;
  tone?: Tone;
  hint?: string;
  delta?: { text: string; dir: 'up' | 'down' };
}

/** KPI card: label + muted icon, large value, optional footer hint/delta. */
export const StatCard = ({ label, value, icon: Icon, hint, delta }: StatCardProps) => (
  <Card className="gap-0 p-5">
    <div className="flex items-start justify-between gap-3">
      <span className="text-sm font-medium text-muted-foreground">{label}</span>
      <span className="flex size-9 items-center justify-center rounded-md bg-muted text-muted-foreground">
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
