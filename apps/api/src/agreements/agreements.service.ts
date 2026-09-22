import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { Document } from '@prisma/client';
import { DocumentKind } from '@loan-pilot/domain';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../documents/storage.service';
import type { DocumentView } from '../documents/documents.service';
import { SettingsService } from '../settings/settings.service';
import { MailService } from '../mail/mail.service';
import { documentFileName } from '../common/file-name';
import {
  AgreementLoan,
  toAgreementData,
  type AgreementData,
  type AgreementImages,
} from './agreement-data';
import { renderAgreementPdf } from './agreement-pdf';
import { toCollateralAgreementData, type CollateralAgreementData } from './collateral-agreement-data';
import { renderCollateralAgreementPdf } from './collateral-agreement-pdf';

const AGREEMENT_INCLUDE = {
  borrower: {
    include: {
      addresses: true,
      bankAccounts: true,
      references: true,
    },
  },
  tenant: { select: { name: true, town: true, logoUrl: true } },
  schedule: { orderBy: { number: 'asc' as const } },
} as const;

/** Max collateral photos embedded in the collateral agreement PDF. */
const MAX_EMBEDDED_PHOTOS = 6;

@Injectable()
export class AgreementsService {
  private readonly logger = new Logger(AgreementsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly settings: SettingsService,
    private readonly mail: MailService,
  ) {}

  // ── NAMFISA loan agreement ─────────────────────────────────────────────

  /** Generate a fresh loan-agreement PDF, store it, and link it to the loan. */
  async generateForLoan(tenantId: string, loanId: string): Promise<DocumentView> {
    const { document } = await this.generate(tenantId, loanId);
    return this.toView(document);
  }

  /** The latest generated/uploaded loan agreement for a loan, or null. */
  async latestForLoan(tenantId: string, loanId: string): Promise<DocumentView | null> {
    const document = await this.latestDocument(tenantId, loanId, DocumentKind.LoanAgreement);
    return document ? this.toView(document) : null;
  }

  /**
   * Email the borrower a copy of the loan agreement (NAMFISA s.9.2.4.1). Reuses
   * the latest stored PDF when present, otherwise generates and stores one.
   */
  async emailToBorrower(tenantId: string, loanId: string): Promise<{ sent: boolean }> {
    const { loan, data } = await this.build(tenantId, loanId);
    if (!loan.borrower.email) {
      throw new BadRequestException('The borrower has no email address on file');
    }
    const latest = await this.latestDocument(tenantId, loanId, DocumentKind.LoanAgreement);
    const fileName =
      latest?.fileName ??
      documentFileName('Loan Agreement', data.borrower.fullName, data.generatedAt);
    const pdf = latest ? await this.storage.read(latest.url) : await renderAgreementPdf(data);
    if (!latest) {
      await this.store(loan.id, loan.borrowerId, pdf, DocumentKind.LoanAgreement, fileName);
    }
    await this.mail.sendAgreement(
      loan.borrower.email,
      data.borrower.fullName,
      data.lender.name,
      pdf,
      fileName,
    );
    return { sent: true };
  }

  /** Attach a wet-signed loan-agreement scan (loans without a captured signature). */
  uploadSigned(tenantId: string, loanId: string, file: Express.Multer.File): Promise<DocumentView> {
    return this.storeUpload(tenantId, loanId, file, DocumentKind.LoanAgreement);
  }

