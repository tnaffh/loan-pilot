import { Injectable } from '@nestjs/common';
import type { Income } from '@prisma/client';
import { toCents, type CreateIncomeInput } from '@loan-pilot/domain';
import { PrismaService } from '../prisma/prisma.service';

export interface IncomeTotals {
  total: number;
  count: number;
}

@Injectable()
export class IncomeService {
  constructor(private readonly prisma: PrismaService) {}

  /** List operational income for a tenant, most recent first; optionally by period. */
  findAllForTenant(tenantId: string, period?: string): Promise<Income[]> {
    return this.prisma.income.findMany({
      where: { tenantId, ...(period ? { period } : {}) },
      orderBy: [{ incurredAt: 'desc' }, { createdAt: 'desc' }],
    });
  }

  /** Total operational income (cents) and the number of entries. */
  async totals(tenantId: string): Promise<IncomeTotals> {
    const agg = await this.prisma.income.aggregate({
      where: { tenantId },
      _sum: { amount: true },
      _count: true,
    });
    return { total: agg._sum.amount ?? 0, count: agg._count };
  }

  /** Record operational income. `amount` arrives in major N$ units. */
  create(tenantId: string, input: CreateIncomeInput): Promise<Income> {
    return this.prisma.income.create({
      data: {
        tenant: { connect: { id: tenantId } },
        category: input.category,
        amount: toCents(input.amount),
        period: input.period || null,
        incurredAt: input.incurredAt ? new Date(input.incurredAt) : null,
        note: input.note || null,
      },
    });
  }
}
