import { Test } from '@nestjs/testing';
import {
  ExpenseKind,
  LoanPurpose,
  LoanStatus,
  LoanType,
  PaymentMethod,
  RepaymentStatus,
} from '@loan-pilot/domain';
import { ReportsService } from './reports.service';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { StorageService } from '../documents/storage.service';

const utc = (iso: string): Date => new Date(`${iso}T00:00:00.000Z`);

/** A loan as the report query selects it. */
const loanRow = (over: Record<string, unknown> = {}) => ({
  id: 'loan_1',
  borrowerId: 'borrower_1',
  status: LoanStatus.Active,
  type: LoanType.Payday,
  principal: 500_000, // N$5,000
  financeCharge: 150_000,
  total: 650_000,
  termMonths: 1,
  instalmentsTotal: 1,
  instalment: 650_000,
  interestRate: 0.3,
  namfisaLevy: 5_150,
  stampDuty: 500,
  insurance: 0,
  bankCharges: 0,
  balance: 650_000,
  purpose: null,
  collateral: null,
  collateralItem: null,
  disbursedAt: utc('2026-02-10'),
  closedAt: null,
  borrower: {
    id: 'borrower_1',
    firstName: 'Aina',
    lastName: 'Shikongo',
    idNumber: '90010112345',
    phone: '0811234567',
    gender: 'Female',
    monthlyIncome: 2_100_000, // N$21,000
    collexiaClientNo: '294',
  },
  ...over,
});

/** A dated money row, as the finance tables store them (`at` null = undated). */
interface FlowRow {
  readonly at: Date | null;
  readonly amount: number;
  readonly kind?: ExpenseKind;
  readonly category?: string;
}

interface PaymentRowMock {
  readonly loanId: string;
  readonly paidAt: Date;
  readonly amount: number;
  readonly method: PaymentMethod;
}

const isDateWindow = (value: unknown): value is { gte?: Date; lt?: Date } =>
  typeof value === 'object' && value !== null;

/** Does a row's date satisfy a Prisma date filter: absent, `null`, or `{ gte?, lt? }`? */
const inWindow = (at: Date | null, filter: unknown): boolean => {
  if (filter === undefined) return true;
  if (filter === null) return at === null;
  if (at === null || !isDateWindow(filter)) return false;
  return (
    (!(filter.gte instanceof Date) || at >= filter.gte) &&
    (!(filter.lt instanceof Date) || at < filter.lt)
  );
};

const sumRows = (rows: readonly FlowRow[]): number =>
  rows.reduce((sum, row) => sum + row.amount, 0);

