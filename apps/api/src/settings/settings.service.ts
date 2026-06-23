import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { LoanProduct, Prisma, TenantSettings } from '@prisma/client';
import {
  MAX_MONTHLY_RATE,
  toCents,
  type FeeSettings,
  type FeeSettingsInput,
  type LoanProductInput,
  type LoanType,
  type UpdateLoanProductInput,
} from '@loan-pilot/domain';
import { PrismaService } from '../prisma/prisma.service';

/** A single calendar year's NAMFISA levy liability, for the annual remittance. */
export interface LevyYear {
  year: number;
  loanCount: number;
  levyCents: number;
  stampDutyCents: number;
}

export interface LevyReport {
  years: LevyYear[];
  totalLevyCents: number;
  totalStampDutyCents: number;
}

@Injectable()
export class SettingsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Fetch the tenant's fee settings, creating the default row on first access. */
  async getFeeSettings(tenantId: string): Promise<TenantSettings> {
    const existing = await this.prisma.tenantSettings.findUnique({ where: { tenantId } });
    return existing ?? this.prisma.tenantSettings.create({ data: { tenantId } });
  }

  /** Fee settings in the domain shape (cents + fractions) used by loan pricing. */
  async resolveFeeSettings(tenantId: string): Promise<FeeSettings> {
    const s = await this.getFeeSettings(tenantId);
    return {
      namfisaLevyRate: s.namfisaLevyRate,
      stampDutyCents: s.stampDuty,
      insuranceRate: s.insuranceRate,
      insuranceFlatCents: s.insuranceFlat,
      monthlyRate: s.monthlyRate,
    };
  }

  /** Update the tenant's fee settings. `stampDuty`/`insuranceFlat` arrive in major N$. */
  updateFeeSettings(tenantId: string, input: FeeSettingsInput): Promise<TenantSettings> {
    const data = {
      namfisaLevyRate: input.namfisaLevyRate,
      stampDuty: toCents(input.stampDuty),
      insuranceRate: input.insuranceRate,
      insuranceFlat: toCents(input.insuranceFlat),
      ...(input.monthlyRate !== undefined
        ? { monthlyRate: Math.min(Math.max(input.monthlyRate, 0), MAX_MONTHLY_RATE) }
        : {}),
    };
    return this.prisma.tenantSettings.upsert({
      where: { tenantId },
      update: data,
      create: { tenantId, ...data },
    });
  }

  /** Set the lender's opening/bank balance. `openingBalance` arrives in major N$. */
  updateOpeningBalance(tenantId: string, openingBalance: number): Promise<TenantSettings> {
    const data = { openingBalance: toCents(openingBalance) };
    return this.prisma.tenantSettings.upsert({
      where: { tenantId },
      update: data,
      create: { tenantId, ...data },
    });
  }

  listProducts(tenantId: string): Promise<LoanProduct[]> {
    return this.prisma.loanProduct.findMany({
      where: { tenantId },
      orderBy: [{ active: 'desc' }, { isDefault: 'desc' }, { createdAt: 'asc' }],
    });
  }

  async createProduct(tenantId: string, input: LoanProductInput): Promise<LoanProduct> {
    return this.prisma.$transaction(async (tx) => {
      if (input.isDefault) {
        await tx.loanProduct.updateMany({
          where: { tenantId, isDefault: true },
          data: { isDefault: false },
        });
      }
      return tx.loanProduct.create({
        data: {
          tenantId,
          name: input.name,
          loanType: input.loanType ?? null,
          interestRate: input.interestRate,
          active: input.active ?? true,
          isDefault: input.isDefault ?? false,
        },
      });
    });
  }

  async updateProduct(
    tenantId: string,
    id: string,
    input: UpdateLoanProductInput,
  ): Promise<LoanProduct> {
    return this.prisma.$transaction(async (tx) => {
      const product = await tx.loanProduct.findFirst({ where: { id, tenantId } });
      if (!product) {
        throw new NotFoundException('Product not found');
      }
      if (input.isDefault) {
        await tx.loanProduct.updateMany({
          where: { tenantId, isDefault: true, id: { not: id } },
          data: { isDefault: false },
        });
      }
      const data: Prisma.LoanProductUpdateInput = {};
      if (input.name !== undefined) data.name = input.name;
      if (input.loanType !== undefined) data.loanType = input.loanType ?? null;
      if (input.interestRate !== undefined) data.interestRate = input.interestRate;
      if (input.active !== undefined) data.active = input.active;
      if (input.isDefault !== undefined) data.isDefault = input.isDefault;
      return tx.loanProduct.update({ where: { id }, data });
    });
  }

  async deleteProduct(tenantId: string, id: string): Promise<{ ok: true }> {
    const product = await this.prisma.loanProduct.findFirst({
      where: { id, tenantId },
      include: { _count: { select: { loans: true } } },
    });
    if (!product) {
      throw new NotFoundException('Product not found');
    }
    if (product._count.loans > 0) {
      throw new BadRequestException(
        'This product has loans priced from it — deactivate it instead of deleting',
      );
    }
    await this.prisma.loanProduct.delete({ where: { id } });
    return { ok: true };
  }

  /**
   * Resolve the rate plan for a new loan: the explicitly chosen product (must be
   * active), otherwise the tenant's default active product, otherwise null (the
   * caller falls back to the loan type's standard rate).
   */
  async resolveProduct(
    tenantId: string,
    productId?: string,
    loanType?: LoanType,
  ): Promise<LoanProduct | null> {
    if (productId) {
      const product = await this.prisma.loanProduct.findFirst({ where: { id: productId, tenantId } });
      if (!product) {
        throw new NotFoundException('Selected product not found');
      }
      if (!product.active) {
        throw new BadRequestException('Selected product is inactive');
      }
      return product;
    }
    return this.prisma.loanProduct.findFirst({
      where: {
        tenantId,
        active: true,
        isDefault: true,
        ...(loanType ? { OR: [{ loanType }, { loanType: null }] } : {}),
      },
      // Prefer a type-specific default over an "any-type" one.
      orderBy: { loanType: { sort: 'desc', nulls: 'last' } },
    });
  }

  /**
   * NAMFISA levies (and stamp duty) collected per calendar year, for the annual
   * remittance. Cancelled loans never advanced funds, so they are excluded.
   */
  async leviesReport(tenantId: string): Promise<LevyReport> {
    const loans = await this.prisma.loan.findMany({
      where: { tenantId, status: { not: 'cancelled' }, namfisaLevy: { gt: 0 } },
      select: { namfisaLevy: true, stampDuty: true, disbursedAt: true, createdAt: true },
    });

    const byYear = new Map<number, LevyYear>();
    for (const loan of loans) {
      const year = (loan.disbursedAt ?? loan.createdAt).getFullYear();
      const bucket = byYear.get(year) ?? { year, loanCount: 0, levyCents: 0, stampDutyCents: 0 };
      bucket.loanCount += 1;
      bucket.levyCents += loan.namfisaLevy;
      bucket.stampDutyCents += loan.stampDuty;
      byYear.set(year, bucket);
    }

    const years = [...byYear.values()].sort((a, b) => b.year - a.year);
    return {
      years,
      totalLevyCents: years.reduce((sum, y) => sum + y.levyCents, 0),
      totalStampDutyCents: years.reduce((sum, y) => sum + y.stampDutyCents, 0),
    };
  }
}
