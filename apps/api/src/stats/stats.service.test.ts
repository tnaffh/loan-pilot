import { Test } from '@nestjs/testing';
import {
  ExpenseKind,
  LoanStatus,
  SYSTEM_ROLE_PERMISSIONS,
  UserRole,
  type SessionUser,
} from '@loan-pilot/domain';
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
      { incurredAt: new Date('2023-10-01'), amount: 5000, kind: ExpenseKind.Drawing, category: 'Investment Cash-out' },
    ]);
    loanGroupBy.mockResolvedValue([
      { status: LoanStatus.Settled, _count: 2 },
      { status: LoanStatus.Active, _count: 1 },
    ]);

    const series = await service.lenderSeries('tenant_1', true);

    expect(series.monthly).toEqual([
      { month: '2023-10', label: 'Oct 2023', disbursed: 100000, collected: 131500, expenses: 30000 },
      { month: '2023-11', label: 'Nov 2023', disbursed: 50000, collected: 65000, expenses: 0 },
    ]);
    // Drawings are excluded from the expense total and category ranking.
    expect(series.topExpenseCategories).toEqual([
      { category: 'Rent', amount: 20000 },
      { category: 'Airtime', amount: 10000 },
    ]);
    expect(series.statusMix).toEqual([
      { status: LoanStatus.Settled, count: 2 },
      { status: LoanStatus.Active, count: 1 },
    ]);
  });

  it('strips the sensitive cash-flow series for non-admins, keeping status mix', async () => {
    loanFindMany.mockResolvedValue([{ disbursedAt: new Date('2023-10-06'), principal: 100000 }]);
    paymentFindMany.mockResolvedValue([{ paidAt: new Date('2023-10-25'), amount: 131500 }]);
    expenseFindMany.mockResolvedValue([
      { incurredAt: new Date('2023-10-01'), amount: 20000, kind: ExpenseKind.Expense, category: 'Rent' },
    ]);
    loanGroupBy.mockResolvedValue([{ status: LoanStatus.Active, _count: 1 }]);

    const series = await service.lenderSeries('tenant_1', false);

    expect(series.monthly).toEqual([]);
    expect(series.topExpenseCategories).toEqual([]);
    expect(series.statusMix).toEqual([{ status: LoanStatus.Active, count: 1 }]);
  });
});

describe('StatsService.lenderOverview', () => {
  const loanAggregate = jest.fn();
  const prismaMock = {
    loan: { aggregate: loanAggregate },
    loanApplication: { count: jest.fn().mockResolvedValue(0) },
    borrower: { count: jest.fn().mockResolvedValue(0) },
    payment: { aggregate: jest.fn() },
    expense: { groupBy: jest.fn() },
    investment: { aggregate: jest.fn() },
    income: { aggregate: jest.fn() },
    tenantSettings: { findUnique: jest.fn() },
  };
  let service: StatsService;

  const admin: SessionUser = {
    id: 'u1',
    email: 'a@rfs.na',
    name: 'Admin',
    role: UserRole.LenderAdmin,
    tenantId: 'tenant_1',
    tenantSlug: 'rfs',
    roleId: 'role_admin',
    permissions: [...SYSTEM_ROLE_PERMISSIONS.administrator],
  };
  const staff: SessionUser = {
    ...admin,
    id: 'u2',
    role: UserRole.LenderStaff,
    roleId: 'role_staff',
    permissions: [...SYSTEM_ROLE_PERMISSIONS.staff],
  };

  const seedOverviewMocks = (): void => {
    loanAggregate
      .mockResolvedValueOnce({ _sum: { balance: 200000 }, _count: 3 }) // book
      .mockResolvedValueOnce({ _sum: { balance: 50000 }, _count: 1 }) // arrears
      .mockResolvedValueOnce({ _sum: { principal: 600000 } }); // disbursed
    prismaMock.payment.aggregate.mockResolvedValue({ _sum: { amount: 300000 } });
    prismaMock.expense.groupBy.mockResolvedValue([
      { kind: ExpenseKind.Expense, _sum: { amount: 50000 } },
      { kind: ExpenseKind.Drawing, _sum: { amount: 30000 } },
    ]);
    prismaMock.investment.aggregate.mockResolvedValue({ _sum: { amount: 500000 } });
    prismaMock.income.aggregate.mockResolvedValue({ _sum: { amount: 20000 } });
    prismaMock.tenantSettings.findUnique.mockResolvedValue({ openingBalance: 100000 });
  };

  beforeEach(async () => {
    jest.resetAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [StatsService, { provide: PrismaService, useValue: prismaMock }],
    }).compile();
    service = moduleRef.get(StatsService);
  });

  it('computes available balance from opening balance + flows for admins', async () => {
    seedOverviewMocks();

    const overview = await service.overview(admin);
    if (overview.kind !== 'lender') throw new Error('expected lender overview');

    // 100000 + 500000 + 300000 + 20000 − 600000 − 50000 − 30000 = 240000
    expect(overview.availableBalance).toBe(240000);
    expect(overview.income).toBe(20000);
    expect(overview.openingBalance).toBe(100000);
  });

  it('omits sensitive financials for staff, keeping operational figures', async () => {
    seedOverviewMocks();

    const overview = await service.overview(staff);
    if (overview.kind !== 'lender') throw new Error('expected lender overview');

    // Operational figures stay.
    expect(overview.activeLoans).toBe(3);
    expect(overview.bookValue).toBe(200000);
    expect(overview.arrearsValue).toBe(50000);
    // Sensitive financials are stripped.
    expect(overview.availableBalance).toBeUndefined();
    expect(overview.netProfit).toBeUndefined();
    expect(overview.invested).toBeUndefined();
    expect(overview.expenses).toBeUndefined();
    expect(overview.openingBalance).toBeUndefined();
  });
});
