import { COLORS, type LetterheadDetails } from './document-layout';

/**
 * The lender's side of a signing block, the company stamp and the per-page
 * initials boxes — shared by the loan agreement, the collateral agreement and
 * the statement letter so a document leaves the system already signed and
 * stamped for the lender.
 */

/** Height reserved for a signature image above its line. */
export const SIGNATURE_IMAGE_H = 44;
/** Clear space a caller should leave above a lender signature so the drawn stamp overlaps nothing. */
export const STAMP_CLEARANCE = 30;
/** Box a custom (uploaded) stamp image is fitted into. */
const CUSTOM_STAMP_W = 104;
const CUSTOM_STAMP_H = 68;

export interface LenderSignatureOptions {
  lender: LetterheadDetails;
  /** The principal officer named in settings, or null (falls back to the lender name). */
  officerName: string | null;
  officerSignaturePng: Buffer | null;
  /** A custom uploaded stamp; when null the dated company stamp is drawn. */
  stampPng: Buffer | null;
  /** Pre-formatted date printed under the signature and inside the drawn stamp. */
  date: string;
  /** Caption above the name; defaults to "Signed for the Lender". */
  caption?: string;
}

/** Place an image inside a box, ignoring a corrupt file rather than failing the document. */
export const placeImage = (
  doc: PDFKit.PDFDocument,
  png: Buffer,
  x: number,
  y: number,
  fit: [number, number],
  align: 'left' | 'center' | 'right' = 'left',
): void => {
  try {
    // pdfkit's image `align` only knows 'center' | 'right'; left is the default.
    doc.image(png, x, y, {
      fit,
      align: align === 'left' ? undefined : align,
      valign: 'center',
    });
  } catch {
    // A corrupt image must not fail the whole document.
  }
};

/** The largest font size (≤ max, ≥ min) at which `text` fits in `width` for the current font. */
const fitFontSize = (
  doc: PDFKit.PDFDocument,
  text: string,
  width: number,
  max: number,
  min: number,
  characterSpacing = 0,
): number => {
  const state = { size: max };
  while (
    state.size > min &&
    doc.fontSize(state.size).widthOfString(text, { characterSpacing }) > width
  ) {
    state.size -= 0.5;
  }
  return state.size;
};

/** "22 September 2026" → "22 SEP 2026", the way a dater stamp abbreviates. */
const stampDate = (date: string): string =>
  date
    .toUpperCase()
    .split(' ')
    .map((word) => (/^[A-Z]{4,}$/.test(word) ? word.slice(0, 3) : word))
    .join(' ');

/** The lender's licence / registration line, or the town when neither is set. */
const credentialsLine = (lender: LetterheadDetails): string =>
  [
    lender.namfisaLicenceNo ? `NAMFISA Licence ${lender.namfisaLicenceNo}` : null,
    lender.registrationNo ? `Reg. No. ${lender.registrationNo}` : null,
  ]
    .filter(Boolean)
    .join('  ·  ') ||
  (lender.town ?? '');

/**
 * The company stamp, drawn (not uploaded) as a double-bordered, slightly
 * rotated rubber stamp in the accent ink: the lender's name across the top, the
 * date in a dater box, then the licence / registration and contact details
 * (phone, email, website). Centred on (cx, cy). Used whenever no custom stamp
 * image has been uploaded, so every generated document carries a dated stamp.
 */
export const drawCompanyStamp = (
  doc: PDFKit.PDFDocument,
  cx: number,
  cy: number,
  opts: Pick<LenderSignatureOptions, 'lender' | 'date'>,
): void => {
  const w = 184;
  const h = 62;
  const sx = cx - w / 2;
  const sy = cy - h / 2;
  const inner = 12;
  const innerW = w - inner * 2;
  const lines = [
    credentialsLine(opts.lender),
    [opts.lender.contactPhone, opts.lender.contactEmail].filter(Boolean).join('  ·  '),
    opts.lender.website ?? '',
  ].filter((line) => line.length > 0);

  doc.save();
  doc.rotate(-4, { origin: [cx, cy] });
  doc.strokeColor(COLORS.accent).fillColor(COLORS.accent).strokeOpacity(0.85).fillOpacity(0.85);
  // Double border.
  doc.lineWidth(1.6).roundedRect(sx, sy, w, h, 8).stroke();
  doc.lineWidth(0.5).roundedRect(sx + 3, sy + 3, w - 6, h - 6, 6).stroke();

  // Lender name across the top, shrunk to fit on one line (spacing included).
  const name = opts.lender.name.toUpperCase();
  const nameSpacing = 0.8;
  doc.font('Helvetica-Bold');
  const nameSize = fitFontSize(doc, name, innerW - 4, 8, 5, nameSpacing);
  doc.fontSize(nameSize).text(name, sx + inner, sy + 7, {
    width: innerW,
    align: 'center',
    characterSpacing: nameSpacing,
    lineBreak: false,
  });
  doc.lineWidth(0.5).moveTo(sx + inner, sy + 18).lineTo(sx + w - inner, sy + 18).stroke();

  // The date in a dater box.
  const dateText = stampDate(opts.date);
  const dateSpacing = 1;
  doc.font('Helvetica-Bold').fontSize(9.5);
  const dateW = doc.widthOfString(dateText, { characterSpacing: dateSpacing }) + 14;
  doc.lineWidth(0.6).rect(cx - dateW / 2, sy + 21.5, dateW, 14).stroke();
  doc.text(dateText, sx, sy + 24.5, {
    width: w,
    align: 'center',
    characterSpacing: dateSpacing,
    lineBreak: false,
  });

  // Licence / registration and contact details.
  doc.font('Helvetica');
  lines.slice(0, 3).forEach((line, i) => {
    const size = fitFontSize(doc, line, innerW, 5.5, 4.5);
    doc.fontSize(size).text(line, sx + inner, sy + 39.5 + i * 7, {
      width: innerW,
      align: 'center',
      lineBreak: false,
    });
  });
  doc.restore();
  doc.strokeOpacity(1).fillOpacity(1);
};

