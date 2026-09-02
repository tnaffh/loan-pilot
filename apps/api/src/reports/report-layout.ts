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
        .fillColor(row.strong ? COLORS.ink : COLORS.muted)
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

  const table = <T>(
    columns: readonly ReportColumn<T>[],
    rows: readonly T[],
    emptyText = 'Nothing to report for this period.',
  ): void => {
    const totalWeight = columns.reduce((sum, column) => sum + column.weight, 0);
    const widths = columns.map((column) => (column.weight / totalWeight) * W);
    const headerH = 20;
    const rowH = 16;

    const drawHeader = (): void => {
      const y = doc.y;
      doc.rect(M, y, W, headerH).fill(COLORS.cellBg);
      doc.font('Helvetica-Bold').fontSize(7).fillColor(COLORS.muted);
      columns.forEach((column, index) => {
        const x = M + widths.slice(0, index).reduce((sum, width) => sum + width, 0);
        doc.text(column.header.toUpperCase(), x + 4, y + 7, {
          width: (widths[index] ?? 0) - 8,
          align: column.align ?? 'left',
          lineBreak: false,
        });
      });
      doc.y = y + headerH;
    };

    if (rows.length === 0) {
      drawHeader();
      doc
        .font('Helvetica-Oblique')
        .fontSize(8.5)
        .fillColor(COLORS.faint)
        .text(emptyText, M + 4, doc.y + 6, { width: W - 8 });
      doc.y += 22;
      doc.fillColor(COLORS.ink);
      return;
    }

    drawHeader();
    rows.forEach((row, rowIndex) => {
      if (doc.y + rowH > bottomLimit()) {
        doc.addPage();
        drawHeader();
      }
      const y = doc.y;
      if (rowIndex % 2 === 1) {
        doc.rect(M, y, W, rowH).fill('#fbfcfd');
      }
      doc.font('Helvetica').fontSize(7.5).fillColor(COLORS.ink);
      columns.forEach((column, index) => {
        const x = M + widths.slice(0, index).reduce((sum, width) => sum + width, 0);
        doc.text(column.value(row), x + 4, y + 5, {
          width: (widths[index] ?? 0) - 8,
          align: column.align ?? 'left',
          lineBreak: false,
          ellipsis: true,
        });
      });
      doc
        .moveTo(M, y + rowH)
        .lineTo(right, y + rowH)
        .lineWidth(0.4)
        .strokeColor(COLORS.rule)
        .stroke();
      doc.y = y + rowH;
    });
    doc.y += 8;
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
      .fontSize(7.5)
      .fillColor(COLORS.muted)
      .text(title.toUpperCase(), M, doc.y, { characterSpacing: 0.4 });
    doc.moveDown(0.25);
    doc.font('Helvetica').fontSize(7.5).fillColor(COLORS.faint);
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
