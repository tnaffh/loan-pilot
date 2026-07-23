import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { Document } from '@prisma/client';
import { DocumentKind } from '@loan-pilot/domain';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../documents/storage.service';
import type { DocumentView } from '../documents/documents.service';
import { SettingsService } from '../settings/settings.service';
import { MailService } from '../mail/mail.service';
import { AgreementLoan, toAgreementData, type AgreementData } from './agreement-data';
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
    const { loan, data } = await this.build(tenantId, loanId);
    const pdf = await renderAgreementPdf(data);
    const document = await this.store(
      loan.id,
      loan.borrowerId,
      pdf,
      DocumentKind.LoanAgreement,
      'loan-agreement.pdf',
    );
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
    const pdf = latest ? await this.storage.read(latest.url) : await renderAgreementPdf(data);
    if (!latest) {
      await this.store(loan.id, loan.borrowerId, pdf, DocumentKind.LoanAgreement, 'loan-agreement.pdf');
    }
    await this.mail.sendAgreement(loan.borrower.email, data.borrower.fullName, data.lender.name, pdf);
    return { sent: true };
  }

  /** Attach a wet-signed loan-agreement scan (loans without a captured signature). */
  uploadSigned(tenantId: string, loanId: string, file: Express.Multer.File): Promise<DocumentView> {
    return this.storeUpload(tenantId, loanId, file, DocumentKind.LoanAgreement);
  }

  // ── Collateral (pledge) agreement ──────────────────────────────────────

  async generateCollateralForLoan(tenantId: string, loanId: string): Promise<DocumentView> {
    const { loan, data } = await this.buildCollateral(tenantId, loanId);
    const pdf = await renderCollateralAgreementPdf(data);
    const document = await this.store(
      loan.id,
      loan.borrowerId,
      pdf,
      DocumentKind.CollateralAgreement,
      'collateral-agreement.pdf',
    );
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
    const pdf = latest ? await this.storage.read(latest.url) : await renderCollateralAgreementPdf(data);
    if (!latest) {
      await this.store(
        loan.id,
        loan.borrowerId,
        pdf,
        DocumentKind.CollateralAgreement,
        'collateral-agreement.pdf',
      );
    }
    await this.mail.sendCollateralAgreement(
      loan.borrower.email,
      data.base.borrower.fullName,
      data.base.lender.name,
      pdf,
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

  /** Load a loan (tenant-scoped) and assemble its display-ready agreement data. */
  private async build(
    tenantId: string,
    loanId: string,
  ): Promise<{ loan: AgreementLoan; data: AgreementData }> {
    const loan = await this.loadLoan(tenantId, loanId);
    const { lender, monthlyRate, signaturePng, logoPng } = await this.loadCommon(tenantId, loan, loanId);
    const data = toAgreementData(loan, lender, monthlyRate, signaturePng, logoPng, new Date());
    return { loan, data };
  }

  /** Load a loan + its collateral photos and assemble collateral-agreement data. */
  private async buildCollateral(
    tenantId: string,
    loanId: string,
  ): Promise<{ loan: AgreementLoan; data: CollateralAgreementData }> {
    const loan = await this.loadLoan(tenantId, loanId);
    const { lender, monthlyRate, signaturePng, logoPng } = await this.loadCommon(tenantId, loan, loanId);
    const photos = await this.readCollateralPhotos(tenantId, loanId);
    const data = toCollateralAgreementData(
      loan,
      lender,
      monthlyRate,
      signaturePng,
      logoPng,
      photos,
      new Date(),
    );
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

  private async loadCommon(tenantId: string, loan: AgreementLoan, loanId: string) {
    const [lender, fees] = await Promise.all([
      this.settings.getLenderIdentity(tenantId),
      this.settings.resolveFeeSettings(tenantId),
    ]);
    const signaturePng = loan.signatureDocumentId
      ? await this.readSignature(loan.signatureDocumentId, loanId)
      : null;
    const logoPng = await this.readImageKey(loan.tenant.logoUrl, `logo for loan ${loanId}`);
    return { lender, monthlyRate: fees.monthlyRate, signaturePng, logoPng };
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
      documents.map((document) => this.readImageKey(document.url, `collateral photo ${document.id}`)),
    );
    return buffers.filter((buffer): buffer is Buffer => buffer !== null);
  }

  private async readSignature(documentId: string, loanId: string): Promise<Buffer | null> {
    const signature = await this.prisma.document.findUnique({
      where: { id: documentId },
      select: { url: true },
    });
    return signature ? this.readImageKey(signature.url, `signature for loan ${loanId}`) : null;
  }

  /** Read an image by storage key, degrading to null (with a log) on failure. */
  private async readImageKey(key: string | null, label: string): Promise<Buffer | null> {
    // Only storage keys are embeddable; skip external/legacy URL values.
    if (!key || /^https?:\/\//i.test(key)) return null;
    try {
      return await this.storage.read(key);
    } catch (error) {
      this.logger.error(
        `Failed to read ${label}`,
        error instanceof Error ? error.stack : String(error),
      );
      return null;
    }
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
