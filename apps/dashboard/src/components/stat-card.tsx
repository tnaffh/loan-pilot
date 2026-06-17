import type { LucideIcon } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';

type Tone = 'brand' | 'green' | 'red' | 'amber';

const TONE_CHIP: Record<Tone, string> = {
  brand: 'bg-brand-soft text-brand-deep',
  green: 'bg-ok-soft text-ok',
  red: 'bg-bad-soft text-bad',
  amber: 'bg-warn-soft text-warn',
};

export interface StatCardProps {
  label: string;
  value: string;
  icon: LucideIcon;
  tone?: Tone;
  hint?: string;
  delta?: { text: string; dir: 'up' | 'down' };
}

/** KPI card: label + tinted icon chip, large serif value, optional footer hint/delta. */
export const StatCard = ({ label, value, icon: Icon, tone = 'brand', hint, delta }: StatCardProps) => (
  <Card className="gap-0 p-5">
    <div className="flex items-start justify-between gap-3">
      <span className="text-sm font-medium text-muted-foreground">{label}</span>
      <span className={cn('flex size-9 items-center justify-center rounded-[9px]', TONE_CHIP[tone])}>
        <Icon className="size-[18px]" />
      </span>
    </div>
    <div className="mt-3 font-heading text-[29px] leading-none font-semibold tracking-tight tabular-nums">
      {value}
    </div>
    {(hint || delta) && (
      <div className="mt-2 flex items-center gap-1.5 text-[12.5px] text-muted-foreground">
        {delta && (
          <span className={delta.dir === 'down' ? 'font-semibold text-bad' : 'font-semibold text-ok'}>
            {delta.text}
          </span>
        )}
        {hint}
      </div>
    )}
  </Card>
);
