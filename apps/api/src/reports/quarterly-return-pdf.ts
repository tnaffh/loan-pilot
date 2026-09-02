import PDFDocument from 'pdfkit';
import {
  formatNad,
  type BandedMatrix,
  type BandedRow,
  type LabelledValue,
  type QuarterlyReturn,
} from '@loan-pilot/domain';
import { COLORS, type LetterheadDetails } from '../common/pdf/document-layout';
import { createReportLayout, type ReportColumn } from './report-layout';

/**
 * The NAMFISA quarterly return as a working paper.
 *
 * Sections follow the portal form's own order and wording — Part D3, Part 1.1,
 * Part 14, Part 15, Parts 7.1–7.3 — so it can be read straight down while the
 * figures are typed in, and filed afterwards as the evidence behind the return.
 * The report's caveats are printed at the end rather than left on screen, so a
 * reviewer sees what the figures could and could not be derived from.
 */
export const renderQuarterlyReturnPdf = (
  report: QuarterlyReturn,
  lender: LetterheadDetails,
  logoPng: Buffer | null,
): Promise<Buffer> =>
  new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 48, bufferPages: true });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const layout = createReportLayout(doc);

    layout.letterhead({
      lender,
      logoPng,
      title: 'NAMFISA QUARTERLY RETURN',
      preamble: `Chart of Accounts return for ${report.period.label} · period ${report.period.startDate} to ${report.period.endDate} · due ${report.period.dueDate}`,
    });

    layout.summaryRow([
      { label: 'Loan book at period end', value: formatNad(report.financial.closingBookValue) },
      { label: 'Disbursed in period', value: formatNad(report.financial.disbursedTotal) },
      { label: 'Collected in period', value: formatNad(report.financial.repayments.total) },
      { label: 'Loans disbursed', value: String(report.nonFinancial.loansDisbursed) },
    ]);

    // ── Part D3 ────────────────────────────────────────────────────────────
    layout.sectionHeading('Income / Revenue · Part D3 — Other income');
    layout.labelValues([
      { label: 'Interest on loans and advances — micro lenders', value: formatNad(report.income.interestOnLoans) },
      { label: 'Default interest', value: formatNad(report.income.defaultInterest) },
      { label: 'Bad debts recovered', value: formatNad(report.income.badDebtsRecovered) },
      { label: 'Other income', value: formatNad(report.income.otherIncome) },
      { label: 'Sub total (Other income — Part D3)', value: formatNad(report.income.total), strong: true },
    ]);

    // ── Part 1.1 ───────────────────────────────────────────────────────────
    layout.sectionHeading('Current liabilities · Part 1.1');
    layout.labelValues([
      { label: 'NAMFISA levy', value: formatNad(report.liabilities.namfisaLevy) },
      { label: 'Stamp duty', value: formatNad(report.liabilities.stampDuty) },
      ...report.liabilities.other.map((row) => ({
        label: row.label.replace(/ payable$/i, ''),
        value: formatNad(row.value),
      })),
      { label: 'Total current liabilities', value: formatNad(report.liabilities.total), strong: true },
    ]);

    // ── Part 14 ────────────────────────────────────────────────────────────
    layout.sectionHeading('Additional financial information · Part 14 (3.4.6)');
    layout.labelValues([
      { label: 'Total value of loan book at beginning of reporting period', value: formatNad(report.financial.openingBookValue) },
      { label: 'Loan disbursement breakdown', value: formatNad(report.financial.disbursedTotal), strong: true },
      ...report.financial.disbursementsByTerm
        .filter((bucket) => bucket.value > 0)
        .map((bucket) => ({
          label: `Length of period from ${bucket.label}`,
          value: formatNad(bucket.value),
          indent: true,
        })),
      { label: 'Other fees charged to borrowers during the quarter', value: formatNad(report.financial.feesCharged.total), strong: true },
      { label: 'NAMFISA levies', value: formatNad(report.financial.feesCharged.namfisaLevies), indent: true },
      { label: 'Stamp duties', value: formatNad(report.financial.feesCharged.stampDuties), indent: true },
      { label: 'Insurance', value: formatNad(report.financial.feesCharged.insurance), indent: true },
      { label: 'Other fees', value: formatNad(report.financial.feesCharged.otherFees), indent: true },
      { label: 'Interest charged on loans outstanding at end of quarter', value: formatNad(report.financial.interestOnOutstanding) },
      { label: 'Total value of repayment received in reporting period', value: formatNad(report.financial.repayments.total), strong: true },
      { label: 'Repayment by payroll deduction', value: formatNad(report.financial.repayments.payroll), indent: true },
      { label: 'Repayment by debit orders', value: formatNad(report.financial.repayments.debitOrder), indent: true },
      { label: 'Repayment by cash collection', value: formatNad(report.financial.repayments.cash), indent: true },
      { label: 'Other repayment method', value: formatNad(report.financial.repayments.other), indent: true },
      { label: 'Provision for bad debts, beginning of period', value: formatNad(report.financial.badDebts.openingProvision) },
      { label: 'Loans written off during the period', value: formatNad(report.financial.badDebts.writtenOffInPeriod), indent: true },
      { label: 'Provision for bad debts during the period', value: formatNad(report.financial.badDebts.provisionRaised), indent: true },
      { label: 'Provision for bad debts, end of period', value: formatNad(report.financial.badDebts.closingProvision), strong: true },
      { label: 'Value of loans rescheduled during the period', value: formatNad(report.financial.rescheduledValue) },
      { label: 'Total value of loan book at end of reporting period', value: formatNad(report.financial.closingBookValue), strong: true },
      ...report.financial.ageing.map((bucket) => ({
        label: bucket.label,
        value: formatNad(bucket.value),
        indent: true,
      })),
    ]);

    // ── Part 15 and Part 7.2 matrices ──────────────────────────────────────
    const matrixColumns = (matrix: BandedMatrix, money: boolean) => {
      const format = (value: number): string => (money ? formatNad(value) : String(value));
      const columns: ReportColumn<{ label: string; row: BandedRow }>[] = [
        { header: '', weight: 2.2, value: (entry) => entry.label },
        { header: 'Total', weight: 1.4, align: 'right', value: (entry) => format(entry.row.total) },
        ...matrix.bands.map((band) => ({
          header: band.label.replace('N$', ''),
          weight: 1.3,
          align: 'right' as const,
          value: (entry: { row: BandedRow }) => format(entry.row.bands[band.key] ?? 0),
        })),
      ];
      return columns;
    };
    const matrixRows = (matrix: BandedMatrix) => [
      { label: 'Male', row: matrix.male },
      { label: 'Female', row: matrix.female },
      { label: 'Other', row: matrix.other },
      { label: 'Not recorded', row: matrix.unknown },
      { label: 'Total', row: matrix.total },
    ];

    doc.addPage();
    layout.sectionHeading('Additional financial information · Part 15 (3.4.7) — values');
    doc.font('Helvetica').fontSize(8).fillColor(COLORS.muted)
      .text('Loan disbursement breakdown by gender (one row per loan advanced in the quarter).', layout.M, doc.y, { width: layout.W });
    doc.moveDown(0.4);
    layout.table(
      matrixColumns(report.valueMatrices.loansByGender, true),
      matrixRows(report.valueMatrices.loansByGender),
    );
    doc.font('Helvetica').fontSize(8).fillColor(COLORS.muted)
      .text('Borrower gross salaries by gender (one row per distinct borrower).', layout.M, doc.y, { width: layout.W });
    doc.moveDown(0.4);
    layout.table(
      matrixColumns(report.valueMatrices.salariesByGender, true),
      matrixRows(report.valueMatrices.salariesByGender),
    );

    layout.sectionHeading('Non-financial information · Part 7.2 — numbers');
    layout.table(
      matrixColumns(report.countMatrices.loansByGender, false),
      matrixRows(report.countMatrices.loansByGender),
    );
    layout.table(
      matrixColumns(report.countMatrices.salariesByGender, false),
      matrixRows(report.countMatrices.salariesByGender),
    );

    // ── Parts 7.1 and 7.3 ──────────────────────────────────────────────────
    layout.sectionHeading('Non-financial information · Part 7.1');
    layout.labelValues([
      { label: 'Number of complaints lodged', value: String(report.nonFinancial.complaints.lodged) },
      { label: 'Resolved in favour of the regulated entity', value: String(report.nonFinancial.complaints.forEntity), indent: true },
      { label: 'Resolved in favour of the complainant', value: String(report.nonFinancial.complaints.forComplainant), indent: true },
      { label: 'Unresolved complaints', value: String(report.nonFinancial.complaints.unresolved), indent: true },
      { label: 'Number of debtors outstanding', value: String(report.nonFinancial.debtorsOutstanding) },
      { label: 'Total number of loans disbursed during the period', value: String(report.nonFinancial.loansDisbursed) },
      { label: 'Active clients at the last day of the period', value: String(report.nonFinancial.activeClients) },
      { label: 'Number of loans outstanding', value: String(report.nonFinancial.loansOutstanding.total), strong: true },
      { label: 'Current loans', value: String(report.nonFinancial.loansOutstanding.current), indent: true },
      { label: 'Loans in arrears', value: String(report.nonFinancial.loansOutstanding.arrears), indent: true },
      ...report.nonFinancial.disbursementsByTerm
        .filter((bucket) => bucket.value > 0)
        .map((bucket) => ({
          label: `Loans with a repayment period of ${bucket.label}`,
          value: String(bucket.value),
          indent: true,
        })),
    ]);

    const labelled = (rows: readonly LabelledValue[]) =>
      rows.map((row) => ({ label: row.label, value: String(row.value), indent: true }));

    layout.sectionHeading('Non-financial information · Part 7.3');
    layout.labelValues([
      { label: 'Number of loans by purpose', value: String(report.nonFinancial.loansDisbursed), strong: true },
      ...labelled(report.nonFinancial.loansByPurpose),
      { label: 'Number of loans per collection method', value: String(report.nonFinancial.loansDisbursed), strong: true },
      ...labelled(report.nonFinancial.loansByCollectionMethod),
      { label: 'Number of loans written off as bad debt', value: String(report.nonFinancial.writtenOffCount) },
      { label: 'Number of loans rescheduled', value: String(report.nonFinancial.rescheduledCount) },
      { label: 'Secured loans', value: String(report.nonFinancial.security.secured) },
      { label: 'Unsecured loans', value: String(report.nonFinancial.security.unsecured) },
      { label: 'Number of outlets (branches)', value: String(report.nonFinancial.outlets) },
      ...labelled(report.nonFinancial.otherBusiness),
    ]);

    layout.notes(
      'Basis of preparation',
      report.warnings.map((warning) => warning.message),
    );

    layout.footer(lender);
    doc.end();
  });