describe('ReportsService', () => {
  const loanFindMany = jest.fn();
  const paymentFindMany = jest.fn();
  const scheduleFindMany = jest.fn();
  const returnFindUnique = jest.fn();
  const returnUpsert = jest.fn();
  const incomeAggregate = jest.fn();
  const expenseGroupBy = jest.fn();
  const investmentAggregate = jest.fn();

  const prismaMock = {
    loan: { findMany: loanFindMany },
    payment: { findMany: paymentFindMany },
    repaymentScheduleItem: { findMany: scheduleFindMany },
    regulatoryReturn: { findUnique: returnFindUnique, upsert: returnUpsert },
    income: { aggregate: incomeAggregate },
    expense: { groupBy: expenseGroupBy },
    investment: { aggregate: investmentAggregate },
    tenantSettings: { findUnique: jest.fn().mockResolvedValue({ openingBalance: 0 }) },
    tenant: { findUnique: jest.fn().mockResolvedValue({ logoUrl: null }) },
  };

  // The finance tables and payments are mocked as rows so that every window the
  // service asks for (this month, before it, undated, everything) answers from
  // the same data — the monthly report's roll-forward depends on that.
  const flows: { expenses: FlowRow[]; investments: FlowRow[]; income: FlowRow[] } = {
    expenses: [],
    investments: [],
    income: [],
  };
  const paymentRows: PaymentRowMock[] = [];

  const aggregateOf =
    (rows: readonly FlowRow[], field: string) =>
    async (args: { where: Record<string, unknown> }) => {
      const matched = rows.filter((row) => inWindow(row.at, args.where[field]));
      return { _sum: { amount: sumRows(matched) }, _count: matched.length };
    };
  const groupExpenses = async (args: {
    by: readonly string[];
    where: { incurredAt?: unknown; kind?: unknown };
  }) => {
    const matched = flows.expenses.filter(
      (row) =>
        inWindow(row.at, args.where.incurredAt) &&
        (args.where.kind === undefined || row.kind === args.where.kind),
    );
    const byCategory = args.by.includes('category');
    const groups = new Map<string, FlowRow[]>();
    for (const row of matched) {
      const key = (byCategory ? row.category : row.kind) ?? '';
      groups.set(key, [...(groups.get(key) ?? []), row]);
    }
    return [...groups.entries()].map(([key, rows]) =>
      byCategory
        ? { category: key, _sum: { amount: sumRows(rows) }, _count: rows.length }
        : { kind: key, _sum: { amount: sumRows(rows) }, _count: rows.length },
    );
  };

  const settingsMock = {
    getLenderIdentity: jest.fn().mockResolvedValue({
      name: 'Racoons Financial Services CC',
      legalName: 'Racoons Financial Services CC',
      namfisaLicenceNo: '25/11/1471',
      registrationNo: null,
      physicalAddress: null,
      postalAddress: null,
      contactPhone: null,
      contactEmail: null,
      town: 'Windhoek',
      logoUrl: null,
    }),
  };

  let service: ReportsService;

  beforeEach(async () => {
    jest.clearAllMocks();
    flows.expenses.length = 0;
    flows.investments.length = 0;
    flows.income.length = 0;
    paymentRows.length = 0;
    loanFindMany.mockResolvedValue([loanRow()]);
    // Honour a `paidAt` filter if the service passes one, so a test can tell a
    // windowed load from a full one.
    paymentFindMany.mockImplementation(async (args: { where: { paidAt?: unknown } }) =>
      paymentRows.filter((row) => inWindow(row.paidAt, args.where.paidAt)),
    );
    scheduleFindMany.mockResolvedValue([]);
    returnFindUnique.mockResolvedValue(null);
    incomeAggregate.mockImplementation(aggregateOf(flows.income, 'incurredAt'));
    expenseGroupBy.mockImplementation(groupExpenses);
    investmentAggregate.mockImplementation(aggregateOf(flows.investments, 'contributedAt'));
    prismaMock.tenantSettings.findUnique.mockResolvedValue({ openingBalance: 0 });

    const moduleRef = await Test.createTestingModule({
      providers: [
        ReportsService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: SettingsService, useValue: settingsMock },
        { provide: StorageService, useValue: { read: jest.fn() } },
      ],
    }).compile();
    service = moduleRef.get(ReportsService);
  });

  describe('periods', () => {
    it('offers only periods with activity, newest first, plus the current one', async () => {
      const now = new Date();
      const currentMonth = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
      loanFindMany.mockResolvedValue([
        { disbursedAt: utc('2026-02-10') },
        { disbursedAt: utc('2026-02-20') },
        { disbursedAt: utc('2025-11-05') },
      ]);
      paymentFindMany.mockResolvedValue([{ paidAt: utc('2026-03-01') }]);

      const { months, quarters } = await service.periods('tenant_1');
      const monthKeys = months.map((month) => month.key);

      expect(monthKeys).toContain('2026-02');
      expect(monthKeys).toContain('2026-03');
      expect(monthKeys).toContain('2025-11');
      expect(monthKeys).toContain(currentMonth);
      // No contiguous filling — a month nobody transacted in is not offered.
      expect(monthKeys).not.toContain('2025-12');
      expect(monthKeys).not.toContain('2026-01');
      expect([...monthKeys].sort((a, b) => b.localeCompare(a))).toEqual(monthKeys);
      expect(quarters.map((quarter) => quarter.key)).toEqual(
        expect.arrayContaining(['2026-Q1', '2025-Q4']),
      );
    });

    it('drops mis-parsed future dates rather than defaulting the picker to them', async () => {
      // The imported register carries a stray 2029 disbursement date.
      loanFindMany.mockResolvedValue([
        { disbursedAt: utc('2029-02-10') },
        { disbursedAt: utc('2026-02-10') },
      ]);
      paymentFindMany.mockResolvedValue([]);

      const { months, quarters } = await service.periods('tenant_1');

      expect(months.map((month) => month.key)).not.toContain('2029-02');
      expect(quarters.map((quarter) => quarter.key)).not.toContain('2029-Q1');
      // The newest offered period is the current one, which is what the UI defaults to.
      const now = new Date();
      expect(months[0]?.key).toBe(
        `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`,
      );
    });

    it('still offers the current period for a tenant with no activity at all', async () => {
      loanFindMany.mockResolvedValue([]);
      paymentFindMany.mockResolvedValue([]);
      const { months, quarters } = await service.periods('tenant_1');
      expect(months).toHaveLength(1);
      expect(quarters).toHaveLength(1);
    });
  });

  describe('quarterly', () => {
    it('derives the fee lines the lender files, at the configured levy rate', async () => {
      const report = await service.quarterly('tenant_1', '2026-Q1');

      expect(report.financial.disbursedTotal).toBe(500_000);
      expect(report.financial.feesCharged.namfisaLevies).toBe(5_150);
      expect(report.financial.feesCharged.stampDuties).toBe(500);
      expect(report.financial.feesCharged.total).toBe(5_650);
      // Part 1.1's NAMFISA levy carries the same figure as Part 14's.
      expect(report.liabilities.namfisaLevy).toBe(report.financial.feesCharged.namfisaLevies);
    });

    it('reports the period, its last day and the filing deadline', async () => {
      const report = await service.quarterly('tenant_1', '2026-Q1');
      expect(report.period.startDate).toBe('2026-01-01');
      expect(report.period.endDate).toBe('2026-03-31');
      expect(report.period.dueDate).toBe('2026-04-30');
    });

    it('bands loans by loan size and salaries by salary size', async () => {
      const report = await service.quarterly('tenant_1', '2026-Q1');

      // A N$5,000 loan to a borrower earning N$21,000: different bands.
      expect(report.valueMatrices.loansByGender.female.bands.to10k).toBe(500_000);
      expect(report.valueMatrices.salariesByGender.female.bands.to30k).toBe(2_100_000);
      expect(report.valueMatrices.loansByGender.total.total).toBe(500_000);
    });

    it('counts one salary row per borrower, not one per loan', async () => {
      // Two loans to the same borrower: two loan rows, one salary row.
      loanFindMany.mockResolvedValue([
        loanRow(),
        loanRow({ id: 'loan_2', disbursedAt: utc('2026-03-01') }),
      ]);

      const report = await service.quarterly('tenant_1', '2026-Q1');

      expect(report.countMatrices.loansByGender.total.total).toBe(2);
      expect(report.countMatrices.salariesByGender.total.total).toBe(1);
      expect(report.nonFinancial.loansDisbursed).toBe(2);
      expect(report.nonFinancial.debtorsOutstanding).toBe(1);
    });

    it('keeps borrowers with no gender out of the male and female columns', async () => {
      loanFindMany.mockResolvedValue([
        loanRow({ borrower: { ...loanRow().borrower, gender: null } }),
      ]);

      const report = await service.quarterly('tenant_1', '2026-Q1');

      expect(report.valueMatrices.loansByGender.unknown.total).toBe(500_000);
      expect(report.valueMatrices.loansByGender.male.total).toBe(0);
      expect(report.valueMatrices.loansByGender.female.total).toBe(0);
      expect(report.coverage.loansMissingGender).toBe(1);
      expect(report.warnings.map((warning) => warning.code)).toContain('gender_coverage');
    });

    it('buckets disbursements by term and reconciles to the total', async () => {
      loanFindMany.mockResolvedValue([
        loanRow(),
        loanRow({ id: 'loan_2', termMonths: 2, instalmentsTotal: 2, principal: 300_000 }),
      ]);

      const report = await service.quarterly('tenant_1', '2026-Q1');
      const byTerm = report.financial.disbursementsByTerm;

      expect(byTerm.find((bucket) => bucket.key === 'm1')?.value).toBe(500_000);
      expect(byTerm.find((bucket) => bucket.key === 'm2')?.value).toBe(300_000);
      expect(byTerm.reduce((sum, bucket) => sum + bucket.value, 0)).toBe(
        report.financial.disbursedTotal,
      );
    });

    it('splits repayments by collection method and sums back to the total', async () => {
      paymentFindMany.mockResolvedValue([
        { loanId: 'loan_1', paidAt: utc('2026-02-20'), amount: 100_000, method: PaymentMethod.Payroll },
        { loanId: 'loan_1', paidAt: utc('2026-02-21'), amount: 200_000, method: PaymentMethod.DebitOrder },
        { loanId: 'loan_1', paidAt: utc('2026-02-22'), amount: 50_000, method: PaymentMethod.Cash },
        { loanId: 'loan_1', paidAt: utc('2026-02-23'), amount: 25_000, method: PaymentMethod.Eft },
      ]);

      const { repayments } = (await service.quarterly('tenant_1', '2026-Q1')).financial;

      expect(repayments.payroll).toBe(100_000);
      expect(repayments.debitOrder).toBe(200_000);
      expect(repayments.cash).toBe(50_000);
      expect(repayments.other).toBe(25_000);
      expect(repayments.total).toBe(375_000);
    });

    it('makes the closing ageing add up to the closing book value', async () => {
      const report = await service.quarterly('tenant_1', '2026-Q1');
      const aged = report.financial.ageing.reduce((sum, bucket) => sum + bucket.value, 0);
      expect(aged).toBe(report.financial.closingBookValue);
    });

    it('classifies a payday loan as consumption and unsecured, like the filed return', async () => {
      const report = await service.quarterly('tenant_1', '2026-Q1');

      expect(
        report.nonFinancial.loansByPurpose.find((row) => row.key === LoanPurpose.Consumption)?.value,
      ).toBe(1);
      expect(report.nonFinancial.security).toEqual({ secured: 0, unsecured: 1 });
    });

    it('treats a collateral loan as secured', async () => {
      loanFindMany.mockResolvedValue([
        loanRow({ type: LoanType.Collateral, collateralItem: 'Toyota Corolla' }),
      ]);
      const report = await service.quarterly('tenant_1', '2026-Q1');
      expect(report.nonFinancial.security).toEqual({ secured: 1, unsecured: 0 });
    });

    it('folds saved operator figures into the provision movement', async () => {
      returnFindUnique.mockResolvedValue({
        figures: { openingBadDebtProvision: 200_000, badDebtProvisionRaised: 50_000, outlets: 1 },
      });

      const report = await service.quarterly('tenant_1', '2026-Q1');

      expect(report.financial.badDebts.openingProvision).toBe(200_000);
      expect(report.financial.badDebts.closingProvision).toBe(250_000);
      expect(report.nonFinancial.outlets).toBe(1);
      expect(report.warnings.map((warning) => warning.code)).not.toContain('manual_missing');
    });

    it('warns when the quarter has no operator figures yet', async () => {
      const report = await service.quarterly('tenant_1', '2026-Q1');
      expect(report.warnings.map((warning) => warning.code)).toContain('manual_missing');
    });

    it('reports repayments with no recorded method as Other, and says so', async () => {
      scheduleFindMany.mockResolvedValue([
        {
          loanId: 'loan_1',
          amount: 130_000,
          paidAt: utc('2026-02-20'),
          status: RepaymentStatus.Paid,
        },
      ]);

      const report = await service.quarterly('tenant_1', '2026-Q1');

      expect(report.financial.repayments.other).toBe(130_000);
      expect(report.warnings.map((warning) => warning.code)).toContain('unreconciled_repayments');
    });

    it('scopes every query to the tenant', async () => {
      await service.quarterly('tenant_1', '2026-Q1');

      expect(loanFindMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ tenantId: 'tenant_1' }) }),
      );
      expect(paymentFindMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ tenantId: 'tenant_1' }) }),
      );
      expect(scheduleFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            loan: expect.objectContaining({ tenantId: 'tenant_1' }),
          }),
        }),
      );
    });

    it('rejects a malformed quarter rather than reporting on the wrong window', async () => {
      await expect(service.quarterly('tenant_1', '2026-Q9')).rejects.toThrow(
        'Expected a quarter like 2026-Q2',
      );
    });
  });

  describe('monthly', () => {
    it('summarises the month and lists the loans advanced in it, without identifying borrowers', async () => {
      flows.expenses.push(
        { at: utc('2026-02-03'), amount: 30_000, kind: ExpenseKind.Expense, category: 'Rent' },
        { at: utc('2026-02-04'), amount: 10_000, kind: ExpenseKind.Drawing, category: 'Cash-out' },
      );
      paymentRows.push({
        loanId: 'loan_1',
        paidAt: utc('2026-02-25'),
        amount: 200_000,
        method: PaymentMethod.DebitOrder,
      });

      const report = await service.monthly('tenant_1', '2026-02');

      expect(report.period.label).toBe('February 2026');
      expect(report.summary.loansDisbursed).toBe(1);
      expect(report.summary.disbursedValue).toBe(500_000);
      expect(report.summary.interestBooked).toBe(150_000);
      expect(report.summary.collected).toBe(200_000);
      expect(report.summary.expenses).toBe(30_000);
      expect(report.summary.drawings).toBe(10_000);
      expect(report.expenseBreakdown).toEqual([{ key: 'Rent', label: 'Rent', value: 30_000 }]);
      expect(report.loans).toHaveLength(1);
      expect(report.loans[0]).toMatchObject({ principal: 500_000, gender: 'female', balance: 450_000 });
      // The register carries the loan's terms and the borrower's profile, never their identity.
      expect(Object.keys(report.loans[0] ?? {})).toEqual(
        expect.not.arrayContaining(['borrowerName', 'idNumber', 'clientNo', 'phone']),
      );
    });

    it("follows the lender's roll-forward: total capital is loaned plus available, collections carry forward", async () => {
      prismaMock.tenantSettings.findUnique.mockResolvedValue({ openingBalance: 1_000_000 });
      flows.expenses.push(
        { at: utc('2026-02-03'), amount: 30_000, kind: ExpenseKind.Expense, category: 'Rent' },
        { at: utc('2026-02-04'), amount: 10_000, kind: ExpenseKind.Drawing, category: 'Cash-out' },
      );
      flows.investments.push({ at: utc('2026-02-01'), amount: 20_000 });
      flows.income.push({ at: utc('2026-02-10'), amount: 5_000 });
      paymentRows.push({
        loanId: 'loan_1',
        paidAt: utc('2026-02-25'),
        amount: 200_000,
        method: PaymentMethod.Cash,
      });

      const { summary } = await service.monthly('tenant_1', '2026-02');

      expect(summary.openingCash).toBe(1_000_000);
      expect(summary.totalCapital).toBe(1_000_000 + 20_000 - 30_000 - 10_000);
      expect(summary.totalCapital).toBe(summary.disbursedValue + summary.availableFunds);
      // Available funds exclude the month's own collections…
      expect(summary.availableFunds).toBe(summary.totalCapital - 500_000);
      // …which land in the closing cash instead, together with other income.
      expect(summary.closingCash).toBe(summary.availableFunds + 200_000 + 5_000);
      expect(summary.netCashMovement).toBe(summary.closingCash - summary.openingCash);
    });

    it("carries one month's closing cash and book into the next month's opening", async () => {
      prismaMock.tenantSettings.findUnique.mockResolvedValue({ openingBalance: 1_000_000 });
      flows.expenses.push({ at: utc('2026-02-03'), amount: 30_000, kind: ExpenseKind.Expense, category: 'Rent' });
      flows.investments.push({ at: utc('2026-02-01'), amount: 20_000 });
      paymentRows.push({
        loanId: 'loan_1',
        paidAt: utc('2026-02-25'),
        amount: 200_000,
        method: PaymentMethod.Cash,
      });

      const february = await service.monthly('tenant_1', '2026-02');
      const march = await service.monthly('tenant_1', '2026-03');

      expect(march.summary.openingCash).toBe(february.summary.closingCash);
      expect(march.summary.openingBookValue).toBe(february.summary.closingBookValue);
      expect(march.summary.loansDisbursed).toBe(0);
    });

    it('counts undated capital injections in the cash position and discloses them', async () => {
      // N$104,100 of injections with no date: dropped entirely by a date filter.
      flows.investments.push({ at: null, amount: 10_410_000 });

      const report = await service.monthly('tenant_1', '2026-02');

      expect(report.summary.openingCash).toBe(10_410_000);
      expect(report.summary.capitalIn).toBe(0);
      expect(report.warnings.map((warning) => warning.code)).toContain('undated_flows');
    });

    it('moves cash and book together for a repayment recorded as a paid instalment', async () => {
      scheduleFindMany.mockResolvedValue([
        { loanId: 'loan_1', amount: 130_000, paidAt: utc('2026-02-20'), status: RepaymentStatus.Paid },
      ]);

      const { summary } = await service.monthly('tenant_1', '2026-02');

      expect(summary.collected).toBe(130_000);
      expect(summary.closingBookValue).toBe(650_000 - 130_000);
      expect(summary.closingCash - summary.availableFunds).toBe(130_000);
    });

    it("keeps a loan settled the following month on this month's book", async () => {
      // Settled on 5 March with no closedAt written (recordRepayment and
      // recomputeLoan never set it): at the end of February it was still owed in full.
      loanFindMany.mockResolvedValue([loanRow({ status: LoanStatus.Settled, balance: 0 })]);
      paymentRows.push({
        loanId: 'loan_1',
        paidAt: utc('2026-03-05'),
        amount: 650_000,
        method: PaymentMethod.Cash,
      });

      const report = await service.monthly('tenant_1', '2026-02');

      expect(report.summary.closingBookValue).toBe(650_000);
      expect(report.loans[0]?.balance).toBe(650_000);
      expect(report.summary.collected).toBe(0);
    });

    it('reports the outstanding balance as at month end, not today', async () => {
      // A payment after the month must not reduce February's closing balance.
      paymentRows.push(
        { loanId: 'loan_1', paidAt: utc('2026-02-15'), amount: 150_000, method: PaymentMethod.Cash },
        { loanId: 'loan_1', paidAt: utc('2026-03-02'), amount: 100_000, method: PaymentMethod.Cash },
      );

      const report = await service.monthly('tenant_1', '2026-02');

      expect(report.loans[0]?.balance).toBe(500_000);
      expect(report.summary.closingBookValue).toBe(500_000);
    });

    it('excludes loans advanced in another month', async () => {
      loanFindMany.mockResolvedValue([loanRow({ disbursedAt: utc('2026-01-10') })]);
      const report = await service.monthly('tenant_1', '2026-02');
      expect(report.loans).toHaveLength(0);
      expect(report.summary.openingBookValue).toBe(650_000);
    });

    it('notes when no opening balance has been set', async () => {
      const unset = await service.monthly('tenant_1', '2026-02');
      expect(unset.warnings.map((warning) => warning.code)).toContain('opening_balance_unset');

      prismaMock.tenantSettings.findUnique.mockResolvedValue({ openingBalance: 2_600_000 });
      const set = await service.monthly('tenant_1', '2026-02');
      expect(set.warnings.map((warning) => warning.code)).not.toContain('opening_balance_unset');
    });

    it('rejects a malformed month', async () => {
      await expect(service.monthly('tenant_1', '2026-13')).rejects.toThrow(
        'Expected a month like 2026-02',
      );
    });
  });

  describe('saveFigures', () => {
    it('converts money to cents and leaves counts alone', async () => {
      returnUpsert.mockResolvedValue({ period: '2026-Q1', notes: null });

      const saved = await service.saveFigures(
        'tenant_1',
        '2026-Q1',
        { figures: { openingBadDebtProvision: 2_000, outlets: 2 }, notes: '' },
        'Eufemia',
      );

      expect(saved.figures.openingBadDebtProvision).toBe(200_000);
      expect(saved.figures.outlets).toBe(2);
      expect(returnUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenantId_period: { tenantId: 'tenant_1', period: '2026-Q1' } },
        }),
      );
    });

    it('refuses a malformed quarter', async () => {
      await expect(
        service.saveFigures('tenant_1', 'nonsense', { figures: {}, notes: '' }, 'Eufemia'),
      ).rejects.toThrow('Expected a quarter like 2026-Q2');
    });
  });

  describe('figures', () => {
    it('drops non-numeric values from the stored blob', async () => {
      returnFindUnique.mockResolvedValue({
        figures: { outlets: 2, junk: 'not a number', nested: { a: 1 } },
      });
      await expect(service.figures('tenant_1', '2026-Q1')).resolves.toEqual({ outlets: 2 });
    });

    it('returns an empty map when nothing is saved', async () => {
      await expect(service.figures('tenant_1', '2026-Q1')).resolves.toEqual({});
    });
  });
});
