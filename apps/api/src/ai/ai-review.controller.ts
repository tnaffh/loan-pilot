import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  startAiReviewSchema,
  type AiReviewDocumentOption,
  type SessionUser,
  type StartAiReviewInput,
} from '@loan-pilot/domain';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { requireTenantId } from '../common/tenant';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { RequirePermissions } from '../auth/permissions.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { AiReviewService, type AiReviewView } from './ai-review.service';

/**
 * AI document reviews of an application or a borrower. A review only ever
 * starts from a POST here (the officer's "AI review" button) — never on its
 * own — because the provider bills every one. The POST may choose which
 * documents to include and add notes for the AI; `…/ai-review-documents` lists
 * the documents on offer. Reading past reports needs only the read permission
 * of what was reviewed.
 */
@Controller()
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class AiReviewController {
  constructor(private readonly reviews: AiReviewService) {}

  @Get('applications/:id/ai-reviews')
  @RequirePermissions('applications:read')
  listForApplication(
    @CurrentUser() user: SessionUser,
    @Param('id') id: string,
  ): Promise<AiReviewView[]> {
    return this.reviews.listForApplication(requireTenantId(user), id);
  }

  @Get('applications/:id/ai-review-documents')
  @RequirePermissions('applications:read', 'ai:review')
  documentsForApplication(
    @CurrentUser() user: SessionUser,
    @Param('id') id: string,
  ): Promise<AiReviewDocumentOption[]> {
    return this.reviews.documentOptionsForApplication(requireTenantId(user), id);
  }

  @Post('applications/:id/ai-reviews')
  @HttpCode(HttpStatus.ACCEPTED)
  @RequirePermissions('applications:read', 'ai:review')
  startForApplication(
    @CurrentUser() user: SessionUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(startAiReviewSchema)) body: StartAiReviewInput,
  ): Promise<AiReviewView> {
    return this.reviews.startForApplication(requireTenantId(user), user, id, body);
  }

  @Get('borrowers/:id/ai-reviews')
  @RequirePermissions('borrowers:read')
  listForBorrower(
    @CurrentUser() user: SessionUser,
    @Param('id') id: string,
  ): Promise<AiReviewView[]> {
    return this.reviews.listForBorrower(requireTenantId(user), id);
  }

  @Get('borrowers/:id/ai-review-documents')
  @RequirePermissions('borrowers:read', 'ai:review')
  documentsForBorrower(
    @CurrentUser() user: SessionUser,
    @Param('id') id: string,
  ): Promise<AiReviewDocumentOption[]> {
    return this.reviews.documentOptionsForBorrower(requireTenantId(user), id);
  }

  @Post('borrowers/:id/ai-reviews')
  @HttpCode(HttpStatus.ACCEPTED)
  @RequirePermissions('borrowers:read', 'ai:review')
  startForBorrower(
    @CurrentUser() user: SessionUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(startAiReviewSchema)) body: StartAiReviewInput,
  ): Promise<AiReviewView> {
    return this.reviews.startForBorrower(requireTenantId(user), user, id, body);
  }
}
