import type { Terms } from '@loan-pilot/domain';
import {
  COLORS,
  createDocumentLayout,
  longDate,
  type DocumentLayout,
  type LetterheadDetails,
} from '../common/pdf/document-layout';

/**
 * Agreement-specific PDF layout: the parties line, the numbered terms sections
 * and the signature block with the lender's drawn stamp. Everything visual that
 * an agreement shares with the reports — letterhead, headings, field grids,
 * summary boxes, footer — comes from {@link createDocumentLayout}.
 */

export interface SignatureBlockOptions {
  signaturePng: Buffer | null;
  lender: LetterheadDetails;
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

/** The shared document layout plus the agreement-only sections. */
export interface AgreementLayout extends DocumentLayout {
  partiesLine(text: string): void;
  renderTermsSections(terms: Terms, title?: string): void;
  signatureBlock(opts: SignatureBlockOptions): void;
}

export const createAgreementLayout = (doc: PDFKit.PDFDocument): AgreementLayout => {
  const base = createDocumentLayout(doc);
  const { M, W, right, ensureSpace, rule } = base;

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


  return { ...base, partiesLine, renderTermsSections, signatureBlock };
};
