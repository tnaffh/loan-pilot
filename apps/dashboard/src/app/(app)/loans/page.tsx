'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Activity, AlertTriangle, Eye, Plus, Wallet } from 'lucide-react';
import type { ColumnDef } from '@tanstack/react-table';
import { LoanStatus, formatNad } from '@loan-pilot/domain';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { PageHeader } from '@/components/page-header';
import { StatusBadge } from '@/components/status-badge';
import { TypeChip } from '@/components/type-chip';
import { InitialsAvatar } from '@/components/initials-avatar';
import { FilterSegments } from '@/components/filter-segments';
import { MonthFilter, toMonthKey, useMonthOptions, ALL_MONTHS } from '@/components/month-filter';
import { DateRangeFilter, isInRange, type IsoRange } from '@/components/date-range-filter';
import { StatStrip } from '@/components/stat-strip';
import { DataTable } from '@/components/data-table';
import { useCommand } from '@/components/command-provider';
import { useApi } from '@/lib/use-api';
import { formatDate } from '@/lib/format';
import type { LoanRow } from '@/lib/types';

const baseColumns: ColumnDef<LoanRow>[] = [
  {
    id: 'borrower',
    header: 'Borrower',
    accessorFn: (row) => `${row.borrower.firstName} ${row.borrower.lastName}`,
    cell: ({ row, getValue }) => (
      <div className="flex items-center gap-3">
        <InitialsAvatar name={String(getValue())} />
        <Link
          href={`/borrowers/${row.original.borrower.id}`}
          className="font-medium hover:underline"
          onClick={(event) => event.stopPropagation()}
        >
          {String(getValue())}
        </Link>
      </div>
    ),
  },
  {
    id: 'type',
    header: 'Type',
    accessorKey: 'type',
    cell: ({ row }) => <TypeChip type={row.original.type} />,
  },
  {
    id: 'principal',
    header: () => <div className="text-right">Principal</div>,
    accessorKey: 'principal',
    cell: ({ row }) => (
      <div className="text-right tabular-nums">{formatNad(row.original.principal)}</div>
    ),
  },
  {
    id: 'balance',
    header: () => <div className="text-right">Balance</div>,
    accessorKey: 'balance',
    cell: ({ row }) => (
      <div className="text-right tabular-nums">{formatNad(row.original.balance)}</div>
    ),
  },
  {
    id: 'term',
    header: () => <div className="text-right">Term</div>,
    accessorKey: 'termMonths',
    cell: ({ row }) => (
      <div className="text-right tabular-nums">
        {row.original.termMonths} {row.original.termMonths === 1 ? 'mo' : 'mos'}
      </div>
    ),
  },
  {
    id: 'disbursed',
    header: 'Disbursed',
    accessorKey: 'disbursedAt',
    cell: ({ row }) => (
      <span className="whitespace-nowrap text-muted-foreground">
        {formatDate(row.original.disbursedAt)}
      </span>
    ),
  },
  {
    id: 'due',
    header: 'Due',
    accessorKey: 'nextDueAt',
    cell: ({ row }) => (
      <span className="whitespace-nowrap text-muted-foreground">
        {formatDate(row.original.nextDueAt)}
      </span>
    ),
  },
  {
    id: 'status',
    header: 'Status',
    accessorKey: 'status',
    cell: ({ row }) => <StatusBadge value={row.original.status} />,
  },
];

/**
 * Live arrears: an open loan whose next instalment is past due, regardless of
 * whether a repayment has been recorded to flip its stored status yet.
 */
const isOverdue = (loan: LoanRow): boolean =>
  loan.balance > 0 &&
  (loan.status === LoanStatus.Active ||
    loan.status === LoanStatus.Arrears ||
    loan.status === LoanStatus.PartlyPaid) &&
  loan.nextDueAt !== null &&
  new Date(loan.nextDueAt) < new Date();

type StatusFilter = 'all' | LoanStatus;

