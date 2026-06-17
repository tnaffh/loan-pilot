'use client';

import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { ApplicationStatus, formatNad } from '@loan-pilot/domain';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { PageHeader } from '@/components/page-header';
import { StatusBadge } from '@/components/status-badge';
import { TypeChip } from '@/components/type-chip';
import { InitialsAvatar } from '@/components/initials-avatar';
import { FilterSegments } from '@/components/filter-segments';
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
      toast.error(
        decisionError instanceof ApiError ? decisionError.message : 'Something went wrong',
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Applications"
        description="Review and decide incoming loan applications"
        action={<FilterSegments value={filter} onChange={setFilter} options={FILTER_OPTIONS} />}
      />

      {loading ? (
        <Skeleton className="h-64 w-full rounded-xl" />
      ) : error ? (
        <p className="text-sm text-destructive">{error}</p>
      ) : (
        <Card className="overflow-hidden py-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Applicant</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead className="text-right">Instalment</TableHead>
                <TableHead>Affordability</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((application) => (
                <TableRow key={application.id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <InitialsAvatar name={`${application.firstName} ${application.lastName}`} />
                      <div>
                        <div className="font-medium">
                          {application.firstName} {application.lastName}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {formatDate(application.submittedAt)}
                        </div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <TypeChip type={application.type} />
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatNad(application.amount)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatNad(application.quotedInstalment)} × {application.termMonths}
                  </TableCell>
                  <TableCell>
                    <StatusBadge value={application.affordability} />
                  </TableCell>
                  <TableCell>
                    <StatusBadge value={application.status} />
                  </TableCell>
                  <TableCell className="text-right">
                    {isOpen(application.status) ? (
                      <div className="flex justify-end gap-2">
                        <Button
                          size="sm"
                          className="bg-brand-soft text-brand-deep hover:bg-brand-soft/70"
                          onClick={() =>
                            setPending({ application, decision: ApplicationStatus.Approved })
                          }
                        >
                          Approve
                        </Button>
                        <Button
                          size="sm"
                          className="bg-bad-soft text-bad hover:bg-bad-soft/70"
                          onClick={() =>
                            setPending({ application, decision: ApplicationStatus.Declined })
                          }
                        >
                          Decline
                        </Button>
                      </div>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground">
                    No applications here.
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </Card>
      )}

      <Dialog open={pending !== null} onOpenChange={(open) => (open ? null : setPending(null))}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {pending?.decision === ApplicationStatus.Approved
                ? 'Approve application'
                : 'Decline application'}
            </DialogTitle>
            <DialogDescription>
              {pending
                ? pending.decision === ApplicationStatus.Approved
                  ? `Approve ${pending.application.firstName} ${pending.application.lastName}'s ` +
                    `${pending.application.type} loan of ${formatNad(pending.application.amount)} ` +
                    `over ${pending.application.termMonths} month(s)? This disburses the loan ` +
                    `immediately (total repayable ${formatNad(pending.application.quotedTotal)}).`
                  : `Decline ${pending.application.firstName} ${pending.application.lastName}'s ` +
                    `application for ${formatNad(pending.application.amount)}? ` +
                    `This cannot be undone.`
                : null}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPending(null)} disabled={submitting}>
              Cancel
            </Button>
            <Button
              onClick={confirmDecision}
              disabled={submitting}
              variant={pending?.decision === ApplicationStatus.Declined ? 'destructive' : 'default'}
            >
              {pending?.decision === ApplicationStatus.Approved ? 'Approve & disburse' : 'Decline'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ApplicationsPage;
