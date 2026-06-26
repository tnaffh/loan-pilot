'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { FileText, Loader2 } from 'lucide-react';
import { ApplicationStatus, formatNad } from '@loan-pilot/domain';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusBadge } from '@/components/status-badge';
import { TypeChip } from '@/components/type-chip';
import { Kv } from '@/components/kv';
import { ActivityTimeline } from '@/components/activity-timeline';
import { ApiError, apiFetch } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { useApi } from '@/lib/use-api';
import { bumpRevalidation } from '@/lib/revalidate';
import { formatDate } from '@/lib/format';
import type { ApplicationDecision, ApplicationDetail } from '@/lib/types';

const isOpen = (status: ApplicationStatus): boolean =>
  status === ApplicationStatus.Pending || status === ApplicationStatus.Review;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  applicationId: string | null;
}

export const ApplicationReviewSheet = ({ open, onOpenChange, applicationId }: Props) => {
  const { token } = useAuth();
  const { data } = useApi<ApplicationDetail>(open && applicationId ? `/applications/${applicationId}` : null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState<ApplicationStatus | null>(null);
  const [declining, setDeclining] = useState(false);

  const decide = async (status: ApplicationStatus) => {
    if (!applicationId) return;
    setBusy(status);
    try {
      const result = await apiFetch<ApplicationDecision>(`/applications/${applicationId}/status`, {
        method: 'PATCH',
        body: { status, reason: status === ApplicationStatus.Declined ? reason : '' },
        token,
      });
      if (status === ApplicationStatus.Approved && result.loanId) {
        toast.success('Approved & loan disbursed');
      } else if (status === ApplicationStatus.Declined) {
        toast.success('Application declined');
      } else {
        toast.success('Moved to review');
      }
      bumpRevalidation();
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Something went wrong');
    } finally {
      setBusy(null);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-full flex-col overflow-y-auto sm:max-w-lg">
        {!data ? (
          <>
            <SheetHeader>
              <SheetTitle>Application</SheetTitle>
            </SheetHeader>
            <div className="px-4">
              <Skeleton className="h-64 w-full rounded-xl" />
            </div>
          </>
        ) : (
          <>
            <SheetHeader>
              <SheetTitle className="flex items-center gap-2">
                {data.firstName} {data.lastName}
                <StatusBadge value={data.status} />
              </SheetTitle>
              <SheetDescription>
                Submitted {formatDate(data.submittedAt)} · <TypeChip type={data.type} />
              </SheetDescription>
            </SheetHeader>

            <div className="space-y-5 px-4 pb-4">
              <div className="grid grid-cols-2 gap-3 rounded-lg border p-3">
                <Kv label="Amount" value={formatNad(data.amount)} />
                <Kv label="Term" value={`${data.termMonths} month(s)`} />
                <Kv label="Instalment" value={formatNad(data.quotedInstalment)} />
                <Kv label="Total repayable" value={formatNad(data.quotedTotal)} />
                <Kv label="Declared income" value={formatNad(data.declaredIncome)} />
                <div>
                  <div className="text-xs text-muted-foreground">Affordability</div>
                  <div className="mt-0.5">
                    <StatusBadge value={data.affordability} />{' '}
                    <span className="text-xs text-muted-foreground">
                      ({Math.round(data.affordabilityRatio * 100)}%)
                    </span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Kv label="Phone" value={data.phone} />
                <Kv label="Email" value={data.email} />
                <Kv label="ID number" value={data.idNumber} />
                <Kv label="Occupation" value={data.occupation} />
                <Kv label="Employer" value={data.employer} />
                <Kv
                  label="Address"
                  value={
                    [data.addrStreet, data.addrSuburb, data.addrCity, data.addrRegion, data.addrCountry]
                      .filter(Boolean)
                      .join(', ') || '—'
                  }
                />
                <Kv label="Bank" value={`${data.bankName} · ${data.accountType}`} />
                <Kv
                  label="Account"
                  value={
                    `${data.bankAccountNumber || '—'}${data.bankBranchCode ? ` · ${data.bankBranchCode}` : ''}`
                  }
                />
              </div>

              {data.references.length > 0 ? (
                <div>
                  <div className="mb-1 text-xs font-medium text-muted-foreground">References</div>
                  <ul className="space-y-1 text-sm">
                    {data.references.map((ref) => (
                      <li key={ref.id} className="flex justify-between">
                        <span>{ref.name}</span>
                        <span className="text-muted-foreground">{ref.phone}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              <div>
                <div className="mb-1 text-xs font-medium text-muted-foreground">Documents</div>
                {data.documents.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No documents uploaded.</p>
                ) : (
                  <ul className="space-y-1 text-sm">
                    {data.documents.map((doc) => (
                      <li key={doc.id} className="flex items-center justify-between gap-3">
                        <span className="capitalize text-muted-foreground">
                          {doc.kind.replace(/_/g, ' ')}
                        </span>
                        {doc.url ? (
                          <a
                            href={doc.url}
                            target="_blank"
                            rel="noreferrer"
                            className="flex items-center gap-1 truncate font-medium hover:underline"
                          >
                            <FileText className="size-3.5 shrink-0" />
                            {doc.fileName}
                          </a>
                        ) : (
                          <span
                            className="flex items-center gap-1 truncate text-muted-foreground"
                            title="This file is temporarily unavailable"
                          >
                            <FileText className="size-3.5 shrink-0" />
                            {doc.fileName}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div>
                <div className="mb-2 text-xs font-medium text-muted-foreground">Activity</div>
                <ActivityTimeline events={data.activity} />
              </div>

              {isOpen(data.status) ? (
                <div className="space-y-3 border-t pt-4">
                  {declining ? (
                    <div className="space-y-2">
                      <Textarea
                        placeholder="Reason for declining (optional)…"
                        value={reason}
                        onChange={(event) => setReason(event.target.value)}
                        rows={2}
                      />
                      <div className="flex gap-2">
                        <Button
                          variant="destructive"
                          disabled={busy !== null}
                          onClick={() => decide(ApplicationStatus.Declined)}
                        >
                          {busy === ApplicationStatus.Declined ? <Loader2 className="animate-spin" /> : null}
                          Confirm decline
                        </Button>
                        <Button variant="outline" onClick={() => setDeclining(false)} disabled={busy !== null}>
                          Back
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      <Button disabled={busy !== null} onClick={() => decide(ApplicationStatus.Approved)}>
                        {busy === ApplicationStatus.Approved ? <Loader2 className="animate-spin" /> : null}
                        Approve &amp; disburse
                      </Button>
                      {data.status === ApplicationStatus.Pending ? (
                        <Button
                          variant="outline"
                          disabled={busy !== null}
                          onClick={() => decide(ApplicationStatus.Review)}
                        >
                          {busy === ApplicationStatus.Review ? <Loader2 className="animate-spin" /> : null}
                          Move to review
                        </Button>
                      ) : null}
                      <Button variant="ghost" className="text-destructive" onClick={() => setDeclining(true)}>
                        Decline
                      </Button>
                    </div>
                  )}
                </div>
              ) : data.status === ApplicationStatus.Declined && data.declineReason ? (
                <p className="border-t pt-4 text-sm text-muted-foreground">
                  Declined: {data.declineReason}
                </p>
              ) : null}
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
};
