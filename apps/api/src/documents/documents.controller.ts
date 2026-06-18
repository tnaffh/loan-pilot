import {
  BadRequestException,
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { DocumentKind } from '@loan-pilot/domain';
import { TenantsService } from '../tenants/tenants.service';
import { DocumentsService } from './documents.service';
import { documentUploadOptions } from './upload.config';

interface DocumentDto {
  id: string;
  kind: string;
  url: string;
  fileName: string;
  uploadedAt: string;
}

const DOCUMENT_KINDS = new Set<string>(Object.values(DocumentKind));

/** Public document upload, mirroring the public apply endpoint's tenant resolution. */
@Controller('applications')
export class DocumentsController {
  constructor(
    private readonly documents: DocumentsService,
    private readonly tenants: TenantsService,
  ) {}

  @Post(':id/documents')
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(FileInterceptor('file', documentUploadOptions))
  async upload(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body('kind') kind: string,
    @Headers('x-tenant') tenantSlug?: string,
  ): Promise<DocumentDto> {
    if (!file) {
      throw new BadRequestException('A file is required');
    }
    if (!DOCUMENT_KINDS.has(kind)) {
      throw new BadRequestException('Invalid document kind');
    }
    const tenant = await this.tenants.resolveForPublicRequest(tenantSlug);
    const document = await this.documents.createForApplication(tenant.id, id, kind, file);
    return {
      id: document.id,
      kind: document.kind,
      url: document.url,
      fileName: document.fileName,
      uploadedAt: document.uploadedAt.toISOString(),
    };
  }
}