/**
 * Draw the lender's signature column at (x, top) within `width`: the officer's
 * signature image over the line with the company stamp (custom image, or the
 * drawn dated stamp over the signature), then the caption, the officer's name
 * and title, and the date. Returns the y just below the block.
 */
export const drawLenderSignature = (
  doc: PDFKit.PDFDocument,
  x: number,
  top: number,
  width: number,
  opts: LenderSignatureOptions,
): number => {
  const lineY = top + SIGNATURE_IMAGE_H + 4;
  if (opts.officerSignaturePng) {
    // Leave room beside the signature for a custom stamp; the drawn stamp
    // overlays the signature like a real one, so it needs none.
    const sigW = opts.stampPng ? width - CUSTOM_STAMP_W - 6 : width;
    placeImage(doc, opts.officerSignaturePng, x, top, [sigW, SIGNATURE_IMAGE_H]);
  }
  if (opts.stampPng) {
    placeImage(
      doc,
      opts.stampPng,
      x + width - CUSTOM_STAMP_W,
      top - 12,
      [CUSTOM_STAMP_W, CUSTOM_STAMP_H],
      'right',
    );
  } else {
    // Centred over the signature and resting on the line, like a real stamp.
    // Reaches ~26pt above `top`, so callers leave that much clear above.
    drawCompanyStamp(doc, x + width / 2, top + 12, opts);
  }
  doc.moveTo(x, lineY).lineTo(x + width, lineY).lineWidth(0.75).strokeColor(COLORS.ink).stroke();
  doc
    .font('Helvetica-Bold')
    .fontSize(8.5)
    .fillColor(COLORS.ink)
    .text(opts.caption ?? 'Signed for the Lender', x, lineY + 5, { width, lineBreak: false });
  doc
    .font('Helvetica')
    .fontSize(8)
    .fillColor(COLORS.muted)
    .text(
      opts.officerName ? `${opts.officerName}, Principal Officer` : opts.lender.name,
      x,
      lineY + 17,
      { width, lineBreak: false },
    );
  doc.text(`Date: ${opts.date}`, x, lineY + 28, { width, lineBreak: false });
  return lineY + 40;
};

export interface InitialsStripOptions {
  borrowerPng: Buffer | null;
  lenderPng: Buffer | null;
}

/**
 * Two initials boxes, bottom-right of the page, pre-filled with the captured
 * borrower initials and the officer's initials when available (blank to be
 * initialled by hand otherwise). Drawn from the footer pass, i.e. with the
 * bottom margin zeroed, on every page except the one carrying the signatures.
 */
export const drawInitialsStrip = (
  doc: PDFKit.PDFDocument,
  M: number,
  right: number,
  opts: InitialsStripOptions,
): void => {
  const boxW = 64;
  const boxH = 28;
  const gap = 14;
  // Sits just under the body area and clear of the footer rule (page height − 40).
  const top = doc.page.height - 86;
  const lenderX = right - boxW;
  const borrowerX = lenderX - gap - boxW;
  doc
    .font('Helvetica-Oblique')
    .fontSize(6.5)
    .fillColor(COLORS.faint)
    .text('To be initialled on every page by the Borrower and for the Lender.', M, top + 10, {
      width: borrowerX - M - 12,
      lineBreak: false,
    });
  (
    [
      [borrowerX, opts.borrowerPng, 'Borrower initials'],
      [lenderX, opts.lenderPng, 'Lender initials'],
    ] as const
  ).forEach(([x, png, label]) => {
    doc.roundedRect(x, top, boxW, boxH, 3).lineWidth(0.6).strokeColor(COLORS.rule).stroke();
    if (png) {
      placeImage(doc, png, x + 3, top + 3, [boxW - 6, boxH - 6], 'center');
    }
    doc
      .font('Helvetica-Bold')
      .fontSize(5.5)
      .fillColor(COLORS.faint)
      .text(label.toUpperCase(), x, top + boxH + 3, {
        width: boxW,
        align: 'center',
        characterSpacing: 0.3,
        lineBreak: false,
      });
  });
  doc.fillColor(COLORS.ink);
};
