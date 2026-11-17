import { Test } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import {
  InterestMethod,
  LoanStatus,
  LoanType,
  PaymentMethod,
  RenewalBasis,
  RepaymentStatus,
  UserRole,
  type SessionUser,
} from '@loan-pilot/domain';
import { LoansService } from './loans.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { SettingsService } from '../settings/settings.service';
import { DocumentsService } from '../documents/documents.service';
import { AgreementsService } from '../agreements/agreements.service';
import { LoanCalculationService } from './loan-calculation.service';

const auditMock = {
  record: jest.fn(),
  diff: jest.fn().mockReturnValue([]),
  listFor: jest.fn().mockResolvedValue([]),
};

const agreementsMock = {
  refreshForLoan: jest.fn().mockResolvedValue(undefined),
};

// Zero fees + no product + 0% monthly rate, so pricing matches the original
// loan-amount-only, flat-charge math. Term compounding is covered in the domain
// tests; individual cases here override monthlyRate when they need it.
const settingsMock = {
  resolveFeeSettings: jest.fn().mockResolvedValue({
    namfisaLevyRate: 0,
    stampDutyCents: 0,
    insuranceRate: 0,
    insuranceFlatCents: 0,
    monthlyRate: 0,
  }),
  resolveProduct: jest.fn().mockResolvedValue(null),
  resolveMethodSettings: jest
    .fn()
    .mockResolvedValue({ bonRate: 0.1, maxLongTermMonths: 60, renewalGraceDays: 3 }),
};

const calculationMock = {
  refresh: jest.fn().mockResolvedValue(undefined),
  writeRenewalState: jest.fn(),
};

