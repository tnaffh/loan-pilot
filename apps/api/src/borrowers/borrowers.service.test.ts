import { Test } from '@nestjs/testing';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { EmploymentType, UserRole, type CreateBorrowerInput, type SessionUser } from '@loan-pilot/domain';
import { BorrowersService } from './borrowers.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

describe('BorrowersService', () => {
  const create = jest.fn();
  const findFirst = jest.fn();
  const findMany = jest.fn();
  const update = jest.fn();
  const addressFindFirst = jest.fn();
  const addressUpdate = jest.fn();
  // Merge writes (run inside $transaction against the tx client).
  const loanUpdateMany = jest.fn();
  const addressUpdateMany = jest.fn();
  const bankUpdateMany = jest.fn();
  const userUpdate = jest.fn();
  const auditUpdateMany = jest.fn();
  const borrowerDelete = jest.fn();
  const txMock = {
    loan: { updateMany: loanUpdateMany },
    borrowerAddress: { updateMany: addressUpdateMany },
    borrowerBankAccount: { updateMany: bankUpdateMany },
    user: { update: userUpdate },
    auditEvent: { updateMany: auditUpdateMany },
    borrower: { delete: borrowerDelete },
  };
  const prismaMock = {
    borrower: { create, findFirst, update, findMany },
    borrowerAddress: { findFirst: addressFindFirst, update: addressUpdate },
    $transaction: jest.fn((cb: (tx: typeof txMock) => Promise<unknown>) => cb(txMock)),
  };
  const auditMock = {
    record: jest.fn(),
    diff: jest.fn().mockReturnValue([{ field: 'x', from: 'a', to: 'b' }]),
    listFor: jest.fn().mockResolvedValue([]),
  };

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

  // ----- merge duplicates ----------------------------------------------------

  // findFirst is called for survivor, duplicate (with includes), then again by
  // findOneForTenant — resolve by the queried id.
  const mergeFindFirst = (survivor: Record<string, unknown>, duplicate: Record<string, unknown>) =>
    findFirst.mockImplementation(({ where }: { where: { id: string } }) =>
      Promise.resolve(where.id === 'dup_1' ? duplicate : survivor),
    );

  it('merges: reassigns loans, deactivates moved contacts, deletes the duplicate, audits', async () => {
    mergeFindFirst(
      borrower({ id: 'bor_1', user: null }),
      borrower({ id: 'dup_1', firstName: 'Selmah', user: null, _count: { loans: 2 } }),
    );

    await service.mergeBorrowers('tenant_1', actor, 'bor_1', 'dup_1');

    expect(loanUpdateMany).toHaveBeenCalledWith({
      where: { borrowerId: 'dup_1' },
      data: { borrowerId: 'bor_1' },
    });
    expect(addressUpdateMany).toHaveBeenCalledWith({
      where: { borrowerId: 'dup_1' },
      data: { borrowerId: 'bor_1', isActive: false },
    });
    expect(bankUpdateMany).toHaveBeenCalledWith({
      where: { borrowerId: 'dup_1' },
      data: { borrowerId: 'bor_1', isActive: false },
    });
    expect(auditUpdateMany).toHaveBeenCalledWith({
      where: { tenantId: 'tenant_1', entity: 'borrower', entityId: 'dup_1' },
      data: { entityId: 'bor_1' },
    });
    expect(borrowerDelete).toHaveBeenCalledWith({ where: { id: 'dup_1' } });
    expect(userUpdate).not.toHaveBeenCalled();
    expect(auditMock.record).toHaveBeenCalledWith(
      'tenant_1',
      actor,
      expect.objectContaining({ entity: 'borrower', entityId: 'bor_1', action: 'merged' }),
      txMock,
    );
  });

  it('rejects merging a borrower into itself', async () => {
    await expect(service.mergeBorrowers('tenant_1', actor, 'bor_1', 'bor_1')).rejects.toThrow(
      BadRequestException,
    );
    expect(borrowerDelete).not.toHaveBeenCalled();
  });

  it('rejects merge when both borrowers have a portal login', async () => {
    mergeFindFirst(
      borrower({ id: 'bor_1', user: { id: 'u_a' } }),
      borrower({ id: 'dup_1', user: { id: 'u_b' }, _count: { loans: 0 } }),
    );
    await expect(service.mergeBorrowers('tenant_1', actor, 'bor_1', 'dup_1')).rejects.toThrow(
      BadRequestException,
    );
    expect(borrowerDelete).not.toHaveBeenCalled();
  });

  it('reassigns the duplicate portal login when only it has one', async () => {
    mergeFindFirst(
      borrower({ id: 'bor_1', user: null }),
      borrower({ id: 'dup_1', user: { id: 'u_b' }, _count: { loans: 1 } }),
    );
    await service.mergeBorrowers('tenant_1', actor, 'bor_1', 'dup_1');
    expect(userUpdate).toHaveBeenCalledWith({
      where: { id: 'u_b' },
      data: { borrowerId: 'bor_1' },
    });
  });

  it('suggests same-phone / same-name borrowers and excludes the target', async () => {
    findFirst.mockResolvedValue(borrower({ id: 'bor_1', phone: '0811', firstName: 'Selma', lastName: 'N' }));
    findMany.mockResolvedValue([
      borrower({ id: 'same_phone', phone: '0811', firstName: 'Different', lastName: 'Name' }),
      borrower({ id: 'same_name', phone: '0822', firstName: 'selma', lastName: 'n' }),
      borrower({ id: 'noise', phone: '0833', firstName: 'Selma', lastName: 'Other' }),
    ]);
    const result = await service.duplicateSuggestions('tenant_1', 'bor_1');
    const ids = result.map((b) => b.id);
    expect(ids).toContain('same_phone');
    expect(ids).toContain('same_name');
    expect(ids).not.toContain('noise');
    expect(ids).not.toContain('bor_1');
  });
});
