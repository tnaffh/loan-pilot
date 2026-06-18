import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { Borrower, BorrowerAddress, BorrowerBankAccount, Prisma } from '@prisma/client';
import {
  toCents,
  type CreateBorrowerAddressInput,
  type CreateBorrowerBankAccountInput,
  type CreateBorrowerInput,
  type UpdateBorrowerInput,
} from '@loan-pilot/domain';
import { PrismaService } from '../prisma/prisma.service';

export type BorrowerWithLoanCount = Prisma.BorrowerGetPayload<{
  include: { _count: { select: { loans: true } } };
}>;

export type BorrowerWithLoans = Prisma.BorrowerGetPayload<{
  include: {
    loans: { include: { schedule: true } };
    addresses: true;
    bankAccounts: true;
  };
}>;

/** Map a validated address input to the create payload (active by default). */
const addressData = (input: CreateBorrowerAddressInput) => ({
  label: input.label || null,
  street: input.street,
  suburb: input.suburb || null,
  city: input.city,
  region: input.region || null,
  country: input.country,
});

/** Map a validated bank-account input to the create payload. */
const bankAccountData = (input: CreateBorrowerBankAccountInput) => ({
  bankName: input.bankName,
  accountNumber: input.accountNumber,
  branchName: input.branchName || null,
  branchCode: input.branchCode || null,
  accountHolderName: input.accountHolderName,
  accountType: input.accountType,
});

const DUPLICATE_KEY_CODE = 'P2002';

const isDuplicateKeyError = (error: unknown): boolean =>
  typeof error === 'object' &&
  error !== null &&
  'code' in error &&
  error.code === DUPLICATE_KEY_CODE;

@Injectable()
export class BorrowersService {
  constructor(private readonly prisma: PrismaService) {}

  findAllForTenant(tenantId: string): Promise<BorrowerWithLoanCount[]> {
    return this.prisma.borrower.findMany({
      where: { tenantId },
      include: { _count: { select: { loans: true } } },
      orderBy: { since: 'desc' },
    });
  }

  async findOneForTenant(tenantId: string, id: string): Promise<BorrowerWithLoans> {
    const borrower = await this.prisma.borrower.findFirst({
      where: { id, tenantId },
      include: {
        loans: {
          include: { schedule: { orderBy: { number: 'asc' } } },
          orderBy: { createdAt: 'desc' },
        },
        addresses: { orderBy: [{ isActive: 'desc' }, { createdAt: 'desc' }] },
        bankAccounts: { orderBy: [{ isActive: 'desc' }, { createdAt: 'desc' }] },
      },
    });
    if (!borrower) {
      throw new NotFoundException('Borrower not found');
    }
    return borrower;
  }

  async create(tenantId: string, input: CreateBorrowerInput): Promise<Borrower> {
    try {
      return await this.prisma.borrower.create({
        data: {
          tenant: { connect: { id: tenantId } },
          firstName: input.firstName,
          lastName: input.lastName,
          idNumber: input.idNumber,
          phone: input.phone,
          email: input.email,
          employer: input.employer,
          occupation: input.occupation,
          monthlyIncome: toCents(input.monthlyIncome),
          employmentType: input.employmentType,
          addresses: { create: [{ ...addressData(input.address), isActive: true }] },
          bankAccounts: { create: [{ ...bankAccountData(input.bankAccount), isActive: true }] },
        },
      });
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        throw new ConflictException('A borrower with this ID number already exists');
      }
      throw error;
    }
  }

  private async ensureBorrower(tenantId: string, id: string): Promise<void> {
    const borrower = await this.prisma.borrower.findFirst({ where: { id, tenantId } });
    if (!borrower) {
      throw new NotFoundException('Borrower not found');
    }
  }

  /** Add an address and make it the active one (deactivating the previous). */
  async addAddress(
    tenantId: string,
    borrowerId: string,
    input: CreateBorrowerAddressInput,
  ): Promise<BorrowerAddress> {
    await this.ensureBorrower(tenantId, borrowerId);
    return this.prisma.$transaction(async (tx) => {
      await tx.borrowerAddress.updateMany({
        where: { borrowerId, isActive: true },
        data: { isActive: false },
      });
      return tx.borrowerAddress.create({
        data: { borrowerId, ...addressData(input), isActive: true },
      });
    });
  }

  async activateAddress(
    tenantId: string,
    borrowerId: string,
    addressId: string,
  ): Promise<BorrowerAddress> {
    await this.ensureBorrower(tenantId, borrowerId);
    return this.prisma.$transaction(async (tx) => {
      const address = await tx.borrowerAddress.findFirst({ where: { id: addressId, borrowerId } });
      if (!address) {
        throw new NotFoundException('Address not found');
      }
      await tx.borrowerAddress.updateMany({
        where: { borrowerId, isActive: true },
        data: { isActive: false },
      });
      return tx.borrowerAddress.update({ where: { id: addressId }, data: { isActive: true } });
    });
  }

  /** Add a bank account and make it the active one (deactivating the previous). */
  async addBankAccount(
    tenantId: string,
    borrowerId: string,
    input: CreateBorrowerBankAccountInput,
  ): Promise<BorrowerBankAccount> {
    await this.ensureBorrower(tenantId, borrowerId);
    return this.prisma.$transaction(async (tx) => {
      await tx.borrowerBankAccount.updateMany({
        where: { borrowerId, isActive: true },
        data: { isActive: false },
      });
      return tx.borrowerBankAccount.create({
        data: { borrowerId, ...bankAccountData(input), isActive: true },
      });
    });
  }

  async activateBankAccount(
    tenantId: string,
    borrowerId: string,
    accountId: string,
  ): Promise<BorrowerBankAccount> {
    await this.ensureBorrower(tenantId, borrowerId);
    return this.prisma.$transaction(async (tx) => {
      const account = await tx.borrowerBankAccount.findFirst({
        where: { id: accountId, borrowerId },
      });
      if (!account) {
        throw new NotFoundException('Bank account not found');
      }
      await tx.borrowerBankAccount.updateMany({
        where: { borrowerId, isActive: true },
        data: { isActive: false },
      });
      return tx.borrowerBankAccount.update({ where: { id: accountId }, data: { isActive: true } });
    });
  }

  async update(tenantId: string, id: string, input: UpdateBorrowerInput): Promise<Borrower> {
    const existing = await this.prisma.borrower.findFirst({ where: { id, tenantId } });
    if (!existing) {
      throw new NotFoundException('Borrower not found');
    }

    const { monthlyIncome, ...rest } = input;
    return this.prisma.borrower.update({
      where: { id },
      data: {
        ...rest,
        ...(monthlyIncome === undefined ? {} : { monthlyIncome: toCents(monthlyIncome) }),
      },
    });
  }
}
