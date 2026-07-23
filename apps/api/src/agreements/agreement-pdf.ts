import PDFDocument from 'pdfkit';
import type { AgreementData } from './agreement-data';
import { COLORS, DASH, createAgreementLayout } from './agreement-layout';

/**
 * Render a NAMFISA-compliant loan agreement as a professional PDF.
 *
 * Uses pdfkit (pure Node, no headless browser) so it runs on a read-only
 * filesystem and returns an in-memory Buffer. Shared layout (letterhead, section
 * headings, field grids, summary box, signature block with the drawn lender
 * stamp, footer) comes from {@link createAgreementLayout} so the loan agreement
 * and the collateral agreement look identical; only the loan-specific body
 * (borrower info, loan terms, itemised cost breakdown) lives here.
 */
export const renderAgreementPdf = (data: AgreementData): Promise<Buffer> =>
  new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 48, bufferPages: true });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const layout = createAgreementLayout(doc);
    const { M, W, right, ensureSpace, sectionHeading, fieldGrid, summaryRow } = layout;

    layout.letterhead({
      lender: data.lender,
      logoPng: data.logoPng,
      title: 'LOAN AGREEMENT',
      preamble: data.terms.preamble,
    });

    layout.partiesLine(
      `This agreement is entered into between ${data.lender.name} ("the Lender") and ` +
        `${data.borrower.fullName} ("the Borrower")` +
        (data.loan.disbursedAt ? ` on ${data.loan.disbursedAt}.` : '.'),
    );

    // ── Borrower information ─────────────────────────────────────────────
    sectionHeading("Borrower's information");
    fieldGrid([
      ['ID / Passport No', data.borrower.idNumber],
      ['Telephone', data.borrower.phone],
      ['Email', data.borrower.email],
      ['Marital status', data.borrower.maritalStatus ?? DASH],
      ['Residential address', data.borrower.residentialAddress ?? DASH],
      ['Postal address', data.borrower.postalAddress ?? data.borrower.residentialAddress ?? DASH],
      ['Occupation', data.borrower.occupation],
      ['Employer', data.borrower.employer],
      ['Employer telephone', data.borrower.employerPhone ?? DASH],
      ['Payslip / Employee No', data.borrower.employeeNo ?? DASH],
      ['Employer address', data.borrower.employerAddress ?? DASH],
      null,
    ]);

    if (data.borrower.bank) {
      sectionHeading('Bank account');
      fieldGrid([
        ['Bank', data.borrower.bank.bankName],
        ['Branch', data.borrower.bank.branchName ?? DASH],
        ['Account holder', data.borrower.bank.accountHolderName],
        ['Account type', data.borrower.bank.accountType],
        ['Account number', data.borrower.bank.accountNumber],
        null,
      ]);
    }

    if (data.borrower.references.length > 0) {
      sectionHeading('References');
      fieldGrid(data.borrower.references.map((reference) => [reference.name, reference.phone] as const));
    }

    // ── Loan terms ───────────────────────────────────────────────────────
    sectionHeading('Loan terms');
    summaryRow([
      { label: 'Loan amount', value: data.loan.principal },
      { label: 'Finance charge', value: data.loan.financeCharge },
      { label: 'Total repayable', value: data.loan.total },
      { label: 'Instalment', value: data.loan.instalment },
    ]);
    fieldGrid([
      ['Finance charge rate', `${data.loan.interestRatePct} fixed (NAMFISA max 30%)`],
      ['Repayment frequency', 'Monthly'],
      ['Number of instalments', String(data.loan.instalmentsTotal)],
      ['Loan period', `${data.loan.termMonths} month${data.loan.termMonths === 1 ? '' : 's'}`],
      ['First instalment due', data.loan.firstDueDate ?? DASH],
      ['Last instalment due', data.loan.lastDueDate ?? DASH],
    ]);

    // ── Itemised cost breakdown ──────────────────────────────────────────
    sectionHeading('Cost breakdown');
    data.loan.breakdown.forEach((line) => {
      ensureSpace(24);
      const isTotal = line.kind === 'total';
      const y = doc.y;
      if (isTotal) {
        doc
          .moveTo(M, y - 1)
          .lineTo(right, y - 1)
          .lineWidth(0.75)
          .strokeColor(COLORS.rule)
          .stroke();
      }
      const font = isTotal ? 'Helvetica-Bold' : 'Helvetica';
      const size = isTotal ? 10 : 9;
      const labelColor = line.kind === 'extra' ? COLORS.muted : COLORS.ink;
      const amountColor = isTotal ? COLORS.accent : line.kind === 'extra' ? COLORS.muted : COLORS.ink;
      const top = y + (isTotal ? 6 : 3);
      doc
        .font(font)
        .fontSize(size)
        .fillColor(labelColor)
        .text(line.label, M, top, { width: W * 0.68, lineBreak: false });
      doc
        .font(font)
        .fontSize(size)
        .fillColor(amountColor)
        .text(line.amount, M + W * 0.5, top, { width: W * 0.5, align: 'right', lineBreak: false });
      doc.y = y + (isTotal ? 25 : 19);
    });

    ensureSpace(60);
    doc
      .font('Helvetica')
      .fontSize(8.5)
      .fillColor(COLORS.muted)
      .text(
        `Penalty interest is charged at ${data.loan.penaltyRatePct} per month on any overdue ` +
          'amount (may not exceed 5% per month, nor be charged for more than three (3) months).',
        M,
        doc.y,
        { width: W },
      );
    doc.moveDown(0.4);
    doc
      .font('Helvetica-Bold')
      .fontSize(9)
      .fillColor(COLORS.ink)
      .text(
        `The Borrower shall repay the capital amount including finance charges on or before ` +
          `${data.loan.periodEndDate ?? DASH}.`,
        M,
        doc.y,
        { width: W },
      );

    // ── Signatures → Terms & Conditions → footer ─────────────────────────
    layout.signatureBlock({
      signaturePng: data.signaturePng,
      lender: data.lender,
      borrowerName: data.borrower.fullName,
      disbursedAt: data.loan.disbursedAt,
      generatedAt: data.generatedAt,
      tcAcceptedAt: data.tcAcceptedAt,
      termsVersion: data.terms.version,
    });
    layout.renderTermsSections(data.terms);
    layout.footer(data.lender);

    doc.end();
  });
