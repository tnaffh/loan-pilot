import { Test } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { LoanStatus, PaymentMethod, type CreatePaymentInput } from '@loan-pilot/domain';
import { PaymentsService } from './payments.service';
import { PrismaService } from '../prisma/prisma.service';

describe('PaymentsService', () => {
  const loanFindFirst = jest.fn();
  const loanFindUnique = jest.fn();
  const loanUpdate = jest.fn();
  const paymentCreate = jest.fn();
  const paymentAggregate = jest.fn();
  const prismaMock = {
    loan: { findFirst: loanFindFirst, findUnique: loanFindUnique, update: loanUpdate },
    payment: { create: paymentCreate, aggregate: paymentAggregate, findMany: jest.fn() },
  };
  let service: PaymentsService;

  beforeEach(async () => {
    jest.resetAllMocks();
    paymentCreate.mockImplementation((args: { data: Record<string, unknown> }) =>
      Promise.resolve({ id: 'pay_1', ...args.data }),
    );
    loanUpdate.mockResolvedValue({ id: 'loan_1' });

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
    paymentAggregate.mockResolvedValue({ _sum: { amount: 50000 } });

    await service.create('tenant_1', input);

    const data = paymentCreate.mock.calls[0][0].data;
    expect(data.amount).toBe(50000); // N$ 500
    expect(data.loan.connect.id).toBe('loan_1');
    expect(data.tenant.connect.id).toBe('tenant_1');
  });

  it('settles the loan once payments cover the total', async () => {
    loanFindFirst.mockResolvedValue({ id: 'loan_1', total: 130000 });
    loanFindUnique.mockResolvedValue({ id: 'loan_1', total: 130000, status: LoanStatus.Active });
    paymentAggregate.mockResolvedValue({ _sum: { amount: 130000 } });

    await service.create('tenant_1', { ...input, amount: 1300 });

    expect(loanUpdate).toHaveBeenCalledWith({
      where: { id: 'loan_1' },
      data: { balance: 0, status: LoanStatus.Settled },
    });
  });

  it('marks the loan partly paid when payments are below the total', async () => {
    loanFindFirst.mockResolvedValue({ id: 'loan_1', total: 130000 });
    loanFindUnique.mockResolvedValue({ id: 'loan_1', total: 130000, status: LoanStatus.Active });
    paymentAggregate.mockResolvedValue({ _sum: { amount: 50000 } });

    await service.create('tenant_1', input);

    expect(loanUpdate).toHaveBeenCalledWith({
      where: { id: 'loan_1' },
      data: { balance: 80000, status: LoanStatus.PartlyPaid },
    });
  });

  it('never resurrects a written-off loan', async () => {
    loanFindFirst.mockResolvedValue({ id: 'loan_1', total: 130000 });
    loanFindUnique.mockResolvedValue({ id: 'loan_1', total: 130000, status: LoanStatus.WrittenOff });
    paymentAggregate.mockResolvedValue({ _sum: { amount: 50000 } });

    await service.create('tenant_1', input);

    expect(loanUpdate).toHaveBeenCalledWith({
      where: { id: 'loan_1' },
      data: { balance: 80000, status: LoanStatus.WrittenOff },
    });
  });
});
