import type { LucideIcon } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';

type Tone = 'default' | 'green' | 'red' | 'amber' | 'blue';

const TONE_CLASS: Record<Tone, string> = {
  default: 'text-foreground',
  green: 'text-emerald-600 dark:text-emerald-400',
  red: 'text-red-600 dark:text-red-400',
  amber: 'text-amber-600 dark:text-amber-400',
  blue: 'text-blue-600 dark:text-blue-400',
};

export interface StatItem {
  label: string;
  value: string;
  icon?: LucideIcon;
  hint?: string;
  tone?: Tone;
}

/** A compact horizontal row of KPIs derived from list data — a page summary. */
export const StatStrip = ({ items }: { items: StatItem[] }) => (
  <Card className="grid grid-cols-2 divide-y p-0 sm:grid-cols-4 sm:divide-x sm:divide-y-0 [&>*:nth-child(2)]:border-l sm:[&>*:nth-child(2)]:border-l-0">
    {items.map((item) => {
      const Icon = item.icon;
      return (
        <div key={item.label} className="flex flex-col gap-1 p-4">
          <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            {Icon ? <Icon className="size-3.5" /> : null}
            {item.label}
          </span>
          <span
            className={cn(
              'font-heading text-xl leading-none font-semibold tracking-tight tabular-nums',
              TONE_CLASS[item.tone ?? 'default'],
            )}
          >
            {item.value}
          </span>
          {item.hint ? <span className="text-xs text-muted-foreground">{item.hint}</span> : null}
        </div>
      );
    })}
  </Card>
);
