import { Injectable } from '@nestjs/common';
import type { Expense } from '@prisma/client';
import { ExpenseKind, toCents, type CreateExpenseInput } from '@loan-pilot/domain';
import { PrismaService } from '../prisma/prisma.service';

export interface ExpenseTotals {
  totalExpenses: number;
  totalDrawings: number;
  net: number;
}

@Injectable()
export class ExpensesService {
  constructor(private readonly prisma: PrismaService) {}

  /** List expenses/drawings for a tenant, most recent first; optionally by period. */
  findAllForTenant(tenantId: string, period?: string): Promise<Expense[]> {
    return this.prisma.expense.findMany({
      where: { tenantId, ...(period ? { period } : {}) },
      orderBy: [{ incurredAt: 'desc' }, { createdAt: 'desc' }],
    });
  }

  /** Totals for operating expenses and owner drawings (cents); net is total cash out. */
  async totals(tenantId: string): Promise<ExpenseTotals> {
    const [expenses, drawings] = await Promise.all([
      this.prisma.expense.aggregate({
        where: { tenantId, kind: ExpenseKind.Expense },
        _sum: { amount: true },
      }),
      this.prisma.expense.aggregate({
        where: { tenantId, kind: ExpenseKind.Drawing },
        _sum: { amount: true },
      }),
    ]);
    const totalExpenses = expenses._sum.amount ?? 0;
    const totalDrawings = drawings._sum.amount ?? 0;
    return { totalExpenses, totalDrawings, net: totalExpenses + totalDrawings };
  }

  /** Record an operating expense or owner drawing. `amount` arrives in major N$ units. */
  create(tenantId: string, input: CreateExpenseInput): Promise<Expense> {
    return this.prisma.expense.create({
      data: {
        tenant: { connect: { id: tenantId } },
        kind: input.kind,
        category: input.category,
        amount: toCents(input.amount),
        period: input.period || null,
        incurredAt: input.incurredAt ? new Date(input.incurredAt) : null,
        note: input.note || null,
      },
    });
  }
}
