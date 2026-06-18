import { Test } from '@nestjs/testing';
import { ExpenseKind, type CreateExpenseInput } from '@loan-pilot/domain';
import { ExpensesService } from './expenses.service';
import { PrismaService } from '../prisma/prisma.service';

describe('ExpensesService', () => {
  const create = jest.fn();
  const aggregate = jest.fn();
  const prismaMock = { expense: { create, aggregate, findMany: jest.fn() } };
  let service: ExpensesService;

  beforeEach(async () => {
    jest.resetAllMocks();
    create.mockImplementation((args: { data: Record<string, unknown> }) =>
      Promise.resolve({ id: 'exp_1', ...args.data }),
    );
    const moduleRef = await Test.createTestingModule({
      providers: [ExpensesService, { provide: PrismaService, useValue: prismaMock }],
    }).compile();
    service = moduleRef.get(ExpensesService);
  });

  const input: CreateExpenseInput = {
    kind: ExpenseKind.Expense,
    category: 'Office Rent',
    amount: 4100,
    period: 'May 2026',
    incurredAt: '2026-05-01',
  };

  it('stores the amount in cents and connects the tenant', async () => {
    await service.create('tenant_1', input);

    const data = create.mock.calls[0][0].data;
    expect(data.amount).toBe(410000); // N$ 4,100
    expect(data.tenant.connect.id).toBe('tenant_1');
    expect(data.category).toBe('Office Rent');
  });

  it('sums operating expenses and drawings into total cash out', async () => {
    aggregate
      .mockResolvedValueOnce({ _sum: { amount: 500000 } }) // expenses
      .mockResolvedValueOnce({ _sum: { amount: 120000 } }); // drawings

    const totals = await service.totals('tenant_1');

    expect(totals).toEqual({ totalExpenses: 500000, totalDrawings: 120000, net: 620000 });
  });
});
