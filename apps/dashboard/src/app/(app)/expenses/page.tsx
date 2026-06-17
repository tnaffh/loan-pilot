'use client';

import { useMemo, useState } from 'react';
import { ArrowDownCircle, ArrowUpCircle, Scale } from 'lucide-react';
import { ExpenseKind, formatNad } from '@loan-pilot/domain';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { PageHeader } from '@/components/page-header';
import { StatCard } from '@/components/stat-card';
import { FilterSegments } from '@/components/filter-segments';
import { useApi } from '@/lib/use-api';
import { formatDate } from '@/lib/format';
import type { ExpenseRow, ExpenseTotals } from '@/lib/types';

type KindFilter = 'all' | ExpenseKind;

const KIND_OPTIONS: { value: KindFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: ExpenseKind.Expense, label: 'Expenses' },
  { value: ExpenseKind.Refund, label: 'Refunds' },
];

const ExpensesPage = () => {
  const { data, loading, error } = useApi<ExpenseRow[]>('/expenses');
  const { data: totals } = useApi<ExpenseTotals>('/expenses/totals');
  const [kindFilter, setKindFilter] = useState<KindFilter>('all');

  const rows = useMemo(
    () => (data ?? []).filter((row) => kindFilter === 'all' || row.kind === kindFilter),
    [data, kindFilter],
  );

  return (
    <div>
      <PageHeader
        title="Expenses"
        description={data ? `${data.length} entries recorded` : 'Operating costs and refunds'}
      />

      {totals ? (
        <div className="mb-4 grid gap-4 sm:grid-cols-3">
          <StatCard
            label="Total expenses"
            value={formatNad(totals.totalExpenses)}
            icon={ArrowUpCircle}
            tone="red"
          />
          <StatCard
            label="Total refunds"
            value={formatNad(totals.totalRefunds)}
            icon={ArrowDownCircle}
            tone="green"
          />
          <StatCard
            label="Net cost"
            value={formatNad(totals.net)}
            icon={Scale}
            tone="brand"
          />
        </div>
      ) : null}

      <div className="mb-4 flex flex-wrap gap-2">
        <FilterSegments value={kindFilter} onChange={setKindFilter} options={KIND_OPTIONS} />
      </div>

      {loading ? (
        <Skeleton className="h-64 w-full rounded-xl" />
      ) : error ? (
        <p className="text-sm text-destructive">{error}</p>
      ) : (
        <Card className="overflow-hidden py-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Category</TableHead>
                <TableHead>Period</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="text-right">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="font-medium">{row.category}</TableCell>
                  <TableCell>{row.period ?? '—'}</TableCell>
                  <TableCell>{formatDate(row.incurredAt)}</TableCell>
                  <TableCell className="capitalize">{row.kind}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatNad(row.amount)}</TableCell>
                </TableRow>
              ))}
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground">
                    No expenses here.
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
};

export default ExpensesPage;
