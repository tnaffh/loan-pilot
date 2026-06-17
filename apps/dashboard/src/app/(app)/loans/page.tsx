'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { ColumnDef } from '@tanstack/react-table';
import { LoanStatus, formatNad } from '@loan-pilot/domain';
import { Skeleton } from '@/components/ui/skeleton';
import { PageHeader } from '@/components/page-header';
import { StatusBadge } from '@/components/status-badge';
import { TypeChip } from '@/components/type-chip';
import { InitialsAvatar } from '@/components/initials-avatar';
import { FilterSegments } from '@/components/filter-segments';
import { DataTable } from '@/components/data-table';
import { useApi } from '@/lib/use-api';
import { formatDate } from '@/lib/format';
import type { LoanRow } from '@/lib/types';

const columns: ColumnDef<LoanRow>[] = [
  {
    id: 'borrower',
    header: 'Borrower',
    accessorFn: (row) => `${row.borrower.firstName} ${row.borrower.lastName}`,
    cell: ({ getValue }) => (
      <div className="flex items-center gap-3">
        <InitialsAvatar name={String(getValue())} />
        <span className="font-medium">{String(getValue())}</span>
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
    id: 'next due',
    header: 'Next due',
    accessorKey: 'nextDueAt',
    cell: ({ row }) => formatDate(row.original.nextDueAt),
  },
  {
    id: 'status',
    header: 'Status',
    accessorKey: 'status',
    cell: ({ row }) => <StatusBadge value={row.original.status} />,
  },
];

type StatusFilter = 'all' | LoanStatus;

const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: LoanStatus.Active, label: 'Active' },
  { value: LoanStatus.Arrears, label: 'Arrears' },
  { value: LoanStatus.PartlyPaid, label: 'Partly paid' },
  { value: LoanStatus.Settled, label: 'Settled' },
];

const LoansPage = () => {
  const router = useRouter();
  const { data, loading, error } = useApi<LoanRow[]>('/loans');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  const rows = useMemo(
    () => (data ?? []).filter((loan) => statusFilter === 'all' || loan.status === statusFilter),
    [data, statusFilter],
  );

  const outstanding = (data ?? []).reduce((sum, loan) => sum + loan.balance, 0);

  return (
    <div>
      <PageHeader
        title="Loans"
        description={
          data ? `${data.length} loans · ${formatNad(outstanding)} outstanding` : 'The full loan book'
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
          toolbar={
            <FilterSegments value={statusFilter} onChange={setStatusFilter} options={STATUS_OPTIONS} />
          }
        />
      )}
    </div>
  );
};

export default LoansPage;
