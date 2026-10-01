import * as XLSX from 'xlsx';
import { fromCents, type MonthlyReport } from '@loan-pilot/domain';

/**
 * The monthly report as a workbook: a Summary sheet of the month's position and
 * a Loans sheet of every advance.
 *
 * Money is written as **numbers in major N$**, not formatted strings, so the
 * lender can total a column in Excel. Cent precision is preserved (2 decimals)
 * rather than rounded for display.
 *
 * The Loans sheet carries no borrower identifiers (see MonthlyReportLoanRow).
 */

const money = (cents: number): number => Number(fromCents(cents).toFixed(2));

const GENDER_LABELS: Record<string, string> = {
  male: 'Male',
  female: 'Female',
  other: 'Other',
  unknown: 'Not recorded',
};

export const renderMonthlyReportXlsx = (report: MonthlyReport): Buffer => {
  const { summary } = report;

  const summaryRows: (string | number)[][] = [
    [report.lender.name],
    [`Monthly management report — ${report.period.label}`],
    [`Period ${report.period.startDate} to ${report.period.endDate}`],
    [],
    // The cash lines follow the lender's own roll-forward: each line is derived
    // from the one above it, and the last is next month's first.
    ['Cash', 'Amount (N$)'],
    ['Cash at start of month', money(summary.openingCash)],
    ['Capital injected', money(summary.capitalIn)],
    ['Operating expenses', money(summary.expenses)],
    ['Owner drawings', money(summary.drawings)],
    ['Total capital', money(summary.totalCapital)],
    ['Loaned this month', money(summary.disbursedValue)],
    ['Available funds', money(summary.availableFunds)],
    ['Collected from borrowers', money(summary.collected)],
    ['Other income received', money(summary.otherIncome)],
    ['Cash at end of month', money(summary.closingCash)],
    ['Net cash movement', money(summary.netCashMovement)],
    [],
    ['Loan book', 'Amount (N$)'],
    ['Loan book at start of month', money(summary.openingBookValue)],
    ['Loans advanced (count)', summary.loansDisbursed],
    ['Advanced to borrowers', money(summary.disbursedValue)],
    ['Interest booked on new loans', money(summary.interestBooked)],
    ['Total repayable on new loans', money(summary.expectedRepayable)],
    ['Collected from borrowers', money(summary.collected)],
    ['Written off or waived', money(summary.writtenOff)],
    ['Loan book at end of month', money(summary.closingBookValue)],
    ['In arrears at month end', money(summary.arrearsValue)],
    ['Loans in arrears', summary.arrearsLoans],
    [],
    ['Charges raised', 'Amount (N$)'],
    ['NAMFISA levies', money(summary.namfisaLevies)],
    ['Stamp duties', money(summary.stampDuties)],
    ['Insurance', money(summary.insurance)],
    ['Bank charges', money(summary.bankCharges)],
    [],
    ['Collections by method', 'Amount (N$)'],
    ...summary.collectionsByMethod.map((row) => [row.label, money(row.value)]),
  ];

  if (report.expenseBreakdown.length > 0) {
    summaryRows.push([], ['Expenses by category', 'Amount (N$)']);
    for (const row of report.expenseBreakdown) {
      summaryRows.push([row.label, money(row.value)]);
    }
  }

  if (report.warnings.length > 0) {
    summaryRows.push([], ['Notes']);
    for (const warning of report.warnings) {
      summaryRows.push([warning.message]);
    }
  }

  const summarySheet = XLSX.utils.aoa_to_sheet(summaryRows);
  summarySheet['!cols'] = [{ wch: 40 }, { wch: 16 }];

  const loanHeader = [
    'Gender',
    'Monthly income (N$)',
    'Loan amount (N$)',
    'Interest (N$)',
    'Rate',
    'Bank charges (N$)',
    'NAMFISA levy (N$)',
    'Stamp duty (N$)',
    'Insurance (N$)',
    'Total repayable (N$)',
    'Instalment (N$)',
    'Term (months)',
    'Outstanding (N$)',
    'Status',
    'Disbursed',
  ];

  const loanRows = report.loans.map((loan) => [
    GENDER_LABELS[loan.gender] ?? '',
    money(loan.monthlyIncome),
    money(loan.principal),
    money(loan.financeCharge),
    loan.interestRate,
    money(loan.bankCharges),
    money(loan.namfisaLevy),
    money(loan.stampDuty),
    money(loan.insurance),
    money(loan.total),
    money(loan.instalment),
    loan.termMonths,
    money(loan.balance),
    loan.status,
    loan.disbursedAt ? loan.disbursedAt.slice(0, 10) : '',
  ]);

  const loanSheet = XLSX.utils.aoa_to_sheet([loanHeader, ...loanRows]);
  loanSheet['!cols'] = loanHeader.map((header) => ({ wch: Math.max(12, header.length + 2) }));
  // Freeze the header row so the register stays readable while scrolling.
  loanSheet['!freeze'] = { xSplit: '0', ySplit: '1' };

  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, summarySheet, 'Summary');
  XLSX.utils.book_append_sheet(book, loanSheet, 'Loans');

  const written: unknown = XLSX.write(book, { type: 'buffer', bookType: 'xlsx' });
  return Buffer.isBuffer(written) ? written : Buffer.from([]);
};
