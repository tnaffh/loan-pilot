'use client';

import { useMemo, useState } from 'react';
import { ArrowDownCircle, ArrowUpCircle, Scale } from 'lucide-react';
import type { ColumnDef } from '@tanstack/react-table';
import { ExpenseKind, formatNad } from '@loan-pilot/domain';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { PageHeader } from '@/components/page-header';
import { StatCard } from '@/components/stat-card';
import { FilterSegments } from '@/components/filter-segments';
import { DataTable } from '@/components/data-table';
import { ExpenseBar } from '@/components/charts/expense-bar';
import { useApi } from '@/lib/use-api';
import { formatDate } from '@/lib/format';
import type { ExpenseRow, ExpenseTotals } from '@/lib/types';

type KindFilter = 'all' | ExpenseKind;

const KIND_OPTIONS: { value: KindFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: ExpenseKind.Expense, label: 'Expenses' },
  { value: ExpenseKind.Refund, label: 'Refunds' },
];

const columns: ColumnDef<ExpenseRow>[] = [
  { id: 'category', header: 'Category', accessorKey: 'category', cell: ({ row }) => <span className="font-medium">{row.original.category}</span> },
  { id: 'period', header: 'Period', accessorKey: 'period', cell: ({ row }) => row.original.period ?? '—' },
  { id: 'date', header: 'Date', accessorKey: 'incurredAt', cell: ({ row }) => formatDate(row.original.incurredAt) },
  {
    id: 'type',
    header: 'Type',
    accessorKey: 'kind',
    cell: ({ row }) => (
      <Badge variant={row.original.kind === ExpenseKind.Refund ? 'secondary' : 'outline'} className="capitalize">
        {row.original.kind}
      </Badge>
    ),
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

  const rows = useMemo(
    () => (data ?? []).filter((row) => kindFilter === 'all' || row.kind === kindFilter),
    [data, kindFilter],
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
        description={data ? `${data.length} entries recorded` : 'Operating costs and refunds'}
      />

      {totals ? (
        <div className="mb-4 grid gap-4 sm:grid-cols-3">
          <StatCard label="Total expenses" value={formatNad(totals.totalExpenses)} icon={ArrowUpCircle} />
          <StatCard label="Total refunds" value={formatNad(totals.totalRefunds)} icon={ArrowDownCircle} />
          <StatCard label="Net cost" value={formatNad(totals.net)} icon={Scale} />
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
          toolbar={<FilterSegments value={kindFilter} onChange={setKindFilter} options={KIND_OPTIONS} />}
        />
      )}
    </div>
  );
};

export default ExpensesPage;
