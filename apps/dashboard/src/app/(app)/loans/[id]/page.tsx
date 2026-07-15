'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { toast } from 'sonner';
import {
  AlertTriangle,
  Banknote,
  CalendarClock,
  FileText,
  Loader2,
  Pencil,
  PieChart,
  Wallet,
} from 'lucide-react';
import { LoanStatus, RepaymentStatus, can, formatNad, isLender } from '@loan-pilot/domain';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { PageHeader } from '@/components/page-header';
import { StatCard } from '@/components/stat-card';
import { StatusBadge } from '@/components/status-badge';
import { TypeChip } from '@/components/type-chip';
import { ActivityTimeline } from '@/components/activity-timeline';
import { AuditLog } from '@/components/audit-log';
import { BorrowerDocuments } from '@/components/borrowers/borrower-documents';
import { LoanAgreementCard } from '@/components/loans/loan-agreement-card';
import { LoanOpsCard } from '@/components/loans/loan-ops';
import { EditLoanSheet } from '@/components/loans/edit-loan-sheet';
import { useCommand } from '@/components/command-provider';
import { ApiError, apiFetch } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { useApi } from '@/lib/use-api';
import { formatDate } from '@/lib/format';
import type { LoanDetail } from '@/lib/types';

const Detail = ({ label, value }: { label: string; value: string }) => (
  <div>
    <dt className="text-xs text-muted-foreground">{label}</dt>
    <dd className="mt-0.5 font-medium tabular-nums">{value}</dd>
  </div>
);

