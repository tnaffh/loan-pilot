'use client';

import { useState } from 'react';
import type { DateRange } from 'react-day-picker';
import { CalendarRange, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

export interface IsoRange {
  from?: string;
  to?: string;
}

const toIso = (date: Date): string =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate(),
  ).padStart(2, '0')}`;

const fromIso = (value?: string): Date | undefined =>
  value ? new Date(`${value}T00:00:00`) : undefined;

const LABEL = new Intl.DateTimeFormat('en-NA', { day: '2-digit', month: 'short', year: '2-digit' });

interface DateRangeFilterProps {
  value: IsoRange;
  onChange: (value: IsoRange) => void;
  className?: string;
}

/** Popover + range Calendar that reads/writes ISO `YYYY-MM-DD` from/to strings. */
export const DateRangeFilter = ({ value, onChange, className }: DateRangeFilterProps) => {
  const [open, setOpen] = useState(false);
  const selected: DateRange | undefined = value.from
    ? { from: fromIso(value.from), to: fromIso(value.to) }
    : undefined;

  const label = value.from
    ? `${LABEL.format(fromIso(value.from)!)}${value.to ? ` – ${LABEL.format(fromIso(value.to)!)}` : ''}`
    : 'Date range';

  return (
    <div className={cn('flex items-center gap-1', className)}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          render={
            <Button
              type="button"
              variant="outline"
              size="sm"
              className={cn(!value.from && 'text-muted-foreground')}
            >
              <CalendarRange className="size-4" />
              {label}
            </Button>
          }
        />
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="range"
            numberOfMonths={2}
            defaultMonth={selected?.from}
            selected={selected}
            onSelect={(range) =>
              onChange({
                from: range?.from ? toIso(range.from) : undefined,
                to: range?.to ? toIso(range.to) : undefined,
              })
            }
          />
        </PopoverContent>
      </Popover>
      {value.from ? (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-8"
          aria-label="Clear date range"
          onClick={() => onChange({})}
        >
          <X className="size-4" />
        </Button>
      ) : null}
    </div>
  );
};

/** True when `iso` falls within the (inclusive) range; an empty range matches everything. */
export const isInRange = (iso: string | null | undefined, range: IsoRange): boolean => {
  if (!range.from) return true;
  if (!iso) return false;
  const day = iso.slice(0, 10);
  if (day < range.from) return false;
  if (range.to && day > range.to) return false;
  return true;
};
