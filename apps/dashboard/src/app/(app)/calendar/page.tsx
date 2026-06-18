'use client';

import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { LoanStatus, formatNad } from '@loan-pilot/domain';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { PageHeader } from '@/components/page-header';
import { StatusBadge } from '@/components/status-badge';
import { useCommand } from '@/components/command-provider';
import { useApi } from '@/lib/use-api';
import { cn } from '@/lib/utils';
import type { LoanRow } from '@/lib/types';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const dayKey = (iso: string): string => iso.slice(0, 10);
const isOpenLoan = (status: LoanStatus): boolean =>
  status === LoanStatus.Active || status === LoanStatus.Arrears || status === LoanStatus.PartlyPaid;

const CalendarPage = () => {
  const command = useCommand();
  const { data, loading } = useApi<LoanRow[]>('/loans');
  const now = new Date();
  const [cursor, setCursor] = useState({ year: now.getFullYear(), month: now.getMonth() });
  const [selected, setSelected] = useState<string | null>(null);

  // Group open loans with a due date by their due day.
  const dueByDay = useMemo(() => {
    const map = new Map<string, LoanRow[]>();
    for (const loan of data ?? []) {
      if (!loan.nextDueAt || !isOpenLoan(loan.status)) continue;
      const key = dayKey(loan.nextDueAt);
      const list = map.get(key) ?? [];
      list.push(loan);
      map.set(key, list);
    }
    return map;
  }, [data]);

  // Build the calendar grid: leading blanks (Mon-start) + each day of the month.
  const cells = useMemo(() => {
    const first = new Date(Date.UTC(cursor.year, cursor.month, 1));
    const lead = (first.getUTCDay() + 6) % 7; // convert Sun=0 to Mon=0 start
    const daysInMonth = new Date(Date.UTC(cursor.year, cursor.month + 1, 0)).getUTCDate();
    const mm = String(cursor.month + 1).padStart(2, '0');
    const blanks: (string | null)[] = Array.from({ length: lead }, () => null);
    const days = Array.from({ length: daysInMonth }, (_, index) => {
      const dd = String(index + 1).padStart(2, '0');
      return `${cursor.year}-${mm}-${dd}`;
    });
    return [...blanks, ...days];
  }, [cursor]);

  const todayKey = dayKey(now.toISOString());
  const selectedLoans = selected ? (dueByDay.get(selected) ?? []) : [];

  const step = (delta: number) =>
    setCursor((current) => {
      const next = new Date(Date.UTC(current.year, current.month + delta, 1));
      return { year: next.getUTCFullYear(), month: next.getUTCMonth() };
    });

  return (
    <div className="space-y-6">
      <PageHeader title="Calendar" description="Upcoming loan due dates across the book" />

      {loading ? (
        <Skeleton className="h-96 w-full rounded-xl" />
      ) : (
        <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
          <Card>
            <CardContent className="p-4">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="font-heading text-lg font-semibold">
                  {MONTHS[cursor.month]} {cursor.year}
                </h2>
                <div className="flex gap-1">
                  <Button variant="outline" size="icon" className="size-8" onClick={() => step(-1)}>
                    <ChevronLeft className="size-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCursor({ year: now.getFullYear(), month: now.getMonth() })}
                  >
                    Today
                  </Button>
                  <Button variant="outline" size="icon" className="size-8" onClick={() => step(1)}>
                    <ChevronRight className="size-4" />
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-7 gap-1">
                {WEEKDAYS.map((weekday) => (
                  <div key={weekday} className="pb-1 text-center text-xs font-medium text-muted-foreground">
                    {weekday}
                  </div>
                ))}
                {cells.map((key, index) => {
                  if (!key) return <div key={`blank-${index}`} />;
                  const due = dueByDay.get(key) ?? [];
                  const arrears = due.some((loan) => loan.status === LoanStatus.Arrears);
                  const day = Number(key.slice(8, 10));
                  return (
                    <button
                      key={key}
                      type="button"
                      disabled={due.length === 0}
                      onClick={() => setSelected(key)}
                      className={cn(
                        'flex aspect-square flex-col items-center justify-center rounded-md border text-sm transition-colors',
                        due.length === 0 ? 'border-transparent text-muted-foreground' : 'hover:border-ring',
                        key === todayKey && 'ring-2 ring-ring/40',
                        selected === key && 'border-ring bg-accent',
                      )}
                    >
                      <span>{day}</span>
                      {due.length > 0 ? (
                        <span
                          className={cn(
                            'mt-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-medium tabular-nums',
                            arrears
                              ? 'bg-destructive text-destructive-foreground'
                              : 'bg-foreground text-background',
                          )}
                        >
                          {due.length}
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <h3 className="mb-3 text-sm font-semibold">
                {selected ? `Due ${selected}` : 'Select a day'}
              </h3>
              {selected && selectedLoans.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nothing due this day.</p>
              ) : null}
              {!selected ? (
                <p className="text-sm text-muted-foreground">
                  Days with loans due are highlighted. Click one to see what&apos;s due.
                </p>
              ) : null}
              <ul className="space-y-2">
                {selectedLoans.map((loan) => (
                  <li key={loan.id}>
                    <button
                      type="button"
                      onClick={() => command.openLoanQuickView(loan.id)}
                      className="flex w-full items-center justify-between rounded-md border px-3 py-2 text-left text-sm hover:bg-accent"
                    >
                      <span>
                        <span className="font-medium">
                          {loan.borrower.firstName} {loan.borrower.lastName}
                        </span>
                        <span className="block text-xs text-muted-foreground tabular-nums">
                          {formatNad(loan.balance)} due
                        </span>
                      </span>
                      <StatusBadge value={loan.status} />
                    </button>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
};

export default CalendarPage;
