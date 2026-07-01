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
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  createBorrowerAddressSchema,
  createBorrowerBankAccountSchema,
  createBorrowerSchema,
  mergeBorrowerSchema,
  updateAddressSchema,
  updateBankAccountSchema,
  updateBorrowerSchema,
  type CreateBorrowerAddressInput,
  type CreateBorrowerBankAccountInput,
  type CreateBorrowerInput,
  type MergeBorrowerInput,
  type SessionUser,
  type UpdateAddressInput,
  type UpdateBankAccountInput,
  type UpdateBorrowerInput,
} from '@loan-pilot/domain';
import type { Borrower, BorrowerAddress, BorrowerBankAccount } from '@prisma/client';
import { BadRequestException } from '@nestjs/common';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { requireTenantId } from '../common/tenant';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { RequirePermissions } from '../auth/permissions.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { DocumentsService, type DocumentView } from '../documents/documents.service';
import { documentUploadOptions } from '../documents/upload.config';
import {
  BorrowersService,
  type BorrowerStatement,
  type BorrowerWithLoanCount,
  type BorrowerWithLoans,
} from './borrowers.service';

@Controller('borrowers')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class BorrowersController {
  constructor(
    private readonly borrowers: BorrowersService,
    private readonly documents: DocumentsService,
  ) {}

  @Get()
  @RequirePermissions('borrowers:read')
  list(@CurrentUser() user: SessionUser): Promise<BorrowerWithLoanCount[]> {
    return this.borrowers.findAllForTenant(requireTenantId(user));
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions('borrowers:write')
  create(
    @CurrentUser() user: SessionUser,
    @Body(new ZodValidationPipe(createBorrowerSchema)) body: CreateBorrowerInput,
  ): Promise<Borrower> {
    return this.borrowers.create(requireTenantId(user), body);
  }

  @Get(':id')
  @RequirePermissions('borrowers:read')
  findOne(@CurrentUser() user: SessionUser, @Param('id') id: string): Promise<BorrowerWithLoans> {
    return this.borrowers.findOneForTenant(requireTenantId(user), id);
  }

  @Get(':id/duplicate-suggestions')
  @RequirePermissions('borrowers:read')
  duplicateSuggestions(
    @CurrentUser() user: SessionUser,
    @Param('id') id: string,
  ): Promise<BorrowerWithLoanCount[]> {
    return this.borrowers.duplicateSuggestions(requireTenantId(user), id);
  }

  @Post(':id/merge')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('borrowers:manage')
  merge(
    @CurrentUser() user: SessionUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(mergeBorrowerSchema)) body: MergeBorrowerInput,
  ): Promise<BorrowerWithLoans> {
    return this.borrowers.mergeBorrowers(requireTenantId(user), user, id, body.duplicateId);
  }

  @Patch(':id')
  @RequirePermissions('borrowers:write')
  update(
    @CurrentUser() user: SessionUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateBorrowerSchema)) body: UpdateBorrowerInput,
  ): Promise<Borrower> {
    return this.borrowers.update(requireTenantId(user), user, id, body);
  }

  @Post(':id/addresses')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions('borrowers:write')
  addAddress(
    @CurrentUser() user: SessionUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(createBorrowerAddressSchema)) body: CreateBorrowerAddressInput,
  ): Promise<BorrowerAddress> {
    return this.borrowers.addAddress(requireTenantId(user), id, body);
  }

  @Patch(':id/addresses/:addressId/activate')
  @RequirePermissions('borrowers:write')
  activateAddress(
    @CurrentUser() user: SessionUser,
    @Param('id') id: string,
    @Param('addressId') addressId: string,
  ): Promise<BorrowerAddress> {
    return this.borrowers.activateAddress(requireTenantId(user), id, addressId);
  }

  @Patch(':id/addresses/:addressId')
  @RequirePermissions('borrowers:write')
  updateAddress(
    @CurrentUser() user: SessionUser,
    @Param('id') id: string,
    @Param('addressId') addressId: string,
    @Body(new ZodValidationPipe(updateAddressSchema)) body: UpdateAddressInput,
  ): Promise<BorrowerAddress> {
    return this.borrowers.updateAddress(requireTenantId(user), user, id, addressId, body);
  }

  @Post(':id/bank-accounts')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions('borrowers:write')
  addBankAccount(
    @CurrentUser() user: SessionUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(createBorrowerBankAccountSchema)) body: CreateBorrowerBankAccountInput,
  ): Promise<BorrowerBankAccount> {
    return this.borrowers.addBankAccount(requireTenantId(user), id, body);
  }

  @Patch(':id/bank-accounts/:accountId/activate')
  @RequirePermissions('borrowers:write')
  activateBankAccount(
    @CurrentUser() user: SessionUser,
    @Param('id') id: string,
    @Param('accountId') accountId: string,
  ): Promise<BorrowerBankAccount> {
    return this.borrowers.activateBankAccount(requireTenantId(user), id, accountId);
  }

  @Patch(':id/bank-accounts/:accountId')
  @RequirePermissions('borrowers:write')
  updateBankAccount(
    @CurrentUser() user: SessionUser,
    @Param('id') id: string,
    @Param('accountId') accountId: string,
    @Body(new ZodValidationPipe(updateBankAccountSchema)) body: UpdateBankAccountInput,
  ): Promise<BorrowerBankAccount> {
    return this.borrowers.updateBankAccount(requireTenantId(user), user, id, accountId, body);
  }

  @Post(':id/documents')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions('borrowers:write')
  @UseInterceptors(FileInterceptor('file', documentUploadOptions))
  uploadDocument(
    @CurrentUser() user: SessionUser,
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body('kind') kind: string,
  ): Promise<DocumentView> {
    if (!file) {
      throw new BadRequestException('A file is required');
    }
    return this.documents.createForBorrower(requireTenantId(user), id, kind || 'other', file);
  }

  @Delete(':id/documents/:documentId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions('borrowers:write')
  deleteDocument(
    @CurrentUser() user: SessionUser,
    @Param('id') id: string,
    @Param('documentId') documentId: string,
  ): Promise<void> {
    return this.documents.removeForBorrower(requireTenantId(user), id, documentId);
  }

  @Get(':id/statement-letter')
  @RequirePermissions('borrowers:read')
  statementLetter(
    @CurrentUser() user: SessionUser,
    @Param('id') id: string,
  ): Promise<BorrowerStatement> {
    return this.borrowers.statementLetter(requireTenantId(user), id);
  }
}
