'use client';

import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  AlertTriangle,
  Banknote,
  Download,
  FileSpreadsheet,
  HandCoins,
  Loader2,
  PiggyBank,
  Wallet,
} from 'lucide-react';
import type { ColumnDef } from '@tanstack/react-table';
import {
  formatNad,
  fromCents,
  type MonthlyReport as MonthlyReportData,
  type MonthlyReportLoanRow,
} from '@loan-pilot/domain';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { DataTable } from '@/components/data-table';
import { StatCard, type StatCardProps } from '@/components/stat-card';
import { StatusBadge } from '@/components/status-badge';
import { ApiError, downloadFile } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { useApi } from '@/lib/use-api';
import { downloadCsv } from '@/lib/csv';
import { formatDate } from '@/lib/format';
import { DataQualityAlert } from './data-quality-alert';

const GENDER_LABELS: Record<string, string> = {
  male: 'Male',
  female: 'Female',
  other: 'Other',
  unknown: '—',
};

// The register deliberately shows no borrower identifiers: the management report
// is read beyond the people who may see personal data.
const columns: ColumnDef<MonthlyReportLoanRow>[] = [
  {
    accessorKey: 'gender',
    header: 'Gender',
    cell: ({ row }) => GENDER_LABELS[row.original.gender] ?? '—',
  },
  {
    accessorKey: 'monthlyIncome',
    header: () => <div className="text-right">Income</div>,
    cell: ({ row }) => (
      <div className="text-right tabular-nums">{formatNad(row.original.monthlyIncome)}</div>
    ),
  },
  {
    accessorKey: 'principal',
    header: () => <div className="text-right">Advanced</div>,
    cell: ({ row }) => (
      <div className="text-right tabular-nums">{formatNad(row.original.principal)}</div>
    ),
  },
  {
    accessorKey: 'financeCharge',
    header: () => <div className="text-right">Interest</div>,
    cell: ({ row }) => (
      <div className="text-right tabular-nums">{formatNad(row.original.financeCharge)}</div>
    ),
  },
  {
    accessorKey: 'termMonths',
    header: () => <div className="text-right">Term</div>,
    cell: ({ row }) => <div className="text-right tabular-nums">{row.original.termMonths}m</div>,
  },
  {
    accessorKey: 'total',
    header: () => <div className="text-right">Repayable</div>,
    cell: ({ row }) => (
      <div className="text-right tabular-nums">{formatNad(row.original.total)}</div>
    ),
  },
  {
    accessorKey: 'instalment',
    header: () => <div className="text-right">Instalment</div>,
    cell: ({ row }) => (
      <div className="text-right tabular-nums">{formatNad(row.original.instalment)}</div>
    ),
  },
  {
    accessorKey: 'balance',
    header: () => <div className="text-right">Outstanding</div>,
    cell: ({ row }) => (
      <div className="text-right tabular-nums">{formatNad(row.original.balance)}</div>
    ),
  },
  {
    accessorKey: 'status',
    header: 'Status',
    cell: ({ row }) => <StatusBadge value={row.original.status} iconless />,
  },
  {
    accessorKey: 'disbursedAt',
    header: 'Disbursed',
    cell: ({ row }) => formatDate(row.original.disbursedAt),
  },
];

interface SummaryLine {
  readonly label: string;
  readonly pick: (summary: MonthlyReportData['summary']) => number;
  readonly strong?: boolean;
}

/**
 * The cash roll-forward, in the order the lender's own register states it:
 * Total capital = cash to lend after the month's costs, Available funds = what
 * is left after lending, and the month's collections carry into next month.
 */
const CASH_LINES: readonly SummaryLine[] = [
  { label: 'Cash at start of month', pick: (s) => s.openingCash },
  { label: 'Capital injected', pick: (s) => s.capitalIn },
  { label: 'Operating expenses', pick: (s) => s.expenses },
  { label: 'Owner drawings', pick: (s) => s.drawings },
  { label: 'Total capital', pick: (s) => s.totalCapital, strong: true },
  { label: 'Loaned this month', pick: (s) => s.disbursedValue },
  { label: 'Available funds', pick: (s) => s.availableFunds, strong: true },
  { label: 'Collected from borrowers', pick: (s) => s.collected },
  { label: 'Other income received', pick: (s) => s.otherIncome },
  { label: 'Cash at end of month', pick: (s) => s.closingCash, strong: true },
  { label: 'Net cash movement', pick: (s) => s.netCashMovement },
];

const BOOK_LINES: readonly SummaryLine[] = [
  { label: 'Loan book at start of month', pick: (s) => s.openingBookValue },
  { label: 'Advanced to borrowers', pick: (s) => s.disbursedValue },
  { label: 'Interest booked on new loans', pick: (s) => s.interestBooked },
  { label: 'Total repayable on new loans', pick: (s) => s.expectedRepayable },
  { label: 'Collected from borrowers', pick: (s) => s.collected },
  { label: 'Loan book at end of month', pick: (s) => s.closingBookValue, strong: true },
  { label: 'In arrears at month end', pick: (s) => s.arrearsValue },
  { label: 'NAMFISA levies charged', pick: (s) => s.namfisaLevies },
  { label: 'Stamp duties charged', pick: (s) => s.stampDuties },
];

interface Props {
  month: string;
}

