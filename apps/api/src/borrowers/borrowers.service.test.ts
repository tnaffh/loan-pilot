import { Test } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { EmploymentType, type CreateBorrowerInput } from '@loan-pilot/domain';
import { BorrowersService } from './borrowers.service';
import { PrismaService } from '../prisma/prisma.service';

describe('BorrowersService', () => {
  const create = jest.fn();
  const findFirst = jest.fn();
  const update = jest.fn();
  const prismaMock = { borrower: { create, findFirst, update, findMany: jest.fn() } };
  let service: BorrowersService;

  beforeEach(async () => {
    create.mockReset();
    findFirst.mockReset();
    update.mockReset();
    create.mockImplementation((args: { data: Record<string, unknown> }) =>
      Promise.resolve({ id: 'bor_1', ...args.data }),
    );
    update.mockImplementation((args: { data: Record<string, unknown> }) =>
      Promise.resolve({ id: 'bor_1', ...args.data }),
    );

    const moduleRef = await Test.createTestingModule({
      providers: [BorrowersService, { provide: PrismaService, useValue: prismaMock }],
    }).compile();

    service = moduleRef.get(BorrowersService);
  });

  const baseInput: CreateBorrowerInput = {
    firstName: 'Selma',
    lastName: 'Nghidinwa',
    idNumber: '98031500412',
    phone: '+264811112222',
    email: 'selma@example.na',
    address: '12 Acacia St, Windhoek',
    employer: 'Ministry of Health',
    occupation: 'Nurse',
    monthlyIncome: 18500,
    employmentType: EmploymentType.PermanentlyEmployed,
    bank: 'Bank Windhoek',
    accountType: 'Savings',
  };

  it('stores monthly income in cents and connects the tenant', async () => {
    await service.create('tenant_1', baseInput);

    expect(create).toHaveBeenCalledTimes(1);
    const data = create.mock.calls[0][0].data;
    expect(data.monthlyIncome).toBe(1850000); // N$ 18,500 in cents
    expect(data.tenant.connect.id).toBe('tenant_1');
  });

  it('maps a duplicate ID number to a ConflictException', async () => {
    create.mockRejectedValue({ code: 'P2002' });

    await expect(service.create('tenant_1', baseInput)).rejects.toThrow(ConflictException);
  });

  it('rejects updates to borrowers outside the tenant', async () => {
    findFirst.mockResolvedValue(null);

    await expect(service.update('tenant_1', 'bor_9', { phone: '+264810000000' })).rejects.toThrow(
      NotFoundException,
    );
    expect(update).not.toHaveBeenCalled();
  });

  it('converts monthly income on update when provided', async () => {
    findFirst.mockResolvedValue({ id: 'bor_1', tenantId: 'tenant_1' });

    await service.update('tenant_1', 'bor_1', { monthlyIncome: 20000 });

    const data = update.mock.calls[0][0].data;
    expect(data.monthlyIncome).toBe(2000000);
  });
});
