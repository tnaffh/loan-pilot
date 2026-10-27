import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { Document } from '@prisma/client';
import { isSupportingDocumentKind, type DocumentKind } from '@loan-pilot/domain';
import { PrismaService } from '../prisma/prisma.service';
import { findApplicantBorrowerId } from '../common/applicant-borrower';
import { StorageService } from './storage.service';

/** A stored document's bytes plus what to serve it as. */
export interface DocumentDownload {
  document: Document;
  buffer: Buffer;
  mimeType: string;
}

/** A document with its storage key resolved to an openable URL (null when the
 * URL could not be signed — see {@link StorageService.safeAccessUrl}). */
export interface DocumentView {
  id: string;
  kind: string;
  url: string | null;
  fileName: string;
  uploadedAt: Date;
}

/** A document on the applicant's borrower profile, as the attach dialog lists it. */
export interface ProfileDocumentOption {
  id: string;
  kind: string;
  fileName: string;
  mimeType: string | null;
  uploadedAt: Date;
  /** Already attached to this application. */
  attached: boolean;
}

@Injectable()
export class DocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  /** Attach an uploaded file to an application owned by the resolved tenant. */
  async createForApplication(
    tenantId: string,
    applicationId: string,
    kind: string,
    file: Express.Multer.File,
  ): Promise<Document> {
    const application = await this.prisma.loanApplication.findFirst({
      where: { id: applicationId, tenantId },
      select: { id: true },
    });

    if (!application) {
      throw new NotFoundException('Application not found');
    }

    const { key } = await this.storage.save({
      buffer: file.buffer,
      contentType: file.mimetype,
      originalName: file.originalname,
    });

    return this.prisma.document.create({
      data: {
        applicationId,
        kind,
        // The storage key; resolved to an openable URL when read back.
        url: key,
        fileName: file.originalname,
        mimeType: file.mimetype,
        sizeBytes: file.size,
      },
    });
  }

  /** Attach an uploaded file directly to a borrower owned by the resolved tenant. */
  async createForBorrower(
    tenantId: string,
    borrowerId: string,
    kind: string,
    file: Express.Multer.File,
  ): Promise<DocumentView> {
    const borrower = await this.prisma.borrower.findFirst({
      where: { id: borrowerId, tenantId },
      select: { id: true },
    });

    if (!borrower) {
      throw new NotFoundException('Borrower not found');
    }

    const { key } = await this.storage.save({
      buffer: file.buffer,
      contentType: file.mimetype,
      originalName: file.originalname,
    });

    const document = await this.prisma.document.create({
      data: {
        borrowerId,
        kind,
        url: key,
        fileName: file.originalname,
        mimeType: file.mimetype,
        sizeBytes: file.size,
      },
    });

    return this.toView(document);
  }

  /** A borrower's documents with storage keys resolved to openable URLs. */
  async listForBorrower(tenantId: string, borrowerId: string): Promise<DocumentView[]> {
    const documents = await this.prisma.document.findMany({
      where: { borrowerId, borrower: { tenantId } },
      orderBy: { uploadedAt: 'desc' },
    });

    return Promise.all(documents.map((document) => this.toView(document)));
  }

  /** A loan's documents of a given kind (tenant-scoped), resolved to openable URLs. */
  async listForLoan(tenantId: string, loanId: string, kind: string): Promise<DocumentView[]> {
    const documents = await this.prisma.document.findMany({
      where: { loanId, kind, loan: { tenantId } },
      orderBy: { uploadedAt: 'asc' },
    });

    return Promise.all(documents.map((document) => this.toView(document)));
  }

  /**
   * Read a document's bytes for an authenticated download. Documents hang off
   * a borrower, a loan or an application, so tenant scoping goes through
   * whichever owner the row has. Storage keys are opaque UUIDs — serving the
   * bytes through the API is what lets the browser save the file under its
   * real name.
   */
  async download(tenantId: string, id: string): Promise<DocumentDownload> {
    const document = await this.prisma.document.findFirst({
      where: {
        id,
        OR: [{ borrower: { tenantId } }, { loan: { tenantId } }, { application: { tenantId } }],
      },
    });

    if (!document) {
      throw new NotFoundException('Document not found');
    }

    // Legacy rows may hold an external URL rather than a storage key.
    if (/^https?:\/\//i.test(document.url)) {
      throw new BadRequestException('This document is stored externally — open it by its link');
    }

    return {
      document,
      buffer: await this.storage.read(document.url),
      mimeType: document.mimeType ?? 'application/octet-stream',
    };
  }

  /** Delete a borrower document after verifying it belongs to the tenant. */
  async removeForBorrower(tenantId: string, borrowerId: string, documentId: string): Promise<void> {
    const document = await this.prisma.document.findFirst({
      where: { id: documentId, borrowerId, borrower: { tenantId } },
      select: { id: true },
    });

    if (!document) {
      throw new NotFoundException('Document not found');
    }

    await this.prisma.document.delete({ where: { id: documentId } });
  }

  // ── An application's supporting documents, managed by staff ──────────────

  /**
   * Supporting documents on the profile of the borrower this application
   * belongs to (matched by ID number) — e.g. a statement the applicant sent
   * later, uploaded to their profile. Empty for a first-time applicant.
   */
  async profileDocumentsForApplication(
    tenantId: string,
    applicationId: string,
  ): Promise<ProfileDocumentOption[]> {
    const application = await this.applicationOrThrow(tenantId, applicationId);
    const borrowerId = await findApplicantBorrowerId(this.prisma, tenantId, application.idNumber);

    if (!borrowerId) {
      return [];
    }

    const [profile, attached] = await Promise.all([
      this.prisma.document.findMany({
        where: { borrowerId },
        orderBy: { uploadedAt: 'desc' },
      }),
      this.prisma.document.findMany({ where: { applicationId }, select: { url: true } }),
    ]);
    const attachedUrls = new Set(attached.map((document) => document.url));

    return profile
      .filter((document) => isSupportingDocumentKind(document.kind))
      .map((document) => ({
        id: document.id,
        kind: document.kind,
        fileName: document.fileName,
        mimeType: document.mimeType,
        uploadedAt: document.uploadedAt,
        attached: attachedUrls.has(document.url),
      }));
  }

  /**
   * Attach profile documents to the application. Each becomes an application
   * document pointing at the same stored file (nothing is copied in storage);
   * approval skips it when relinking, so the profile never lists it twice.
   */
  async attachProfileDocuments(
    tenantId: string,
    applicationId: string,
    documentIds: string[],
  ): Promise<{ attached: number }> {
    const application = await this.applicationOrThrow(tenantId, applicationId);
    const borrowerId = await findApplicantBorrowerId(this.prisma, tenantId, application.idNumber);

    if (!borrowerId) {
      throw new BadRequestException('This applicant has no borrower profile to attach from.');
    }

    const [sources, existing] = await Promise.all([
      this.prisma.document.findMany({ where: { id: { in: documentIds }, borrowerId } }),
      this.prisma.document.findMany({ where: { applicationId }, select: { url: true } }),
    ]);

    if (sources.length !== new Set(documentIds).size) {
      throw new NotFoundException("Some documents aren't on this applicant's profile");
    }

    const existingUrls = new Set(existing.map((document) => document.url));
    const toAttach = sources.filter(
      (document) => isSupportingDocumentKind(document.kind) && !existingUrls.has(document.url),
    );

    await this.prisma.document.createMany({
      data: toAttach.map((document) => ({
        applicationId,
        kind: document.kind,
        url: document.url,
        fileName: document.fileName,
        mimeType: document.mimeType,
        sizeBytes: document.sizeBytes,
      })),
    });

    return { attached: toAttach.length };
  }

  /** Correct the type of an application's supporting document. */
  async updateApplicationDocumentKind(
    tenantId: string,
    applicationId: string,
    documentId: string,
    kind: DocumentKind,
  ): Promise<void> {
    await this.supportingApplicationDocument(tenantId, applicationId, documentId);
    await this.prisma.document.update({ where: { id: documentId }, data: { kind } });
  }

  /**
   * Take a supporting document off the application. A file that also belongs
   * to the borrower's profile (after approval) is only unlinked, never deleted.
   */
  async removeFromApplication(
    tenantId: string,
    applicationId: string,
    documentId: string,
  ): Promise<void> {
    const document = await this.supportingApplicationDocument(tenantId, applicationId, documentId);

    if (document.borrowerId) {
      await this.prisma.document.update({
        where: { id: documentId },
        data: { applicationId: null },
      });

      return;
    }

    await this.prisma.document.delete({ where: { id: documentId } });
  }

  private async applicationOrThrow(
    tenantId: string,
    applicationId: string,
  ): Promise<{ id: string; idNumber: string }> {
    const application = await this.prisma.loanApplication.findFirst({
      where: { id: applicationId, tenantId },
      select: { id: true, idNumber: true },
    });

    if (!application) {
      throw new NotFoundException('Application not found');
    }

    return application;
  }

  /** An application's document that staff may edit — not a signature, agreement or photo. */
  private async supportingApplicationDocument(
    tenantId: string,
    applicationId: string,
    documentId: string,
  ): Promise<Document> {
    const document = await this.prisma.document.findFirst({
      where: { id: documentId, applicationId, application: { tenantId } },
    });

    if (!document) {
      throw new NotFoundException('Document not found');
    }

    if (!isSupportingDocumentKind(document.kind)) {
      throw new BadRequestException('Only supporting documents can be changed here');
    }

    return document;
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
