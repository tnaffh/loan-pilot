import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { Borrower, Prisma } from '@prisma/client';
import { toCents, type CreateBorrowerInput, type UpdateBorrowerInput } from '@loan-pilot/domain';
import { PrismaService } from '../prisma/prisma.service';

export type BorrowerWithLoanCount = Prisma.BorrowerGetPayload<{
  include: { _count: { select: { loans: true } } };
}>;

export type BorrowerWithLoans = Prisma.BorrowerGetPayload<{
  include: { loans: { include: { schedule: true } } };
}>;

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
          address: input.address,
          employer: input.employer,
          occupation: input.occupation,
          monthlyIncome: toCents(input.monthlyIncome),
          employmentType: input.employmentType,
          bank: input.bank,
          accountType: input.accountType,
        },
      });
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        throw new ConflictException('A borrower with this ID number already exists');
      }
      throw error;
    }
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
