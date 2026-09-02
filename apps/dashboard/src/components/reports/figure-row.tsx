'use client';

import { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { formatNad, fromCents } from '@loan-pilot/domain';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * The plain number the NAMFISA portal accepts — no currency prefix, no thousands
 * separators, decimals only when the amount actually has cents. Typing
 * "N$ 1,778.81" into the portal is rejected, so the copy button hands over
 * "1778.81".
 */
export const rawAmount = (cents: number): string => String(Number(fromCents(cents).toFixed(2)));

interface FigureRowProps {
  label: string;
  /** Integer cents for a money figure, or a plain count. */
  value: number;
  kind?: 'money' | 'count';
  /** Emphasise a subtotal or total line. */
  strong?: boolean;
  indent?: boolean;
  hint?: string;
}

/**
 * One line of the return: the label as the form words it, the human-readable
 * amount, and the raw value with a copy control. Both are shown because the
 * figure is read by a person and typed into a portal by the same person.
 */
export const FigureRow = ({ label, value, kind = 'money', strong, indent, hint }: FigureRowProps) => {
  const [copied, setCopied] = useState(false);
  const raw = kind === 'money' ? rawAmount(value) : String(value);
  const display = kind === 'money' ? formatNad(value) : String(value);

  const copy = () => {
    void navigator.clipboard?.writeText(raw).then(
      () => {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1200);
      },
      () => undefined,
    );
  };

  return (
    <div
      className={cn(
        'group flex items-center gap-3 border-b border-border/60 py-1.5 last:border-0',
        strong && 'border-border font-medium',
      )}
    >
      <div className={cn('min-w-0 flex-1', indent && 'pl-4')}>
        <p
          className={cn(
            'truncate text-sm',
            strong ? 'font-medium text-foreground' : 'text-muted-foreground',
          )}
          title={label}
        >
          {label}
        </p>
        {hint ? <p className="truncate text-xs text-muted-foreground/80">{hint}</p> : null}
      </div>
      <div className="shrink-0 text-right">
        <p className={cn('text-sm tabular-nums', strong && 'font-semibold')}>{display}</p>
        <p className="font-mono text-[11px] text-muted-foreground tabular-nums">{raw}</p>
      </div>
      <Button
        type="button"
        size="icon"
        variant="ghost"
        aria-label={`Copy ${label}`}
        className="size-7 shrink-0 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
        onClick={copy}
      >
        {copied ? <Check className="size-3.5 text-emerald-600" /> : <Copy className="size-3.5" />}
      </Button>
    </div>
  );
};