  /**
   * Re-render whichever agreements have already been generated for a loan, so
   * the stored PDFs track the loan after an officer's edit (amount, term, rate,
   * fees or dates), and email the borrower the updated copy so they hold the
   * same version we do. Loans with no agreement yet are left alone. Never
   * throws: a render/storage/mail failure is logged and staff can regenerate
   * and resend from the loan page.
   */
  async refreshForLoan(tenantId: string, loanId: string): Promise<void> {
    try {
      const [hasAgreement, hasCollateral] = await Promise.all([
        this.latestDocument(tenantId, loanId, DocumentKind.LoanAgreement),
        this.latestDocument(tenantId, loanId, DocumentKind.CollateralAgreement),
      ]);
      if (hasAgreement) {
        const { loan, data, pdf, fileName } = await this.generate(tenantId, loanId);
        if (loan.borrower.email) {
          await this.mail.sendAgreement(
            loan.borrower.email,
            data.borrower.fullName,
            data.lender.name,
            pdf,
            fileName,
            { updated: true },
          );
        }
      }
      if (hasCollateral) {
        const { loan, data, pdf, fileName } = await this.generateCollateral(tenantId, loanId);
        if (loan.borrower.email) {
          await this.mail.sendCollateralAgreement(
            loan.borrower.email,
            data.base.borrower.fullName,
            data.base.lender.name,
            pdf,
            fileName,
            { updated: true },
          );
        }
      }
    } catch (error) {
      this.logger.error(
        `Failed to refresh agreements for loan ${loanId}`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  // ── Collateral (pledge) agreement ──────────────────────────────────────

  async generateCollateralForLoan(tenantId: string, loanId: string): Promise<DocumentView> {
    const { document } = await this.generateCollateral(tenantId, loanId);
    return this.toView(document);
  }

  async latestCollateralForLoan(tenantId: string, loanId: string): Promise<DocumentView | null> {
    const document = await this.latestDocument(tenantId, loanId, DocumentKind.CollateralAgreement);
    return document ? this.toView(document) : null;
  }

  async emailCollateralToBorrower(tenantId: string, loanId: string): Promise<{ sent: boolean }> {
    const { loan, data } = await this.buildCollateral(tenantId, loanId);
    if (!loan.borrower.email) {
      throw new BadRequestException('The borrower has no email address on file');
    }
    const latest = await this.latestDocument(tenantId, loanId, DocumentKind.CollateralAgreement);
    const fileName =
      latest?.fileName ??
      documentFileName('Collateral Agreement', data.base.borrower.fullName, data.base.generatedAt);
    const pdf = latest ? await this.storage.read(latest.url) : await renderCollateralAgreementPdf(data);
    if (!latest) {
      await this.store(loan.id, loan.borrowerId, pdf, DocumentKind.CollateralAgreement, fileName);
    }
    await this.mail.sendCollateralAgreement(
      loan.borrower.email,
      data.base.borrower.fullName,
      data.base.lender.name,
      pdf,
      fileName,
    );
    return { sent: true };
  }

  uploadSignedCollateral(
    tenantId: string,
    loanId: string,
    file: Express.Multer.File,
  ): Promise<DocumentView> {
    return this.storeUpload(tenantId, loanId, file, DocumentKind.CollateralAgreement);
  }

  // ── Shared builders / storage ──────────────────────────────────────────

  /** Render, store and link a loan agreement; returns everything a caller may want to email. */
  private async generate(tenantId: string, loanId: string) {
    const { loan, data } = await this.build(tenantId, loanId);
    const pdf = await renderAgreementPdf(data);
    const fileName = documentFileName('Loan Agreement', data.borrower.fullName, data.generatedAt);
    const document = await this.store(
      loan.id,
      loan.borrowerId,
      pdf,
      DocumentKind.LoanAgreement,
      fileName,
    );
    return { loan, data, pdf, fileName, document };
  }

  /** Render, store and link a collateral agreement; the collateral twin of {@link generate}. */
  private async generateCollateral(tenantId: string, loanId: string) {
    const { loan, data } = await this.buildCollateral(tenantId, loanId);
    const pdf = await renderCollateralAgreementPdf(data);
    const fileName = documentFileName(
      'Collateral Agreement',
      data.base.borrower.fullName,
      data.base.generatedAt,
    );
    const document = await this.store(
      loan.id,
      loan.borrowerId,
      pdf,
      DocumentKind.CollateralAgreement,
      fileName,
    );
    return { loan, data, pdf, fileName, document };
  }

  /** Load a loan (tenant-scoped) and assemble its display-ready agreement data. */
  private async build(
    tenantId: string,
    loanId: string,
  ): Promise<{ loan: AgreementLoan; data: AgreementData }> {
    const loan = await this.loadLoan(tenantId, loanId);
    const { lender, monthlyRate, images } = await this.loadContext(tenantId, loan);
    const data = toAgreementData(loan, lender, monthlyRate, images, new Date());
    return { loan, data };
  }

  /** Load a loan + its collateral photos and assemble collateral-agreement data. */
  private async buildCollateral(
    tenantId: string,
    loanId: string,
  ): Promise<{ loan: AgreementLoan; data: CollateralAgreementData }> {
    const loan = await this.loadLoan(tenantId, loanId);
    const [{ lender, monthlyRate, images }, photos] = await Promise.all([
      this.loadContext(tenantId, loan),
      this.readCollateralPhotos(tenantId, loanId),
    ]);
    const data = toCollateralAgreementData(loan, lender, monthlyRate, images, photos, new Date());
    return { loan, data };
  }

  private async loadLoan(tenantId: string, loanId: string): Promise<AgreementLoan> {
    const loan = (await this.prisma.loan.findFirst({
      where: { id: loanId, tenantId },
      include: AGREEMENT_INCLUDE,
    })) as AgreementLoan | null;
    if (!loan) {
      throw new NotFoundException('Loan not found');
    }
    return loan;
  }

  /**
   * Everything an agreement needs besides the loan itself: the lender identity
   * and penalty rate, and every embedded image — the borrower's captured
   * signature and initials, the tenant logo, and the officer/stamp images.
   */
  private async loadContext(
    tenantId: string,
    loan: AgreementLoan,
  ): Promise<{ lender: Awaited<ReturnType<SettingsService['getLenderIdentity']>>; monthlyRate: number; images: AgreementImages }> {
    const [lender, fees, signing, signaturePng, initialsPng, logoPng] = await Promise.all([
      this.settings.getLenderIdentity(tenantId),
      this.settings.resolveFeeSettings(tenantId),
      this.settings.getSigningAssets(tenantId),
      this.readDocumentImage(loan.signatureDocumentId, `signature for loan ${loan.id}`),
      this.readDocumentImage(loan.initialsDocumentId, `initials for loan ${loan.id}`),
      this.storage.tryRead(loan.tenant.logoUrl, `logo for loan ${loan.id}`),
    ]);
    const images: AgreementImages = {
      signaturePng,
      initialsPng,
      logoPng,
      officerSignaturePng: signing.officerSignaturePng,
      officerInitialsPng: signing.officerInitialsPng,
      stampPng: signing.stampPng,
    };
    return { lender, monthlyRate: fees.monthlyRate, images };
  }

  /** Read up to {@link MAX_EMBEDDED_PHOTOS} collateral photos as image buffers. */
  private async readCollateralPhotos(tenantId: string, loanId: string): Promise<Buffer[]> {
    const documents = await this.prisma.document.findMany({
      where: {
        loanId,
        kind: DocumentKind.CollateralPhoto,
        loan: { tenantId },
        // pdfkit can only embed JPEG/PNG.
        mimeType: { in: ['image/jpeg', 'image/png'] },
      },
      orderBy: { uploadedAt: 'asc' },
      take: MAX_EMBEDDED_PHOTOS,
    });
    const buffers = await Promise.all(
      documents.map((document) => this.storage.tryRead(document.url, `collateral photo ${document.id}`)),
    );
    return buffers.filter((buffer): buffer is Buffer => buffer !== null);
  }

  /** Read a captured handwriting image (signature / initials) by its Document id. */
  private async readDocumentImage(documentId: string | null, label: string): Promise<Buffer | null> {
    if (!documentId) return null;
    const document = await this.prisma.document.findUnique({
      where: { id: documentId },
      select: { url: true },
    });
    return document ? this.storage.tryRead(document.url, label) : null;
  }

  /** Persist a generated PDF and create its Document row (linked to the loan). */
  private async store(
    loanId: string,
    borrowerId: string,
    pdf: Buffer,
    kind: DocumentKind,
    fileName: string,
  ): Promise<Document> {
    const { key } = await this.storage.save({
      buffer: pdf,
      contentType: 'application/pdf',
      originalName: fileName,
    });
    return this.prisma.document.create({
      data: {
        loanId,
        borrowerId,
        kind,
        url: key,
        fileName,
        mimeType: 'application/pdf',
        sizeBytes: pdf.length,
      },
    });
  }

  /** Store an uploaded (wet-signed) agreement scan of the given kind. */
  private async storeUpload(
    tenantId: string,
    loanId: string,
    file: Express.Multer.File,
    kind: DocumentKind,
  ): Promise<DocumentView> {
    const loan = await this.prisma.loan.findFirst({
      where: { id: loanId, tenantId },
      select: { id: true, borrowerId: true },
    });
    if (!loan) {
      throw new NotFoundException('Loan not found');
    }
    const { key } = await this.storage.save({
      buffer: file.buffer,
      contentType: file.mimetype,
      originalName: file.originalname,
    });
    const document = await this.prisma.document.create({
      data: {
        loanId: loan.id,
        borrowerId: loan.borrowerId,
        kind,
        url: key,
        fileName: file.originalname,
        mimeType: file.mimetype,
        sizeBytes: file.size,
      },
    });
    return this.toView(document);
  }

  private latestDocument(
    tenantId: string,
    loanId: string,
    kind: DocumentKind,
  ): Promise<Document | null> {
    return this.prisma.document.findFirst({
      where: { loanId, kind, loan: { tenantId } },
      orderBy: { uploadedAt: 'desc' },
    });
  }

  private async toView(document: Document): Promise<DocumentView> {
    return {
      id: document.id,
      kind: document.kind,
      url: await this.storage.safeAccessUrl(document.url),
      fileName: document.fileName,
      uploadedAt: document.uploadedAt,
    };
  }
}
