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

const columns: ColumnDef<MonthlyReportLoanRow>[] = [
  {
    accessorKey: 'borrowerName',
    header: 'Borrower',
    cell: ({ row }) => (
      <div className="min-w-0">
        <p className="truncate font-medium">{row.original.borrowerName}</p>
        <p className="truncate text-xs text-muted-foreground">
          {row.original.clientNo ? `#${row.original.clientNo} · ` : ''}
          {row.original.idNumber}
        </p>
      </div>
    ),
  },
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
        'Client no',
        'Borrower',
        'ID number',
        'Phone',
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
        loan.clientNo ?? '',
        loan.borrowerName,
        loan.idNumber,
        loan.phone,
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
        hint: 'On loan plus available',
      },
      {
        label: 'Capital on loan',
        value: formatNad(summary.closingBookValue),
        icon: Banknote,
        hint: `${summary.loansDisbursed} advanced this month`,
      },
      {
        label: 'Available funds',
        value: formatNad(summary.availableFunds),
        icon: Wallet,
        tone: summary.availableFunds >= 0 ? 'green' : 'red',
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
            <CardTitle>The month</CardTitle>
            <CardDescription>How the book moved</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableBody>
                {[
                  ['Loan book at start of month', summary.openingBookValue],
                  ['Advanced to borrowers', summary.disbursedValue],
                  ['Interest booked on new loans', summary.interestBooked],
                  ['Total repayable on new loans', summary.expectedRepayable],
                  ['Collected from borrowers', summary.collected],
                  ['Loan book at end of month', summary.closingBookValue],
                ].map(([label, value]) => (
                  <TableRow key={String(label)}>
                    <TableCell className="text-muted-foreground">{label}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatNad(Number(value))}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Cash &amp; charges</CardTitle>
            <CardDescription>Everything else that moved money</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableBody>
                {[
                  ['Other income received', summary.otherIncome],
                  ['Capital injected', summary.capitalIn],
                  ['Operating expenses', summary.expenses],
                  ['Owner drawings', summary.drawings],
                  ['NAMFISA levies charged', summary.namfisaLevies],
                  ['Stamp duties charged', summary.stampDuties],
                ].map(([label, value]) => (
                  <TableRow key={String(label)}>
                    <TableCell className="text-muted-foreground">{label}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatNad(Number(value))}
                    </TableCell>
                  </TableRow>
                ))}
                <TableRow className="font-semibold">
                  <TableCell>Net cash movement</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatNad(summary.netCashMovement)}
                  </TableCell>
                </TableRow>
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
          <DataTable
            columns={columns}
            data={[...data.loans]}
            searchPlaceholder="Search borrower or ID…"
            pageSize={20}
          />
        </CardContent>
      </Card>
    </div>
  );
};
