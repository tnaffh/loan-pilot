import PDFDocument from 'pdfkit';
import { COLORS, DASH, createAgreementLayout, rowsOf } from './agreement-layout';
import type { CollateralAgreementData } from './collateral-agreement-data';

/**
 * Render a collateral (pledge) agreement PDF. Shares the loan agreement's visual
 * language via {@link createAgreementLayout}; the body is the pledged asset, the
 * secured-loan summary, embedded photos, and the collateral terms.
 */
export const renderCollateralAgreementPdf = (data: CollateralAgreementData): Promise<Buffer> =>
  new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 48, bufferPages: true });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const layout = createAgreementLayout(doc);
    const { M, W, ensureSpace, sectionHeading, fieldGrid, summaryRow } = layout;
    const base = data.base;

    layout.letterhead({
      lender: base.lender,
      logoPng: base.logoPng,
      title: 'COLLATERAL AGREEMENT',
      preamble: data.terms.preamble,
    });

    layout.partiesLine(
      `This collateral agreement is entered into between ${base.lender.name} ("the Lender") and ` +
        `${base.borrower.fullName} ("the Borrower")` +
        (base.loan.disbursedAt ? ` on ${base.loan.disbursedAt}` : '') +
        ', as security for the loan described below.',
    );

    // ── Borrower (brief) ─────────────────────────────────────────────────
    sectionHeading("Borrower's information");
    fieldGrid([
      ['ID / Passport No', base.borrower.idNumber],
      ['Telephone', base.borrower.phone],
      ['Email', base.borrower.email],
      ['Residential address', base.borrower.residentialAddress ?? DASH],
    ]);

    // ── The secured loan ─────────────────────────────────────────────────
    sectionHeading('Loan secured by this agreement');
    summaryRow([
      { label: 'Loan amount', value: base.loan.principal },
      { label: 'Total repayable', value: base.loan.total },
      { label: 'Instalment', value: base.loan.instalment },
      { label: 'Term', value: `${base.loan.termMonths} mo` },
    ]);

    // ── Collateral details ───────────────────────────────────────────────
    sectionHeading('Collateral pledged');
    fieldGrid([
      ['Item / asset', data.collateral.item || DASH],
      ['Identification', data.collateral.identifier || DASH],
      ['Condition', data.collateral.condition || DASH],
      ['Estimated value', data.collateral.estimatedValue ?? DASH],
    ]);
    doc
      .font('Helvetica-Bold')
      .fontSize(7)
      .fillColor(COLORS.faint)
      .text('DESCRIPTION', M, doc.y, { width: W, characterSpacing: 0.4 });
    doc
      .font('Helvetica')
      .fontSize(9.5)
      .fillColor(COLORS.ink)
      .text(data.collateral.description || DASH, M, doc.y + 1, { width: W });
    doc.moveDown(0.4);

    // ── Photos ───────────────────────────────────────────────────────────
    if (data.photos.length > 0) {
      sectionHeading('Collateral photos');
      const perRow = 3;
      const gap = 10;
      const cellW = (W - gap * (perRow - 1)) / perRow;
      const cellH = 95;
      rowsOf(data.photos, perRow).forEach((rowPhotos) => {
        ensureSpace(cellH + 10);
        const y0 = doc.y;
        rowPhotos.forEach((photo, i) => {
          const x = M + i * (cellW + gap);
          doc.roundedRect(x, y0, cellW, cellH, 4).lineWidth(0.5).strokeColor(COLORS.rule).stroke();
          try {
            doc.image(photo, x + 3, y0 + 3, {
              fit: [cellW - 6, cellH - 6],
              align: 'center',
              valign: 'center',
            });
          } catch {
            // Skip a corrupt/unsupported image rather than fail the document.
          }
        });
        doc.y = y0 + cellH + 8;
      });
    }

    // ── Signatures → Collateral terms → footer ───────────────────────────
    layout.signatureBlock({
      signaturePng: base.signaturePng,
      lender: base.lender,
      borrowerName: base.borrower.fullName,
      disbursedAt: base.loan.disbursedAt,
      generatedAt: base.generatedAt,
      tcAcceptedAt: base.tcAcceptedAt,
      termsVersion: data.terms.version,
    });
    layout.renderTermsSections(data.terms, 'Collateral Terms & Conditions');
    layout.footer(base.lender);

    doc.end();
  });
