import { Injectable, NotFoundException } from '@nestjs/common';
import type { Document } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from './storage.service';

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
}
