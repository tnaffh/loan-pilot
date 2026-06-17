import { Test } from '@nestjs/testing';
import { ExpenseKind, LoanStatus } from '@loan-pilot/domain';
import { StatsService } from './stats.service';
import { PrismaService } from '../prisma/prisma.service';

describe('StatsService.lenderSeries', () => {
  const loanFindMany = jest.fn();
  const paymentFindMany = jest.fn();
  const expenseFindMany = jest.fn();
  const loanGroupBy = jest.fn();
  const prismaMock = {
    loan: { findMany: loanFindMany, groupBy: loanGroupBy },
    payment: { findMany: paymentFindMany },
    expense: { findMany: expenseFindMany },
  };
  let service: StatsService;

  beforeEach(async () => {
    jest.resetAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [StatsService, { provide: PrismaService, useValue: prismaMock }],
    }).compile();
    service = moduleRef.get(StatsService);
  });

  it('buckets cash flows by month and ranks expense categories', async () => {
    loanFindMany.mockResolvedValue([
      { disbursedAt: new Date('2023-10-06'), principal: 100000 },
      { disbursedAt: new Date('2023-11-04'), principal: 50000 },
    ]);
    paymentFindMany.mockResolvedValue([
      { paidAt: new Date('2023-10-25'), amount: 131500 },
      { paidAt: new Date('2023-11-25'), amount: 65000 },
    ]);
    expenseFindMany.mockResolvedValue([
      { incurredAt: new Date('2023-10-01'), amount: 20000, kind: ExpenseKind.Expense, category: 'Rent' },
      { incurredAt: new Date('2023-10-01'), amount: 10000, kind: ExpenseKind.Expense, category: 'Airtime' },
      { incurredAt: new Date('2023-10-01'), amount: 5000, kind: ExpenseKind.Refund, category: 'Refund' },
    ]);
    loanGroupBy.mockResolvedValue([
      { status: LoanStatus.Settled, _count: 2 },
      { status: LoanStatus.Active, _count: 1 },
    ]);

    const series = await service.lenderSeries('tenant_1');

    expect(series.monthly).toEqual([
      { month: '2023-10', label: 'Oct 2023', disbursed: 100000, collected: 131500, expenses: 30000 },
      { month: '2023-11', label: 'Nov 2023', disbursed: 50000, collected: 65000, expenses: 0 },
    ]);
    // Refunds are excluded from the expense total and category ranking.
    expect(series.topExpenseCategories).toEqual([
      { category: 'Rent', amount: 20000 },
      { category: 'Airtime', amount: 10000 },
    ]);
    expect(series.statusMix).toEqual([
      { status: LoanStatus.Settled, count: 2 },
      { status: LoanStatus.Active, count: 1 },
    ]);
  });
});
