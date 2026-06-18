import { Injectable } from '@nestjs/common';
import type { Investment } from '@prisma/client';
import { toCents, type CreateInvestmentInput } from '@loan-pilot/domain';
import { PrismaService } from '../prisma/prisma.service';

export interface InvestmentTotals {
  total: number;
  count: number;
}

@Injectable()
export class InvestmentsService {
  constructor(private readonly prisma: PrismaService) {}

  /** List capital injections for a tenant, most recent first. */
  findAllForTenant(tenantId: string): Promise<Investment[]> {
    return this.prisma.investment.findMany({
      where: { tenantId },
      orderBy: [{ contributedAt: 'desc' }, { createdAt: 'desc' }],
    });
  }

  /** Total capital invested (cents) and the number of contributions. */
  async totals(tenantId: string): Promise<InvestmentTotals> {
    const agg = await this.prisma.investment.aggregate({
      where: { tenantId },
      _sum: { amount: true },
      _count: true,
    });
    return { total: agg._sum.amount ?? 0, count: agg._count };
  }

  /** Record a capital injection. `amount` arrives in major N$ units. */
  create(tenantId: string, input: CreateInvestmentInput): Promise<Investment> {
    return this.prisma.investment.create({
      data: {
        tenant: { connect: { id: tenantId } },
        name: input.name,
        amount: toCents(input.amount),
        period: input.period || null,
        contributedAt: input.contributedAt ? new Date(input.contributedAt) : null,
        note: input.note || null,
      },
    });
  }
}
