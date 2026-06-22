import { Test } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { EmploymentType, UserRole, type CreateBorrowerInput, type SessionUser } from '@loan-pilot/domain';
import { BorrowersService } from './borrowers.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

describe('BorrowersService', () => {
  const create = jest.fn();
  const findFirst = jest.fn();
  const update = jest.fn();
  const addressFindFirst = jest.fn();
  const addressUpdate = jest.fn();
  const prismaMock = {
    borrower: { create, findFirst, update, findMany: jest.fn() },
    borrowerAddress: { findFirst: addressFindFirst, update: addressUpdate },
  };
  const auditMock = { record: jest.fn(), diff: jest.fn().mockReturnValue([{ field: 'x', from: 'a', to: 'b' }]) };

  let service: BorrowersService;

  const actor: SessionUser = {
    id: 'user_1',
    email: 'admin@rfs.na',
    name: 'Admin',
    role: UserRole.LenderAdmin,
    tenantId: 'tenant_1',
    tenantSlug: 'rfs',
  };

  const borrower = (over: Record<string, unknown> = {}) => ({
    id: 'bor_1',
    tenantId: 'tenant_1',
    firstName: 'Selma',
    lastName: 'Nghidinwa',
    idNumber: '98031500412',
    phone: '+264811112222',
    email: 'selma@example.na',
    employer: 'Ministry of Health',
    occupation: 'Nurse',
    monthlyIncome: 1850000,
    employmentType: EmploymentType.PermanentlyEmployed,
    gender: null,
    payDay: null,
    status: 'active',
    since: new Date('2024-01-01'),
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    ...over,
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    create.mockImplementation((args: { data: Record<string, unknown> }) =>
      Promise.resolve({ id: 'bor_1', ...args.data }),
    );
    update.mockImplementation((args: { data: Record<string, unknown> }) =>
      Promise.resolve(borrower(args.data)),
    );

    const moduleRef = await Test.createTestingModule({
      providers: [
        BorrowersService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: AuditService, useValue: auditMock },
      ],
    }).compile();
    service = moduleRef.get(BorrowersService);
  });

  const baseInput: CreateBorrowerInput = {
    firstName: 'Selma',
    lastName: 'Nghidinwa',
    idNumber: '98031500412',
    phone: '+264811112222',
    email: 'selma@example.na',
    address: { street: '12 Acacia St', city: 'Windhoek', country: 'Namibia' },
    employer: 'Ministry of Health',
    occupation: 'Nurse',
    monthlyIncome: 18500,
    employmentType: EmploymentType.PermanentlyEmployed,
    bankAccount: {
      bankName: 'Bank Windhoek',
      accountNumber: '62001234567',
      accountHolderName: 'Selma Nghidinwa',
      accountType: 'Savings',
    },
  };

  it('stores monthly income in cents, connects the tenant, and seeds an active address + account', async () => {
    await service.create('tenant_1', baseInput);
    const data = create.mock.calls[0][0].data;
    expect(data.monthlyIncome).toBe(1850000);
    expect(data.tenant.connect.id).toBe('tenant_1');
    expect(data.addresses.create[0]).toMatchObject({ street: '12 Acacia St', isActive: true });
  });

  it('maps a duplicate ID number to a ConflictException on create', async () => {
    create.mockRejectedValue({ code: 'P2002' });
    await expect(service.create('tenant_1', baseInput)).rejects.toThrow(ConflictException);
  });

  it('rejects updates to borrowers outside the tenant', async () => {
    findFirst.mockResolvedValue(null);
    await expect(
      service.update('tenant_1', actor, 'bor_9', { phone: '+264810000000' }),
    ).rejects.toThrow(NotFoundException);
    expect(update).not.toHaveBeenCalled();
  });

  it('converts monthly income on update and records an audit entry', async () => {
    findFirst.mockResolvedValue(borrower());
    await service.update('tenant_1', actor, 'bor_1', { monthlyIncome: 20000 });
    expect(update.mock.calls[0][0].data.monthlyIncome).toBe(2000000);
    expect(auditMock.record).toHaveBeenCalledWith(
      'tenant_1',
      actor,
      expect.objectContaining({ entity: 'borrower', entityId: 'bor_1', action: 'updated' }),
    );
  });

  it('maps a duplicate ID number to a ConflictException on update (no audit)', async () => {
    findFirst.mockResolvedValue(borrower());
    update.mockRejectedValue({ code: 'P2002' });
    await expect(
      service.update('tenant_1', actor, 'bor_1', { idNumber: '11111111111' }),
    ).rejects.toThrow(ConflictException);
    expect(auditMock.record).not.toHaveBeenCalled();
  });

  it('edits an address in place and audits it', async () => {
    findFirst.mockResolvedValue(borrower());
    addressFindFirst.mockResolvedValue({
      id: 'addr_1',
      borrowerId: 'bor_1',
      label: 'Residential',
      street: 'Old St',
      suburb: null,
      city: 'Windhoek',
      region: null,
      country: 'Namibia',
    });
    addressUpdate.mockImplementation((args: { data: Record<string, unknown> }) =>
      Promise.resolve({ id: 'addr_1', borrowerId: 'bor_1', street: 'New St', city: 'Windhoek', country: 'Namibia', label: null, suburb: null, region: null, ...args.data }),
    );
    await service.updateAddress('tenant_1', actor, 'bor_1', 'addr_1', { street: 'New St' });
    expect(addressUpdate).toHaveBeenCalled();
    expect(auditMock.record).toHaveBeenCalledWith(
      'tenant_1',
      actor,
      expect.objectContaining({ action: 'address_updated' }),
    );
  });
});
