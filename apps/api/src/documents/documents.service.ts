import { Injectable, NotFoundException } from '@nestjs/common';
import type { Document } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from './storage.service';

/** A document with its storage key resolved to an openable URL (null when the
 * URL could not be signed — see {@link StorageService.safeAccessUrl}). */
export interface DocumentView {
  id: string;
  kind: string;
  url: string | null;
  fileName: string;
  uploadedAt: Date;
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
