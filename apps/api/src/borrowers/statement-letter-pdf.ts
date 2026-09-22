import PDFDocument from 'pdfkit';
import { formatNad } from '@loan-pilot/domain';
import { COLORS, DASH, longDate, type LetterheadDetails } from '../common/pdf/document-layout';
import { STAMP_CLEARANCE, drawLenderSignature } from '../common/pdf/signing';
import { createReportLayout, type ReportColumn } from '../reports/report-layout';
import type { BorrowerStatement, StatementLoan } from './borrowers.service';

/** Everything the statement letter renders: the account position plus the lender's signing identity. */
export interface StatementLetterData {
  statement: BorrowerStatement;
  lender: LetterheadDetails;
  logoPng: Buffer | null;
  officerName: string | null;
  officerSignaturePng: Buffer | null;
  /** A custom uploaded stamp, or null for the drawn dated stamp. */
  stampPng: Buffer | null;
}

const shortDate = (date: Date | null): string =>
  date ? date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : DASH;

const titleCase = (value: string): string =>
  value.charAt(0).toUpperCase() + value.slice(1).replace(/_/g, ' ');

const LOAN_COLUMNS: readonly ReportColumn<StatementLoan>[] = [
  { header: 'Loan', weight: 1.0, value: (loan) => titleCase(loan.type) },
  { header: 'Disbursed', weight: 1.15, value: (loan) => shortDate(loan.disbursedAt) },
  { header: 'Principal', weight: 1.1, align: 'right', value: (loan) => formatNad(loan.principal) },
  {
    header: 'Paid',
    weight: 0.8,
    align: 'right',
    value: (loan) => `${loan.instalmentsPaid}/${loan.instalmentsTotal}`,
  },
  { header: 'Next due', weight: 1.15, value: (loan) => shortDate(loan.nextDueAt) },
  { header: 'Balance', weight: 1.1, align: 'right', value: (loan) => formatNad(loan.balance) },
  {
    header: 'Arrears',
    weight: 1.0,
    align: 'right',
    value: (loan) => (loan.defaultInterest > 0 ? formatNad(loan.defaultInterest) : DASH),
  },
  { header: 'Payoff', weight: 1.15, align: 'right', value: (loan) => formatNad(loan.payoff) },
  { header: 'Status', weight: 1.0, value: (loan) => titleCase(loan.status) },
];

/**
 * Render a borrower's statement of account as a signed letter: the lender's
 * letterhead, the client's details, a table of the accounts still open (with
 * live balance, arrears and payoff), the outstanding total, and the principal
 * officer's signature with the company stamp — so the downloaded PDF needs no
 * further signing. Settled history is summarised in one line rather than
 * listed, as a statement is about what is owed today.
 */
export const renderStatementLetterPdf = (data: StatementLetterData): Promise<Buffer> =>
  new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 48, bufferPages: true });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const { statement, lender } = data;
    const issued = longDate(statement.generatedAt);
    const layout = createReportLayout(doc);
    const { M, W, ensureSpace, sectionHeading, fieldGrid, summaryRow } = layout;

    layout.letterhead({
      lender,
      logoPng: data.logoPng,
      title: 'STATEMENT OF ACCOUNT',
      preamble: `Issued on ${issued} · Reference ${statement.reference}`,
    });

    // ── Client ───────────────────────────────────────────────────────────
    sectionHeading('Client');
    fieldGrid([
      ['Name', statement.borrower.name],
      ['ID / Passport No', statement.borrower.idNumber],
      ['Telephone', statement.borrower.phone || DASH],
      ['Email', statement.borrower.email || DASH],
      ['Address', statement.borrower.address || DASH],
      null,
    ]);

    doc.moveDown(0.4);
    doc
      .font('Helvetica')
      .fontSize(9.5)
      .fillColor(COLORS.ink)
      .text(
        `To whom it may concern: this letter confirms the position of the above-named client's ` +
          `loan account(s) with ${lender.name} as at ${issued}. Balances include all charges due; ` +
          `"Payoff" is the amount that settles the account in full today, including any default ` +
          `interest accrued on overdue instalments.`,
        M,
        doc.y,
        { width: W },
      );

    // ── Open accounts ────────────────────────────────────────────────────
    sectionHeading('Accounts currently open');
    layout.table(
      LOAN_COLUMNS,
      statement.loans,
      'No open accounts — the client has no outstanding debt with us.',
    );

    summaryRow([
      { label: 'Total outstanding', value: formatNad(statement.totals.outstanding) },
      { label: 'Open accounts', value: String(statement.totals.openLoans) },
      { label: 'Settled accounts', value: String(statement.totals.settledLoans) },
      { label: 'Lifetime borrowed', value: formatNad(statement.totals.lifetimeBorrowed) },
    ]);

    ensureSpace(60);
    doc
      .font('Helvetica-Bold')
      .fontSize(10)
      .fillColor(COLORS.ink)
      .text(
        statement.hasOutstanding
          ? `Total amount outstanding as at ${issued}: ${formatNad(statement.totals.outstanding)}.`
          : `The client has no outstanding debt with ${lender.name} as at ${issued}.`,
        M,
        doc.y,
        { width: W },
      );
    doc.moveDown(0.4);
    doc
      .font('Helvetica')
      .fontSize(8.5)
      .fillColor(COLORS.muted)
      .text(
        `${statement.totals.settledLoans} previous account${statement.totals.settledLoans === 1 ? '' : 's'} ` +
          `settled in full and not listed above. Figures are valid on the date of issue only; ` +
          `default interest continues to accrue on overdue amounts.`,
        M,
        doc.y,
        { width: W },
      );

    // ── Signature ────────────────────────────────────────────────────────
    ensureSpace(170);
    doc.y += STAMP_CLEARANCE + 8;
    const sigW = (W - 40) / 2;
    const bottom = drawLenderSignature(doc, M + sigW + 40, doc.y, sigW, {
      lender,
      officerName: data.officerName,
      officerSignaturePng: data.officerSignaturePng,
      stampPng: data.stampPng,
      date: issued,
      caption: 'Issued for the Lender',
    });
    doc.y = bottom;

    doc.moveDown(1.2);
    doc
      .font('Helvetica-Oblique')
      .fontSize(7.5)
      .fillColor(COLORS.faint)
      .text(
        `System-generated statement issued by ${lender.name} on ${issued}. Queries: ` +
          [lender.contactPhone, lender.contactEmail].filter(Boolean).join(' · '),
        M,
        doc.y,
        { width: W },
      );

    layout.footer(lender);
    doc.end();
  });
