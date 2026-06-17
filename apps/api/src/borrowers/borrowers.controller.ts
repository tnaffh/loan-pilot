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
  createBorrowerSchema,
  updateBorrowerSchema,
  type CreateBorrowerInput,
  type SessionUser,
  type UpdateBorrowerInput,
} from '@loan-pilot/domain';
import type { Borrower } from '@prisma/client';
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
}
