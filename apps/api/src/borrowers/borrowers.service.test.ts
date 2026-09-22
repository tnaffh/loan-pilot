import { Test } from '@nestjs/testing';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { EmploymentType, UserRole, type CreateBorrowerInput, type SessionUser } from '@loan-pilot/domain';
import { BorrowersService } from './borrowers.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { DocumentsService } from '../documents/documents.service';
import { StorageService } from '../documents/storage.service';
import { SettingsService } from '../settings/settings.service';

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
  const tenantFindUnique = jest.fn();
  const prismaMock = {
    borrower: { create, findFirst, update, findMany },
    borrowerAddress: { findFirst: addressFindFirst, update: addressUpdate },
    tenant: { findUnique: tenantFindUnique },
    $transaction: jest.fn((cb: (tx: typeof txMock) => Promise<unknown>) => cb(txMock)),
  };
  const auditMock = {
    record: jest.fn(),
    diff: jest.fn().mockReturnValue([{ field: 'x', from: 'a', to: 'b' }]),
    listFor: jest.fn().mockResolvedValue([]),
  };
  const documentsMock = {
    listForBorrower: jest.fn().mockResolvedValue([]),
    createForBorrower: jest.fn(),
    removeForBorrower: jest.fn(),
  };
  const settingsMock = {
    resolveFeeSettings: jest.fn().mockResolvedValue({
      namfisaLevyRate: 0,
      stampDutyCents: 0,
      insuranceRate: 0,
      insuranceFlatCents: 0,
      monthlyRate: 0.05,
    }),
    getLenderIdentity: jest.fn().mockResolvedValue({
      name: 'Regal Financial Solutions',
      town: 'Windhoek',
      logoUrl: null,
      legalName: 'Regal Financial Solutions CC',
      namfisaLicenceNo: '25/11/1471',
      registrationNo: null,
      physicalAddress: 'Erf 863',
      postalAddress: null,
      contactPhone: '+264818789138',
      contactEmail: 'info@regal.na',
      website: 'www.regal.na',
      principalOfficerName: 'Eufemia Nghifenwa',
      principalOfficerSignatureUrl: null,
      principalOfficerInitialsUrl: null,
      companyStampUrl: null,
    }),
    getSigningAssets: jest.fn().mockResolvedValue({
      officerName: 'Eufemia Nghifenwa',
      officerSignaturePng: null,
      officerInitialsPng: null,
      stampPng: null,
    }),
  };
  const storageMock = {
    safeAccessUrl: jest.fn().mockResolvedValue(null),
    tryRead: jest.fn().mockResolvedValue(null),
  };

  let service: BorrowersService;

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
        { provide: DocumentsService, useValue: documentsMock },
        { provide: SettingsService, useValue: settingsMock },
        { provide: StorageService, useValue: storageMock },
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

  const borrowerWithHistory = () =>
    borrower({
      loans: [
        {
          id: 'loan_open',
          type: 'payday',
          status: 'arrears',
          principal: 100000,
          balance: 130000,
          instalmentsPaid: 0,
          instalmentsTotal: 1,
          nextDueAt: new Date('2020-02-01'),
          disbursedAt: new Date('2020-01-01'),
          // Long overdue → default interest accrues, so payoff exceeds balance.
          schedule: [{ amount: 130000, dueAt: new Date('2020-02-01'), status: 'due' }],
        },
        {
          id: 'loan_settled',
          type: 'payday',
          status: 'settled',
          principal: 80000,
          balance: 0,
          instalmentsPaid: 1,
          instalmentsTotal: 1,
          nextDueAt: null,
          disbursedAt: new Date('2021-01-01'),
          schedule: [{ amount: 104000, dueAt: new Date('2021-02-01'), status: 'paid' }],
        },
        {
          id: 'loan_cancelled',
          type: 'payday',
          status: 'cancelled',
          principal: 50000,
          balance: 0,
          instalmentsPaid: 0,
          instalmentsTotal: 1,
          nextDueAt: null,
          disbursedAt: null,
          schedule: [],
        },
      ],
      addresses: [{ street: '1 Main', suburb: null, city: 'Windhoek', region: null, country: 'Namibia' }],
    });

  it('builds a statement of the open accounts only, with payoff (incl. default interest) and totals', async () => {
    findFirst.mockResolvedValue(borrowerWithHistory());

    const letter = await service.statementLetter('tenant_1', 'bor_1');

    expect(letter.borrower.address).toBe('1 Main, Windhoek, Namibia');
    // Settled and cancelled loans are history, not part of the account position.
    expect(letter.loans.map((loan) => loan.id)).toEqual(['loan_open']);
    expect(letter.totals.openLoans).toBe(1);
    expect(letter.totals.settledLoans).toBe(1);
    // A cancelled loan never advanced funds, so it is not "borrowed".
    expect(letter.totals.lifetimeBorrowed).toBe(180000);
    const openLoan = letter.loans[0];
    expect(openLoan?.payoff).toBeGreaterThan(130000); // includes default interest
    expect(openLoan?.defaultInterest).toBe((openLoan?.payoff ?? 0) - 130000);
    expect(letter.totals.outstanding).toBe(openLoan?.payoff);
    expect(letter.hasOutstanding).toBe(true);
  });

  it('renders the statement letter as a PDF named after the borrower', async () => {
    findFirst.mockResolvedValue(borrowerWithHistory());
    tenantFindUnique.mockResolvedValue({ name: 'Regal Financial Solutions', town: 'Windhoek', logoUrl: null });

    const { pdf, fileName } = await service.statementLetterPdf('tenant_1', 'bor_1');

    expect(pdf.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    expect(fileName).toMatch(/^Statement of Account - Selma Nghidinwa - \d{4}-\d{2}-\d{2}\.pdf$/);
    expect(settingsMock.getSigningAssets).toHaveBeenCalledWith('tenant_1');
  });
});
