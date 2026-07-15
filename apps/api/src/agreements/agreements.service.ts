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

const AGREEMENT_INCLUDE = {
  borrower: {
    include: {
      addresses: true,
      bankAccounts: true,
      references: true,
    },
  },
  tenant: { select: { name: true, town: true } },
  schedule: { orderBy: { number: 'asc' as const } },
} as const;

@Injectable()
export class AgreementsService {
  private readonly logger = new Logger(AgreementsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly settings: SettingsService,
    private readonly mail: MailService,
  ) {}

  /** Load a loan (tenant-scoped) and assemble its display-ready agreement data. */
  private async build(tenantId: string, loanId: string): Promise<{ loan: AgreementLoan; data: AgreementData }> {
    const loan = (await this.prisma.loan.findFirst({
      where: { id: loanId, tenantId },
      include: AGREEMENT_INCLUDE,
    })) as AgreementLoan | null;
    if (!loan) {
      throw new NotFoundException('Loan not found');
    }
    const [lender, fees] = await Promise.all([
      this.settings.getLenderIdentity(tenantId),
      this.settings.resolveFeeSettings(tenantId),
    ]);
    // The captured signature image, when the loan carries one (absent for
    // legacy/imported loans and loans created directly against a borrower).
    let signaturePng: Buffer | null = null;
    if (loan.signatureDocumentId) {
      const signature = await this.prisma.document.findUnique({
        where: { id: loan.signatureDocumentId },
        select: { url: true },
      });
      if (signature) {
        try {
          signaturePng = await this.storage.read(signature.url);
        } catch (error) {
          this.logger.error(
            `Failed to read signature for loan ${loanId}`,
            error instanceof Error ? error.stack : String(error),
          );
        }
      }
    }
    const data = toAgreementData(loan, lender, fees.monthlyRate, signaturePng, new Date());
    return { loan, data };
  }

  /** Generate a fresh signed-agreement PDF, store it, and link it to the loan. */
  async generateForLoan(tenantId: string, loanId: string): Promise<DocumentView> {
    const { loan, data } = await this.build(tenantId, loanId);
    const pdf = await renderAgreementPdf(data);
    const document = await this.store(loan.id, loan.borrowerId, pdf);
    return this.toView(document);
  }

  /** The latest generated/uploaded agreement for a loan, or null if none yet. */
  async latestForLoan(tenantId: string, loanId: string): Promise<DocumentView | null> {
    const document = await this.latestDocument(tenantId, loanId);
    return document ? this.toView(document) : null;
  }

  /**
   * Email the borrower a copy of the signed agreement (NAMFISA s.9.2.4.1). Reuses
   * the latest stored PDF when present, otherwise generates and stores one.
   */
  async emailToBorrower(tenantId: string, loanId: string): Promise<{ sent: boolean }> {
    const { loan, data } = await this.build(tenantId, loanId);
    if (!loan.borrower.email) {
      throw new BadRequestException('The borrower has no email address on file');
    }
    const latest = await this.latestDocument(tenantId, loanId);
    const pdf = latest ? await this.storage.read(latest.url) : await renderAgreementPdf(data);
    if (!latest) {
      await this.store(loan.id, loan.borrowerId, pdf);
    }
    await this.mail.sendAgreement(loan.borrower.email, data.borrower.fullName, data.lender.name, pdf);
    return { sent: true };
  }

  /**
   * Attach a wet-signed agreement scan uploaded from the dashboard, for loans
   * with no captured signature (legacy/imported, or disbursed to an existing
   * borrower). Verifies the loan belongs to the tenant.
   */
  async uploadSigned(
    tenantId: string,
    loanId: string,
    file: Express.Multer.File,
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
        kind: DocumentKind.LoanAgreement,
        url: key,
        fileName: file.originalname,
        mimeType: file.mimetype,
        sizeBytes: file.size,
      },
    });
    return this.toView(document);
  }

  /** Persist a generated PDF and create its Document row (linked to the loan). */
  private async store(loanId: string, borrowerId: string, pdf: Buffer): Promise<Document> {
    const { key } = await this.storage.save({
      buffer: pdf,
      contentType: 'application/pdf',
      originalName: 'loan-agreement.pdf',
    });
    return this.prisma.document.create({
      data: {
        loanId,
        borrowerId,
        kind: DocumentKind.LoanAgreement,
        url: key,
        fileName: 'loan-agreement.pdf',
        mimeType: 'application/pdf',
        sizeBytes: pdf.length,
      },
    });
  }

  private latestDocument(tenantId: string, loanId: string): Promise<Document | null> {
    return this.prisma.document.findFirst({
      where: { loanId, kind: DocumentKind.LoanAgreement, loan: { tenantId } },
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
