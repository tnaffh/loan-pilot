'use client';

import Link from 'next/link';
import { ArrowDownLeft, Check, Download, Wallet } from 'lucide-react';
import { LoanStatus, RepaymentStatus, formatNad } from '@loan-pilot/domain';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { StatusBadge } from '@/components/status-badge';
import { Kv } from '@/components/kv';
import { useAuth } from '@/lib/auth-context';
import { useApi } from '@/lib/use-api';
import { formatDate } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { LoanDetail, LoanRow } from '@/lib/types';

const QuickAction = ({
  icon: Icon,
  label,
  href,
  disabled,
  hint,
}: {
  icon: typeof Wallet;
  label: string;
  href?: string;
  disabled?: boolean;
  hint?: string;
}) => {
  const inner = (
    <div
      className={cn(
        'flex flex-col items-center gap-2 rounded-xl border bg-card p-5 text-center transition-colors',
        disabled ? 'opacity-60' : 'hover:border-primary',
      )}
    >
      <span className="flex size-10 items-center justify-center rounded-lg bg-brand-soft text-brand-deep">
        <Icon className="size-5" />
      </span>
      <span className="text-sm font-medium">{label}</span>
    </div>
  );

  if (disabled) {
    return (
      <Tooltip>
        <TooltipTrigger render={<div>{inner}</div>} />
        <TooltipContent>{hint ?? 'Coming soon'}</TooltipContent>
      </Tooltip>
    );
  }
  return href ? <Link href={href}>{inner}</Link> : inner;
};

export const BorrowerHome = () => {
  const { user } = useAuth();
  const { data: loans, loading } = useApi<LoanRow[]>('/loans');

  const firstName = user?.name.split(' ')[0] ?? 'there';
  const activeLoan =
    loans?.find((loan) => loan.status === LoanStatus.Active || loan.status === LoanStatus.Arrears) ??
    loans?.[0] ??
    null;

  const { data: loan } = useApi<LoanDetail>(activeLoan ? `/loans/${activeLoan.id}` : null);

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-52 w-full rounded-2xl" />
      </div>
    );
  }

  if (!activeLoan) {
    return (
      <div className="space-y-6">
        <h2 className="font-heading text-2xl font-semibold tracking-tight">Hello, {firstName}</h2>
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            You have no active loans right now.
          </CardContent>
        </Card>
      </div>
    );
  }

  const paidCount = activeLoan.instalmentsPaid;
  const total = activeLoan.total;
  const progress = total > 0 ? ((total - activeLoan.balance) / total) * 100 : 0;
  const schedule = loan?.schedule ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-heading text-2xl font-semibold tracking-tight">Hello, {firstName}</h2>
        <p className="mt-1 text-sm text-muted-foreground">Here&apos;s where your loan stands today.</p>
      </div>

      <div
        className="relative overflow-hidden rounded-2xl p-6 text-white sm:p-8"
        style={{ backgroundImage: 'linear-gradient(150deg, var(--brand), var(--brand-deep))' }}
      >
        <div
          className="pointer-events-none absolute inset-0 opacity-20"
          style={{
            backgroundImage:
              'linear-gradient(white 1px, transparent 1px), linear-gradient(90deg, white 1px, transparent 1px)',
            backgroundSize: '34px 34px',
          }}
        />
        <div className="relative">
          <div className="text-xs font-semibold tracking-wide uppercase opacity-80">
            Balance remaining
          </div>
          <div className="mt-2 font-heading text-[42px] leading-none font-semibold tabular-nums">
            {formatNad(activeLoan.balance)}
          </div>
          <div className="mt-2 text-sm capitalize opacity-90">
            of {formatNad(total)} total · {activeLoan.type} loan
          </div>
          <div className="mt-5 h-[7px] overflow-hidden rounded-full bg-white/25">
            <div className="h-full rounded-full bg-white" style={{ width: `${progress}%` }} />
          </div>
          <div className="mt-2 flex items-center justify-between text-xs opacity-90">
            <span>
              {paidCount} of {activeLoan.instalmentsTotal} instalments paid
            </span>
            <span>Next due {formatDate(activeLoan.nextDueAt)}</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <QuickAction icon={Wallet} label="Make a payment" href={`/loans/${activeLoan.id}`} />
        <QuickAction icon={Check} label="Settle early" disabled hint="Contact your lender to settle early" />
        <QuickAction icon={Download} label="Statements" disabled hint="Statements are coming soon" />
      </div>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="schedule">Schedule</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Loan details</CardTitle>
              </CardHeader>
              <CardContent>
                <dl className="grid grid-cols-2 gap-4">
                  <Kv label="Instalment" value={formatNad(activeLoan.instalment)} />
                  <Kv label="Next payment" value={formatDate(activeLoan.nextDueAt)} />
                  <Kv label="Principal" value={formatNad(activeLoan.principal)} />
                  <Kv label="Total repayable" value={formatNad(total)} />
                  <Kv label="Term" value={`${activeLoan.termMonths} months`} />
                  <Kv label="Disbursed" value={formatDate(activeLoan.disbursedAt)} />
                </dl>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Recent activity</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {schedule
                  .filter((item) => item.status === RepaymentStatus.Paid)
                  .map((item) => (
                    <div key={item.id} className="flex items-center gap-3">
                      <span className="flex size-8 items-center justify-center rounded-full bg-ok-soft text-ok">
                        <ArrowDownLeft className="size-4" />
                      </span>
                      <div className="flex-1">
                        <div className="text-sm font-medium">Instalment {item.number} received</div>
                        <div className="text-xs text-muted-foreground">{formatDate(item.paidAt)}</div>
                      </div>
                      <div className="text-sm font-medium tabular-nums">{formatNad(item.amount)}</div>
                    </div>
                  ))}
                <div className="flex items-center gap-3">
                  <span className="flex size-8 items-center justify-center rounded-full bg-brand-soft text-brand-deep">
                    <Wallet className="size-4" />
                  </span>
                  <div className="flex-1">
                    <div className="text-sm font-medium">Loan disbursed</div>
                    <div className="text-xs text-muted-foreground">
                      {formatDate(activeLoan.disbursedAt)}
                    </div>
                  </div>
                  <div className="text-sm font-medium tabular-nums">{formatNad(activeLoan.principal)}</div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="schedule">
          <Card>
            <CardContent className="space-y-2 py-4">
              {schedule.length === 0 ? (
                <p className="py-4 text-center text-sm text-muted-foreground">
                  Schedule is loading…
                </p>
              ) : (
                schedule.map((item) => {
                  const paid = item.status === RepaymentStatus.Paid;
                  return (
                    <div
                      key={item.id}
                      className="flex items-center gap-3 rounded-lg border px-3 py-2.5"
                    >
                      <span
                        className={cn(
                          'flex size-8 items-center justify-center rounded-full text-xs font-bold',
                          paid ? 'bg-ok-soft text-ok' : 'bg-warn-soft text-warn',
                        )}
                      >
                        {paid ? <Check className="size-4" /> : item.number}
                      </span>
                      <div className="flex-1">
                        <div className="text-sm font-medium">Instalment {item.number}</div>
                        <div className="text-xs text-muted-foreground">{formatDate(item.dueAt)}</div>
                      </div>
                      <div className="text-sm font-medium tabular-nums">{formatNad(item.amount)}</div>
                      <StatusBadge value={item.status} />
                    </div>
                  );
                })
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};
