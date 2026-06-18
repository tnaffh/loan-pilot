'use client';

import { useMemo, useState } from 'react';
import { ArrowDownCircle, ArrowUpCircle, Scale } from 'lucide-react';
import type { ColumnDef } from '@tanstack/react-table';
import { ExpenseKind, formatNad } from '@loan-pilot/domain';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { PageHeader } from '@/components/page-header';
import { StatCard } from '@/components/stat-card';
import { StatusBadge } from '@/components/status-badge';
import { FilterSegments } from '@/components/filter-segments';
import { MonthFilter, toMonthKey, useMonthOptions, ALL_MONTHS } from '@/components/month-filter';
import { DateRangeFilter, isInRange, type IsoRange } from '@/components/date-range-filter';
import { DataTable } from '@/components/data-table';
import { ExpenseBar } from '@/components/charts/expense-bar';
import { useApi } from '@/lib/use-api';
import { formatDate } from '@/lib/format';
import type { ExpenseRow, ExpenseTotals } from '@/lib/types';

type KindFilter = 'all' | ExpenseKind;

const KIND_OPTIONS: { value: KindFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: ExpenseKind.Expense, label: 'Expenses' },
  { value: ExpenseKind.Drawing, label: 'Drawings' },
];

const columns: ColumnDef<ExpenseRow>[] = [
  { id: 'category', header: 'Category', accessorKey: 'category', cell: ({ row }) => <span className="font-medium">{row.original.category}</span> },
  { id: 'period', header: 'Period', accessorKey: 'period', cell: ({ row }) => row.original.period ?? '—' },
  { id: 'date', header: 'Date', accessorKey: 'incurredAt', cell: ({ row }) => formatDate(row.original.incurredAt) },
  {
    id: 'type',
    header: 'Type',
    accessorKey: 'kind',
    cell: ({ row }) => <StatusBadge value={row.original.kind} />,
  },
  {
    id: 'amount',
    header: () => <div className="text-right">Amount</div>,
    accessorKey: 'amount',
    cell: ({ row }) => <div className="text-right tabular-nums">{formatNad(row.original.amount)}</div>,
  },
];

const ExpensesPage = () => {
  const { data, loading, error } = useApi<ExpenseRow[]>('/expenses');
  const { data: totals } = useApi<ExpenseTotals>('/expenses/totals');
  const [kindFilter, setKindFilter] = useState<KindFilter>('all');
  const [range, setRange] = useState<IsoRange>({});

  const { months, latest } = useMonthOptions((data ?? []).map((row) => row.incurredAt));
  const [month, setMonth] = useState<string>('');
  const activeMonth = month || latest;

  const rows = useMemo(
    () =>
      (data ?? []).filter(
        (row) =>
          (kindFilter === 'all' || row.kind === kindFilter) &&
          (activeMonth === ALL_MONTHS || toMonthKey(row.incurredAt) === activeMonth) &&
          isInRange(row.incurredAt, range),
      ),
    [data, kindFilter, activeMonth, range],
  );

  const topCategories = useMemo(() => {
    const totalsByCategory = new Map<string, number>();
    for (const row of data ?? []) {
      if (row.kind === ExpenseKind.Expense) {
        totalsByCategory.set(row.category, (totalsByCategory.get(row.category) ?? 0) + row.amount);
      }
    }
    return [...totalsByCategory.entries()]
      .map(([category, amount]) => ({ category, amount }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 8);
  }, [data]);

  return (
    <div>
      <PageHeader
        title="Expenses"
        description={data ? `${data.length} entries recorded` : 'Operating costs and owner drawings'}
      />

      {totals ? (
        <div className="mb-4 grid gap-4 sm:grid-cols-3">
          <StatCard label="Total expenses" value={formatNad(totals.totalExpenses)} icon={ArrowUpCircle} />
          <StatCard label="Owner drawings" value={formatNad(totals.totalDrawings)} icon={ArrowDownCircle} />
          <StatCard label="Total cash out" value={formatNad(totals.net)} icon={Scale} />
        </div>
      ) : null}

      {topCategories.length > 0 ? (
        <Card className="mb-4">
          <CardHeader>
            <CardTitle>Top categories</CardTitle>
          </CardHeader>
          <CardContent>
            <ExpenseBar data={topCategories} />
          </CardContent>
        </Card>
      ) : null}

      {loading ? (
        <Skeleton className="h-64 w-full rounded-xl" />
      ) : error ? (
        <p className="text-sm text-destructive">{error}</p>
      ) : (
        <DataTable
          columns={columns}
          data={rows}
          searchPlaceholder="Search category…"
          toolbar={
            <div className="flex flex-wrap items-center gap-2">
              <FilterSegments value={kindFilter} onChange={setKindFilter} options={KIND_OPTIONS} />
              <MonthFilter months={months} value={activeMonth} onChange={setMonth} />
              <DateRangeFilter value={range} onChange={setRange} />
            </div>
          }
        />
      )}
    </div>
  );
};

export default ExpensesPage;