describe('LoansService', () => {
  const loanCreate = jest.fn();
  const loanFindFirst = jest.fn();
  const loanUpdate = jest.fn();
  const borrowerFindFirst = jest.fn();
  const borrowerUpsert = jest.fn();
  const scheduleItemUpdate = jest.fn();
  const scheduleItemUpdateMany = jest.fn();
  const paymentCreate = jest.fn();

  const scheduleItemDeleteMany = jest.fn();

  const waiveActor: SessionUser = {
    id: 'user_1',
    email: 'admin@rfs.na',
    phone: null,
    name: 'Admin',
    role: UserRole.LenderAdmin,
    tenantId: 'tenant_1',
    tenantSlug: 'rfs',
    roleId: 'role_admin',
    permissions: [],
  };

  const txMock = {
    loan: { create: loanCreate, findFirst: loanFindFirst, update: loanUpdate },
    borrower: { upsert: borrowerUpsert },
    repaymentScheduleItem: {
      update: scheduleItemUpdate,
      updateMany: scheduleItemUpdateMany,
      deleteMany: scheduleItemDeleteMany,
    },
    payment: { create: paymentCreate, findMany: jest.fn().mockResolvedValue([]) },
    loanRenewal: { deleteMany: jest.fn() },
  };

  const prismaMock = {
    loan: {
      create: loanCreate,
      findFirst: loanFindFirst,
      update: loanUpdate,
      findMany: jest.fn(),
      findFirstOrThrow: jest.fn().mockResolvedValue({ id: 'loan_1' }),
    },
    borrower: { findFirst: borrowerFindFirst, upsert: borrowerUpsert },
    repaymentScheduleItem: { update: scheduleItemUpdate },
    user: { findUnique: jest.fn() },
    $transaction: jest.fn(async (fn: (tx: typeof txMock) => Promise<unknown>) => fn(txMock)),
  };

  let service: LoansService;

  beforeEach(async () => {
    jest.clearAllMocks();
    loanCreate.mockImplementation((args: { data: Record<string, unknown> }) =>
      Promise.resolve({ id: 'loan_1', ...args.data }),
    );
    loanUpdate.mockImplementation((args: { data: Record<string, unknown> }) =>
      Promise.resolve({ id: 'loan_1', ...args.data }),
    );

    const moduleRef = await Test.createTestingModule({
      providers: [
        LoansService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: AuditService, useValue: auditMock },
        { provide: SettingsService, useValue: settingsMock },
        {
          provide: DocumentsService,
          useValue: {
            listForBorrower: jest.fn().mockResolvedValue([]),
            listForLoan: jest.fn().mockResolvedValue([]),
          },
        },
        { provide: AgreementsService, useValue: agreementsMock },
        { provide: LoanCalculationService, useValue: calculationMock },
      ],
    }).compile();

    service = moduleRef.get(LoansService);
  });

  it('disburses a loan with a quoted schedule', async () => {
    borrowerFindFirst.mockResolvedValue({ id: 'bor_1', tenantId: 'tenant_1' });

    await service.create('tenant_1', {
      borrowerId: 'bor_1',
      loanType: LoanType.Payday,
      amount: 8000,
      termMonths: 2,
    });

    const data = loanCreate.mock.calls[0][0].data;

    expect(data.principal).toBe(800000);
    expect(data.financeCharge).toBe(240000); // 30% payday charge
    expect(data.total).toBe(1040000);
    expect(data.balance).toBe(1040000);
    expect(data.instalment).toBe(520000);
    expect(data.instalmentsTotal).toBe(2);
    expect(data.schedule.create).toHaveLength(2);
    expect(data.schedule.create[0]).toMatchObject({ number: 1, amount: 520000, status: 'due' });
    expect(data.nextDueAt).toBeInstanceOf(Date);
  });

  const scheduleItem = (number: number, status: RepaymentStatus, dueAt: Date) => ({
    id: `item_${number}`,
    loanId: 'loan_1',
    number,
    amount: 520000,
    status,
    dueAt,
    paidAt: status === RepaymentStatus.Paid ? dueAt : null,
  });

  const futureDate = (days: number): Date => new Date(Date.now() + days * 86_400_000);

  it('records a repayment: marks the item paid and advances the loan', async () => {
    loanFindFirst.mockResolvedValue({
      id: 'loan_1',
      tenantId: 'tenant_1',
      status: LoanStatus.Active,
      balance: 1040000,
      instalmentsPaid: 0,
      schedule: [
        scheduleItem(1, RepaymentStatus.Due, futureDate(5)),
        scheduleItem(2, RepaymentStatus.Due, futureDate(35)),
      ],
    });

    await service.recordRepayment('tenant_1', 'loan_1', {});

    expect(scheduleItemUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'item_1' },
        data: expect.objectContaining({ status: RepaymentStatus.Paid }),
      }),
    );
    const data = loanUpdate.mock.calls[0][0].data;

    expect(data.balance).toBe(520000);
    expect(data.instalmentsPaid).toBe(1);
    expect(data.status).toBe(LoanStatus.Active);
    expect(data.nextDueAt).toEqual(expect.any(Date));
  });

  it('settles the loan on the final repayment', async () => {
    loanFindFirst.mockResolvedValue({
      id: 'loan_1',
      tenantId: 'tenant_1',
      status: LoanStatus.Active,
      balance: 520000,
      instalmentsPaid: 1,
      schedule: [
        scheduleItem(1, RepaymentStatus.Paid, futureDate(-30)),
        scheduleItem(2, RepaymentStatus.Due, futureDate(1)),
      ],
    });

    await service.recordRepayment('tenant_1', 'loan_1', {});

    const data = loanUpdate.mock.calls[0][0].data;

    expect(data.balance).toBe(0);
    expect(data.status).toBe(LoanStatus.Settled);
    expect(data.nextDueAt).toBeNull();
    expect(data.instalmentsPaid).toBe(2);
  });

  it('flags arrears when the next unpaid instalment is overdue', async () => {
    loanFindFirst.mockResolvedValue({
      id: 'loan_1',
      tenantId: 'tenant_1',
      status: LoanStatus.Arrears,
      balance: 1560000,
      instalmentsPaid: 0,
      schedule: [
        scheduleItem(1, RepaymentStatus.Due, futureDate(-40)),
        scheduleItem(2, RepaymentStatus.Overdue, futureDate(-10)),
        scheduleItem(3, RepaymentStatus.Due, futureDate(20)),
      ],
    });

    await service.recordRepayment('tenant_1', 'loan_1', {});

    const data = loanUpdate.mock.calls[0][0].data;

    expect(data.status).toBe(LoanStatus.Arrears);
    expect(data.daysLate).toBeGreaterThanOrEqual(9);
  });

  it('rejects repayments on a settled loan', async () => {
    loanFindFirst.mockResolvedValue({
      id: 'loan_1',
      tenantId: 'tenant_1',
      status: LoanStatus.Settled,
      balance: 0,
      instalmentsPaid: 2,
      schedule: [],
    });

    await expect(service.recordRepayment('tenant_1', 'loan_1', {})).rejects.toThrow(
      BadRequestException,
    );
    expect(loanUpdate).not.toHaveBeenCalled();
  });

  it('settles early: pays off the balance, clears the schedule and closes the loan', async () => {
    loanFindFirst.mockResolvedValue({
      id: 'loan_1',
      tenantId: 'tenant_1',
      status: LoanStatus.Active,
      balance: 520000,
      instalmentsTotal: 2,
      schedule: [],
    });

    await service.settle('tenant_1', 'loan_1', {
      method: PaymentMethod.Cash,
      paidAt: '2026-06-18',
    });

    expect(paymentCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ amount: 520000 }) }),
    );
    expect(scheduleItemUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: RepaymentStatus.Paid }) }),
    );
    const data = loanUpdate.mock.calls[0][0].data;

    expect(data.balance).toBe(0);
    expect(data.status).toBe(LoanStatus.Settled);
    expect(data.instalmentsPaid).toBe(2);
    expect(data.closedAt).toBeInstanceOf(Date);
  });

  it('rejects settling a loan with no balance', async () => {
    loanFindFirst.mockResolvedValue({
      id: 'loan_1',
      tenantId: 'tenant_1',
      status: LoanStatus.Active,
      balance: 0,
      instalmentsTotal: 1,
    });

    await expect(
      service.settle('tenant_1', 'loan_1', { method: PaymentMethod.Cash, paidAt: '2026-06-18' }),
    ).rejects.toThrow(BadRequestException);
    expect(paymentCreate).not.toHaveBeenCalled();
  });

  it('writes off a loan with a reason', async () => {
    loanFindFirst.mockResolvedValue({
      id: 'loan_1',
      tenantId: 'tenant_1',
      status: LoanStatus.Arrears,
      balance: 520000,
    });

    await service.writeOff('tenant_1', 'loan_1', { reason: 'Borrower unreachable' });

    const data = loanUpdate.mock.calls[0][0].data;

    expect(data.status).toBe(LoanStatus.WrittenOff);
    expect(data.writeOffReason).toBe('Borrower unreachable');
    expect(data.closedAt).toBeInstanceOf(Date);
  });

  it('settles a loan by waiving the remainder, reporting it as bad debt', async () => {
    loanFindFirst.mockResolvedValue({
      id: 'loan_1',
      tenantId: 'tenant_1',
      status: LoanStatus.PartlyPaid,
      balance: 2_418,
      waived: 0,
      instalmentsTotal: 1,
      closedAt: null,
      writeOffReason: null,
    });
    loanUpdate.mockResolvedValue({ id: 'loan_1' });

    await service.waive('tenant_1', waiveActor, 'loan_1', {
      reason: 'Debit order loaded for the wrong amount',
    });

    // Remaining instalments are waived, never marked paid — the reporting
    // ledger would read a paid instalment as money received.
    expect(scheduleItemUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: RepaymentStatus.Waived } }),
    );
    const data = loanUpdate.mock.calls[0][0].data;

    expect(data.status).toBe(LoanStatus.Settled);
    expect(data.balance).toBe(0);
    expect(data.waived).toBe(2_418);
    expect(data.waiveReason).toBe('Debit order loaded for the wrong amount');
    expect(data.closedAt).toBeInstanceOf(Date);
    expect(auditMock.record).toHaveBeenCalledWith(
      'tenant_1',
      waiveActor,
      expect.objectContaining({ action: 'waived', entityId: 'loan_1' }),
      expect.anything(),
    );
  });

  it('converts a written-off loan into settled-with-waiver, keeping the date it left the book', async () => {
    const writtenOffAt = new Date('2026-09-25T00:00:00.000Z');

    loanFindFirst.mockResolvedValue({
      id: 'loan_1',
      tenantId: 'tenant_1',
      status: LoanStatus.WrittenOff,
      balance: 2_418,
      waived: 0,
      instalmentsTotal: 1,
      closedAt: writtenOffAt,
      writeOffReason: 'Loss',
    });
    loanUpdate.mockResolvedValue({ id: 'loan_1' });

    await service.waive('tenant_1', waiveActor, 'loan_1', { reason: 'Loading error' });

    const data = loanUpdate.mock.calls[0][0].data;

    expect(data.status).toBe(LoanStatus.Settled);
    expect(data.waived).toBe(2_418);
    expect(data.writeOffReason).toBeNull();
    expect(data.closedAt).toBe(writtenOffAt);
  });

  it('refuses to waive on a settled loan or one with nothing owing', async () => {
    loanFindFirst.mockResolvedValue({
      id: 'loan_1',
      tenantId: 'tenant_1',
      status: LoanStatus.Settled,
      balance: 0,
      waived: 0,
    });
    await expect(
      service.waive('tenant_1', waiveActor, 'loan_1', { reason: 'Nothing to do' }),
    ).rejects.toThrow(BadRequestException);

    loanFindFirst.mockResolvedValue({
      id: 'loan_1',
      tenantId: 'tenant_1',
      status: LoanStatus.Active,
      balance: 0,
      waived: 0,
    });
    await expect(
      service.waive('tenant_1', waiveActor, 'loan_1', { reason: 'Nothing to do' }),
    ).rejects.toThrow(BadRequestException);
    expect(loanUpdate).not.toHaveBeenCalled();
  });

  // ----- audit edit + cancel -------------------------------------------------

  const actor: SessionUser = {
    id: 'user_1',
    email: 'admin@rfs.na',
    phone: null,
    name: 'Admin',
    role: UserRole.LenderAdmin,
    tenantId: 'tenant_1',
    tenantSlug: 'rfs',
    roleId: 'role_admin',
    permissions: [],
  };

  const loanRow = (over: Record<string, unknown> = {}) => ({
    id: 'loan_1',
    tenantId: 'tenant_1',
    borrowerId: 'bor_1',
    type: LoanType.Payday,
    principal: 100000,
    financeCharge: 30000,
    bankCharges: 0,
    namfisaLevy: 0,
    stampDuty: 0,
    interestRate: 0.3,
    total: 130000,
    termMonths: 1,
    instalment: 130000,
    instalmentsPaid: 0,
    instalmentsTotal: 1,
    balance: 130000,
    status: LoanStatus.Active,
    collateral: null,
    daysLate: 0,
    originMonth: null,
    externalRef: null,
    note: null,
    writeOffReason: null,
    cancelReason: null,
    disbursedAt: new Date('2025-01-01'),
    nextDueAt: new Date('2025-02-01'),
    closedAt: null,
    createdAt: new Date('2025-01-01'),
    updatedAt: new Date('2025-01-01'),
    _count: { payments: 0 },
    ...over,
  });

  it('re-prices and rebuilds the schedule when the amount changes on an unpaid loan', async () => {
    loanFindFirst.mockResolvedValue(loanRow({ _count: { payments: 0 } }));
    // Prisma returns the whole updated row, which the agreement-staleness check reads.
    loanUpdate.mockImplementation((args: { data: Record<string, unknown> }) =>
      Promise.resolve({ ...loanRow(), ...args.data }),
    );

    await service.update('tenant_1', actor, 'loan_1', { amount: 2000, termMonths: 2 });

    expect(scheduleItemDeleteMany).toHaveBeenCalledWith({ where: { loanId: 'loan_1' } });
    const data = loanUpdate.mock.calls[0][0].data;

    expect(data.principal).toBe(200000); // N$ 2,000
    expect(data.termMonths).toBe(2);
    expect(data.total).toBe(260000); // + 30%
    expect(data.schedule.create).toHaveLength(2);
    expect(auditMock.record).toHaveBeenCalled();
    // The stored agreement now shows the wrong figures, so it is regenerated after the commit.
    expect(agreementsMock.refreshForLoan).toHaveBeenCalledWith('tenant_1', 'loan_1');
  });

  it('regenerates the agreement after a fee-only edit, which changes the cost breakdown', async () => {
    loanFindFirst.mockResolvedValue(loanRow({ _count: { payments: 3 } }));
    loanUpdate.mockImplementation((args: { data: Record<string, unknown> }) =>
      Promise.resolve({ ...loanRow(), ...args.data }),
    );

    await service.update('tenant_1', actor, 'loan_1', { bankCharges: 25 });

    expect(loanUpdate.mock.calls[0][0].data.bankCharges).toBe(2500);
    expect(agreementsMock.refreshForLoan).toHaveBeenCalledWith('tenant_1', 'loan_1');
  });

  it('rejects changing the amount of a loan that has payments', async () => {
    loanFindFirst.mockResolvedValue(loanRow({ _count: { payments: 3 } }));

    await expect(service.update('tenant_1', actor, 'loan_1', { amount: 2000 })).rejects.toThrow(
      BadRequestException,
    );
    expect(loanUpdate).not.toHaveBeenCalled();
  });

  it('allows safe-field edits on a loan with payments', async () => {
    loanFindFirst.mockResolvedValue(loanRow({ _count: { payments: 3 } }));
    loanUpdate.mockImplementation((args: { data: Record<string, unknown> }) =>
      Promise.resolve({ ...loanRow(), ...args.data }),
    );

    await service.update('tenant_1', actor, 'loan_1', { note: 'corrected', collateral: 'Toyota' });

    const data = loanUpdate.mock.calls[0][0].data;

    expect(data.note).toBe('corrected');
    expect(data.collateral).toBe('Toyota');
    expect(scheduleItemDeleteMany).not.toHaveBeenCalled();
    // Nothing printed on the agreement changed, so it is left alone.
    expect(agreementsMock.refreshForLoan).not.toHaveBeenCalled();
  });

  it('cancels a payment-free loan', async () => {
    loanFindFirst.mockResolvedValue(loanRow({ _count: { payments: 0 } }));

    await service.cancel('tenant_1', actor, 'loan_1', { reason: 'Duplicate import' });

    const data = loanUpdate.mock.calls[0][0].data;

    expect(data.status).toBe(LoanStatus.Cancelled);
    expect(data.balance).toBe(0);
    expect(data.cancelReason).toBe('Duplicate import');
    expect(data.closedAt).toBeInstanceOf(Date);
  });

  it('refuses to cancel a loan that has payments', async () => {
    loanFindFirst.mockResolvedValue(loanRow({ _count: { payments: 2 } }));

    await expect(service.cancel('tenant_1', actor, 'loan_1', { reason: 'oops' })).rejects.toThrow(
      BadRequestException,
    );
    expect(loanUpdate).not.toHaveBeenCalled();
  });

  const feeSettings = (monthlyRate: number) => ({
    namfisaLevyRate: 0,
    stampDutyCents: 0,
    insuranceRate: 0,
    insuranceFlatCents: 0,
    monthlyRate,
  });

  it('compounds the monthly rate into the stored total for a 2-month term loan', async () => {
    borrowerFindFirst.mockResolvedValue({ id: 'bor_1', tenantId: 'tenant_1' });
    settingsMock.resolveFeeSettings.mockResolvedValueOnce(feeSettings(0.05));

    await service.create('tenant_1', {
      borrowerId: 'bor_1',
      loanType: LoanType.Payday,
      amount: 8000,
      termMonths: 2,
    });

    const data = loanCreate.mock.calls[0][0].data;

    expect(data.total).toBe(1092000); // 8000 ×1.30 ×1.05
    expect(data.schedule.create).toHaveLength(2);
  });

  it('does not recompute the total on a fee-only edit of a term loan', async () => {
    loanFindFirst.mockResolvedValue(
      loanRow({ termMonths: 2, total: 200000, _count: { payments: 0 } }),
    );

    await service.update('tenant_1', actor, 'loan_1', { namfisaLevy: 50 });

    const data = loanUpdate.mock.calls[0][0].data;

    expect(data.namfisaLevy).toBe(5000);
    expect(data.total).toBeUndefined();
    expect(scheduleItemDeleteMany).not.toHaveBeenCalled();
  });

  it('derives default interest and a payoff on a loan with an overdue instalment', async () => {
    const overdue = new Date();

    overdue.setDate(overdue.getDate() - 65); // ≥ 1 complete month late
    settingsMock.resolveFeeSettings.mockResolvedValueOnce(feeSettings(0.05));
    loanFindFirst.mockResolvedValue({
      ...loanRow(),
      balance: 130000,
      payments: [],
      schedule: [
        {
          id: 's1',
          number: 1,
          amount: 130000,
          dueAt: overdue,
          status: RepaymentStatus.Due,
          paidAt: null,
        },
      ],
    });

    const result = await service.findOne('tenant_1', 'loan_1');

    expect(result.defaultInterest).toBeGreaterThan(0);
    expect(result.payoff).toBe(130000 + result.defaultInterest);
    expect(result.daysLate).toBeGreaterThan(0);
  });

  it('includes accrued default interest in the settlement payoff', async () => {
    settingsMock.resolveFeeSettings.mockResolvedValueOnce(feeSettings(0.05));
    loanFindFirst.mockResolvedValue({
      id: 'loan_1',
      tenantId: 'tenant_1',
      status: LoanStatus.Arrears,
      balance: 130000,
      instalmentsTotal: 1,
      schedule: [{ amount: 130000, dueAt: new Date('2026-01-01'), status: RepaymentStatus.Due }],
    });

    await service.settle('tenant_1', 'loan_1', {
      method: PaymentMethod.Cash,
      paidAt: '2026-06-01',
    });

    const amount = paymentCreate.mock.calls[0][0].data.amount;

    expect(amount).toBeGreaterThan(130000); // balance + default interest
    expect(loanUpdate.mock.calls[0][0].data.balance).toBe(0);
  });

  describe('calculation methods', () => {
    const monthsAgo = (months: number, extraDays = 0): Date => {
      const date = new Date();

      date.setMonth(date.getMonth() - months);
      date.setDate(date.getDate() - extraDays);

      return date;
    };

    // N$100,000 at 30%, 1 month: N$130,000 due one month after disbursement.
    const tenderLoan = (over: Record<string, unknown> = {}) =>
      loanRow({
        principal: 10000000,
        financeCharge: 3000000,
        total: 13000000,
        instalment: 13000000,
        balance: 13000000,
        insurance: 0,
        waived: 0,
        renewalCharges: 0,
        renewalBasis: null,
        annualRate: null,
        bonRate: null,
        marginRate: null,
        productId: null,
        interestMethod: InterestMethod.Payday,
        payments: [],
        schedule: [],
        ...over,
      });

    it('prices a term loan on the BoN rate plus the margin, with an interest split per instalment', async () => {
      borrowerFindFirst.mockResolvedValue({ id: 'bor_1', tenantId: 'tenant_1' });

      await service.create('tenant_1', {
        borrowerId: 'bor_1',
        loanType: LoanType.Business,
        amount: 100000,
        termMonths: 12,
        method: InterestMethod.TermLoan,
        marginRate: 0.055,
      });

      const data = loanCreate.mock.calls[0][0].data;

      expect(data.interestMethod).toBe(InterestMethod.TermLoan);
      expect(data.bonRate).toBe(0.1);
      expect(data.annualRate).toBeCloseTo(0.155);
      expect(data.instalment).toBe(904944); // PMT for 100,000 over 12 months at 15.5% p.a.
      expect(data.instalmentsTotal).toBe(12);
      expect(data.schedule.create[0].interest).toBe(129167);
      // The monthly finance rate is not overwritten with the yearly rate.
      expect(data.interestRate).toBeUndefined();
    });

    it('rejects a payday loan longer than 5 months and a term loan beyond the lender maximum', async () => {
      borrowerFindFirst.mockResolvedValue({ id: 'bor_1', tenantId: 'tenant_1' });
      const base = { borrowerId: 'bor_1', loanType: LoanType.Payday, amount: 5000 };

      await expect(service.create('tenant_1', { ...base, termMonths: 6 })).rejects.toThrow(
        BadRequestException,
      );
      await expect(
        service.create('tenant_1', { ...base, termMonths: 61, method: InterestMethod.TermLoan }),
      ).rejects.toThrow(BadRequestException);
      expect(loanCreate).not.toHaveBeenCalled();
    });

    it('creates a monthly renewal loan as a 1-month loan with its charge basis', async () => {
      borrowerFindFirst.mockResolvedValue({ id: 'bor_1', tenantId: 'tenant_1' });

      await service.create('tenant_1', {
        borrowerId: 'bor_1',
        loanType: LoanType.Business,
        amount: 100000,
        termMonths: 1,
        method: InterestMethod.MonthlyRenewal,
        renewalBasis: RenewalBasis.Balance,
      });

      const data = loanCreate.mock.calls[0][0].data;

      expect(data.interestMethod).toBe(InterestMethod.MonthlyRenewal);
      expect(data.renewalBasis).toBe(RenewalBasis.Balance);
      expect(data.total).toBe(13000000);
    });

    it('refuses to capture a fixed instalment on a monthly renewal loan', async () => {
      loanFindFirst.mockResolvedValue(
        tenderLoan({ interestMethod: InterestMethod.MonthlyRenewal }),
      );

      await expect(service.recordRepayment('tenant_1', 'loan_1', {})).rejects.toThrow(
        BadRequestException,
      );
    });

    it('previews payday → monthly renewal: one renewal per month the loan has gone unpaid', async () => {
      // Disbursed 2 months and 10 days ago: the due dates 1 month + 10 days ago
      // and 10 days ago have both passed their grace days → 130,000 → 160,000 → 190,000.
      loanFindFirst.mockResolvedValue(tenderLoan({ disbursedAt: monthsAgo(2, 10) }));

      const preview = await service.previewMethodChange('tenant_1', 'loan_1', {
        method: InterestMethod.MonthlyRenewal,
      });

      expect(preview.renewals).toBe(2);
      expect(preview.total).toBe(19000000);
      expect(preview.balance).toBe(19000000);
      expect(preview.defaultInterest).toBe(0);
      expect(preview.current.total).toBe(13000000);
    });

    it('previews monthly renewal → payday: renewals go, 5% default interest applies to the months late', async () => {
      settingsMock.resolveFeeSettings.mockResolvedValue(feeSettings(0.05));
      // Three months after disbursement = two complete months late.
      loanFindFirst.mockResolvedValue(
        tenderLoan({
          interestMethod: InterestMethod.MonthlyRenewal,
          renewalBasis: RenewalBasis.Principal,
          disbursedAt: monthsAgo(3, 10),
          financeCharge: 9000000,
          renewalCharges: 6000000,
          total: 19000000,
          balance: 19000000,
        }),
      );

      const preview = await service
        .previewMethodChange('tenant_1', 'loan_1', { method: InterestMethod.Payday })
        .finally(() => settingsMock.resolveFeeSettings.mockResolvedValue(feeSettings(0)));

      expect(preview.total).toBe(13000000);
      expect(preview.renewals).toBe(0);
      // 130,000 × (1.05² − 1) = 13,325.
      expect(preview.defaultInterest).toBe(1332500);
      expect(preview.payoff).toBe(14332500);
    });

    it('counts payments already made when previewing a method change', async () => {
      const disbursedAt = monthsAgo(1, 10);
      const firstDue = new Date(disbursedAt);

      firstDue.setMonth(firstDue.getMonth() + 1);
      // The first month's 30,000 charge was paid on the due date, so the renewal
      // is charged on the 100,000 borrowed: 160,000 − 30,000 = 130,000 owed.
      loanFindFirst.mockResolvedValue(
        tenderLoan({ disbursedAt, payments: [{ amount: 3000000, paidAt: firstDue }] }),
      );

      const preview = await service.previewMethodChange('tenant_1', 'loan_1', {
        method: InterestMethod.MonthlyRenewal,
      });

      expect(preview.renewals).toBe(1);
      expect(preview.balance).toBe(13000000);
    });

    it('changes the method: reprices from the loan’s own figures, then recalculates and audits', async () => {
      loanFindFirst.mockResolvedValue(tenderLoan({ disbursedAt: monthsAgo(3, 10) }));

      await service.changeMethod('tenant_1', actor, 'loan_1', {
        method: InterestMethod.MonthlyRenewal,
        renewalBasis: RenewalBasis.Balance,
      });

      const data = loanUpdate.mock.calls[0][0].data;

      expect(data.interestMethod).toBe(InterestMethod.MonthlyRenewal);
      expect(data.renewalBasis).toBe(RenewalBasis.Balance);
      expect(data.total).toBe(13000000); // origination total; renewals follow in refresh
      expect(data.schedule.create).toHaveLength(1);
      expect(scheduleItemDeleteMany).toHaveBeenCalled();
      expect(auditMock.record).toHaveBeenCalledWith(
        'tenant_1',
        actor,
        expect.objectContaining({ action: 'method_changed' }),
        expect.anything(),
      );
      expect(calculationMock.refresh).toHaveBeenCalledWith('loan_1');
      expect(agreementsMock.refreshForLoan).toHaveBeenCalledWith('tenant_1', 'loan_1');
    });

    it('moves a loan onto a term loan at today’s BoN rate plus the chosen margin', async () => {
      loanFindFirst.mockResolvedValue(tenderLoan({ disbursedAt: monthsAgo(0, 5) }));

      await service.changeMethod('tenant_1', actor, 'loan_1', {
        method: InterestMethod.TermLoan,
        termMonths: 24,
        marginRate: 0.04,
      });

      const data = loanUpdate.mock.calls[0][0].data;

      expect(data.interestMethod).toBe(InterestMethod.TermLoan);
      expect(data.annualRate).toBeCloseTo(0.14);
      expect(data.termMonths).toBe(24);
      expect(data.schedule.create).toHaveLength(24);
      expect(data.interestRate).toBe(0.3); // monthly rate kept for a later switch back
    });

    it('refuses to change the method of a closed loan or one with a waived amount', async () => {
      loanFindFirst.mockResolvedValue(tenderLoan({ status: LoanStatus.Settled }));
      await expect(
        service.changeMethod('tenant_1', actor, 'loan_1', { method: InterestMethod.TermLoan }),
      ).rejects.toThrow(BadRequestException);

      loanFindFirst.mockResolvedValue(tenderLoan({ waived: 500 }));
      await expect(
        service.changeMethod('tenant_1', actor, 'loan_1', { method: InterestMethod.TermLoan }),
      ).rejects.toThrow(BadRequestException);
      expect(loanUpdate).not.toHaveBeenCalled();
    });

    it('rebates unearned interest when a term loan is settled early', async () => {
      const disbursedAt = new Date('2026-01-10T00:00:00.000Z');
      const due = (n: number): Date => {
        const date = new Date(disbursedAt);

        date.setMonth(date.getMonth() + n);

        return date;
      };

      loanFindFirst.mockResolvedValue(
        tenderLoan({
          interestMethod: InterestMethod.TermLoan,
          total: 10600000,
          financeCharge: 600000,
          balance: 10600000,
          instalmentsTotal: 3,
          schedule: [1, 2, 3].map((n) => ({
            amount: n === 3 ? 3533334 : 3533333,
            dueAt: due(n),
            status: RepaymentStatus.Due,
            interest: 400000 - n * 100000,
          })),
        }),
      );

      // Settled in month 1: months 2 and 3 have not started → 200,000 + 100,000 rebated.
      await service.settle('tenant_1', 'loan_1', {
        method: PaymentMethod.Eft,
        paidAt: '2026-01-20',
      });

      expect(paymentCreate.mock.calls[0][0].data.amount).toBe(10300000);
      const data = loanUpdate.mock.calls[0][0].data;

      expect(data.total).toBe(10300000);
      expect(data.financeCharge).toBe(300000);
      expect(data.balance).toBe(0);
    });

    it('settles a monthly renewal loan for what is owed on the payment date', async () => {
      const disbursedAt = new Date('2026-01-10T00:00:00.000Z');
      const found = tenderLoan({
        interestMethod: InterestMethod.MonthlyRenewal,
        renewalBasis: RenewalBasis.Principal,
        disbursedAt,
      });

      loanFindFirst.mockResolvedValue(found);
      calculationMock.writeRenewalState.mockImplementation(
        (
          _tx: unknown,
          loan: Record<string, unknown>,
          state: { position: { totalCents: number } },
        ) => Promise.resolve({ ...loan, total: state.position.totalCents }),
      );

      // Due 10 Feb; paid 20 Feb, after the 3 grace days → one renewal: 160,000.
      await service.settle('tenant_1', 'loan_1', {
        method: PaymentMethod.Eft,
        paidAt: '2026-02-20',
      });

      const state = calculationMock.writeRenewalState.mock.calls[0][2];

      expect(state.position.renewals).toHaveLength(1);
      expect(paymentCreate.mock.calls[0][0].data.amount).toBe(16000000);
      expect(loanUpdate.mock.calls[0][0].data.status).toBe(LoanStatus.Settled);
    });
  });
});
