import { Test } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import {
  LoanStatus,
  LoanType,
  PaymentMethod,
  RepaymentStatus,
  UserRole,
  type SessionUser,
} from '@loan-pilot/domain';
import { LoansService } from './loans.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { SettingsService } from '../settings/settings.service';
import { DocumentsService } from '../documents/documents.service';

const auditMock = {
  record: jest.fn(),
  diff: jest.fn().mockReturnValue([]),
  listFor: jest.fn().mockResolvedValue([]),
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

  const txMock = {
    loan: { create: loanCreate, findFirst: loanFindFirst, update: loanUpdate },
    borrower: { upsert: borrowerUpsert },
    repaymentScheduleItem: {
      update: scheduleItemUpdate,
      updateMany: scheduleItemUpdateMany,
      deleteMany: scheduleItemDeleteMany,
    },
    payment: { create: paymentCreate },
  };

  const prismaMock = {
    loan: {
      create: loanCreate,
      findFirst: loanFindFirst,
      update: loanUpdate,
      findMany: jest.fn(),
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
        { provide: DocumentsService, useValue: { listForBorrower: jest.fn().mockResolvedValue([]) } },
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

    await service.settle('tenant_1', 'loan_1', { method: PaymentMethod.Cash, paidAt: '2026-06-18' });

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

  // ----- audit edit + cancel -------------------------------------------------

  const actor: SessionUser = {
    id: 'user_1',
    email: 'admin@rfs.na',
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

    await service.update('tenant_1', actor, 'loan_1', { amount: 2000, termMonths: 2 });

    expect(scheduleItemDeleteMany).toHaveBeenCalledWith({ where: { loanId: 'loan_1' } });
    const data = loanUpdate.mock.calls[0][0].data;
    expect(data.principal).toBe(200000); // N$ 2,000
    expect(data.termMonths).toBe(2);
    expect(data.total).toBe(260000); // + 30%
    expect(data.schedule.create).toHaveLength(2);
    expect(auditMock.record).toHaveBeenCalled();
  });

  it('rejects changing the amount of a loan that has payments', async () => {
    loanFindFirst.mockResolvedValue(loanRow({ _count: { payments: 3 } }));

    await expect(
      service.update('tenant_1', actor, 'loan_1', { amount: 2000 }),
    ).rejects.toThrow(BadRequestException);
    expect(loanUpdate).not.toHaveBeenCalled();
  });

  it('allows safe-field edits on a loan with payments', async () => {
    loanFindFirst.mockResolvedValue(loanRow({ _count: { payments: 3 } }));

    await service.update('tenant_1', actor, 'loan_1', { note: 'corrected', collateral: 'Toyota' });

    const data = loanUpdate.mock.calls[0][0].data;
    expect(data.note).toBe('corrected');
    expect(data.collateral).toBe('Toyota');
    expect(scheduleItemDeleteMany).not.toHaveBeenCalled();
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

    await expect(
      service.cancel('tenant_1', actor, 'loan_1', { reason: 'oops' }),
    ).rejects.toThrow(BadRequestException);
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
    loanFindFirst.mockResolvedValue(loanRow({ termMonths: 2, total: 200000, _count: { payments: 0 } }));

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
        { id: 's1', number: 1, amount: 130000, dueAt: overdue, status: RepaymentStatus.Due, paidAt: null },
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

    await service.settle('tenant_1', 'loan_1', { method: PaymentMethod.Cash, paidAt: '2026-06-01' });

    const amount = paymentCreate.mock.calls[0][0].data.amount;
    expect(amount).toBeGreaterThan(130000); // balance + default interest
    expect(loanUpdate.mock.calls[0][0].data.balance).toBe(0);
  });
});
