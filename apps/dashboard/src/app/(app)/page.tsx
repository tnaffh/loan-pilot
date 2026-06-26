'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle,
  ArrowDownCircle,
  Banknote,
  Building2,
  Download,
  FileText,
  Inbox,
  PiggyBank,
  TrendingUp,
  Users,
  Wallet,
} from 'lucide-react';
import { LoanStatus, UserRole, formatNad, fromCents } from '@loan-pilot/domain';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { StatCard } from '@/components/stat-card';
import { StatusBadge } from '@/components/status-badge';
import { TypeChip } from '@/components/type-chip';
import { InitialsAvatar } from '@/components/initials-avatar';
import { CashFlowChart } from '@/components/charts/cash-flow-chart';
import { StatusDonut } from '@/components/charts/status-donut';
import { ExpenseBar } from '@/components/charts/expense-bar';
import { BorrowerHome } from '@/components/borrower/home';
import { useCommand } from '@/components/command-provider';
import { useAuth } from '@/lib/auth-context';
import { useApi } from '@/lib/use-api';
import { downloadCsv } from '@/lib/csv';
import { useTenantBranding } from '@/lib/tenant-theme';
import { formatDate } from '@/lib/format';
import type { ApplicationRow, LenderSeries, LoanRow, OverviewStats } from '@/lib/types';

const greeting = (): string => {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
};

const StatGrid = ({ children }: { children: React.ReactNode }) => (
  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{children}</div>
);

const LoadingState = () => (
  <StatGrid>
    {[0, 1, 2, 3].map((index) => (
      <Skeleton key={index} className="h-[120px] w-full rounded-xl" />
    ))}
  </StatGrid>
);

