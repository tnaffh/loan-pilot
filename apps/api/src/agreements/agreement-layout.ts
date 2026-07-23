import type { Terms } from '@loan-pilot/domain';
import type { AgreementData } from './agreement-data';

/** Placeholder shown for an absent value in a field grid. */
export const DASH = '—';

export const COLORS = {
  ink: '#1c1c1c',
  muted: '#5b6b7a',
  faint: '#8a97a4',
  rule: '#d8dee5',
  accent: '#25397a',
  cellBg: '#f4f6f9',
};

/** Format a Date as "14 July 2026". */
export const longDate = (date: Date): string =>
  date.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

/** Split an array into rows of `n`. */
export const rowsOf = <T>(arr: readonly T[], n: number): T[][] =>
  Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n));

/** The lender identity block used by the letterhead / signature stamp / footer. */
export type LenderHeader = AgreementData['lender'];

export interface SignatureBlockOptions {
  signaturePng: Buffer | null;
  lender: LenderHeader;
  borrowerName: string;
  /** Pre-formatted disbursement date (for the stamp), or null. */
  disbursedAt: string | null;
  generatedAt: Date;
  /** T&C acceptance stamp line, when the borrower accepted online. */
  tcAcceptedAt: Date | null;
  termsVersion: string;
  /** The "I acknowledge…" paragraph above the signature lines. */
  acknowledgement?: string;
}

const DEFAULT_ACK =
  'I acknowledge that this agreement has been completed in full prior to my signature, that ' +
  'its terms and conditions were explained to me, that I was given the opportunity to read ' +
  'them, and that I have read and agree to them.';

/** The reusable building blocks that give every agreement PDF its shared look. */
export interface AgreementLayout {
  M: number;
  W: number;
  right: number;
  bottomLimit: number;
  ensureSpace(needed: number): void;
  rule(y: number, color?: string, weight?: number): void;
  sectionHeading(title: string): void;
  fieldGrid(pairs: (readonly [string, string] | null)[]): void;
  summaryRow(cells: { label: string; value: string }[]): void;
  letterhead(opts: { lender: LenderHeader; logoPng: Buffer | null; title: string; preamble: string }): void;
  partiesLine(text: string): void;
  renderTermsSections(terms: Terms, title?: string): void;
  signatureBlock(opts: SignatureBlockOptions): void;
  footer(lender: LenderHeader): void;
}

/**
 * Bind the shared agreement-PDF layout helpers to a pdfkit document. Both the
 * NAMFISA loan agreement and the collateral agreement build on these so they
 * share one visual language (letterhead, section headings, field grids, summary
 * boxes, signature block with the drawn lender stamp, and footer).
 */
