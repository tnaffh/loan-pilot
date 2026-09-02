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

describe('ReportsService', () => {
  const loanFindMany = jest.fn();
  const paymentFindMany = jest.fn();
  const scheduleFindMany = jest.fn();
  const returnFindUnique = jest.fn();
  const returnUpsert = jest.fn();
  const incomeAggregate = jest.fn();
  const expenseGroupBy = jest.fn();
  const investmentAggregate = jest.fn();
  const loanAggregate = jest.fn();
  const paymentAggregate = jest.fn();

  const prismaMock = {
    loan: { findMany: loanFindMany, aggregate: loanAggregate },
    payment: { findMany: paymentFindMany, aggregate: paymentAggregate },
    repaymentScheduleItem: { findMany: scheduleFindMany },
    regulatoryReturn: { findUnique: returnFindUnique, upsert: returnUpsert },
    income: { aggregate: incomeAggregate },
    expense: { groupBy: expenseGroupBy },
    investment: { aggregate: investmentAggregate },
    tenantSettings: { findUnique: jest.fn().mockResolvedValue({ openingBalance: 0 }) },
    tenant: { findUnique: jest.fn().mockResolvedValue({ logoUrl: null }) },
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
    loanFindMany.mockResolvedValue([loanRow()]);
    paymentFindMany.mockResolvedValue([]);
    scheduleFindMany.mockResolvedValue([]);
    returnFindUnique.mockResolvedValue(null);
    incomeAggregate.mockResolvedValue({ _sum: { amount: 0 } });
    expenseGroupBy.mockResolvedValue([]);
    investmentAggregate.mockResolvedValue({ _sum: { amount: 0 } });
    loanAggregate.mockResolvedValue({ _sum: { principal: 0 } });
    paymentAggregate.mockResolvedValue({ _sum: { amount: 0 } });
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
          where: expect.objectContaining({ loan: { tenantId: 'tenant_1' } }),
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
    it('summarises the month and lists the loans advanced in it', async () => {
      expenseGroupBy.mockResolvedValue([
        { kind: ExpenseKind.Expense, _sum: { amount: 30_000 } },
        { kind: ExpenseKind.Drawing, _sum: { amount: 10_000 } },
      ]);
      paymentFindMany.mockResolvedValue([
        { loanId: 'loan_1', paidAt: utc('2026-02-25'), amount: 200_000, method: PaymentMethod.DebitOrder },
      ]);
      paymentAggregate.mockResolvedValue({ _sum: { amount: 200_000 } });
      loanAggregate.mockResolvedValue({ _sum: { principal: 500_000 } });

      const report = await service.monthly('tenant_1', '2026-02');

      expect(report.period.label).toBe('February 2026');
      expect(report.summary.loansDisbursed).toBe(1);
      expect(report.summary.disbursedValue).toBe(500_000);
      expect(report.summary.interestBooked).toBe(150_000);
      expect(report.summary.collected).toBe(200_000);
      expect(report.summary.expenses).toBe(30_000);
      expect(report.summary.drawings).toBe(10_000);
      // Collected − advanced − expenses.
      expect(report.summary.netCashMovement).toBe(200_000 - 500_000 - 30_000);
      expect(report.loans).toHaveLength(1);
      expect(report.loans[0]?.borrowerName).toBe('Aina Shikongo');
      expect(report.loans[0]?.clientNo).toBe('294');
    });

    it('reports the outstanding balance as at month end, not today', async () => {
      // A payment after the month must not reduce February's closing balance.
      paymentFindMany.mockResolvedValue([
        { loanId: 'loan_1', paidAt: utc('2026-02-15'), amount: 150_000, method: PaymentMethod.Cash },
      ]);

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
