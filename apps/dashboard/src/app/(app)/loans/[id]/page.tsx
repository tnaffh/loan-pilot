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
  RefreshCw,
  Repeat,
  ShieldCheck,
  Wallet,
} from 'lucide-react';
import {
  INTEREST_METHOD_LABEL,
  InterestMethod,
  LoanStatus,
  RENEWAL_BASIS_LABEL,
  RenewalBasis,
  can,
  formatNad,
  isInstalmentSettled,
  isLender,
} from '@loan-pilot/domain';
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
import { LoanPriceBreakdown } from '@/components/loan-price-breakdown';
import { StatusBadge } from '@/components/status-badge';
import { TypeChip } from '@/components/type-chip';
import { ActivityTimeline } from '@/components/activity-timeline';
import { AuditLog } from '@/components/audit-log';
import { BorrowerDocuments } from '@/components/borrowers/borrower-documents';
import { LoanAgreementCard } from '@/components/loans/loan-agreement-card';
import { CollateralAgreementCard } from '@/components/loans/collateral-agreement-card';
import { LoanOpsCard } from '@/components/loans/loan-ops';
import { EditLoanSheet } from '@/components/loans/edit-loan-sheet';
import { ChangeMethodDialog } from '@/components/loans/change-method-dialog';
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
  const [changingMethod, setChangingMethod] = useState(false);

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
  // Let a small remainder go: on any loan still owing, or to put right a loan
  // written off over a few dollars.
  const canWaive =
    admin &&
    data.balance > 0 &&
    (open || data.status === LoanStatus.PartlyPaid || data.status === LoanStatus.WrittenOff);
  const payable = lender && (open || data.status === LoanStatus.PartlyPaid) && data.balance > 0;
  const nextInstalment = data.schedule.find((item) => !isInstalmentSettled(item.status));
  const renewing = data.interestMethod === InterestMethod.MonthlyRenewal;
  const termLoan = data.interestMethod === InterestMethod.TermLoan;
  // A monthly renewal loan has no fixed instalments to capture.
  const canCapture = lender && open && Boolean(nextInstalment) && !renewing;
  // Changing the method recalculates the loan, so it needs nothing waived.
  const canChangeMethod = canEditLoan && data.waived === 0;
  const percent = (fraction: number): string => `${Math.round(fraction * 10000) / 100}%`;
  const loanLabel = `${data.borrower.firstName} ${data.borrower.lastName}'s loan`;

  const captureRepayment = async () => {
    setSubmitting(true);

    try {
      await apiFetch(`/loans/${data.id}/repayments`, { method: 'POST', body: {}, token });
      toast.success('Repayment recorded');
      setConfirming(false);
      refresh();
    } catch (captureError) {
      toast.error(captureError instanceof ApiError ? captureError.message : 'Something went wrong');
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
            {canChangeMethod ? (
              <Button size="sm" variant="outline" onClick={() => setChangingMethod(true)}>
                <RefreshCw className="size-4" /> Change method
              </Button>
            ) : null}
            {payable ? (
              <Button
                size="sm"
                onClick={() => command.openRecordPayment({ loanId: data.id, loanLabel })}
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
            {canWaive ? (
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  command.openWaive({
                    loanId: data.id,
                    remainder: data.balance,
                    loanLabel,
                    writtenOff: data.status === LoanStatus.WrittenOff,
                  })
                }
              >
                Waive remainder
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
          label={renewing ? 'Due this month' : 'Instalment'}
          value={formatNad(renewing ? data.balance : data.instalment)}
          icon={CalendarClock}
          tone="amber"
          hint={
            renewing
              ? `Renews if unpaid after ${formatDate(data.nextDueAt)}`
              : `Next due ${formatDate(data.nextDueAt)}`
          }
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
        {data.unearnedInterest > 0 ? (
          <StatCard
            label="Settle today"
            value={formatNad(data.payoff)}
            icon={Banknote}
            tone="green"
            hint={`${formatNad(data.unearnedInterest)} interest not yet earned comes off`}
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
                <Detail label="Method" value={INTEREST_METHOD_LABEL[data.interestMethod]} />
                {termLoan ? (
                  <Detail
                    label="Interest rate"
                    value={`${percent(data.annualRate ?? 0)} a year (BoN ${percent(data.bonRate ?? 0)} + ${percent(data.marginRate ?? 0)})`}
                  />
                ) : (
                  <Detail
                    label={renewing ? 'Monthly rate' : 'Finance rate'}
                    value={percent(data.interestRate)}
                  />
                )}
                {renewing ? (
                  <Detail
                    label="Renewal charge"
                    value={RENEWAL_BASIS_LABEL[data.renewalBasis ?? RenewalBasis.Principal]}
                  />
                ) : (
                  <Detail label="Instalment" value={formatNad(data.instalment)} />
                )}
              </dl>
              {data.bankCharges > 0 || data.namfisaLevy > 0 || data.stampDuty > 0 ? (
                <p className="mt-4 border-t pt-3 text-xs text-muted-foreground">
                  Fees: bank charges {formatNad(data.bankCharges)} · NAMFISA levy{' '}
                  {formatNad(data.namfisaLevy)} · stamp duty {formatNad(data.stampDuty)}
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
              {data.waived > 0 ? (
                <p className="mt-2 text-xs text-muted-foreground">
                  Settled with {formatNad(data.waived)} waived
                  {data.waiveReason ? `: ${data.waiveReason}` : ''}
                </p>
              ) : null}
            </CardContent>
          </Card>

          {data.type === 'collateral' || data.collateralItem ? (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <ShieldCheck className="size-4 text-muted-foreground" /> Collateral
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <dl className="grid grid-cols-2 gap-x-6 gap-y-4 text-sm sm:grid-cols-3">
                  <Detail
                    label="Item / asset"
                    value={data.collateralItem ?? data.collateral ?? '—'}
                  />
                  <Detail label="Identification" value={data.collateralIdentifier ?? '—'} />
                  <Detail label="Condition" value={data.collateralCondition ?? '—'} />
                  <Detail
                    label="Estimated value"
                    value={data.collateralValue != null ? formatNad(data.collateralValue) : '—'}
                  />
                </dl>
                {data.collateralDescription ? (
                  <p className="text-sm text-muted-foreground">{data.collateralDescription}</p>
                ) : null}
                {data.collateralPhotos.length > 0 ? (
                  <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                    {data.collateralPhotos.map((photo) =>
                      photo.url ? (
                        <a
                          key={photo.id}
                          href={photo.url}
                          target="_blank"
                          rel="noreferrer"
                          className="aspect-square overflow-hidden rounded-lg border"
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={photo.url}
                            alt={photo.fileName}
                            className="h-full w-full object-cover"
                          />
                        </a>
                      ) : null,
                    )}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">No collateral photos on file.</p>
                )}
              </CardContent>
            </Card>
          ) : null}

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

          <LoanPriceBreakdown loan={data} />

          {renewing ? (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Repeat className="size-4 text-muted-foreground" /> Renewals
                </CardTitle>
              </CardHeader>
              <CardContent className="px-2">
                {data.renewals.length === 0 ? (
                  <p className="px-4 py-3 text-sm text-muted-foreground">
                    Not renewed yet. If the loan is still unpaid after its due date and grace days,
                    it renews for another month and {percent(data.interestRate)} is added.
                  </p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>#</TableHead>
                        <TableHead>Renewed on</TableHead>
                        <TableHead className="text-right">Charged on</TableHead>
                        <TableHead className="text-right">Charge</TableHead>
                        <TableHead>New due date</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.renewals.map((renewal) => (
                        <TableRow key={renewal.id}>
                          <TableCell>{renewal.number}</TableCell>
                          <TableCell>{formatDate(renewal.renewedAt)}</TableCell>
                          <TableCell className="text-right tabular-nums">
                            {formatNad(renewal.base)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {formatNad(renewal.charge)}
                          </TableCell>
                          <TableCell>{formatDate(renewal.newDueAt)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          ) : null}

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
                    {termLoan ? (
                      <>
                        <TableHead className="text-right">Interest</TableHead>
                        <TableHead className="text-right">Principal</TableHead>
                      </>
                    ) : null}
                    <TableHead>Status</TableHead>
                    <TableHead>Paid</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.schedule.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell>{item.number}</TableCell>
                      <TableCell>{formatDate(item.dueAt)}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatNad(item.amount)}
                      </TableCell>
                      {termLoan ? (
                        <>
                          <TableCell className="text-right tabular-nums text-muted-foreground">
                            {formatNad(item.interest ?? 0)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums text-muted-foreground">
                            {formatNad(item.principalPortion ?? 0)}
                          </TableCell>
                        </>
                      ) : null}
                      <TableCell>
                        <StatusBadge value={item.status} />
                        {!isInstalmentSettled(item.status) && new Date(item.dueAt) < new Date() ? (
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
                        <TableCell className="whitespace-nowrap">
                          {formatDate(payment.paidAt)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatNad(payment.amount)}
                          {payment.badDebt ? (
                            <span className="ml-1 text-xs font-medium text-destructive">
                              (bad debt)
                            </span>
                          ) : null}
                        </TableCell>
                        <TableCell className="capitalize">
                          {payment.method.replace('_', ' ')}
                        </TableCell>
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
            loanUpdatedAt={data.updatedAt}
            user={user}
            token={token}
            hasSignature={Boolean(data.signatureDocumentId)}
          />

          {data.type === 'collateral' ? (
            <CollateralAgreementCard
              loanId={data.id}
              loanUpdatedAt={data.updatedAt}
              user={user}
              token={token}
              hasSignature={Boolean(data.signatureDocumentId)}
            />
          ) : null}

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
      {canChangeMethod ? (
        <ChangeMethodDialog open={changingMethod} onOpenChange={setChangingMethod} loan={data} />
      ) : null}
    </div>
  );
};

export default LoanDetailPage;
