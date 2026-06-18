'use client';

import { useMemo } from 'react';
import { CalendarRange } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export const ALL_MONTHS = 'all';

/** Extract a `YYYY-MM` bucket key from an ISO date string. */
export const toMonthKey = (iso: string | null | undefined): string | null =>
  iso && iso.length >= 7 ? iso.slice(0, 7) : null;

const MONTH_LABEL = new Intl.DateTimeFormat('en-NA', { month: 'short', year: 'numeric' });

/** Format a `YYYY-MM` key as e.g. "Oct 2023". */
export const formatMonth = (key: string): string => {
  const [year, month] = key.split('-').map(Number);
  if (!year || !month) return key;
  return MONTH_LABEL.format(new Date(year, month - 1, 1));
};

/**
 * Derive the sorted (newest-first) list of month keys present in `dates`, plus
 * the most recent one — the "smart default" for a month filter.
 */
export const useMonthOptions = (dates: (string | null | undefined)[]) =>
  useMemo(() => {
    const keys = Array.from(
      new Set(dates.map(toMonthKey).filter((key): key is string => key !== null)),
    ).sort((a, b) => b.localeCompare(a));
    return { months: keys, latest: keys[0] ?? ALL_MONTHS };
  }, [dates]);

interface MonthFilterProps {
  months: string[];
  value: string;
  onChange: (value: string) => void;
}

/** Month dropdown with an "All time" option; pairs with useMonthOptions(). */
export const MonthFilter = ({ months, value, onChange }: MonthFilterProps) => (
  <Select value={value} onValueChange={(next) => onChange(next ?? ALL_MONTHS)}>
    <SelectTrigger size="sm" className="w-42">
      <CalendarRange className="size-4 text-muted-foreground" />
      <SelectValue />
    </SelectTrigger>
    <SelectContent>
      <SelectItem value={ALL_MONTHS}>All time</SelectItem>
      {months.map((key) => (
        <SelectItem key={key} value={key}>
          {formatMonth(key)}
        </SelectItem>
      ))}
    </SelectContent>
  </Select>
);
