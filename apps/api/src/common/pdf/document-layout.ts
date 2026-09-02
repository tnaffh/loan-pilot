/**
 * Shared PDF building blocks for every document this API renders — loan
 * agreements, collateral agreements and the regulatory / management reports.
 *
 * Anything that gives a document the lender's visual identity lives here
 * (letterhead, section headings, field grids, summary boxes, footer) so a
 * NAMFISA return and a loan agreement are recognisably from the same lender.
 * Document-specific composition sits alongside its own renderer: signature
 * blocks and terms in `agreements/agreement-layout.ts`, tables and label/value
 * rows in `reports/report-layout.ts`.
 */

/** Placeholder shown for an absent value in a field grid. */
export const DASH = '\u2014';

export const COLORS = {
  ink: '#1c1c1c',
  // Body copy in tables and figure rows: darker than `muted`, which is a label
  // colour and prints too faint at small sizes.
  body: '#33414f',
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

/**
 * The lender identity printed on a document's letterhead, stamp and footer.
 * Structurally satisfied by both the agreement builder's lender block and the
 * reports' resolved lender identity.
 */
export interface LetterheadDetails {
  name: string;
  legalName: string | null;
  namfisaLicenceNo: string | null;
  registrationNo: string | null;
  physicalAddress: string | null;
  postalAddress: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  town: string | null;
}

/** The primitives every document layout is built from. */
export interface DocumentLayout {
  M: number;
  W: number;
  right: number;
  bottomLimit: number;
  ensureSpace(needed: number): void;
  rule(y: number, color?: string, weight?: number): void;
  sectionHeading(title: string): void;
  fieldGrid(pairs: (readonly [string, string] | null)[]): void;
  summaryRow(cells: { label: string; value: string }[]): void;
  letterhead(opts: {
    lender: LetterheadDetails;
    logoPng: Buffer | null;
    title: string;
    preamble: string;
  }): void;
  footer(lender: LetterheadDetails): void;
}

/** Bind the shared layout helpers to a pdfkit document. */
export const createDocumentLayout = (doc: PDFKit.PDFDocument): DocumentLayout => {
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
    lender: LetterheadDetails;
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

  const footer = (lender: LetterheadDetails): void => {
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
    footer,
  };
};
