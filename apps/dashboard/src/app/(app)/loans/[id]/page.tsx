'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { toast } from 'sonner';
import { AlertTriangle, Banknote, CalendarClock, Loader2, Wallet } from 'lucide-react';
import { LoanStatus, RepaymentStatus, formatNad, isLender } from '@loan-pilot/domain';
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
import { ApiError, apiFetch } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { useApi } from '@/lib/use-api';
import { formatDate } from '@/lib/format';
import type { LoanDetail } from '@/lib/types';

const LoanDetailPage = () => {
  const params = useParams<{ id: string }>();
  const { user, token } = useAuth();
  const { data, loading, error, refresh } = useApi<LoanDetail>(
    params.id ? `/loans/${params.id}` : null,
  );
  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);

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
  const nextInstalment = data.schedule.find((item) => item.status !== RepaymentStatus.Paid);
  const canCapture = Boolean(user && isLender(user.role)) && open && nextInstalment;

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
        description={`${data.borrower.firstName} ${data.borrower.lastName} · disbursed ${formatDate(data.disbursedAt)}`}
        action={
          <div className="flex items-center gap-3">
            <StatusBadge value={data.status} />
            {canCapture ? (
              <Button onClick={() => setConfirming(true)}>Capture repayment</Button>
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
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Repayment progress</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <Progress
            value={
              data.instalmentsTotal > 0
                ? (data.instalmentsPaid / data.instalmentsTotal) * 100
                : 0
            }
            className="h-[7px]"
          />
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>
              {data.instalmentsPaid} of {data.instalmentsTotal} instalments paid
            </span>
            <span className="flex items-center gap-2">
              <TypeChip type={data.type} />
              Finance charge {formatNad(data.financeCharge)}
            </span>
          </div>
          {data.collateral ? (
            <p className="pt-1 text-xs text-muted-foreground">
              Collateral: <span className="font-medium text-foreground">{data.collateral}</span>
            </p>
          ) : null}
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
                  </TableCell>
                  <TableCell>{formatDate(item.paidAt)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

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
    </div>
  );
};

export default LoanDetailPage;
