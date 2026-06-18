import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  UserRole,
  createBorrowerAddressSchema,
  createBorrowerBankAccountSchema,
  createBorrowerSchema,
  updateBorrowerSchema,
  type CreateBorrowerAddressInput,
  type CreateBorrowerBankAccountInput,
  type CreateBorrowerInput,
  type SessionUser,
  type UpdateBorrowerInput,
} from '@loan-pilot/domain';
import type { Borrower, BorrowerAddress, BorrowerBankAccount } from '@prisma/client';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { requireTenantId } from '../common/tenant';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import {
  BorrowersService,
  type BorrowerWithLoanCount,
  type BorrowerWithLoans,
} from './borrowers.service';

@Controller('borrowers')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.LenderAdmin, UserRole.LenderStaff)
export class BorrowersController {
  constructor(private readonly borrowers: BorrowersService) {}

  @Get()
  list(@CurrentUser() user: SessionUser): Promise<BorrowerWithLoanCount[]> {
    return this.borrowers.findAllForTenant(requireTenantId(user));
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(
    @CurrentUser() user: SessionUser,
    @Body(new ZodValidationPipe(createBorrowerSchema)) body: CreateBorrowerInput,
  ): Promise<Borrower> {
    return this.borrowers.create(requireTenantId(user), body);
  }

  @Get(':id')
  findOne(@CurrentUser() user: SessionUser, @Param('id') id: string): Promise<BorrowerWithLoans> {
    return this.borrowers.findOneForTenant(requireTenantId(user), id);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: SessionUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateBorrowerSchema)) body: UpdateBorrowerInput,
  ): Promise<Borrower> {
    return this.borrowers.update(requireTenantId(user), id, body);
  }

  @Post(':id/addresses')
  @HttpCode(HttpStatus.CREATED)
  addAddress(
    @CurrentUser() user: SessionUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(createBorrowerAddressSchema)) body: CreateBorrowerAddressInput,
  ): Promise<BorrowerAddress> {
    return this.borrowers.addAddress(requireTenantId(user), id, body);
  }

  @Patch(':id/addresses/:addressId/activate')
  activateAddress(
    @CurrentUser() user: SessionUser,
    @Param('id') id: string,
    @Param('addressId') addressId: string,
  ): Promise<BorrowerAddress> {
    return this.borrowers.activateAddress(requireTenantId(user), id, addressId);
  }

  @Post(':id/bank-accounts')
  @HttpCode(HttpStatus.CREATED)
  addBankAccount(
    @CurrentUser() user: SessionUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(createBorrowerBankAccountSchema)) body: CreateBorrowerBankAccountInput,
  ): Promise<BorrowerBankAccount> {
    return this.borrowers.addBankAccount(requireTenantId(user), id, body);
  }

  @Patch(':id/bank-accounts/:accountId/activate')
  activateBankAccount(
    @CurrentUser() user: SessionUser,
    @Param('id') id: string,
    @Param('accountId') accountId: string,
  ): Promise<BorrowerBankAccount> {
    return this.borrowers.activateBankAccount(requireTenantId(user), id, accountId);
  }
}
