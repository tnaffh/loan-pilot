import { COLORS, createDocumentLayout, type DocumentLayout } from '../common/pdf/document-layout';

/**
 * Report-specific PDF layout: label/value rows that mirror a form's own line
 * ordering, a tabular grid, and a closing notes block.
 *
 * Everything that gives a report the lender's identity — letterhead, section
 * headings, summary boxes, footer — comes from {@link createDocumentLayout}, the
 * same source the loan agreements use, so the two look like one family.
 */

export interface ReportColumn<T> {
  readonly header: string;
  /** Relative width; columns are scaled to fill the page. */
  readonly weight: number;
  readonly align?: 'left' | 'right';
  readonly value: (row: T) => string;
}

/** The shared document layout plus the report-only sections. */
export interface ReportLayout extends DocumentLayout {
  /** A row of `label ....... value` lines, mirroring the form's own ordering. */
  labelValues(rows: readonly { label: string; value: string; strong?: boolean; indent?: boolean }[]): void;
  /** A bordered grid. Repeats the header band after a page break. */
  table<T>(columns: readonly ReportColumn<T>[], rows: readonly T[], emptyText?: string): void;
  /** A caveat block printed under a report, so the PDF carries its own disclosure. */
  notes(title: string, lines: readonly string[]): void;
}

export const createReportLayout = (doc: PDFKit.PDFDocument): ReportLayout => {
  const base = createDocumentLayout(doc);
  const { M, W, right } = base;
  // Recomputed per call rather than captured: a landscape page break changes it.
  const bottomLimit = (): number => doc.page.height - doc.page.margins.bottom - 24;

  const labelValues = (
    rows: readonly { label: string; value: string; strong?: boolean; indent?: boolean }[],
  ): void => {
    const valueW = 150;
    const labelW = W - valueW - 10;
    for (const row of rows) {
      if (doc.y + 18 > bottomLimit()) {
        doc.addPage();
      }
      const y = doc.y;
      const indent = row.indent ? 12 : 0;
      doc
        .font(row.strong ? 'Helvetica-Bold' : 'Helvetica')
        .fontSize(9)
        .fillColor(row.strong ? COLORS.ink : COLORS.body)
        .text(row.label, M + indent, y, { width: labelW - indent });
      const labelBottom = doc.y;
      doc
        .font('Helvetica-Bold')
        .fontSize(9)
        .fillColor(COLORS.ink)
        .text(row.value, M + labelW + 10, y, { width: valueW, align: 'right', lineBreak: false });
      doc.y = Math.max(labelBottom, y + 12) + 3;
      if (row.strong) {
        doc
          .moveTo(M, doc.y - 1)
          .lineTo(right, doc.y - 1)
          .lineWidth(0.5)
          .strokeColor(COLORS.rule)
          .stroke();
        doc.y += 2;
      }
    }
    doc.fillColor(COLORS.ink);
  };

  /**
   * Shorten a string to fit a column, measured in the current font.
   *
   * pdfkit's own `lineBreak: false` does not reliably keep text on one line — a
   * hyphenated name still breaks and lands on top of the row beneath it — so the
   * width is enforced here instead of trusting the renderer.
   */
  const fit = (text: string, width: number): string => {
    if (width <= 0) {
      return '';
    }
    if (doc.widthOfString(text) <= width) {
      return text;
    }
    const state = { out: text };
    while (state.out.length > 1 && doc.widthOfString(`${state.out}…`) > width) {
      state.out = state.out.slice(0, -1);
    }
    return `${state.out}…`;
  };

  const table = <T>(
    columns: readonly ReportColumn<T>[],
    rows: readonly T[],
    emptyText = 'Nothing to report for this period.',
  ): void => {
    const totalWeight = columns.reduce((sum, column) => sum + column.weight, 0);
    const widths = columns.map((column) => (column.weight / totalWeight) * W);
    const xs = columns.map((_column, index) =>
      widths.slice(0, index).reduce((sum, width) => sum + width, M),
    );
    const headerH = 21;
    const rowH = 17;
    const pad = 5;

    const cellWidth = (index: number): number => (widths[index] ?? 0) - pad * 2;

    const drawHeader = (): void => {
      const y = doc.y;
      doc.rect(M, y, W, headerH).fill(COLORS.accent);
      doc.font('Helvetica-Bold').fontSize(7).fillColor('#ffffff');
      columns.forEach((column, index) => {
        doc.text(fit(column.header.toUpperCase(), cellWidth(index)), (xs[index] ?? M) + pad, y + 7, {
          width: cellWidth(index),
          align: column.align ?? 'left',
          lineBreak: false,
        });
      });
      doc.y = y + headerH;
    };

    if (rows.length === 0) {
      drawHeader();
      const y = doc.y;
      doc.rect(M, y, W, rowH + 4).fillAndStroke('#ffffff', COLORS.rule);
      doc
        .font('Helvetica-Oblique')
        .fontSize(8)
        .fillColor(COLORS.faint)
        .text(emptyText, M + pad, y + 7, { width: W - pad * 2, lineBreak: false });
      doc.y = y + rowH + 4 + 8;
      doc.fillColor(COLORS.ink);
      return;
    }

    // Keep a table with its header: if barely anything fits, start it overleaf.
    if (doc.y + headerH + rowH * Math.min(rows.length, 3) > bottomLimit()) {
      doc.addPage();
    }
    drawHeader();
    const tableTop = { y: doc.y - headerH };

    const closeBorder = (): void => {
      doc
        .rect(M, tableTop.y, W, doc.y - tableTop.y)
        .lineWidth(0.6)
        .strokeColor(COLORS.rule)
        .stroke();
    };

    rows.forEach((row, rowIndex) => {
      if (doc.y + rowH > bottomLimit()) {
        closeBorder();
        doc.addPage();
        drawHeader();
        tableTop.y = doc.y - headerH;
      }
      const y = doc.y;
      // Zebra striping carries the eye across a wide row better than rules do.
      doc.rect(M, y, W, rowH).fill(rowIndex % 2 === 1 ? COLORS.cellBg : '#ffffff');
      doc.font('Helvetica').fontSize(8).fillColor(COLORS.ink);
      columns.forEach((column, index) => {
        doc.text(fit(column.value(row), cellWidth(index)), (xs[index] ?? M) + pad, y + 5, {
          width: cellWidth(index),
          align: column.align ?? 'left',
          lineBreak: false,
        });
      });
      doc.y = y + rowH;
    });

    closeBorder();
    doc.y += 10;
    doc.fillColor(COLORS.ink);
  };

  const notes = (title: string, lines: readonly string[]): void => {
    if (lines.length === 0) {
      return;
    }
    if (doc.y + 40 > bottomLimit()) {
      doc.addPage();
    }
    doc.moveDown(0.6);
    doc
      .font('Helvetica-Bold')
      .fontSize(8)
      .fillColor(COLORS.accent)
      .text(title.toUpperCase(), M, doc.y, { characterSpacing: 0.4 });
    doc.moveDown(0.25);
    doc.font('Helvetica').fontSize(7.5).fillColor(COLORS.body);
    for (const line of lines) {
      if (doc.y + 16 > bottomLimit()) {
        doc.addPage();
      }
      doc.text(`•  ${line}`, M, doc.y, { width: W });
      doc.moveDown(0.15);
    }
    doc.fillColor(COLORS.ink);
  };

  return { ...base, labelValues, table, notes };
};
