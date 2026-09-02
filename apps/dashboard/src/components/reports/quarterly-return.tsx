'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Download, FileSpreadsheet, Loader2, PencilLine } from 'lucide-react';
import {
  can,
  fromCents,
  type QuarterlyReturn as QuarterlyReturnData,
  type SessionUser,
} from '@loan-pilot/domain';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ApiError, downloadFile } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { useApi } from '@/lib/use-api';
import { downloadCsv } from '@/lib/csv';
import { DataQualityAlert } from './data-quality-alert';
import { FigureRow, rawAmount } from './figure-row';
import { GenderBackfillCard } from './gender-backfill-card';
import { ManualFiguresSheet } from './manual-figures-sheet';
import { ReportMatrix } from './report-matrix';

interface Props {
  period: string;
  user: SessionUser | null;
}

/** One flattened `part / field / value` row per figure, for the CSV export. */
const flatten = (report: QuarterlyReturnData): (string | number)[][] => {
  const rows: (string | number)[][] = [];
  const push = (part: string, field: string, value: number, money = true): void => {
    rows.push([part, field, money ? Number(fromCents(value).toFixed(2)) : value]);
  };

  const { financial: f, nonFinancial: n } = report;
  push('Part D3', 'Interest on loans and advances — micro lenders', report.income.interestOnLoans);
  push('Part D3', 'Default interest', report.income.defaultInterest);
  push('Part D3', 'Bad debts recovered', report.income.badDebtsRecovered);
  push('Part D3', 'Other income', report.income.otherIncome);
  push('Part D3', 'Sub total (Other income)', report.income.total);

  push('Part 1.1', 'NAMFISA levy', report.liabilities.namfisaLevy);
  push('Part 1.1', 'Stamp duty', report.liabilities.stampDuty);
  for (const row of report.liabilities.other) {
    push('Part 1.1', row.label, row.value);
  }
  push('Part 1.1', 'Total current liabilities', report.liabilities.total);

  push('Part 14', 'Loan book at beginning of period', f.openingBookValue);
  push('Part 14', 'Loan disbursement breakdown', f.disbursedTotal);
  for (const bucket of f.disbursementsByTerm) {
    push('Part 14', `Disbursed — length of period from ${bucket.label}`, bucket.value);
  }
  push('Part 14', 'Other fees charged to borrowers', f.feesCharged.total);
  push('Part 14', 'NAMFISA levies', f.feesCharged.namfisaLevies);
  push('Part 14', 'Stamp duties', f.feesCharged.stampDuties);
  push('Part 14', 'Insurance', f.feesCharged.insurance);
  push('Part 14', 'Other fees', f.feesCharged.otherFees);
  push('Part 14', 'Interest charged on loans outstanding at end of quarter', f.interestOnOutstanding);
  push('Part 14', 'Total value of repayment received', f.repayments.total);
  push('Part 14', 'Repayment by payroll deduction', f.repayments.payroll);
  push('Part 14', 'Repayment by debit orders', f.repayments.debitOrder);
  push('Part 14', 'Repayment by cash collection', f.repayments.cash);
  push('Part 14', 'Other repayment method', f.repayments.other);
  push('Part 14', 'Provision for bad debts, beginning of period', f.badDebts.openingProvision);
  push('Part 14', 'Loans written off during the period', f.badDebts.writtenOffInPeriod);
  push('Part 14', 'Provision for bad debts during the period', f.badDebts.provisionRaised);
  push('Part 14', 'Provision for bad debts, end of period', f.badDebts.closingProvision);
  push('Part 14', 'Value of loans rescheduled during the period', f.rescheduledValue);
  push('Part 14', 'Loan book at end of period', f.closingBookValue);
  for (const bucket of f.ageing) {
    push('Part 14', bucket.label, bucket.value);
  }

  const matrix = (
    part: string,
    title: string,
    data: QuarterlyReturnData['valueMatrices']['loansByGender'],
    money: boolean,
  ): void => {
    for (const [key, label] of [
      ['male', 'Male'],
      ['female', 'Female'],
      ['other', 'Other'],
      ['unknown', 'Not recorded'],
      ['total', 'Total'],
    ] as const) {
      const row = data[key];
      push(part, `${title} — ${label} — total`, row.total, money);
      for (const band of data.bands) {
        push(part, `${title} — ${label} — ${band.label}`, row.bands[band.key] ?? 0, money);
      }
    }
  };
  matrix('Part 15', 'Loan disbursement by gender', report.valueMatrices.loansByGender, true);
  matrix('Part 15', 'Borrower salaries by gender', report.valueMatrices.salariesByGender, true);

  push('Part 7.1', 'Complaints lodged', n.complaints.lodged, false);
  push('Part 7.1', 'Resolved in favour of the regulated entity', n.complaints.forEntity, false);
  push('Part 7.1', 'Resolved in favour of the complainant', n.complaints.forComplainant, false);
  push('Part 7.1', 'Unresolved complaints', n.complaints.unresolved, false);
  push('Part 7.1', 'Number of debtors outstanding', n.debtorsOutstanding, false);
  push('Part 7.1', 'Total number of loans disbursed during the period', n.loansDisbursed, false);
  push('Part 7.1', 'Active clients at last day of period', n.activeClients, false);
  push('Part 7.1', 'Number of loans outstanding', n.loansOutstanding.total, false);
  push('Part 7.1', 'Current loans', n.loansOutstanding.current, false);
  push('Part 7.1', 'Loans in arrears', n.loansOutstanding.arrears, false);
  for (const bucket of n.disbursementsByTerm) {
    push('Part 7.1', `Loans with a repayment period of ${bucket.label}`, bucket.value, false);
  }

  matrix('Part 7.2', 'Loan disbursement by gender', report.countMatrices.loansByGender, false);
  matrix('Part 7.2', 'Borrower salaries by gender', report.countMatrices.salariesByGender, false);

  for (const row of n.loansByPurpose) {
    push('Part 7.3', `Loans by purpose — ${row.label}`, row.value, false);
  }
  for (const row of n.loansByCollectionMethod) {
    push('Part 7.3', `Loans by collection method — ${row.label}`, row.value, false);
  }
  push('Part 7.3', 'Number of loans written off as bad debt', n.writtenOffCount, false);
  push('Part 7.3', 'Number of loans rescheduled', n.rescheduledCount, false);
  push('Part 7.3', 'Secured loans', n.security.secured, false);
  push('Part 7.3', 'Unsecured loans', n.security.unsecured, false);
  push('Part 7.3', 'Number of outlets (branches)', n.outlets, false);
  for (const row of n.otherBusiness) {
    push('Part 7.3', row.label, row.value, false);
  }
  return rows;
};

