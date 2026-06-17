'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { LoanStatus, LoanType, formatNad } from '@loan-pilot/domain';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Card } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { PageHeader } from '@/components/page-header';
import { StatusBadge } from '@/components/status-badge';
import { TypeChip } from '@/components/type-chip';
import { InitialsAvatar } from '@/components/initials-avatar';
import { FilterSegments } from '@/components/filter-segments';
import { useApi } from '@/lib/use-api';
import { formatDate } from '@/lib/format';
import type { LoanRow } from '@/lib/types';

type StatusFilter = 'all' | LoanStatus;
type TypeFilter = 'all' | LoanType;

const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: LoanStatus.Active, label: 'Active' },
  { value: LoanStatus.Arrears, label: 'In arrears' },
  { value: LoanStatus.Settled, label: 'Settled' },
];

const TYPE_OPTIONS: { value: TypeFilter; label: string }[] = [
  { value: 'all', label: 'All types' },
  { value: LoanType.Payday, label: 'Payday' },
  { value: LoanType.Business, label: 'Business' },
  { value: LoanType.Collateral, label: 'Collateral' },
];

const LoansPage = () => {
  const router = useRouter();
  const { data, loading, error } = useApi<LoanRow[]>('/loans');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');

  const rows = useMemo(
    () =>
      (data ?? []).filter(
        (loan) =>
          (statusFilter === 'all' || loan.status === statusFilter) &&
          (typeFilter === 'all' || loan.type === typeFilter),
      ),
    [data, statusFilter, typeFilter],
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

      <div className="mb-4 flex flex-wrap gap-2">
        <FilterSegments value={statusFilter} onChange={setStatusFilter} options={STATUS_OPTIONS} />
        <FilterSegments value={typeFilter} onChange={setTypeFilter} options={TYPE_OPTIONS} />
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
                <TableHead>Borrower</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="text-right">Principal</TableHead>
                <TableHead className="text-right">Balance</TableHead>
                <TableHead className="min-w-[140px]">Progress</TableHead>
                <TableHead>Next due</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((loan) => (
                <TableRow
                  key={loan.id}
                  className="cursor-pointer"
                  onClick={() => router.push(`/loans/${loan.id}`)}
                >
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <InitialsAvatar name={`${loan.borrower.firstName} ${loan.borrower.lastName}`} />
                      <span className="font-medium">
                        {loan.borrower.firstName} {loan.borrower.lastName}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <TypeChip type={loan.type} />
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{formatNad(loan.principal)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatNad(loan.balance)}</TableCell>
                  <TableCell>
                    <Progress
                      value={
                        loan.instalmentsTotal > 0
                          ? (loan.instalmentsPaid / loan.instalmentsTotal) * 100
                          : 0
                      }
                      className="h-[5px]"
                    />
                    <span className="mt-1 block text-xs text-muted-foreground">
                      {loan.instalmentsPaid} of {loan.instalmentsTotal} paid
                    </span>
                  </TableCell>
                  <TableCell>{formatDate(loan.nextDueAt)}</TableCell>
                  <TableCell>
                    <StatusBadge value={loan.status} />
                  </TableCell>
                </TableRow>
              ))}
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground">
                    No loans here.
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

export default LoansPage;