/** The lender's monthly management report: position, movements and the register. */
export const MonthlyReport = ({ month }: Props) => {
  const { token } = useAuth();
  const [busy, setBusy] = useState<'pdf' | 'xlsx' | null>(null);

  const { data, loading, error } = useApi<MonthlyReportData>(
    month ? `/reports/monthly?month=${month}` : null,
  );

  const download = async (kind: 'pdf' | 'xlsx') => {
    setBusy(kind);
    try {
      await downloadFile(
        `/reports/monthly/${month}/${kind}`,
        `monthly-report-${month}.${kind}`,
        token,
      );
    } catch (downloadError) {
      toast.error(
        downloadError instanceof ApiError ? downloadError.message : 'Could not build the report',
      );
    } finally {
      setBusy(null);
    }
  };

  const exportCsv = () => {
    if (!data) return;
    downloadCsv(
      `monthly-report-${month}.csv`,
      [
        'Gender',
        'Monthly income (N$)',
        'Loan amount (N$)',
        'Interest (N$)',
        'Rate',
        'NAMFISA levy (N$)',
        'Stamp duty (N$)',
        'Total repayable (N$)',
        'Instalment (N$)',
        'Term (months)',
        'Outstanding (N$)',
        'Status',
        'Disbursed',
      ],
      data.loans.map((loan) => [
        GENDER_LABELS[loan.gender] ?? '',
        fromCents(loan.monthlyIncome),
        fromCents(loan.principal),
        fromCents(loan.financeCharge),
        loan.interestRate,
        fromCents(loan.namfisaLevy),
        fromCents(loan.stampDuty),
        fromCents(loan.total),
        fromCents(loan.instalment),
        loan.termMonths,
        fromCents(loan.balance),
        loan.status,
        loan.disbursedAt ? loan.disbursedAt.slice(0, 10) : '',
      ]),
    );
  };

  const stats = useMemo((): StatCardProps[] | null => {
    if (!data) return null;
    const { summary } = data;
    return [
      {
        label: 'Total capital',
        value: formatNad(summary.totalCapital),
        icon: PiggyBank,
        tone: 'brand',
        hint: 'Loaned this month plus available funds',
      },
      {
        label: 'Loaned this month',
        value: formatNad(summary.disbursedValue),
        icon: Banknote,
        hint: `${summary.loansDisbursed} loan(s) advanced`,
      },
      {
        label: 'Available funds',
        value: formatNad(summary.availableFunds),
        icon: Wallet,
        tone: summary.availableFunds >= 0 ? 'green' : 'red',
        hint: 'After lending, before collections',
      },
      {
        label: 'Collected',
        value: formatNad(summary.collected),
        icon: HandCoins,
        tone: 'green',
      },
      {
        label: 'In arrears',
        value: formatNad(summary.arrearsValue),
        icon: AlertTriangle,
        tone: summary.arrearsValue > 0 ? 'red' : 'green',
        hint: `${summary.arrearsLoans} loan(s)`,
      },
    ];
  }, [data]);

  if (error) {
    return <p className="text-sm text-destructive">{error}</p>;
  }
  if (!data || !stats) {
    return loading ? <Skeleton className="h-96 w-full rounded-xl" /> : null;
  }

  const { summary } = data;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium">{data.period.label}</p>
          <p className="text-xs text-muted-foreground">
            {data.period.startDate} to {data.period.endDate}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={exportCsv} disabled={data.loans.length === 0}>
            <FileSpreadsheet className="size-4" /> CSV
          </Button>
          <Button size="sm" variant="outline" onClick={() => download('xlsx')} disabled={busy !== null}>
            {busy === 'xlsx' ? <Loader2 className="size-4 animate-spin" /> : <FileSpreadsheet className="size-4" />}
            Excel
          </Button>
          <Button size="sm" onClick={() => download('pdf')} disabled={busy !== null}>
            {busy === 'pdf' ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
            PDF
          </Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {stats.map((stat) => (
          <StatCard key={stat.label} {...stat} />
        ))}
      </div>

      <DataQualityAlert warnings={data.warnings} />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Cash</CardTitle>
            <CardDescription>
              Each line follows from the one above; the last is next month&apos;s first
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableBody>
                {CASH_LINES.map(({ label, pick, strong }) => (
                  <TableRow key={label} className={strong ? 'font-semibold' : undefined}>
                    <TableCell className={strong ? undefined : 'text-muted-foreground'}>
                      {label}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatNad(pick(summary))}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>The book</CardTitle>
            <CardDescription>How the loan book moved, and the charges raised</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableBody>
                {BOOK_LINES.map(({ label, pick, strong }) => (
                  <TableRow key={label} className={strong ? 'font-semibold' : undefined}>
                    <TableCell className={strong ? undefined : 'text-muted-foreground'}>
                      {label}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatNad(pick(summary))}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Collections by method</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Method</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {summary.collectionsByMethod.map((row) => (
                  <TableRow key={row.key}>
                    <TableCell>{row.label}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatNad(row.value)}</TableCell>
                  </TableRow>
                ))}
                <TableRow className="font-semibold">
                  <TableCell>Total</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatNad(summary.collected)}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Expenses by category</CardTitle>
          </CardHeader>
          <CardContent>
            {data.expenseBreakdown.length === 0 ? (
              <p className="text-sm text-muted-foreground">No expenses recorded this month.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Category</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.expenseBreakdown.map((row) => (
                    <TableRow key={row.key}>
                      <TableCell>{row.label}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatNad(row.value)}
                      </TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="font-semibold">
                    <TableCell>Total</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatNad(summary.expenses)}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Loans advanced in {data.period.label}</CardTitle>
          <CardDescription>
            {data.loans.length} loan(s) · {formatNad(summary.disbursedValue)} advanced ·{' '}
            {formatNad(summary.expectedRepayable)} repayable
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DataTable columns={columns} data={[...data.loans]} pageSize={20} />
        </CardContent>
      </Card>
    </div>
  );
};
