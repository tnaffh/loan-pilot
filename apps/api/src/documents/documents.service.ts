import { Injectable, NotFoundException } from '@nestjs/common';
import type { Document } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class DocumentsService {
  constructor(private readonly prisma: PrismaService) {}

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

    return this.prisma.document.create({
      data: {
        applicationId,
        kind,
        url: `/uploads/${file.filename}`,
        fileName: file.originalname,
        mimeType: file.mimetype,
        sizeBytes: file.size,
      },
    });
  }
}