const LenderOverview = ({
  stats,
}: {
  stats: Extract<OverviewStats, { kind: 'lender' }>;
}) => {
  const router = useRouter();
  const command = useCommand();
  const { user } = useAuth();
  const admin = user?.role === UserRole.LenderAdmin;
  const branding = useTenantBranding();
  const { data: loans } = useApi<LoanRow[]>('/loans');
  const { data: applications } = useApi<ApplicationRow[]>('/applications');
  const { data: series } = useApi<LenderSeries>('/stats/series');

  const firstName = user?.name.split(' ')[0] ?? 'there';
  const today = formatDate(new Date().toISOString());

  const needsAttention = (loans ?? [])
    .filter((loan) => loan.status === LoanStatus.Active || loan.status === LoanStatus.Arrears)
    .sort((a, b) => {
      if (a.status !== b.status) {
        return a.status === LoanStatus.Arrears ? -1 : 1;
      }
      return (a.nextDueAt ?? '').localeCompare(b.nextDueAt ?? '');
    })
    .slice(0, 5);

  const latestApplications = (applications ?? []).slice(0, 4);

  const exportLoanBook = () => {
    const rows = (loans ?? []).map((loan) => [
      `${loan.borrower.firstName} ${loan.borrower.lastName}`,
      loan.type,
      fromCents(loan.principal),
      fromCents(loan.balance),
      fromCents(loan.instalment),
      loan.termMonths,
      `${loan.instalmentsPaid}/${loan.instalmentsTotal}`,
      loan.status,
      loan.disbursedAt ? formatDate(loan.disbursedAt) : '',
      loan.nextDueAt ? formatDate(loan.nextDueAt) : '',
      loan.daysLate,
    ]);
    downloadCsv(
      `loan-book-${new Date().toISOString().slice(0, 10)}.csv`,
      [
        'Borrower',
        'Type',
        'Principal (N$)',
        'Balance (N$)',
        'Instalment (N$)',
        'Term (months)',
        'Instalments paid',
        'Status',
        'Disbursed',
        'Next due',
        'Days late',
      ],
      rows,
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-heading text-3xl font-semibold tracking-tight">
            {greeting()}, {firstName}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Here&apos;s how {branding?.name ?? 'your book'} looks today — {today}.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={exportLoanBook} disabled={!loans?.length}>
            <Download />
            Export
          </Button>
          <Button onClick={() => router.push('/applications')}>
            <Inbox />
            Review applications
          </Button>
        </div>
      </div>

      <StatGrid>
        <StatCard
          label="Active book size"
          value={formatNad(stats.bookValue)}
          icon={Wallet}
          tone="brand"
          hint="Outstanding balance"
        />
        <StatCard
          label="Active loans"
          value={String(stats.activeLoans)}
          icon={FileText}
          tone="green"
          hint={`${stats.borrowers} borrowers`}
        />
        <StatCard
          label="In arrears"
          value={formatNad(stats.arrearsValue)}
          icon={AlertTriangle}
          tone="red"
          delta={{ text: String(stats.arrearsLoans), dir: 'down' }}
          hint={stats.arrearsLoans === 1 ? 'loan overdue' : 'loans overdue'}
        />
        <StatCard
          label="Pending applications"
          value={String(stats.pendingApplications)}
          icon={Inbox}
          tone="amber"
          hint="Awaiting a decision"
        />
      </StatGrid>

      {admin ? (
        <StatGrid>
          <StatCard
            label="Available balance"
            value={formatNad(stats.availableBalance ?? 0)}
            icon={Wallet}
            tone={(stats.availableBalance ?? 0) >= 0 ? 'green' : 'red'}
            hint="Cash available to lend"
          />
          <StatCard
            label="Net profit"
            value={formatNad(stats.netProfit ?? 0)}
            icon={TrendingUp}
            tone={(stats.netProfit ?? 0) >= 0 ? 'green' : 'red'}
            hint="Collected − disbursed − expenses"
          />
          <StatCard
            label="Collected to date"
            value={formatNad(stats.collected ?? 0)}
            icon={Banknote}
            hint={`${formatNad(stats.expenses ?? 0)} operating costs`}
          />
          <StatCard
            label="Invested capital"
            value={formatNad(stats.invested ?? 0)}
            icon={PiggyBank}
            tone="brand"
            hint="Owner contributions in"
          />
          <StatCard
            label="Owner drawings"
            value={formatNad(stats.drawings ?? 0)}
            icon={ArrowDownCircle}
            hint="Dividends / cash-out"
          />
        </StatGrid>
      ) : null}

      {admin ? (
        <Card>
          <CardHeader>
            <CardTitle>Cash flow</CardTitle>
            <CardDescription>Disbursed, collected and expenses by month</CardDescription>
          </CardHeader>
          <CardContent>
            {series ? (
              <CashFlowChart data={series.monthly} />
            ) : (
              <Skeleton className="h-[260px] w-full" />
            )}
          </CardContent>
        </Card>
      ) : null}

      <div className={admin ? 'grid gap-4 lg:grid-cols-[1fr_1.4fr]' : undefined}>
        <Card>
          <CardHeader>
            <CardTitle>Loan status</CardTitle>
            <CardDescription>Distribution across the book</CardDescription>
          </CardHeader>
          <CardContent>
            {series ? (
              <StatusDonut data={series.statusMix} />
            ) : (
              <Skeleton className="mx-auto h-[240px] w-[240px] rounded-full" />
            )}
          </CardContent>
        </Card>
        {admin ? (
          <Card>
            <CardHeader>
              <CardTitle>Top expenses</CardTitle>
              <CardDescription>Largest operating cost categories</CardDescription>
            </CardHeader>
            <CardContent>
              {series ? (
                <ExpenseBar data={series.topExpenseCategories} />
              ) : (
                <Skeleton className="h-[240px] w-full" />
              )}
            </CardContent>
          </Card>
        ) : null}
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Loans needing attention</CardTitle>
          </CardHeader>
          <CardContent className="px-2">
            {needsAttention.length === 0 ? (
              <p className="px-4 py-6 text-sm text-muted-foreground">Nothing outstanding right now.</p>
            ) : (
              <ul>
                {needsAttention.map((loan) => (
                  <li key={loan.id}>
                    <button
                      type="button"
                      onClick={() => command.openLoanQuickView(loan.id)}
                      className="flex w-full items-center gap-3 rounded-lg px-2 py-2.5 text-left hover:bg-muted"
                    >
                      <InitialsAvatar name={`${loan.borrower.firstName} ${loan.borrower.lastName}`} />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium">
                          {loan.borrower.firstName} {loan.borrower.lastName}
                        </div>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <TypeChip type={loan.type} />
                          {loan.daysLate > 0 ? (
                            <span className="text-destructive">{loan.daysLate}d late</span>
                          ) : (
                            <span>Due {formatDate(loan.nextDueAt)}</span>
                          )}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-medium tabular-nums">
                          {formatNad(loan.balance)}
                        </div>
                        <StatusBadge value={loan.status} />
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle className="text-base">Latest applications</CardTitle>
            <Link href="/applications" className="text-xs font-medium text-primary hover:underline">
              View all
            </Link>
          </CardHeader>
          <CardContent className="px-2">
            {latestApplications.length === 0 ? (
              <p className="px-4 py-6 text-sm text-muted-foreground">No applications yet.</p>
            ) : (
              <ul>
                {latestApplications.map((application) => (
                  <li key={application.id}>
                    <button
                      type="button"
                      onClick={() => command.openReview(application.id)}
                      className="flex w-full items-center gap-3 rounded-lg px-2 py-2.5 text-left hover:bg-muted"
                    >
                      <InitialsAvatar
                        name={`${application.firstName} ${application.lastName}`}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium">
                          {application.firstName} {application.lastName}
                        </div>
                        <div className="text-xs capitalize text-muted-foreground">
                          {application.type} · {formatNad(application.amount)}
                        </div>
                      </div>
                      <StatusBadge value={application.status} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

const PlatformOverview = ({
  stats,
}: {
  stats: Extract<OverviewStats, { kind: 'platform' }>;
}) => (
  <div className="space-y-6">
    <div>
      <h2 className="font-heading text-3xl font-semibold tracking-tight">Platform overview</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        How LoanPilot is performing across all lenders.
      </p>
    </div>
    <StatGrid>
      <StatCard label="Tenants" value={String(stats.tenants)} icon={Building2} tone="brand" />
      <StatCard
        label="Active tenants"
        value={String(stats.activeTenants)}
        icon={Building2}
        tone="green"
      />
      <StatCard
        label="Total book"
        value={formatNad(stats.totalBookValue)}
        icon={Banknote}
        tone="brand"
      />
      <StatCard
        label="Borrowers"
        value={String(stats.totalBorrowers)}
        icon={Users}
        tone="amber"
      />
    </StatGrid>
  </div>
);

const OverviewPage = () => {
  const { user } = useAuth();
  const { data, loading, error } = useApi<OverviewStats>('/stats/overview');

  if (user && user.role === 'borrower') {
    return <BorrowerHome />;
  }

  if (loading || !data) {
    return error ? <p className="text-sm text-destructive">{error}</p> : <LoadingState />;
  }

  if (data.kind === 'lender') {
    return <LenderOverview stats={data} />;
  }
  if (data.kind === 'platform') {
    return <PlatformOverview stats={data} />;
  }
  return <BorrowerHome />;
};

export default OverviewPage;