const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: LoanStatus.Active, label: 'Active' },
  { value: LoanStatus.Arrears, label: 'Arrears' },
  { value: LoanStatus.PartlyPaid, label: 'Partly paid' },
  { value: LoanStatus.Settled, label: 'Settled' },
  { value: LoanStatus.WrittenOff, label: 'Written off' },
  { value: LoanStatus.Cancelled, label: 'Cancelled' },
];

const LoansPage = () => {
  const router = useRouter();
  const command = useCommand();
  const { data, loading, error } = useApi<LoanRow[]>('/loans');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [range, setRange] = useState<IsoRange>({});

  const { months, latest } = useMonthOptions((data ?? []).map((loan) => loan.disbursedAt));
  const [month, setMonth] = useState<string>('');
  // Default to the most recent month that has data once the data arrives.
  const activeMonth = month || latest;

  const columns = useMemo<ColumnDef<LoanRow>[]>(
    () => [
      ...baseColumns,
      {
        id: 'quickview',
        header: () => <span className="sr-only">Quick view</span>,
        enableHiding: false,
        enableSorting: false,
        cell: ({ row }) => (
          <div className="flex justify-end">
            <Button
              size="icon"
              variant="ghost"
              className="size-8"
              title="Quick view"
              onClick={(event) => {
                event.stopPropagation();
                command.openLoanQuickView(row.original.id);
              }}
            >
              <Eye className="size-4" />
            </Button>
          </div>
        ),
      },
    ],
    [command],
  );

  const rows = useMemo(
    () =>
      (data ?? []).filter(
        (loan) =>
          (statusFilter === 'all' || loan.status === statusFilter) &&
          (activeMonth === ALL_MONTHS || toMonthKey(loan.disbursedAt) === activeMonth) &&
          isInRange(loan.disbursedAt, range),
      ),
    [data, statusFilter, activeMonth, range],
  );

  const summary = useMemo(() => {
    const book = rows.reduce((sum, loan) => sum + loan.balance, 0);
    const active = rows.filter((loan) => loan.status === LoanStatus.Active).length;
    const arrears = rows.filter(isOverdue).length;
    const avg = rows.length ? Math.round(rows.reduce((s, l) => s + l.principal, 0) / rows.length) : 0;
    return { book, active, arrears, avg };
  }, [rows]);

  const outstanding = (data ?? []).reduce((sum, loan) => sum + loan.balance, 0);

  return (
    <div>
      <PageHeader
        title="Loans"
        description={
          data ? `${data.length} loans · ${formatNad(outstanding)} outstanding` : 'The full loan book'
        }
        action={
          <Button onClick={() => command.openNewLoan()}>
            <Plus />
            New loan
          </Button>
        }
      />

      {loading ? (
        <Skeleton className="h-64 w-full rounded-xl" />
      ) : error ? (
        <p className="text-sm text-destructive">{error}</p>
      ) : (
        <DataTable
          columns={columns}
          data={rows}
          searchPlaceholder="Search borrowers…"
          onRowClick={(loan) => router.push(`/loans/${loan.id}`)}
          summary={
            <StatStrip
              items={[
                { label: 'Outstanding (shown)', value: formatNad(summary.book), icon: Wallet },
                { label: 'Active', value: String(summary.active), icon: Activity, tone: 'green' },
                {
                  label: 'In arrears',
                  value: String(summary.arrears),
                  icon: AlertTriangle,
                  tone: summary.arrears > 0 ? 'red' : 'default',
                },
                { label: 'Avg loan size', value: formatNad(summary.avg) },
              ]}
            />
          }
          toolbar={
            <div className="flex flex-wrap items-center gap-2">
              <FilterSegments value={statusFilter} onChange={setStatusFilter} options={STATUS_OPTIONS} />
              <MonthFilter months={months} value={activeMonth} onChange={setMonth} />
              <DateRangeFilter value={range} onChange={setRange} />
            </div>
          }
        />
      )}
    </div>
  );
};

export default LoansPage;
