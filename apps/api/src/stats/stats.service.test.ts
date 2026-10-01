import { Test } from '@nestjs/testing';
import {
  ExpenseKind,
  LoanStatus,
  PaymentMethod,
  RepaymentStatus,
  SYSTEM_ROLE_PERMISSIONS,
  UserRole,
  type SessionUser,
} from '@loan-pilot/domain';
import { StatsService } from './stats.service';
import { PrismaService } from '../prisma/prisma.service';

const utc = (iso: string): Date => new Date(`${iso}T00:00:00.000Z`);

/** A loan as the stats ledger query selects it. */
const loanRow = (over: Record<string, unknown> = {}) => ({
  id: 'loan_1',
  borrowerId: 'borrower_1',
  status: LoanStatus.Active,
  total: 131_500,
  principal: 100_000,
  financeCharge: 30_000,
  instalmentsTotal: 1,
  disbursedAt: utc('2023-10-06'),
  closedAt: null,
  ...over,
});

const admin: SessionUser = {
  id: 'u1',
  email: 'a@rfs.na',
  phone: null,
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

describe('StatsService', () => {
  const loanFindMany = jest.fn();
  const loanAggregate = jest.fn();
  const loanGroupBy = jest.fn();
  const paymentFindMany = jest.fn();
  const scheduleFindMany = jest.fn();
  const expenseFindMany = jest.fn();
  const expenseGroupBy = jest.fn();
  const prismaMock = {
    loan: { findMany: loanFindMany, aggregate: loanAggregate, groupBy: loanGroupBy },
    payment: { findMany: paymentFindMany },
    repaymentScheduleItem: { findMany: scheduleFindMany },
    expense: { findMany: expenseFindMany, groupBy: expenseGroupBy },
    loanApplication: { count: jest.fn().mockResolvedValue(0) },
    borrower: { count: jest.fn().mockResolvedValue(0) },
    investment: { aggregate: jest.fn() },
    income: { aggregate: jest.fn() },
    tenantSettings: { findUnique: jest.fn() },
  };
  let service: StatsService;

  beforeEach(async () => {
    jest.resetAllMocks();
    loanFindMany.mockResolvedValue([loanRow()]);
    paymentFindMany.mockResolvedValue([]);
    scheduleFindMany.mockResolvedValue([]);
    expenseFindMany.mockResolvedValue([]);
    expenseGroupBy.mockResolvedValue([]);
    loanGroupBy.mockResolvedValue([]);
    prismaMock.loanApplication.count.mockResolvedValue(0);
    prismaMock.borrower.count.mockResolvedValue(0);
    prismaMock.investment.aggregate.mockResolvedValue({ _sum: { amount: 0 } });
    prismaMock.income.aggregate.mockResolvedValue({ _sum: { amount: 0 } });
    prismaMock.tenantSettings.findUnique.mockResolvedValue({ openingBalance: 0 });
    loanAggregate
      .mockResolvedValueOnce({ _sum: { balance: 200_000 }, _count: 3 }) // book
      .mockResolvedValueOnce({ _sum: { balance: 50_000 }, _count: 1 }); // arrears
    const moduleRef = await Test.createTestingModule({
      providers: [StatsService, { provide: PrismaService, useValue: prismaMock }],
    }).compile();
    service = moduleRef.get(StatsService);
  });

  describe('lenderSeries', () => {
    it('buckets cash flows by month and ranks expense categories', async () => {
      loanFindMany.mockResolvedValue([
        loanRow({ id: 'loan_1', disbursedAt: utc('2023-10-06'), principal: 100_000 }),
        loanRow({ id: 'loan_2', disbursedAt: utc('2023-11-04'), principal: 50_000 }),
      ]);
      paymentFindMany.mockResolvedValue([
        {
          loanId: 'loan_1',
          paidAt: utc('2023-10-25'),
          amount: 131_500,
          method: PaymentMethod.Cash,
        },
        { loanId: 'loan_2', paidAt: utc('2023-11-25'), amount: 65_000, method: PaymentMethod.Cash },
      ]);
      expenseFindMany.mockResolvedValue([
        {
          incurredAt: utc('2023-10-01'),
          amount: 20_000,
          kind: ExpenseKind.Expense,
          category: 'Rent',
        },
        {
          incurredAt: utc('2023-10-01'),
          amount: 10_000,
          kind: ExpenseKind.Expense,
          category: 'Airtime',
        },
        {
          incurredAt: utc('2023-10-01'),
          amount: 5_000,
          kind: ExpenseKind.Drawing,
          category: 'Investment Cash-out',
        },
      ]);
      loanGroupBy.mockResolvedValue([
        { status: LoanStatus.Settled, _count: 2 },
        { status: LoanStatus.Active, _count: 1 },
      ]);

      const series = await service.lenderSeries('tenant_1', true);

      expect(series.monthly).toEqual([
        {
          month: '2023-10',
          label: 'Oct 2023',
          disbursed: 100_000,
          collected: 131_500,
          expenses: 30_000,
        },
        { month: '2023-11', label: 'Nov 2023', disbursed: 50_000, collected: 65_000, expenses: 0 },
      ]);
      // Drawings are excluded from the expense total and category ranking.
      expect(series.topExpenseCategories).toEqual([
        { category: 'Rent', amount: 20_000 },
        { category: 'Airtime', amount: 10_000 },
      ]);
      expect(series.statusMix).toEqual([
        { status: LoanStatus.Settled, count: 2 },
        { status: LoanStatus.Active, count: 1 },
      ]);
    });

    it('counts a repayment recorded as a paid instalment, and ignores cancelled loans', async () => {
      loanFindMany.mockResolvedValue([
        loanRow({ id: 'loan_1', disbursedAt: utc('2023-10-06'), principal: 100_000 }),
        loanRow({
          id: 'loan_2',
          disbursedAt: utc('2023-10-20'),
          principal: 999_000,
          status: LoanStatus.Cancelled,
        }),
      ]);
      scheduleFindMany.mockResolvedValue([
        {
          loanId: 'loan_1',
          amount: 131_500,
          paidAt: utc('2023-10-25'),
          status: RepaymentStatus.Paid,
        },
      ]);

      const series = await service.lenderSeries('tenant_1', true);

      expect(series.monthly).toEqual([
        {
          month: '2023-10',
          label: 'Oct 2023',
          disbursed: 100_000,
          collected: 131_500,
          expenses: 0,
        },
      ]);
    });

    it('drops months that have not happened yet', async () => {
      loanFindMany.mockResolvedValue([
        loanRow({ id: 'loan_1', disbursedAt: utc('2023-10-06') }),
        loanRow({ id: 'loan_2', disbursedAt: utc('2099-01-06') }),
      ]);
      const series = await service.lenderSeries('tenant_1', true);
      expect(series.monthly.map((point) => point.month)).toEqual(['2023-10']);
    });

    it('strips the sensitive cash-flow series for non-admins, keeping status mix', async () => {
      loanGroupBy.mockResolvedValue([{ status: LoanStatus.Active, _count: 1 }]);

      const series = await service.lenderSeries('tenant_1', false);

      expect(series.monthly).toEqual([]);
      expect(series.topExpenseCategories).toEqual([]);
      expect(series.statusMix).toEqual([{ status: LoanStatus.Active, count: 1 }]);
    });
  });

  describe('lenderOverview', () => {
    const seedCashMocks = (): void => {
      loanFindMany.mockResolvedValue([
        loanRow({ id: 'loan_1', principal: 600_000, total: 780_000 }),
        // Cancelled in error: never paid out, so not part of "disbursed".
        loanRow({ id: 'loan_2', principal: 250_000, status: LoanStatus.Cancelled }),
      ]);
      paymentFindMany.mockResolvedValue([
        {
          loanId: 'loan_1',
          paidAt: utc('2023-10-25'),
          amount: 300_000,
          method: PaymentMethod.Cash,
        },
      ]);
      expenseGroupBy.mockResolvedValue([
        { kind: ExpenseKind.Expense, _sum: { amount: 50_000 } },
        { kind: ExpenseKind.Drawing, _sum: { amount: 30_000 } },
      ]);
      prismaMock.investment.aggregate.mockResolvedValue({ _sum: { amount: 500_000 } });
      prismaMock.income.aggregate.mockResolvedValue({ _sum: { amount: 20_000 } });
      prismaMock.tenantSettings.findUnique.mockResolvedValue({ openingBalance: 100_000 });
    };

    it('computes available balance from opening balance + flows for admins', async () => {
      seedCashMocks();

      const overview = await service.overview(admin);
      if (overview.kind !== 'lender') throw new Error('expected lender overview');

      expect(overview.disbursed).toBe(600_000);
      expect(overview.collected).toBe(300_000);
      // 100000 + 500000 + 300000 + 20000 − 600000 − 50000 − 30000 = 240000
      expect(overview.availableBalance).toBe(240_000);
      expect(overview.netProfit).toBe(300_000 - 600_000 - 50_000);
      expect(overview.income).toBe(20_000);
      expect(overview.openingBalance).toBe(100_000);
    });

    it('counts a repayment recorded as a paid instalment as collected cash', async () => {
      seedCashMocks();
      scheduleFindMany.mockResolvedValue([
        {
          loanId: 'loan_1',
          amount: 80_000,
          paidAt: utc('2023-11-25'),
          status: RepaymentStatus.Paid,
        },
      ]);

      const overview = await service.overview(admin);
      if (overview.kind !== 'lender') throw new Error('expected lender overview');

      expect(overview.collected).toBe(380_000);
      expect(overview.availableBalance).toBe(320_000);
    });

    it('measures the book over every open status, partly paid included', async () => {
      seedCashMocks();
      await service.overview(admin);

      expect(loanAggregate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: { in: expect.arrayContaining([LoanStatus.PartlyPaid, LoanStatus.Arrears]) },
          }),
        }),
      );
    });

    it('omits sensitive financials for staff, keeping operational figures', async () => {
      seedCashMocks();

      const overview = await service.overview(staff);
      if (overview.kind !== 'lender') throw new Error('expected lender overview');

      // Operational figures stay.
      expect(overview.activeLoans).toBe(3);
      expect(overview.bookValue).toBe(200_000);
      expect(overview.arrearsValue).toBe(50_000);
      // Sensitive financials are stripped.
      expect(overview.availableBalance).toBeUndefined();
      expect(overview.netProfit).toBeUndefined();
      expect(overview.invested).toBeUndefined();
      expect(overview.expenses).toBeUndefined();
      expect(overview.openingBalance).toBeUndefined();
    });
  });
});
