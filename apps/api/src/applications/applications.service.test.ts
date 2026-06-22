import { Test } from '@nestjs/testing';
import { ConflictException } from '@nestjs/common';
import {
  ApplicationStatus,
  EmploymentType,
  LoanType,
  type CreateApplicationInput,
} from '@loan-pilot/domain';
import { ApplicationsService } from './applications.service';
import { LoansService } from '../loans/loans.service';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../documents/storage.service';
import { AuditService } from '../audit/audit.service';

describe('ApplicationsService', () => {
  const create = jest.fn();
  const applicationFindFirst = jest.fn();
  const applicationUpdate = jest.fn();
  const borrowerUpsert = jest.fn();
  const loanCreate = jest.fn();

  const txMock = {
    loanApplication: { findFirst: applicationFindFirst, update: applicationUpdate },
    borrower: { upsert: borrowerUpsert },
    borrowerAddress: { updateMany: jest.fn(), create: jest.fn() },
    borrowerBankAccount: { updateMany: jest.fn(), create: jest.fn() },
    loan: { create: loanCreate },
  };

  const prismaMock = {
    loanApplication: { create, findMany: jest.fn() },
    $transaction: jest.fn(async (fn: (tx: typeof txMock) => Promise<unknown>) => fn(txMock)),
  };

  let service: ApplicationsService;

  beforeEach(async () => {
    jest.clearAllMocks();
    create.mockImplementation((args: { data: Record<string, unknown> }) =>
      Promise.resolve({ id: 'app_1', ...args.data }),
    );
    applicationUpdate.mockImplementation((args: { data: Record<string, unknown> }) =>
      Promise.resolve({ id: 'app_1', ...args.data }),
    );
    borrowerUpsert.mockResolvedValue({ id: 'bor_new' });
    loanCreate.mockImplementation((args: { data: Record<string, unknown> }) =>
      Promise.resolve({ id: 'loan_new', ...args.data }),
    );

    const moduleRef = await Test.createTestingModule({
      providers: [
        ApplicationsService,
        LoansService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: StorageService, useValue: { accessUrl: jest.fn(), save: jest.fn() } },
        {
          provide: AuditService,
          useValue: { record: jest.fn(), diff: jest.fn().mockReturnValue([]), listFor: jest.fn() },
        },
      ],
    }).compile();

    service = moduleRef.get(ApplicationsService);
  });

  const baseInput: CreateApplicationInput = {
    loanType: LoanType.Payday,
    amount: 5000,
    termMonths: 1,
    firstName: 'Selma',
    lastName: 'Nghidinwa',
    idNumber: '98031500412',
    dateOfBirth: '1998-03-15',
    phone: '+264811112222',
    email: 'selma@example.na',
    address: { street: '12 Acacia St', city: 'Windhoek', country: 'Namibia' },
    employmentType: EmploymentType.PermanentlyEmployed,
    employer: 'Ministry of Health',
    occupation: 'Nurse',
    monthlyIncome: 18000,
    bankAccount: {
      bankName: 'Bank Windhoek',
      accountNumber: '62001234567',
      accountHolderName: 'Selma Nghidinwa',
      accountType: 'Savings',
    },
    references: [
      { name: 'Helena K', phone: '+264811234567' },
      { name: 'Petrus H', phone: '+264814455667' },
    ],
    consent: true,
  };

  it('prices the loan in cents and stores an affordability assessment', async () => {
    await service.create('tenant_1', baseInput);

    expect(create).toHaveBeenCalledTimes(1);
    const data = create.mock.calls[0][0].data;
    expect(data.amount).toBe(500000); // N$ 5,000 in cents
    expect(data.quotedTotal).toBe(650000); // 30% finance charge
    expect(data.quotedInstalment).toBe(650000);
    expect(data.affordability).toBe('pass');
    expect(data.tenant.connect.id).toBe('tenant_1');
    expect(data.references.create).toHaveLength(2);
  });

  it('fails affordability when the instalment is unaffordable', async () => {
    await service.create('tenant_1', { ...baseInput, amount: 15000, monthlyIncome: 9000 });

    const data = create.mock.calls[0][0].data;
    expect(data.affordability).toBe('fail');
  });

  const pendingApplication = {
    id: 'app_1',
    tenantId: 'tenant_1',
    status: ApplicationStatus.Pending,
    firstName: 'Selma',
    lastName: 'Nghidinwa',
    idNumber: '98031500412',
    phone: '+264811112222',
    email: 'selma@example.na',
    addrStreet: '12 Acacia St',
    addrSuburb: null,
    addrCity: 'Windhoek',
    addrRegion: null,
    addrCountry: 'Namibia',
    employer: 'Ministry of Health',
    occupation: 'Nurse',
    declaredIncome: 1400000,
    employmentType: EmploymentType.PermanentlyEmployed,
    bankName: 'Bank Windhoek',
    bankAccountNumber: '62001234567',
    bankBranchName: null,
    bankBranchCode: null,
    bankAccountHolder: 'Selma Nghidinwa',
    accountType: 'Savings',
    type: LoanType.Payday,
    amount: 600000, // N$ 6,000 in cents
    termMonths: 2,
  };

  it('approving creates the borrower and a quoted loan, then flips the status', async () => {
    applicationFindFirst.mockResolvedValue(pendingApplication);

    const result = await service.updateStatus('tenant_1', 'app_1', {
      status: ApplicationStatus.Approved,
    });

    expect(borrowerUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId_idNumber: { tenantId: 'tenant_1', idNumber: '98031500412' } },
      }),
    );
    const loanData = loanCreate.mock.calls[0][0].data;
    expect(loanData.borrower.connect.id).toBe('bor_new');
    expect(loanData.total).toBe(780000); // N$ 7,800 (30% charge on N$ 6,000)
    expect(loanData.instalment).toBe(390000);
    expect(loanData.schedule.create).toHaveLength(2);
    expect(applicationUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: ApplicationStatus.Approved, declineReason: null }),
      }),
    );
    expect(result.loanId).toBe('loan_new');
  });

  it('declining flips the status without creating a loan and stores the reason', async () => {
    applicationFindFirst.mockResolvedValue(pendingApplication);

    const result = await service.updateStatus('tenant_1', 'app_1', {
      status: ApplicationStatus.Declined,
      reason: 'Affordability too tight',
    });

    expect(borrowerUpsert).not.toHaveBeenCalled();
    expect(loanCreate).not.toHaveBeenCalled();
    expect(result.loanId).toBeNull();
    expect(applicationUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: ApplicationStatus.Declined,
          declineReason: 'Affordability too tight',
        }),
      }),
    );
  });

  it('moving to review keeps it open with no loan', async () => {
    applicationFindFirst.mockResolvedValue(pendingApplication);

    const result = await service.updateStatus('tenant_1', 'app_1', {
      status: ApplicationStatus.Review,
    });

    expect(loanCreate).not.toHaveBeenCalled();
    expect(result.loanId).toBeNull();
    expect(applicationUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: ApplicationStatus.Review }) }),
    );
  });

  it('rejects deciding an application twice', async () => {
    applicationFindFirst.mockResolvedValue({
      ...pendingApplication,
      status: ApplicationStatus.Approved,
    });

    await expect(
      service.updateStatus('tenant_1', 'app_1', { status: ApplicationStatus.Declined }),
    ).rejects.toThrow(ConflictException);
    expect(applicationUpdate).not.toHaveBeenCalled();
  });
});
