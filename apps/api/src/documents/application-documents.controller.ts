import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  attachProfileDocumentsSchema,
  updateDocumentKindSchema,
  type AttachProfileDocumentsInput,
  type SessionUser,
  type UpdateDocumentKindInput,
} from '@loan-pilot/domain';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { requireTenantId } from '../common/tenant';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { RequirePermissions } from '../auth/permissions.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { DocumentsService, type ProfileDocumentOption } from './documents.service';

/**
 * Staff management of an application's supporting documents: bring in files
 * from the borrower's profile, fix a mislabelled document, remove one. New
 * files go through the regular upload (`POST /applications/:id/documents`).
 */
@Controller('applications')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ApplicationDocumentsController {
  constructor(private readonly documents: DocumentsService) {}

  @Get(':id/documents/profile')
  @RequirePermissions('applications:read')
  profile(
    @CurrentUser() user: SessionUser,
    @Param('id') id: string,
  ): Promise<ProfileDocumentOption[]> {
    return this.documents.profileDocumentsForApplication(requireTenantId(user), id);
  }

  @Post(':id/documents/attach')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('applications:write')
  attach(
    @CurrentUser() user: SessionUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(attachProfileDocumentsSchema)) body: AttachProfileDocumentsInput,
  ): Promise<{ attached: number }> {
    return this.documents.attachProfileDocuments(requireTenantId(user), id, body.documentIds);
  }

  @Patch(':id/documents/:documentId')
  @RequirePermissions('applications:write')
  async updateKind(
    @CurrentUser() user: SessionUser,
    @Param('id') id: string,
    @Param('documentId') documentId: string,
    @Body(new ZodValidationPipe(updateDocumentKindSchema)) body: UpdateDocumentKindInput,
  ): Promise<{ ok: true }> {
    await this.documents.updateApplicationDocumentKind(
      requireTenantId(user),
      id,
      documentId,
      body.kind,
    );

    return { ok: true };
  }

  @Delete(':id/documents/:documentId')
  @RequirePermissions('applications:write')
  async remove(
    @CurrentUser() user: SessionUser,
    @Param('id') id: string,
    @Param('documentId') documentId: string,
  ): Promise<{ ok: true }> {
    await this.documents.removeFromApplication(requireTenantId(user), id, documentId);

    return { ok: true };
  }
}
