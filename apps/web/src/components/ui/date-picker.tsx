'use client';

import { useState } from 'react';
import { CalendarIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

/** Convert an ISO `YYYY-MM-DD` string to a local Date (or undefined). */
const fromIso = (value?: string): Date | undefined => {
  if (!value) return undefined;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return undefined;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
};

/** Format a local Date back to an ISO `YYYY-MM-DD` string. */
const toIso = (date: Date): string =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate(),
  ).padStart(2, '0')}`;

const LABEL_FORMAT = new Intl.DateTimeFormat('en-NA', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

interface DatePickerProps {
  id?: string;
  value?: string;
  onChange: (value: string) => void;
  placeholder?: string;
  /** Disable dates after today (e.g. for a date of birth). */
  disableFuture?: boolean;
  className?: string;
}

/** Popover + Calendar date picker that reads/writes ISO `YYYY-MM-DD` strings. */
export const DatePicker = ({
  id,
  value,
  onChange,
  placeholder = 'Select a date',
  disableFuture,
  className,
}: DatePickerProps) => {
  const [open, setOpen] = useState(false);
  const selected = fromIso(value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            id={id}
            type="button"
            variant="outline"
            className={cn(
              'w-full justify-start text-left font-normal',
              !selected && 'text-muted-foreground',
              className,
            )}
          >
            <CalendarIcon className="size-4" />
            {selected ? LABEL_FORMAT.format(selected) : placeholder}
          </Button>
        }
      />
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          captionLayout="dropdown"
          startMonth={new Date(1925, 0)}
          endMonth={new Date()}
          defaultMonth={selected ?? new Date(2000, 0)}
          selected={selected}
          disabled={disableFuture ? { after: new Date() } : undefined}
          onSelect={(date) => {
            if (date) {
              onChange(toIso(date));
              setOpen(false);
            }
          }}
        />
      </PopoverContent>
    </Popover>
  );
};
