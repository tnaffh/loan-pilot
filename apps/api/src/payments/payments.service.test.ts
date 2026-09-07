import { Test } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import {
  LoanStatus,
  PaymentMethod,
  RepaymentStatus,
  type CreatePaymentInput,
} from '@loan-pilot/domain';
import { PaymentsService } from './payments.service';
import { PrismaService } from '../prisma/prisma.service';

describe('PaymentsService', () => {
  const loanFindFirst = jest.fn();
  const loanFindUnique = jest.fn();
  const loanUpdate = jest.fn();
  const paymentCreate = jest.fn();
  const paymentFindMany = jest.fn();
  const scheduleFindMany = jest.fn();
  const scheduleUpdate = jest.fn();
  const transaction = jest.fn();
  const prismaMock = {
    loan: { findFirst: loanFindFirst, findUnique: loanFindUnique, update: loanUpdate },
    payment: { create: paymentCreate, findMany: paymentFindMany },
    repaymentScheduleItem: { findMany: scheduleFindMany, update: scheduleUpdate },
    $transaction: transaction,
  };
  let service: PaymentsService;

  /** The loan update is the first operation handed to $transaction. */
  const loanWrite = (): Record<string, unknown> =>
    transaction.mock.calls[0]?.[0]?.[0]?.data ?? {};
  /** Every schedule row the recompute chose to rewrite. */
  const scheduleWrites = (): { where: { id: string }; data: Record<string, unknown> }[] =>
    scheduleUpdate.mock.calls.map((call) => call[0]);

  beforeEach(async () => {
    jest.resetAllMocks();
    paymentCreate.mockImplementation((args: { data: Record<string, unknown> }) =>
      Promise.resolve({ id: 'pay_1', ...args.data }),
    );
    loanUpdate.mockImplementation((args: unknown) => args);
    scheduleUpdate.mockImplementation((args: unknown) => args);
    transaction.mockResolvedValue([]);
    paymentFindMany.mockResolvedValue([]);
    scheduleFindMany.mockResolvedValue([]);

    const moduleRef = await Test.createTestingModule({
      providers: [PaymentsService, { provide: PrismaService, useValue: prismaMock }],
    }).compile();
    service = moduleRef.get(PaymentsService);
  });

  const input: CreatePaymentInput = {
    loanId: 'loan_1',
    amount: 500,
    method: PaymentMethod.Cash,
    paidAt: '2026-06-17',
  };

  it('rejects a payment for a loan outside the tenant', async () => {
    loanFindFirst.mockResolvedValue(null);
    await expect(service.create('tenant_1', input)).rejects.toThrow(NotFoundException);
    expect(paymentCreate).not.toHaveBeenCalled();
  });

  it('stores the amount in cents and connects loan + tenant', async () => {
    loanFindFirst.mockResolvedValue({ id: 'loan_1', total: 130000 });
    loanFindUnique.mockResolvedValue({ id: 'loan_1', total: 130000, status: LoanStatus.Active });
    paymentFindMany.mockResolvedValue([{ amount: 50000, paidAt: new Date('2026-06-17') }]);

    await service.create('tenant_1', input);

    const data = paymentCreate.mock.calls[0][0].data;
    expect(data.amount).toBe(50000); // N$ 500
    expect(data.loan.connect.id).toBe('loan_1');
    expect(data.tenant.connect.id).toBe('tenant_1');
  });

  it('settles the loan once payments cover the total', async () => {
    loanFindFirst.mockResolvedValue({ id: 'loan_1', total: 130000 });
    loanFindUnique.mockResolvedValue({ id: 'loan_1', total: 130000, status: LoanStatus.Active });
    paymentFindMany.mockResolvedValue([{ amount: 130000, paidAt: new Date('2026-06-17') }]);

    await service.create('tenant_1', { ...input, amount: 1300 });

    expect(loanWrite()).toMatchObject({ balance: 0, status: LoanStatus.Settled });
  });

  it('marks the loan partly paid when payments are below the total', async () => {
    loanFindFirst.mockResolvedValue({ id: 'loan_1', total: 130000 });
    loanFindUnique.mockResolvedValue({ id: 'loan_1', total: 130000, status: LoanStatus.Active });
    paymentFindMany.mockResolvedValue([{ amount: 50000, paidAt: new Date('2026-06-17') }]);

    await service.create('tenant_1', input);

    expect(loanWrite()).toMatchObject({ balance: 80000, status: LoanStatus.PartlyPaid });
  });

  it('never resurrects a written-off loan', async () => {
    loanFindFirst.mockResolvedValue({ id: 'loan_1', total: 130000 });
    loanFindUnique.mockResolvedValue({
      id: 'loan_1',
      total: 130000,
      status: LoanStatus.WrittenOff,
    });
    paymentFindMany.mockResolvedValue([{ amount: 50000, paidAt: new Date('2026-06-17') }]);

    await service.create('tenant_1', input);

    expect(loanWrite()).toMatchObject({ balance: 80000, status: LoanStatus.WrittenOff });
  });

  describe('schedule progress', () => {
    const twoMonthSchedule = [
      {
        id: 'sch_1',
        number: 1,
        amount: 586442,
        dueAt: new Date('2026-08-13'),
        status: RepaymentStatus.Due,
        paidAt: null,
      },
      {
        id: 'sch_2',
        number: 2,
        amount: 586442,
        dueAt: new Date('2026-09-13'),
        status: RepaymentStatus.Due,
        paidAt: null,
      },
    ];

    beforeEach(() => {
      loanFindFirst.mockResolvedValue({ id: 'loan_1', total: 1172884 });
      loanFindUnique.mockResolvedValue({
        id: 'loan_1',
        total: 1172884,
        status: LoanStatus.Active,
      });
      scheduleFindMany.mockResolvedValue(twoMonthSchedule);
    });

    it('marks an instalment paid once receipts cover it, and dates it by that payment', async () => {
      // N$6,000 against a N$5,864.42 instalment: covers the first, not the second.
      paymentFindMany.mockResolvedValue([{ amount: 600000, paidAt: new Date('2026-08-12') }]);

      await service.create('tenant_1', { ...input, amount: 6000 });

      expect(loanWrite()).toMatchObject({
        balance: 572884,
        instalmentsPaid: 1,
        nextDueAt: new Date('2026-09-13'),
      });
      expect(scheduleWrites()).toEqual([
        {
          where: { id: 'sch_1' },
          data: { status: RepaymentStatus.Paid, paidAt: new Date('2026-08-12') },
        },
      ]);
    });

    it('does not count an instalment that receipts only partly cover', async () => {
      paymentFindMany.mockResolvedValue([{ amount: 500000, paidAt: new Date('2026-08-12') }]);

      await service.create('tenant_1', { ...input, amount: 5000 });

      expect(loanWrite()).toMatchObject({
        instalmentsPaid: 0,
        nextDueAt: new Date('2026-08-13'),
      });
      // The first instalment is past due and still uncovered, so it is flagged overdue.
      expect(scheduleWrites()).toEqual([
        { where: { id: 'sch_1' }, data: { status: RepaymentStatus.Overdue, paidAt: null } },
      ]);
    });

    it('spreads several payments across instalments in date order', async () => {
      paymentFindMany.mockResolvedValue([
        { amount: 300000, paidAt: new Date('2026-08-10') },
        { amount: 300000, paidAt: new Date('2026-08-12') },
        { amount: 572884, paidAt: new Date('2026-09-05') },
      ]);

      await service.create('tenant_1', { ...input, amount: 5728.84 });

      expect(loanWrite()).toMatchObject({
        balance: 0,
        status: LoanStatus.Settled,
        instalmentsPaid: 2,
        nextDueAt: null,
        daysLate: 0,
      });
      expect(scheduleWrites()).toEqual([
        {
          where: { id: 'sch_1' },
          data: { status: RepaymentStatus.Paid, paidAt: new Date('2026-08-12') },
        },
        {
          where: { id: 'sch_2' },
          data: { status: RepaymentStatus.Paid, paidAt: new Date('2026-09-05') },
        },
      ]);
    });

    it('rewrites nothing when the schedule already matches the payments', async () => {
      scheduleFindMany.mockResolvedValue([
        { ...twoMonthSchedule[0], status: RepaymentStatus.Paid, paidAt: new Date('2026-08-12') },
        twoMonthSchedule[1],
      ]);
      paymentFindMany.mockResolvedValue([{ amount: 600000, paidAt: new Date('2026-08-12') }]);

      await service.create('tenant_1', { ...input, amount: 6000 });

      expect(scheduleWrites()).toEqual([]);
    });
  });
});