export const createAgreementLayout = (doc: PDFKit.PDFDocument): AgreementLayout => {
  const M = doc.page.margins.left;
  const W = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const right = M + W;
  const bottomLimit = doc.page.height - doc.page.margins.bottom;

  const ensureSpace = (needed: number): void => {
    if (doc.y + needed > bottomLimit) doc.addPage();
  };

  const rule = (y: number, color = COLORS.rule, weight = 0.75): void => {
    doc.moveTo(M, y).lineTo(right, y).lineWidth(weight).strokeColor(color).stroke();
  };

  const sectionHeading = (title: string): void => {
    ensureSpace(44);
    doc.moveDown(0.7);
    doc
      .fillColor(COLORS.accent)
      .font('Helvetica-Bold')
      .fontSize(10.5)
      .text(title.toUpperCase(), M, doc.y, { characterSpacing: 0.6 });
    doc.moveDown(0.25);
    rule(doc.y);
    doc.moveDown(0.5);
    doc.fillColor(COLORS.ink);
  };

  /** Two-column "label above value" rows; each row grows to its taller column. */
  const fieldGrid = (pairs: (readonly [string, string] | null)[]): void => {
    const colGap = 22;
    const colW = (W - colGap) / 2;
    rowsOf(pairs, 2).forEach((rowPairs) => {
      ensureSpace(38);
      const y0 = doc.y;
      const bottoms = rowPairs.map((pair, idx) => {
        if (!pair) return y0;
        const x = M + idx * (colW + colGap);
        doc
          .fillColor(COLORS.faint)
          .font('Helvetica-Bold')
          .fontSize(7)
          .text(pair[0].toUpperCase(), x, y0, { width: colW, characterSpacing: 0.4 });
        doc
          .fillColor(COLORS.ink)
          .font('Helvetica')
          .fontSize(9.5)
          .text(pair[1] && pair[1].length ? pair[1] : DASH, x, doc.y + 1, { width: colW });
        const bottom = doc.y;
        doc.y = y0;
        return bottom;
      });
      doc.y = Math.max(...bottoms) + 9;
    });
  };

  /** A row of headline figures in a bordered, divided box. */
  const summaryRow = (cells: { label: string; value: string }[]): void => {
    const h = 50;
    ensureSpace(h + 14);
    const y0 = doc.y;
    const cw = W / cells.length;
    doc.roundedRect(M, y0, W, h, 5).fillAndStroke(COLORS.cellBg, COLORS.rule);
    cells.forEach((cell, i) => {
      const x = M + i * cw;
      if (i > 0) {
        doc
          .moveTo(x, y0 + 9)
          .lineTo(x, y0 + h - 9)
          .lineWidth(0.5)
          .strokeColor(COLORS.rule)
          .stroke();
      }
      doc
        .fillColor(COLORS.muted)
        .font('Helvetica-Bold')
        .fontSize(6.5)
        .text(cell.label.toUpperCase(), x + 9, y0 + 11, { width: cw - 18, characterSpacing: 0.3 });
      doc
        .fillColor(COLORS.accent)
        .font('Helvetica-Bold')
        .fontSize(12)
        .text(cell.value, x + 9, y0 + 24, { width: cw - 18, lineBreak: false });
    });
    doc.y = y0 + h + 13;
    doc.fillColor(COLORS.ink);
  };

  const letterhead = ({
    lender,
    logoPng,
    title,
    preamble,
  }: {
    lender: LenderHeader;
    logoPng: Buffer | null;
    title: string;
    preamble: string;
  }): void => {
    doc.y = M;
    if (logoPng) {
      try {
        const logoH = 52;
        const boxW = 180;
        doc.image(logoPng, M + (W - boxW) / 2, doc.y, {
          fit: [boxW, logoH],
          align: 'center',
          valign: 'center',
        });
        doc.y = M + logoH + 10;
      } catch {
        // A corrupt logo must not fail the whole document.
      }
    }
    doc
      .fillColor(COLORS.accent)
      .font('Helvetica-Bold')
      .fontSize(20)
      .text(lender.name, M, doc.y, { width: W, align: 'center' });
    doc.moveDown(0.25);
    const headerLines = [
      [lender.physicalAddress, lender.town].filter(Boolean).join(', '),
      [lender.contactPhone, lender.contactEmail].filter(Boolean).join('   ·   '),
      [
        lender.namfisaLicenceNo ? `NAMFISA Licence ${lender.namfisaLicenceNo}` : null,
        lender.registrationNo ? `Reg. No. ${lender.registrationNo}` : null,
      ]
        .filter(Boolean)
        .join('   ·   '),
    ].filter((line) => line.length > 0);
    doc.font('Helvetica').fontSize(9).fillColor(COLORS.muted);
    headerLines.forEach((line) => doc.text(line, M, doc.y, { width: W, align: 'center' }));
    doc.moveDown(0.6);
    rule(doc.y, COLORS.accent, 1.2);
    doc.moveDown(0.6);

    doc
      .fillColor(COLORS.ink)
      .font('Helvetica-Bold')
      .fontSize(15)
      .text(title, M, doc.y, { width: W, align: 'center', characterSpacing: 1 });
    doc.moveDown(0.2);
    doc
      .font('Helvetica-Oblique')
      .fontSize(8.5)
      .fillColor(COLORS.muted)
      .text(preamble, M, doc.y, { width: W, align: 'center' });
    doc.moveDown(0.5);
  };

  const partiesLine = (text: string): void => {
    doc.fillColor(COLORS.ink).font('Helvetica').fontSize(9.5).text(text, M, doc.y, { width: W });
  };

  const renderClause = (text: string): void => {
    ensureSpace(26);
    const numbered = /^(\d+(?:\.\d+)*\.)\s+([\s\S]*)$/.exec(text);
    if (numbered) {
      const depth = numbered[1]?.match(/\./g)?.length ?? 1;
      const indent = (depth - 1) * 14;
      doc
        .font('Helvetica')
        .fontSize(8.5)
        .fillColor(COLORS.ink)
        .text(numbered[1] ?? '', M + indent, doc.y, { continued: true })
        .text(`  ${numbered[2] ?? ''}`, { width: W - indent });
      doc.moveDown(0.35);
      return;
    }
    const step = /^(Step\s+[IVX]+)\s*[:.]?\s*([\s\S]*)$/.exec(text);
    if (step) {
      doc
        .font('Helvetica-Bold')
        .fontSize(8.5)
        .fillColor(COLORS.ink)
        .text(`${step[1]}. `, M, doc.y, { continued: true })
        .font('Helvetica')
        .text(step[2] ?? '', { width: W });
      doc.moveDown(0.35);
      return;
    }
    if (text === text.toUpperCase() && /[A-Z]/.test(text) && text.length < 90) {
      doc
        .font('Helvetica-Bold')
        .fontSize(8.5)
        .fillColor(COLORS.muted)
        .text(text, M, doc.y, { width: W, characterSpacing: 0.3 });
      doc.moveDown(0.35);
      return;
    }
    doc.font('Helvetica').fontSize(8.5).fillColor(COLORS.ink).text(text, M, doc.y, { width: W });
    doc.moveDown(0.35);
  };

  const renderTermsSections = (terms: Terms, title = 'Terms & Conditions'): void => {
    doc.addPage();
    doc.fillColor(COLORS.accent).font('Helvetica-Bold').fontSize(14).text(title, M, doc.y);
    doc.moveDown(0.3);
    rule(doc.y, COLORS.accent, 1.2);
    doc.moveDown(0.6);
    terms.sections.forEach((section) => {
      ensureSpace(50);
      doc.moveDown(0.3);
      doc
        .font('Helvetica-Bold')
        .fontSize(9.5)
        .fillColor(COLORS.accent)
        .text(section.title, M, doc.y, { width: W });
      doc.moveDown(0.3);
      doc.fillColor(COLORS.ink);
      section.body.forEach(renderClause);
    });
  };

  const signatureBlock = (opts: SignatureBlockOptions): void => {
    ensureSpace(150);
    doc.moveDown(0.9);
    doc
      .font('Helvetica')
      .fontSize(9)
      .fillColor(COLORS.ink)
      .text(opts.acknowledgement ?? DEFAULT_ACK, M, doc.y, { width: W });
    if (opts.tcAcceptedAt) {
      doc.moveDown(0.3);
      doc
        .font('Helvetica-Oblique')
        .fontSize(7.5)
        .fillColor(COLORS.faint)
        .text(
          `Terms & Conditions version ${opts.termsVersion} accepted on ${longDate(opts.tcAcceptedAt)}.`,
          M,
          doc.y,
          { width: W },
        );
    }

    doc.moveDown(1.4);
    const sigGap = 40;
    const sigW = (W - sigGap) / 2;
    const imgTop = doc.y;
    if (opts.signaturePng) {
      try {
        doc.image(opts.signaturePng, M, imgTop, { fit: [sigW, 42] });
      } catch {
        // A corrupt signature image must not fail the whole document.
      }
    }
    const lineY = imgTop + 46;
    doc.moveTo(M, lineY).lineTo(M + sigW, lineY).lineWidth(0.75).strokeColor(COLORS.ink).stroke();
    doc
      .moveTo(M + sigW + sigGap, lineY)
      .lineTo(right, lineY)
      .stroke();

    // The lender's digital stamp — drawn (not uploaded) as a rounded, double-bordered
    // seal over the lender signature line, slightly rotated for a rubber-stamp feel.
    const stampCx = M + sigW + sigGap + sigW / 2;
    const stampCy = imgTop + 16;
    const stampW = 155;
    const stampH = 52;
    const sx = stampCx - stampW / 2;
    const sy = stampCy - stampH / 2;
    doc.save();
    doc.rotate(-6, { origin: [stampCx, stampCy] });
    doc.strokeColor(COLORS.accent).strokeOpacity(0.7).fillOpacity(0.8).fillColor(COLORS.accent);
    doc.lineWidth(1.4).roundedRect(sx, sy, stampW, stampH, 7).stroke();
    doc.lineWidth(0.6).roundedRect(sx + 3.5, sy + 3.5, stampW - 7, stampH - 7, 5).stroke();
    doc
      .font('Helvetica-Bold')
      .fontSize(7)
      .text('APPROVED', sx, sy + 7, { width: stampW, align: 'center', characterSpacing: 2.5 });
    doc
      .font('Helvetica-Bold')
      .fontSize(7.5)
      .text(opts.lender.name, sx + 6, sy + 18, { width: stampW - 12, align: 'center', lineBreak: false });
    doc
      .font('Helvetica')
      .fontSize(6)
      .text(
        opts.lender.namfisaLicenceNo ? `NAMFISA ${opts.lender.namfisaLicenceNo}` : (opts.lender.town ?? ''),
        sx,
        sy + 30,
        { width: stampW, align: 'center' },
      );
    doc
      .font('Helvetica')
      .fontSize(6)
      .text(opts.disbursedAt ?? longDate(opts.generatedAt), sx, sy + 39, {
        width: stampW,
        align: 'center',
      });
    doc.restore();
    doc.strokeOpacity(1).fillOpacity(1);

    doc.font('Helvetica-Bold').fontSize(8.5).fillColor(COLORS.ink);
    doc.text('Signature of Borrower', M, lineY + 5, { width: sigW });
    doc.text('Signature of Lender', M + sigW + sigGap, lineY + 5, { width: sigW });
    doc.font('Helvetica').fontSize(8).fillColor(COLORS.muted);
    doc.text(opts.borrowerName, M, lineY + 17, { width: sigW });
    doc.text(opts.lender.name, M + sigW + sigGap, lineY + 17, { width: sigW });
  };

  const footer = (lender: LenderHeader): void => {
    // Drawing in the bottom margin would push pdfkit past the page and spawn a
    // blank page per footer, so zero the bottom margin while writing it.
    const range = doc.bufferedPageRange();
    const footerContact =
      [lender.contactPhone, lender.contactEmail].filter(Boolean).join('   ·   ') ||
      [lender.name, lender.town].filter(Boolean).join(', ');
    Array.from({ length: range.count }, (_, i) => range.start + i).forEach((pageIndex, i) => {
      doc.switchToPage(pageIndex);
      const savedBottom = doc.page.margins.bottom;
      doc.page.margins.bottom = 0;
      const fy = doc.page.height - 34;
      doc
        .moveTo(M, fy - 6)
        .lineTo(right, fy - 6)
        .lineWidth(0.5)
        .strokeColor(COLORS.rule)
        .stroke();
      doc.font('Helvetica').fontSize(7).fillColor(COLORS.faint);
      doc.text(footerContact, M, fy, { width: W * 0.65, align: 'left', lineBreak: false });
      doc.text(`Page ${i + 1} of ${range.count}`, M + W * 0.35, fy, {
        width: W * 0.65,
        align: 'right',
        lineBreak: false,
      });
      doc.page.margins.bottom = savedBottom;
    });
  };

  return {
    M,
    W,
    right,
    bottomLimit,
    ensureSpace,
    rule,
    sectionHeading,
    fieldGrid,
    summaryRow,
    letterhead,
    partiesLine,
    renderTermsSections,
    signatureBlock,
    footer,
  };
};