/**
 * The NAMFISA return, laid out part by part in the portal's own order and
 * wording so the figures can be read down the page and typed across.
 */
export const QuarterlyReturn = ({ period, user }: Props) => {
  const { token } = useAuth();
  const [busy, setBusy] = useState<'pdf' | null>(null);
  const [editing, setEditing] = useState(false);

  const { data, loading, error, refresh } = useApi<QuarterlyReturnData>(
    period ? `/reports/quarterly?period=${period}` : null,
  );
  const canEdit = Boolean(user && can(user, 'reports:write'));

  const downloadPdf = async () => {
    setBusy('pdf');
    try {
      await downloadFile(
        `/reports/quarterly/${period}/pdf`,
        `namfisa-return-${period}.pdf`,
        token,
      );
    } catch (downloadError) {
      toast.error(
        downloadError instanceof ApiError ? downloadError.message : 'Could not build the worksheet',
      );
    } finally {
      setBusy(null);
    }
  };

  const exportCsv = () => {
    if (!data) return;
    downloadCsv(`namfisa-return-${period}.csv`, ['Part', 'Field', 'Value'], flatten(data));
  };

  if (error) {
    return <p className="text-sm text-destructive">{error}</p>;
  }
  if (!data) {
    return loading ? <Skeleton className="h-96 w-full rounded-xl" /> : null;
  }

  const { financial: f, nonFinancial: n } = data;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium">
            {data.period.label} · {data.period.startDate} to {data.period.endDate}
          </p>
          <p className="text-xs text-muted-foreground">
            Due {data.period.dueDate}
            {data.lender.licenceNo ? ` · NAMFISA licence ${data.lender.licenceNo}` : ''}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canEdit ? (
            <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
              <PencilLine className="size-4" /> Complete figures
            </Button>
          ) : null}
          <Button size="sm" variant="outline" onClick={exportCsv}>
            <FileSpreadsheet className="size-4" /> CSV
          </Button>
          <Button size="sm" onClick={downloadPdf} disabled={busy === 'pdf'}>
            {busy === 'pdf' ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
            Worksheet PDF
          </Button>
        </div>
      </div>

      <DataQualityAlert warnings={data.warnings} onCaptureFigures={canEdit ? () => setEditing(true) : undefined} />

      <p className="text-xs text-muted-foreground">
        Each line shows the amount and, beneath it, the plain number to type into the portal.
        Hover a row to copy it.
      </p>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Part D3 — Other income</CardTitle>
            <CardDescription>Income / Revenue</CardDescription>
          </CardHeader>
          <CardContent>
            <FigureRow label="Interest on loans and advances — micro lenders" value={data.income.interestOnLoans} />
            <FigureRow label="Default interest" value={data.income.defaultInterest} />
            <FigureRow label="Bad debts recovered" value={data.income.badDebtsRecovered} />
            <FigureRow label="Other income" value={data.income.otherIncome} />
            <FigureRow label="Sub total (Other income — Part D3)" value={data.income.total} strong />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Part 1.1 — Current liabilities</CardTitle>
            <CardDescription>Accrued at the end of the quarter</CardDescription>
          </CardHeader>
          <CardContent>
            <FigureRow label="NAMFISA levy" value={data.liabilities.namfisaLevy} />
            <FigureRow label="Stamp duty" value={data.liabilities.stampDuty} />
            {data.liabilities.other.map((row) => (
              <FigureRow key={row.key} label={row.label.replace(/ payable$/i, '')} value={row.value} />
            ))}
            <FigureRow label="Total current liabilities" value={data.liabilities.total} strong />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Part 14 (3.4.6) — Additional financial information</CardTitle>
          <CardDescription>Loan book, disbursements, fees, repayments and ageing</CardDescription>
        </CardHeader>
        <CardContent>
          <FigureRow label="Total value of loan book at beginning of reporting period" value={f.openingBookValue} />
          <FigureRow label="Loan disbursement breakdown" value={f.disbursedTotal} strong />
          {f.disbursementsByTerm
            .filter((bucket) => bucket.value > 0)
            .map((bucket) => (
              <FigureRow key={bucket.key} label={`Length of period from ${bucket.label}`} value={bucket.value} indent />
            ))}
          <FigureRow label="Other fees charged to borrowers during the quarter" value={f.feesCharged.total} strong />
          <FigureRow label="NAMFISA levies" value={f.feesCharged.namfisaLevies} indent />
          <FigureRow label="Stamp duties" value={f.feesCharged.stampDuties} indent />
          <FigureRow label="Insurance" value={f.feesCharged.insurance} indent />
          <FigureRow label="Other fees" value={f.feesCharged.otherFees} indent />
          <FigureRow label="Interest charged on loans outstanding at the end of quarter" value={f.interestOnOutstanding} />
          <FigureRow label="Total value of repayment received in reporting period" value={f.repayments.total} strong />
          <FigureRow label="Repayment by payroll deduction" value={f.repayments.payroll} indent />
          <FigureRow label="Repayment by debit orders" value={f.repayments.debitOrder} indent />
          <FigureRow label="Repayment by cash collection" value={f.repayments.cash} indent />
          <FigureRow label="Other repayment method" value={f.repayments.other} indent />
          <FigureRow label="Provision for bad debts, beginning of period" value={f.badDebts.openingProvision} />
          <FigureRow label="Loans written off during the period" value={f.badDebts.writtenOffInPeriod} indent />
          <FigureRow label="Provision for bad debts during the period" value={f.badDebts.provisionRaised} indent />
          <FigureRow label="Provision for bad debts, end of period" value={f.badDebts.closingProvision} strong />
          <FigureRow label="Value of loans rescheduled during the period" value={f.rescheduledValue} />
          <FigureRow label="Total value of loan book at end of reporting period" value={f.closingBookValue} strong />
          {f.ageing.map((bucket) => (
            <FigureRow key={bucket.key} label={bucket.label} value={bucket.value} indent />
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Part 15 (3.4.7) — Values by gender and range</CardTitle>
          <CardDescription>
            Loans are counted once each; salaries once per borrower.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <ReportMatrix
            matrix={data.valueMatrices.loansByGender}
            kind="money"
            caption="Loan disbursement breakdown by gender — one row per loan advanced this quarter."
          />
          <ReportMatrix
            matrix={data.valueMatrices.salariesByGender}
            kind="money"
            caption="Borrower gross salaries by gender — one row per distinct borrower, banded by salary."
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Part 7.1 — Non-financial information</CardTitle>
        </CardHeader>
        <CardContent>
          <FigureRow label="Number of complaints lodged" value={n.complaints.lodged} kind="count" />
          <FigureRow label="Resolved in favour of the regulated entity" value={n.complaints.forEntity} kind="count" indent />
          <FigureRow label="Resolved in favour of the complainant" value={n.complaints.forComplainant} kind="count" indent />
          <FigureRow label="Unresolved complaints" value={n.complaints.unresolved} kind="count" indent />
          <FigureRow label="Number of debtors outstanding" value={n.debtorsOutstanding} kind="count" />
          <FigureRow label="Total number of loans disbursed during the period" value={n.loansDisbursed} kind="count" />
          <FigureRow
            label="Total number of clients in book at last day of reporting period"
            value={n.activeClients}
            kind="count"
            hint="Distinct borrowers with a loan still on the book at period end."
          />
          <FigureRow label="Number of loans outstanding" value={n.loansOutstanding.total} kind="count" strong />
          <FigureRow label="Current loans" value={n.loansOutstanding.current} kind="count" indent />
          <FigureRow label="Loans in arrears" value={n.loansOutstanding.arrears} kind="count" indent />
          {n.disbursementsByTerm
            .filter((bucket) => bucket.value > 0)
            .map((bucket) => (
              <FigureRow
                key={bucket.key}
                label={`Length of repayment period ${bucket.label}`}
                value={bucket.value}
                kind="count"
                indent
              />
            ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Part 7.2 — Numbers by gender and range</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <ReportMatrix
            matrix={data.countMatrices.loansByGender}
            kind="count"
            caption="Number of loans by gender and loan-size band."
          />
          <ReportMatrix
            matrix={data.countMatrices.salariesByGender}
            kind="count"
            caption="Number of borrowers by gender and salary band."
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Part 7.3 — Non-financial information</CardTitle>
        </CardHeader>
        <CardContent>
          <FigureRow label="Number of loans by purpose" value={n.loansDisbursed} kind="count" strong />
          {n.loansByPurpose.map((row) => (
            <FigureRow key={row.key} label={row.label} value={row.value} kind="count" indent />
          ))}
          <FigureRow label="Number of loans per collection method" value={n.loansDisbursed} kind="count" strong />
          {n.loansByCollectionMethod.map((row) => (
            <FigureRow key={row.key} label={row.label} value={row.value} kind="count" indent />
          ))}
          <FigureRow label="Number of loans written off as bad debt" value={n.writtenOffCount} kind="count" />
          <FigureRow label="Number of loans rescheduled" value={n.rescheduledCount} kind="count" />
          <FigureRow label="Secured loans" value={n.security.secured} kind="count" />
          <FigureRow label="Unsecured loans" value={n.security.unsecured} kind="count" />
          <FigureRow label="Number of outlets (branches)" value={n.outlets} kind="count" />
          {n.otherBusiness.map((row) => (
            <FigureRow key={row.key} label={row.label} value={row.value} kind="count" indent />
          ))}
        </CardContent>
      </Card>

      {data.reconciliation.variance !== 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Reconciliation</CardTitle>
            <CardDescription>
              The book rebuilt from the payment history against the sum of stored loan balances.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <FigureRow label="Rebuilt from payment history (reported)" value={data.reconciliation.derived} strong />
            <FigureRow label="Sum of stored loan balances" value={data.reconciliation.stored} />
            <FigureRow label="Difference" value={data.reconciliation.variance} />
            <p className="pt-2 text-xs text-muted-foreground">
              Raw difference: {rawAmount(data.reconciliation.variance)}
            </p>
          </CardContent>
        </Card>
      ) : null}

      {data.coverage.loansMissingGender > 0 ? <GenderBackfillCard /> : null}

      {canEdit ? (
        <ManualFiguresSheet
          period={period}
          periodLabel={data.period.label}
          figures={data.manual}
          notes=""
          open={editing}
          onOpenChange={setEditing}
          onSaved={refresh}
        />
      ) : null}
    </div>
  );
};
