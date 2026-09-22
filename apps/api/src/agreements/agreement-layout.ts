import type { Terms } from '@loan-pilot/domain';
import {
  COLORS,
  createDocumentLayout,
  longDate,
  type DocumentLayout,
  type LetterheadDetails,
} from '../common/pdf/document-layout';
import {
  SIGNATURE_IMAGE_H,
  STAMP_CLEARANCE,
  drawInitialsStrip,
  drawLenderSignature,
  placeImage,
  type InitialsStripOptions,
} from '../common/pdf/signing';

/**
 * Agreement-specific PDF layout: the parties line, the numbered terms sections,
 * the two-party signature block (borrower + principal officer with the company
 * stamp) and the per-page initials strip. Everything visual that an agreement
 * shares with the reports — letterhead, headings, field grids, summary boxes,
 * footer — comes from {@link createDocumentLayout}.
 */

/**
 * A4 with a deeper bottom margin than the reports: the initials strip sits
 * between the body and the footer on every page.
 */
export const AGREEMENT_PAGE_OPTIONS: PDFKit.PDFDocumentOptions = {
  size: 'A4',
  margins: { top: 48, left: 48, right: 48, bottom: 92 },
  bufferPages: true,
};

export interface SignatureBlockOptions {
  /** The borrower's captured signature, or null (blank line to sign by hand). */
  signaturePng: Buffer | null;
  lender: LetterheadDetails;
  /** The principal officer named in settings and their captured signature. */
  officerName: string | null;
  officerSignaturePng: Buffer | null;
  /** A custom uploaded company stamp; the dated stamp is drawn when null. */
  stampPng: Buffer | null;
  borrowerName: string;
  /** Pre-formatted disbursement date (for the stamp and date lines), or null. */
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
  'them, and that I have read and agree to them. I have initialled every other page of this ' +
  'agreement.';

/** The shared document layout plus the agreement-only sections. */
export interface AgreementLayout extends DocumentLayout {
  partiesLine(text: string): void;
  renderTermsSections(terms: Terms, title?: string): void;
  /** Draws the signature block and remembers its page, which the initials strip skips. */
  signatureBlock(opts: SignatureBlockOptions): void;
  /**
   * Finish the document: the footer on every page plus the initials boxes on
   * every page except the one carrying the signatures.
   */
  finish(lender: LetterheadDetails, initials: InitialsStripOptions): void;
}

export const createAgreementLayout = (doc: PDFKit.PDFDocument): AgreementLayout => {
  const base = createDocumentLayout(doc);
  const { M, W, right, ensureSpace, rule } = base;
  // Which buffered page carries the signature block (−1 until drawn).
  const state = { signaturePage: -1 };

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
    ensureSpace(220);
    const range = doc.bufferedPageRange();
    state.signaturePage = range.start + range.count - 1;

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

    doc.y += STAMP_CLEARANCE;
    const sigGap = 40;
    const sigW = (W - sigGap) / 2;
    const imgTop = doc.y;
    const date = opts.disbursedAt ?? longDate(opts.generatedAt);

    // Borrower column.
    if (opts.signaturePng) {
      placeImage(doc, opts.signaturePng, M, imgTop, [sigW, SIGNATURE_IMAGE_H]);
    }
    const lineY = imgTop + SIGNATURE_IMAGE_H + 4;
    doc.moveTo(M, lineY).lineTo(M + sigW, lineY).lineWidth(0.75).strokeColor(COLORS.ink).stroke();
    doc
      .font('Helvetica-Bold')
      .fontSize(8.5)
      .fillColor(COLORS.ink)
      .text('Signature of Borrower', M, lineY + 5, { width: sigW, lineBreak: false });
    doc
      .font('Helvetica')
      .fontSize(8)
      .fillColor(COLORS.muted)
      .text(opts.borrowerName, M, lineY + 17, { width: sigW, lineBreak: false });
    doc.text(`Date: ${date}`, M, lineY + 28, { width: sigW, lineBreak: false });

    // Lender column: principal officer + company stamp.
    const bottom = drawLenderSignature(doc, M + sigW + sigGap, imgTop, sigW, {
      lender: opts.lender,
      officerName: opts.officerName,
      officerSignaturePng: opts.officerSignaturePng,
      stampPng: opts.stampPng,
      date,
    });
    doc.y = bottom;
    doc.fillColor(COLORS.ink);
  };

  const finish = (lender: LetterheadDetails, initials: InitialsStripOptions): void => {
    base.footer(lender, (pageIndex) => {
      if (pageIndex !== state.signaturePage) {
        drawInitialsStrip(doc, M, right, initials);
      }
    });
  };

  return { ...base, partiesLine, renderTermsSections, signatureBlock, finish };
};
