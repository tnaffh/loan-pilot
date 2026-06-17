'use client';

import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import type { ColumnDef } from '@tanstack/react-table';
import { ApplicationStatus, formatNad } from '@loan-pilot/domain';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { PageHeader } from '@/components/page-header';
import { StatusBadge } from '@/components/status-badge';
import { TypeChip } from '@/components/type-chip';
import { InitialsAvatar } from '@/components/initials-avatar';
import { FilterSegments } from '@/components/filter-segments';
import { DataTable } from '@/components/data-table';
import { ApiError, apiFetch } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { useApi } from '@/lib/use-api';
import { formatDate } from '@/lib/format';
import type { ApplicationDecision, ApplicationRow } from '@/lib/types';

type Decision = ApplicationStatus.Approved | ApplicationStatus.Declined;

interface PendingDecision {
  application: ApplicationRow;
  decision: Decision;
}

type StatusFilter = 'all' | ApplicationStatus;

const FILTER_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: ApplicationStatus.Pending, label: 'Pending' },
  { value: ApplicationStatus.Review, label: 'Review' },
  { value: ApplicationStatus.Approved, label: 'Approved' },
  { value: ApplicationStatus.Declined, label: 'Declined' },
];

const isOpen = (status: ApplicationStatus): boolean =>
  status === ApplicationStatus.Pending || status === ApplicationStatus.Review;

const ApplicationsPage = () => {
  const { token } = useAuth();
  const { data, loading, error, refresh } = useApi<ApplicationRow[]>('/applications');
  const [pending, setPending] = useState<PendingDecision | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [filter, setFilter] = useState<StatusFilter>('all');

  const rows = useMemo(
    () => (data ?? []).filter((row) => filter === 'all' || row.status === filter),
    [data, filter],
  );

  const columns = useMemo<ColumnDef<ApplicationRow>[]>(
    () => [
      {
        id: 'applicant',
        header: 'Applicant',
        accessorFn: (row) => `${row.firstName} ${row.lastName}`,
        cell: ({ row }) => (
          <div className="flex items-center gap-3">
            <InitialsAvatar name={`${row.original.firstName} ${row.original.lastName}`} />
            <div>
              <div className="font-medium">
                {row.original.firstName} {row.original.lastName}
              </div>
              <div className="text-xs text-muted-foreground">
                {formatDate(row.original.submittedAt)}
              </div>
            </div>
          </div>
        ),
      },
      { id: 'type', header: 'Type', accessorKey: 'type', cell: ({ row }) => <TypeChip type={row.original.type} /> },
      {
        id: 'amount',
        header: () => <div className="text-right">Amount</div>,
        accessorKey: 'amount',
        cell: ({ row }) => <div className="text-right tabular-nums">{formatNad(row.original.amount)}</div>,
      },
      {
        id: 'affordability',
        header: 'Affordability',
        accessorKey: 'affordability',
        cell: ({ row }) => <StatusBadge value={row.original.affordability} />,
      },
      { id: 'status', header: 'Status', accessorKey: 'status', cell: ({ row }) => <StatusBadge value={row.original.status} /> },
      {
        id: 'actions',
        header: () => <div className="text-right">Actions</div>,
        enableHiding: false,
        cell: ({ row }) =>
          isOpen(row.original.status) ? (
            <div className="flex justify-end gap-2">
              <Button
                size="sm"
                onClick={() => setPending({ application: row.original, decision: ApplicationStatus.Approved })}
              >
                Approve
              </Button>
              <Button
                size="sm"
                variant="destructive"
                onClick={() => setPending({ application: row.original, decision: ApplicationStatus.Declined })}
              >
                Decline
              </Button>
            </div>
          ) : (
            <div className="text-right text-muted-foreground">—</div>
          ),
      },
    ],
    [],
  );

  const confirmDecision = async () => {
    if (!pending) {
      return;
    }
    setSubmitting(true);
    try {
      const result = await apiFetch<ApplicationDecision>(
        `/applications/${pending.application.id}/status`,
        { method: 'PATCH', body: { status: pending.decision }, token },
      );
      if (result.loanId) {
        toast.success('Application approved', {
          description: `A ${pending.application.termMonths}-month loan of ${formatNad(
            pending.application.amount,
          )} was disbursed.`,
        });
      } else {
        toast.success('Application declined');
      }
      setPending(null);
      refresh();
    } catch (decisionError) {
      toast.error(decisionError instanceof ApiError ? decisionError.message : 'Something went wrong');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      <PageHeader title="Applications" description="Review and decide incoming loan applications" />

      {loading ? (
        <Skeleton className="h-64 w-full rounded-xl" />
      ) : error ? (
        <p className="text-sm text-destructive">{error}</p>
      ) : (
        <DataTable
          columns={columns}
          data={rows}
          searchPlaceholder="Search applicants…"
          toolbar={<FilterSegments value={filter} onChange={setFilter} options={FILTER_OPTIONS} />}
        />
      )}

      <AlertDialog open={pending !== null} onOpenChange={(open) => (open ? null : setPending(null))}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pending?.decision === ApplicationStatus.Approved ? 'Approve application' : 'Decline application'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pending
                ? pending.decision === ApplicationStatus.Approved
                  ? `Approve ${pending.application.firstName} ${pending.application.lastName}'s ` +
                    `${pending.application.type} loan of ${formatNad(pending.application.amount)} ` +
                    `over ${pending.application.termMonths} month(s)? This disburses the loan ` +
                    `immediately (total repayable ${formatNad(pending.application.quotedTotal)}).`
                  : `Decline ${pending.application.firstName} ${pending.application.lastName}'s ` +
                    `application for ${formatNad(pending.application.amount)}? This cannot be undone.`
                : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={submitting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDecision}
              disabled={submitting}
              variant={pending?.decision === ApplicationStatus.Declined ? 'destructive' : 'default'}
            >
              {pending?.decision === ApplicationStatus.Approved ? 'Approve & disburse' : 'Decline'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default ApplicationsPage;