const LoanDetailPage = () => {
  const params = useParams<{ id: string }>();
  const { user, token } = useAuth();
  const command = useCommand();
  const { data, loading, error, refresh } = useApi<LoanDetail>(
    params.id ? `/loans/${params.id}` : null,
  );
  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [editing, setEditing] = useState(false);

  if (loading || !data) {
    return (
      <div>
        <PageHeader title="Loan" />
        {error ? (
          <p className="text-sm text-destructive">{error}</p>
        ) : (
          <Skeleton className="h-64 w-full rounded-xl" />
        )}
      </div>
    );
  }

  const open = data.status === LoanStatus.Active || data.status === LoanStatus.Arrears;
  const lender = Boolean(user && isLender(user.role));
  const admin = Boolean(user && can(user, 'loans:manage'));
  const canWrite = Boolean(user && can(user, 'loans:write'));
  const terminal =
    data.status === LoanStatus.Settled ||
    data.status === LoanStatus.WrittenOff ||
    data.status === LoanStatus.Cancelled ||
    data.status === LoanStatus.Closed;
  const canEditLoan = admin && !terminal;
  const canCancel = admin && !terminal && data.payments.length === 0;
  const payable =
    lender &&
    (open || data.status === LoanStatus.PartlyPaid) &&
    data.balance > 0;
  const nextInstalment = data.schedule.find((item) => item.status !== RepaymentStatus.Paid);
  const canCapture = lender && open && Boolean(nextInstalment);
  const loanLabel = `${data.borrower.firstName} ${data.borrower.lastName}'s loan`;

  const captureRepayment = async () => {
    setSubmitting(true);
    try {
      await apiFetch(`/loans/${data.id}/repayments`, { method: 'POST', body: {}, token });
      toast.success('Repayment recorded');
      setConfirming(false);
      refresh();
    } catch (captureError) {
      toast.error(
        captureError instanceof ApiError ? captureError.message : 'Something went wrong',
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={`${data.type[0]?.toUpperCase()}${data.type.slice(1)} loan`}
        description={
          <>
            <Link href={`/borrowers/${data.borrower.id}`} className="font-medium hover:underline">
              {data.borrower.firstName} {data.borrower.lastName}
            </Link>{' '}
            · disbursed {formatDate(data.disbursedAt)}
          </>
        }
        action={
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge value={data.status} />
            {canEditLoan ? (
              <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
                <Pencil className="size-4" /> Edit
              </Button>
            ) : null}
            {payable ? (
              <Button
                size="sm"
                onClick={() =>
                  command.openRecordPayment({ loanId: data.id, loanLabel })
                }
              >
                Record payment
              </Button>
            ) : null}
            {canCapture ? (
              <Button size="sm" variant="outline" onClick={() => setConfirming(true)}>
                Capture instalment
              </Button>
            ) : null}
            {payable ? (
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  command.openSettle({
                    loanId: data.id,
                    balance: data.payoff,
                    defaultInterest: data.defaultInterest,
                    loanLabel,
                  })
                }
              >
                Settle
              </Button>
            ) : null}
            {payable ? (
              <Button
                size="sm"
                variant="ghost"
                className="text-destructive"
                onClick={() => command.openWriteOff({ loanId: data.id, loanLabel })}
              >
                Write off
              </Button>
            ) : null}
            {canCancel ? (
              <Button
                size="sm"
                variant="ghost"
                className="text-destructive"
                onClick={() => command.openCancel({ loanId: data.id, loanLabel })}
              >
                Cancel loan
              </Button>
            ) : null}
          </div>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Balance" value={formatNad(data.balance)} icon={Wallet} tone="brand" />
        <StatCard
          label="Total repayable"
          value={formatNad(data.total)}
          icon={Banknote}
          tone="green"
          hint={`Principal ${formatNad(data.principal)}`}
        />
        <StatCard
          label="Instalment"
          value={formatNad(data.instalment)}
          icon={CalendarClock}
          tone="amber"
          hint={`Next due ${formatDate(data.nextDueAt)}`}
        />
        <StatCard
          label="Days late"
          value={String(data.daysLate)}
          icon={AlertTriangle}
          tone={data.daysLate > 0 ? 'red' : 'green'}
          hint={data.daysLate > 0 ? 'In arrears' : 'On track'}
        />
        {data.defaultInterest > 0 ? (
          <StatCard
            label="Default interest"
            value={formatNad(data.defaultInterest)}
            icon={Banknote}
            tone="red"
            hint={`Payoff today ${formatNad(data.payoff)}`}
          />
        ) : null}
      </div>

      {lender ? <LoanOpsCard loan={data} canEdit={canWrite} onChanged={refresh} /> : null}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <FileText className="size-4 text-muted-foreground" /> Loan details
              </CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-2 gap-x-6 gap-y-4 text-sm sm:grid-cols-3">
                <Detail label="Register month" value={data.originMonth ?? '—'} />
                <Detail label="Disbursed" value={formatDate(data.disbursedAt)} />
                <Detail label="Due" value={formatDate(data.nextDueAt)} />
                <Detail
                  label="Term"
                  value={`${data.termMonths} ${data.termMonths === 1 ? 'month' : 'months'}`}
                />
                <Detail label="Finance rate" value={`${Math.round(data.interestRate * 100)}%`} />
                <Detail label="Instalment" value={formatNad(data.instalment)} />
              </dl>
              {data.bankCharges > 0 || data.namfisaLevy > 0 || data.stampDuty > 0 ? (
                <p className="mt-4 border-t pt-3 text-xs text-muted-foreground">
                  Fees: bank charges {formatNad(data.bankCharges)} · NAMFISA levy{' '}
                  {formatNad(data.namfisaLevy)} · stamp duty {formatNad(data.stampDuty)}
                </p>
              ) : null}
              {data.collateral ? (
                <p className="mt-2 text-xs text-muted-foreground">
                  Collateral: <span className="font-medium text-foreground">{data.collateral}</span>
                </p>
              ) : null}
              {data.note ? (
                <p className="mt-2 text-xs text-muted-foreground italic">{data.note}</p>
              ) : null}
              {data.cancelReason ? (
                <p className="mt-2 text-xs text-destructive">Cancelled: {data.cancelReason}</p>
              ) : null}
              {data.writeOffReason ? (
                <p className="mt-2 text-xs text-destructive">Written off: {data.writeOffReason}</p>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <PieChart className="size-4 text-muted-foreground" /> Repayment progress
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Progress
                value={
                  data.instalmentsTotal > 0
                    ? (data.instalmentsPaid / data.instalmentsTotal) * 100
                    : 0
                }
                className="h-2"
              />
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                <span>
                  {data.instalmentsPaid} of {data.instalmentsTotal} instalments paid ·{' '}
                  <span className="font-medium text-foreground">{formatNad(data.balance)}</span>{' '}
                  remaining
                </span>
                <span className="flex items-center gap-2">
                  <TypeChip type={data.type} />
                  Finance charge {formatNad(data.financeCharge)}
                </span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Repayment schedule</CardTitle>
            </CardHeader>
            <CardContent className="px-2">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>#</TableHead>
                    <TableHead>Due</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Paid</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.schedule.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell>{item.number}</TableCell>
                      <TableCell>{formatDate(item.dueAt)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatNad(item.amount)}</TableCell>
                      <TableCell>
                        <StatusBadge value={item.status} />
                        {item.status !== RepaymentStatus.Paid &&
                        new Date(item.dueAt) < new Date() ? (
                          <span className="ml-2 text-xs font-medium text-destructive">Overdue</span>
                        ) : null}
                      </TableCell>
                      <TableCell>{formatDate(item.paidAt)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Payments received</CardTitle>
            </CardHeader>
            <CardContent className="px-2">
              {data.payments.length === 0 ? (
                <p className="px-4 py-3 text-sm text-muted-foreground">No payments recorded yet.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead>Method</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.payments.map((payment) => (
                      <TableRow key={payment.id}>
                        <TableCell className="whitespace-nowrap">{formatDate(payment.paidAt)}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatNad(payment.amount)}
                          {payment.badDebt ? (
                            <span className="ml-1 text-xs font-medium text-destructive">(bad debt)</span>
                          ) : null}
                        </TableCell>
                        <TableCell className="capitalize">{payment.method.replace('_', ' ')}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Activity</CardTitle>
            </CardHeader>
            <CardContent>
              <ActivityTimeline events={data.activity} />
            </CardContent>
          </Card>

          <LoanAgreementCard
            loanId={data.id}
            user={user}
            token={token}
            hasSignature={Boolean(data.signatureDocumentId)}
          />

          <BorrowerDocuments
            borrowerId={data.borrower.id}
            documents={data.borrowerDocuments}
            canEdit={false}
            onChanged={() => {}}
            title="Borrower documents"
          />

          {admin ? (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Change history</CardTitle>
              </CardHeader>
              <CardContent>
                <AuditLog entries={data.audit} />
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        Borrower:{' '}
        <Link href={`/borrowers/${data.borrower.id}`} className="hover:underline">
          {data.borrower.firstName} {data.borrower.lastName} ({data.borrower.idNumber})
        </Link>
      </p>

      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Capture repayment</DialogTitle>
            <DialogDescription>
              {nextInstalment
                ? `Record instalment ${nextInstalment.number} of ${formatNad(nextInstalment.amount)} ` +
                  `(due ${formatDate(nextInstalment.dueAt)}) as paid today?`
                : null}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirming(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button onClick={captureRepayment} disabled={submitting}>
              {submitting ? <Loader2 className="animate-spin" /> : null}
              Record payment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {canEditLoan ? (
        <EditLoanSheet loan={data} open={editing} onOpenChange={setEditing} onSaved={refresh} />
      ) : null}
    </div>
  );
};

export default LoanDetailPage;
