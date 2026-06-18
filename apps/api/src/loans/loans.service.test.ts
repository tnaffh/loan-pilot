import { Test } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { LoanStatus, LoanType, PaymentMethod, RepaymentStatus } from '@loan-pilot/domain';
import { LoansService } from './loans.service';
import { PrismaService } from '../prisma/prisma.service';

describe('LoansService', () => {
  const loanCreate = jest.fn();
  const loanFindFirst = jest.fn();
  const loanUpdate = jest.fn();
  const borrowerFindFirst = jest.fn();
  const borrowerUpsert = jest.fn();
  const scheduleItemUpdate = jest.fn();
  const scheduleItemUpdateMany = jest.fn();
  const paymentCreate = jest.fn();

  const txMock = {
    loan: { create: loanCreate, findFirst: loanFindFirst, update: loanUpdate },
    borrower: { upsert: borrowerUpsert },
    repaymentScheduleItem: { update: scheduleItemUpdate, updateMany: scheduleItemUpdateMany },
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
      providers: [LoansService, { provide: PrismaService, useValue: prismaMock }],
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
});
