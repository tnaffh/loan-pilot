import PDFDocument from 'pdfkit';
import { formatNad, fromCents, type MonthlyReport, type MonthlyReportLoanRow } from '@loan-pilot/domain';
import { COLORS, type LetterheadDetails } from '../common/pdf/document-layout';
import { createReportLayout, type ReportColumn } from './report-layout';

const GENDER_LABELS: Record<string, string> = {
  male: 'Male',
  female: 'Female',
  other: 'Other',
  unknown: '—',
};

const STATUS_LABELS: Record<string, string> = {
  active: 'Active',
  arrears: 'Arrears',
  partly_paid: 'Partly paid',
  settled: 'Settled',
  written_off: 'Written off',
  cancelled: 'Cancelled',
  closed: 'Closed',
};

const shortDate = (iso: string | null): string =>
  iso ? new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) : '—';

/** Compact money for table cells, where `formatNad`'s prefix wastes width. */
const amount = (cents: number): string =>
  new Intl.NumberFormat('en-NA', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(
    Math.round(fromCents(cents)),
  );

/**
 * The lender's monthly management report: the month's position and movements,
 * then every loan advanced in the month. Landscape, because the loan table needs
 * the width; the letterhead is shared with the loan agreements.
 */
export const renderMonthlyReportPdf = (
  report: MonthlyReport,
  lender: LetterheadDetails,
  logoPng: Buffer | null,
): Promise<Buffer> =>
  new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 40, bufferPages: true });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const layout = createReportLayout(doc);
    const { summary } = report;

    layout.letterhead({
      lender,
      logoPng,
      title: 'MONTHLY MANAGEMENT REPORT',
      preamble: `${report.period.label} · ${report.period.startDate} to ${report.period.endDate}`,
    });

    layout.summaryRow([
      { label: 'Total capital', value: formatNad(summary.totalCapital) },
      { label: 'Capital on loan', value: formatNad(summary.closingBookValue) },
      { label: 'Available funds', value: formatNad(summary.availableFunds) },
      { label: 'Loans advanced', value: String(summary.loansDisbursed) },
      { label: 'Interest booked', value: formatNad(summary.interestBooked) },
    ]);

    // Two columns of figures, so the position and the movements sit side by side.
    const columnWidth = (layout.W - 24) / 2;
    const top = doc.y;

    doc.font('Helvetica-Bold').fontSize(9).fillColor(COLORS.accent).text('THE MONTH', layout.M, top);
    doc.moveDown(0.3);
    const leftStart = doc.y;

    const renderColumn = (
      x: number,
      rows: readonly { label: string; value: string; strong?: boolean }[],
    ): number => {
      const state = { y: doc.y };
      for (const row of rows) {
        doc
          .font(row.strong ? 'Helvetica-Bold' : 'Helvetica')
          .fontSize(8.5)
          .fillColor(row.strong ? COLORS.ink : COLORS.muted)
          .text(row.label, x, state.y, { width: columnWidth - 110, lineBreak: false });
        doc
          .font('Helvetica-Bold')
          .fontSize(8.5)
          .fillColor(COLORS.ink)
          .text(row.value, x + columnWidth - 105, state.y, {
            width: 105,
            align: 'right',
            lineBreak: false,
          });
        state.y += 14;
      }
      return state.y;
    };

    const leftBottom = renderColumn(layout.M, [
      { label: 'Loan book at start of month', value: formatNad(summary.openingBookValue) },
      { label: 'Advanced to borrowers', value: formatNad(summary.disbursedValue) },
      { label: 'Interest booked on new loans', value: formatNad(summary.interestBooked) },
      { label: 'Total repayable on new loans', value: formatNad(summary.expectedRepayable) },
      { label: 'Collected from borrowers', value: formatNad(summary.collected) },
      { label: 'Loan book at end of month', value: formatNad(summary.closingBookValue), strong: true },
      { label: 'In arrears at month end', value: `${formatNad(summary.arrearsValue)}  (${summary.arrearsLoans})` },
    ]);

    doc.y = leftStart;
    doc.font('Helvetica-Bold').fontSize(9).fillColor(COLORS.accent)
      .text('CASH & CHARGES', layout.M + columnWidth + 24, top);
    doc.y = leftStart;
    const rightBottom = renderColumn(layout.M + columnWidth + 24, [
      { label: 'Other income received', value: formatNad(summary.otherIncome) },
      { label: 'Capital injected', value: formatNad(summary.capitalIn) },
      { label: 'Operating expenses', value: formatNad(summary.expenses) },
      { label: 'Owner drawings', value: formatNad(summary.drawings) },
      { label: 'NAMFISA levies charged', value: formatNad(summary.namfisaLevies) },
      { label: 'Stamp duties charged', value: formatNad(summary.stampDuties) },
      { label: 'Net cash movement', value: formatNad(summary.netCashMovement), strong: true },
    ]);

    doc.y = Math.max(leftBottom, rightBottom) + 10;

    // ── Collections by method ────────────────────────────────────────────
    layout.sectionHeading('Collections by method');
    layout.table<{ key: string; label: string; value: number }>(
      [
        { header: 'Method', weight: 3, value: (row) => row.label },
        { header: 'Amount (N$)', weight: 2, align: 'right', value: (row) => amount(row.value) },
      ],
      summary.collectionsByMethod.filter((row) => row.value > 0),
      'No repayments were received this month.',
    );

    if (report.expenseBreakdown.length > 0) {
      layout.sectionHeading('Expenses by category');
      layout.table<{ key: string; label: string; value: number }>(
        [
          { header: 'Category', weight: 3, value: (row) => row.label },
          { header: 'Amount (N$)', weight: 2, align: 'right', value: (row) => amount(row.value) },
        ],
        report.expenseBreakdown,
      );
    }

    // ── The loan register ────────────────────────────────────────────────
    doc.addPage();
    layout.sectionHeading(`Loans advanced in ${report.period.label}`);

    const columns: ReportColumn<MonthlyReportLoanRow>[] = [
      { header: 'Client', weight: 1.1, value: (row) => row.clientNo ?? '—' },
      { header: 'Borrower', weight: 2.4, value: (row) => row.borrowerName },
      { header: 'ID number', weight: 1.6, value: (row) => row.idNumber },
      { header: 'Gender', weight: 0.9, value: (row) => GENDER_LABELS[row.gender] ?? '—' },
      { header: 'Income', weight: 1.2, align: 'right', value: (row) => amount(row.monthlyIncome) },
      { header: 'Advanced', weight: 1.2, align: 'right', value: (row) => amount(row.principal) },
      { header: 'Interest', weight: 1.1, align: 'right', value: (row) => amount(row.financeCharge) },
      { header: 'Rate', weight: 0.8, align: 'right', value: (row) => `${Math.round(row.interestRate * 100)}%` },
      { header: 'Levy', weight: 0.9, align: 'right', value: (row) => amount(row.namfisaLevy) },
      { header: 'Stamp', weight: 0.8, align: 'right', value: (row) => amount(row.stampDuty) },
      { header: 'Repayable', weight: 1.2, align: 'right', value: (row) => amount(row.total) },
      { header: 'Instalment', weight: 1.2, align: 'right', value: (row) => amount(row.instalment) },
      { header: 'Term', weight: 0.7, align: 'right', value: (row) => `${row.termMonths}m` },
      { header: 'Balance', weight: 1.2, align: 'right', value: (row) => amount(row.balance) },
      { header: 'Status', weight: 1.1, value: (row) => STATUS_LABELS[row.status] ?? row.status },
      { header: 'Date', weight: 0.9, value: (row) => shortDate(row.disbursedAt) },
    ];

    layout.table(columns, report.loans, 'No loans were advanced in this month.');

    doc
      .font('Helvetica-Bold')
      .fontSize(8.5)
      .fillColor(COLORS.ink)
      .text(
        `${report.loans.length} loan(s) · advanced ${formatNad(summary.disbursedValue)} · ` +
          `repayable ${formatNad(summary.expectedRepayable)}`,
        layout.M,
        doc.y,
        { width: layout.W, align: 'right' },
      );

    layout.notes(
      'Notes',
      report.warnings.map((warning) => warning.message),
    );

    layout.footer(lender);
    doc.end();
  });
