'use client';

import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { CheckCircle2, FilePlus2, Hourglass, Search, Wallet } from 'lucide-react';
import type { ColumnDef } from '@tanstack/react-table';
import { ApplicationStatus, formatNad } from '@loan-pilot/domain';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { PageHeader } from '@/components/page-header';
import { StatusBadge } from '@/components/status-badge';
import { StatStrip } from '@/components/stat-strip';
import { TypeChip } from '@/components/type-chip';
import { InitialsAvatar } from '@/components/initials-avatar';
import { DataTable } from '@/components/data-table';
import { MonthFilter, toMonthKey, useMonthOptions, ALL_MONTHS } from '@/components/month-filter';
import { useCommand } from '@/components/command-provider';
import { ApiError, apiFetch } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { useApi } from '@/lib/use-api';
import { bumpRevalidation } from '@/lib/revalidate';
import { formatDate } from '@/lib/format';
import type { ApplicationRow } from '@/lib/types';

const COLUMNS: { status: ApplicationStatus; label: string }[] = [
  { status: ApplicationStatus.Pending, label: 'Pending' },
  { status: ApplicationStatus.Review, label: 'Review' },
  { status: ApplicationStatus.Approved, label: 'Approved' },
  { status: ApplicationStatus.Declined, label: 'Declined' },
];

const isOpen = (status: ApplicationStatus): boolean =>
  status === ApplicationStatus.Pending || status === ApplicationStatus.Review;

const ApplicationsPage = () => {
  const { token } = useAuth();
  const command = useCommand();
  const { data, loading, error } = useApi<ApplicationRow[]>('/applications');
  const [movingId, setMovingId] = useState<string | null>(null);

  const { months, latest } = useMonthOptions((data ?? []).map((row) => row.submittedAt));
  const [month, setMonth] = useState<string>('');
  const activeMonth = month || latest;

  const tableRows = useMemo(
    () =>
      (data ?? []).filter(
        (row) => activeMonth === ALL_MONTHS || toMonthKey(row.submittedAt) === activeMonth,
      ),
    [data, activeMonth],
  );

  const summary = useMemo(() => {
    const all = data ?? [];
    const pending = all.filter((a) => a.status === ApplicationStatus.Pending).length;
    const review = all.filter((a) => a.status === ApplicationStatus.Review).length;
    const approved = all.filter((a) => a.status === ApplicationStatus.Approved).length;
    const declined = all.filter((a) => a.status === ApplicationStatus.Declined).length;
    const decided = approved + declined;
    const rate = decided ? Math.round((approved / decided) * 100) : 0;
    const requested = all.reduce((sum, a) => sum + a.amount, 0);
    return { pending, review, rate, requested };
  }, [data]);

  const move = async (id: string, status: ApplicationStatus) => {
    setMovingId(id);
    try {
      await apiFetch(`/applications/${id}/status`, { method: 'PATCH', body: { status }, token });
      toast.success(
        status === ApplicationStatus.Approved
          ? 'Approved & loan disbursed'
          : status === ApplicationStatus.Declined
            ? 'Application declined'
            : 'Moved to review',
      );
      bumpRevalidation();
    } catch (moveError) {
      toast.error(moveError instanceof ApiError ? moveError.message : 'Something went wrong');
    } finally {
      setMovingId(null);
    }
  };

  const byStatus = useMemo(() => {
    const groups: Record<ApplicationStatus, ApplicationRow[]> = {
      [ApplicationStatus.Pending]: [],
      [ApplicationStatus.Review]: [],
      [ApplicationStatus.Approved]: [],
      [ApplicationStatus.Declined]: [],
    };
    for (const row of data ?? []) groups[row.status]?.push(row);
    return groups;
  }, [data]);

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
              <div className="text-xs text-muted-foreground">{formatDate(row.original.submittedAt)}</div>
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
        cell: ({ row }) => (
          <div className="flex justify-end">
            <Button size="sm" variant="outline" onClick={() => command.openReview(row.original.id)}>
              Review
            </Button>
          </div>
        ),
      },
    ],
    [command],
  );

  return (
    <div>
      <PageHeader
        title="Applications"
        description="Review and decide incoming loan applications"
        action={
          <Button onClick={() => command.openNewApplication()}>
            <FilePlus2 />
            New application
          </Button>
        }
      />

      {loading ? (
        <Skeleton className="h-64 w-full rounded-xl" />
      ) : error ? (
        <p className="text-sm text-destructive">{error}</p>
      ) : (
        <Tabs defaultValue="board">
          <div className="mb-4">
            <StatStrip
              items={[
                { label: 'Pending', value: String(summary.pending), icon: Hourglass, tone: 'amber' },
                { label: 'In review', value: String(summary.review), icon: Search, tone: 'blue' },
                {
                  label: 'Approval rate',
                  value: `${summary.rate}%`,
                  icon: CheckCircle2,
                  tone: 'green',
                },
                { label: 'Total requested', value: formatNad(summary.requested), icon: Wallet },
              ]}
            />
          </div>
          <TabsList>
            <TabsTrigger value="board">Board</TabsTrigger>
            <TabsTrigger value="table">Table</TabsTrigger>
          </TabsList>

          <TabsContent value="board">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {COLUMNS.map((column) => (
                <div key={column.status} className="rounded-xl border bg-muted/30 p-3">
                  <div className="mb-3 flex items-center justify-between px-1">
                    <span className="text-sm font-semibold">{column.label}</span>
                    <span className="rounded-full bg-background px-2 text-xs text-muted-foreground tabular-nums">
                      {byStatus[column.status].length}
                    </span>
                  </div>
                  <div className="space-y-2">
                    {byStatus[column.status].map((app) => (
                      <button
                        key={app.id}
                        type="button"
                        onClick={() => command.openReview(app.id)}
                        className="w-full rounded-lg border bg-background p-3 text-left shadow-xs transition-colors hover:border-ring"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate text-sm font-medium">
                            {app.firstName} {app.lastName}
                          </span>
                          <TypeChip type={app.type} />
                        </div>
                        <div className="mt-1 flex items-center justify-between">
                          <span className="text-sm tabular-nums">{formatNad(app.amount)}</span>
                          <StatusBadge value={app.affordability} />
                        </div>
                        {isOpen(app.status) ? (
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            <Button
                              size="sm"
                              className="h-7 px-2"
                              disabled={movingId === app.id}
                              onClick={(event) => {
                                event.stopPropagation();
                                move(app.id, ApplicationStatus.Approved);
                              }}
                            >
                              Approve
                            </Button>
                            {app.status === ApplicationStatus.Pending ? (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 px-2"
                                disabled={movingId === app.id}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  move(app.id, ApplicationStatus.Review);
                                }}
                              >
                                Review
                              </Button>
                            ) : null}
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 px-2 text-destructive"
                              disabled={movingId === app.id}
                              onClick={(event) => {
                                event.stopPropagation();
                                move(app.id, ApplicationStatus.Declined);
                              }}
                            >
                              Decline
                            </Button>
                          </div>
                        ) : null}
                      </button>
                    ))}
                    {byStatus[column.status].length === 0 ? (
                      <p className="px-1 py-6 text-center text-xs text-muted-foreground">Nothing here</p>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="table">
            <DataTable
              columns={columns}
              data={tableRows}
              searchPlaceholder="Search applicants…"
              onRowClick={(application) => command.openReview(application.id)}
              toolbar={<MonthFilter months={months} value={activeMonth} onChange={setMonth} />}
            />
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
};

export default ApplicationsPage;
