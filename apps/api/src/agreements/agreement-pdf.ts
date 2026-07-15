import PDFDocument from 'pdfkit';
import type { AgreementData } from './agreement-data';

/** Fallback dash for a field the lender has not captured. */
const DASH = '—';

/**
 * Render a NAMFISA-compliant loan agreement as a PDF, returning the bytes.
 *
 * Uses pdfkit (pure Node, no headless browser) so it runs on a read-only
 * filesystem and emits an in-memory Buffer that {@link StorageService.save}
 * persists. The captured signature image is embedded; the full Terms &
 * Conditions and Annexure A auto-paginate.
 */
export const renderAgreementPdf = (data: AgreementData): Promise<Buffer> =>
  new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const left = doc.page.margins.left;
    const contentWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;

    // ── Lender letterhead ────────────────────────────────────────────────
    doc.font('Helvetica-Bold').fontSize(18).text(data.lender.name, { align: 'center' });
    doc.font('Helvetica').fontSize(9);
    const headerLines = [
      data.lender.physicalAddress,
      data.lender.town,
      [data.lender.contactPhone, data.lender.contactEmail].filter(Boolean).join('  ·  ') || null,
      data.lender.namfisaLicenceNo ? `NAMFISA Licence ${data.lender.namfisaLicenceNo}` : null,
      data.lender.registrationNo ? `Reg. No. ${data.lender.registrationNo}` : null,
    ].filter((line): line is string => Boolean(line));
    for (const line of headerLines) {
      doc.text(line, { align: 'center' });
    }
    doc.moveDown(0.5);
    doc.font('Helvetica-Bold').fontSize(14).text('LOAN AGREEMENT', { align: 'center' });
    doc.moveDown(0.5);
    doc
      .font('Helvetica')
      .fontSize(9)
      .text(data.terms.preamble, { align: 'center', oblique: true });
    doc.moveDown(0.5);

    // ── Parties ──────────────────────────────────────────────────────────
    doc
      .fontSize(10)
      .text(
        `Entered into between ${data.lender.name} ("the Lender") and ${data.borrower.fullName} ` +
          `("the Borrower").`,
      );
    doc.moveDown(0.5);

    // ── Borrower personal information ────────────────────────────────────
    const sectionHeading = (text: string): void => {
      if (doc.y > doc.page.height - 120) doc.addPage();
      doc.moveDown(0.4);
      doc.font('Helvetica-Bold').fontSize(11).text(text);
      doc.font('Helvetica').fontSize(10);
      doc.moveDown(0.2);
    };

    /** A two-column row of "Label: value" pairs. */
    const pairRow = (a: [string, string], b?: [string, string]): void => {
      const colWidth = (contentWidth - 20) / 2;
      const y = doc.y;
      doc.font('Helvetica-Bold').fontSize(9).text(`${a[0]}: `, left, y, {
        width: colWidth,
        continued: true,
      });
      doc.font('Helvetica').text(a[1] || DASH);
      if (b) {
        doc.font('Helvetica-Bold').fontSize(9).text(`${b[0]}: `, left + colWidth + 20, y, {
          width: colWidth,
          continued: true,
        });
        doc.font('Helvetica').text(b[1] || DASH);
      }
      doc.moveDown(0.2);
    };

    sectionHeading("Borrower's personal information");
    pairRow(['ID / Passport No', data.borrower.idNumber], ['Tel', data.borrower.phone]);
    pairRow(
      ['Residential address', data.borrower.residentialAddress ?? DASH],
      ['Email', data.borrower.email],
    );
    pairRow(
      ['Postal address', data.borrower.postalAddress ?? data.borrower.residentialAddress ?? DASH],
      ['Marital status', data.borrower.maritalStatus ?? DASH],
    );
    pairRow(['Occupation', data.borrower.occupation], ['Employer', data.borrower.employer]);
    pairRow(
      ['Employer tel', data.borrower.employerPhone ?? DASH],
      ['Employer address', data.borrower.employerAddress ?? DASH],
    );
    pairRow(['Payslip / Employee No', data.borrower.employeeNo ?? DASH]);
    if (data.borrower.bank) {
      pairRow(
        ['Bank', data.borrower.bank.bankName],
        ['Branch', data.borrower.bank.branchName ?? DASH],
      );
      pairRow(
        ['Account No', data.borrower.bank.accountNumber],
        ['Account type', data.borrower.bank.accountType],
      );
    }
    if (data.borrower.references.length > 0) {
      data.borrower.references.forEach((reference, index) => {
        pairRow([`Reference ${index + 1}`, reference.name], ['Tel', reference.phone]);
      });
    }

    // ── Loan financial terms box ─────────────────────────────────────────
    sectionHeading('Loan terms');
    const terms: [string, string][] = [
      ['Loan amount (paid to Borrower)', data.loan.principal],
      [`Finance charges (${data.loan.interestRatePct}, fixed — NAMFISA ≤30%)`, data.loan.financeCharge],
      ['Total repayable', data.loan.total],
      ['Instalment amount', data.loan.instalment],
      ['Number of instalments', String(data.loan.instalmentsTotal)],
      ['Frequency', 'Monthly'],
      ['First instalment due', data.loan.firstDueDate ?? DASH],
      ['Last instalment due', data.loan.lastDueDate ?? DASH],
    ];
    const rowH = 20;
    const boxTop = doc.y;
    terms.forEach(([labelText, value], index) => {
      const y = boxTop + index * rowH;
      doc.rect(left, y, contentWidth, rowH).stroke();
      doc.font('Helvetica-Bold').fontSize(9).text(labelText, left + 6, y + 6, { width: contentWidth * 0.62 });
      doc.font('Helvetica').fontSize(9).text(value, left + contentWidth * 0.64, y + 6, {
        width: contentWidth * 0.34,
        align: 'right',
      });
    });
    doc.y = boxTop + terms.length * rowH;
    doc.moveDown(0.5);

    doc
      .font('Helvetica')
      .fontSize(9)
      .text(
        `Penalty interest is charged at ${data.loan.penaltyRatePct} per month on the outstanding ` +
          'amount (may not exceed 5% per month and may not be charged for more than three (3) months).',
      );
    doc.moveDown(0.3);
    doc
      .font('Helvetica-Bold')
      .fontSize(9)
      .text(
        `Period of loan: the Borrower shall repay the capital amount including interest on or before ` +
          `${data.loan.periodEndDate ?? DASH}.`,
      );
    doc.moveDown(0.5);

    // ── Acknowledgement + signatures ─────────────────────────────────────
    if (doc.y > doc.page.height - 200) doc.addPage();
    doc
      .font('Helvetica')
      .fontSize(9)
      .text(
        'I acknowledge that this agreement has been completed in full prior to my signature, that ' +
          'the terms and conditions below were explained to me and I was given the opportunity to ' +
          'read them, and that I have read and agree to them.',
      );
    if (data.tcAcceptedAt) {
      doc
        .fontSize(8)
        .fillColor('#555')
        .text(
          `Terms & Conditions version ${data.terms.version} accepted on ` +
            `${data.tcAcceptedAt.toLocaleDateString('en-GB', {
              day: 'numeric',
              month: 'long',
              year: 'numeric',
            })}.`,
        )
        .fillColor('black');
    }
    doc.moveDown(1);

    const sigY = doc.y;
    const sigWidth = 200;
    if (data.signaturePng) {
      try {
        doc.image(data.signaturePng, left, sigY, { fit: [sigWidth, 60] });
      } catch {
        // A corrupt signature image should not fail the whole document.
      }
    }
    const lineY = sigY + 64;
    doc.moveTo(left, lineY).lineTo(left + sigWidth, lineY).stroke();
    doc.font('Helvetica').fontSize(9).text('Signature of Borrower', left, lineY + 4);
    doc
      .moveTo(left + contentWidth - sigWidth, lineY)
      .lineTo(left + contentWidth, lineY)
      .stroke();
    doc.text('Signature of Lender', left + contentWidth - sigWidth, lineY + 4);
    doc.moveDown(2);

    // ── Terms & Conditions + Annexure A ──────────────────────────────────
    doc.addPage();
    doc.font('Helvetica-Bold').fontSize(13).text('Terms & Conditions');
    doc.moveDown(0.5);
    for (const section of data.terms.sections) {
      if (doc.y > doc.page.height - 100) doc.addPage();
      doc.font('Helvetica-Bold').fontSize(10).text(section.title);
      doc.moveDown(0.2);
      doc.font('Helvetica').fontSize(9).text(section.body.join('\n\n'), { align: 'left' });
      doc.moveDown(0.5);
    }

    // ── Footer note ──────────────────────────────────────────────────────
    doc
      .font('Helvetica')
      .fontSize(7)
      .fillColor('#888')
      .text(
        `Generated ${data.generatedAt.toLocaleDateString('en-GB', {
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        })} · ${data.lender.name}`,
        left,
        doc.page.height - 40,
        { align: 'center', width: contentWidth },
      )
      .fillColor('black');

    doc.end();
  });
