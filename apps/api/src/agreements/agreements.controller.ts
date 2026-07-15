import {
  BadRequestException,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { SessionUser } from '@loan-pilot/domain';
import { requireTenantId } from '../common/tenant';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { RequirePermissions } from '../auth/permissions.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { documentUploadOptions } from '../documents/upload.config';
import type { DocumentView } from '../documents/documents.service';
import { AgreementsService } from './agreements.service';

/**
 * Signed loan-agreement generation & retrieval, keyed by loan. Mounted under
 * `loans` so routes read `/api/loans/:id/agreement`.
 */
@Controller('loans')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class AgreementsController {
  constructor(private readonly agreements: AgreementsService) {}

  /** The latest generated/uploaded agreement for a loan (404 if none yet). */
  @Get(':id/agreement')
  @RequirePermissions('agreements:read')
  async latest(@CurrentUser() user: SessionUser, @Param('id') id: string): Promise<DocumentView> {
    const document = await this.agreements.latestForLoan(requireTenantId(user), id);
    if (!document) {
      throw new NotFoundException('No agreement has been generated for this loan yet');
    }
    return document;
  }

  /** Generate (or regenerate) the signed agreement PDF for a loan. */
  @Post(':id/agreement')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions('agreements:generate')
  generate(@CurrentUser() user: SessionUser, @Param('id') id: string): Promise<DocumentView> {
    return this.agreements.generateForLoan(requireTenantId(user), id);
  }

  /** Email a copy of the signed agreement to the borrower. */
  @Post(':id/agreement/email')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('agreements:generate')
  email(@CurrentUser() user: SessionUser, @Param('id') id: string): Promise<{ sent: boolean }> {
    return this.agreements.emailToBorrower(requireTenantId(user), id);
  }

  /** Attach a wet-signed agreement scan (for loans with no captured signature). */
  @Post(':id/agreement/upload')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions('agreements:generate')
  @UseInterceptors(FileInterceptor('file', documentUploadOptions))
  upload(
    @CurrentUser() user: SessionUser,
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File | undefined,
  ): Promise<DocumentView> {
    if (!file) {
      throw new BadRequestException('A file is required');
    }
    return this.agreements.uploadSigned(requireTenantId(user), id, file);
  }
}
