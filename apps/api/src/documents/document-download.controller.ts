import {
  Controller,
  ForbiddenException,
  Get,
  Param,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import { DocumentKind, hasPermission, type Permission, type SessionUser } from '@loan-pilot/domain';
import { requireTenantId } from '../common/tenant';
import { attachmentDisposition } from '../common/file-name';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { DocumentsService } from './documents.service';

const AGREEMENT_KINDS = new Set<string>([
  DocumentKind.LoanAgreement,
  DocumentKind.CollateralAgreement,
]);

/**
 * Authenticated document downloads. Serves a stored file under its real name
 * (`Content-Disposition`), which a link straight to the storage URL cannot do:
 * that URL ends in the opaque storage key, so browsers save it as a UUID.
 */
@Controller('documents')
@UseGuards(JwtAuthGuard)
export class DocumentDownloadController {
  constructor(private readonly documents: DocumentsService) {}

  /**
   * Agreements are readable with `agreements:read`, every other borrower file
   * with `borrowers:read` — the same gates as the pages that list them.
   */
  @Get(':id/download')
  async download(
    @CurrentUser() user: SessionUser,
    @Param('id') id: string,
  ): Promise<StreamableFile> {
    const { document, buffer, mimeType } = await this.documents.download(
      requireTenantId(user),
      id,
    );
    const required: Permission = AGREEMENT_KINDS.has(document.kind)
      ? 'agreements:read'
      : 'borrowers:read';
    if (!hasPermission(user, required)) {
      throw new ForbiddenException('You do not have permission to download this document');
    }
    return new StreamableFile(buffer, {
      type: mimeType,
      disposition: attachmentDisposition(document.fileName),
      length: buffer.length,
    });
  }
}
