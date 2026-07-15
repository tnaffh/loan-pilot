import { Test } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { DocumentKind } from '@loan-pilot/domain';
import { AgreementsService } from './agreements.service';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../documents/storage.service';
import { SettingsService } from '../settings/settings.service';
import { MailService } from '../mail/mail.service';

const lenderIdentity = {
  legalName: 'Raccoons Financial Services CC',
  namfisaLicenceNo: '25/11/1471',
  registrationNo: null,
  physicalAddress: 'Erf 863',
  postalAddress: null,
  contactPhone: '+264818789138',
  contactEmail: 'racoonsfs@gmail.com',
};

const loanPayload = {
  id: 'loan_1',
  tenantId: 'tenant_1',
  borrowerId: 'bor_1',
  principal: 600000,
  financeCharge: 180000,
  interestRate: 0.3,
  total: 780000,
  instalment: 390000,
  termMonths: 2,
  instalmentsTotal: 2,
  disbursedAt: new Date('2026-07-14'),
  tcVersion: '2026-01',
  tcAcceptedAt: new Date('2026-07-14'),
  signatureDocumentId: null,
  tenant: { name: 'Raccoons Financial Services', town: 'Windhoek', logoUrl: null },
  borrower: {
    firstName: 'Selma',
    lastName: 'N',
    idNumber: '98031500412',
    phone: '+264811112222',
    email: 'selma@example.na',
    maritalStatus: 'Single',
    occupation: 'Nurse',
    employer: 'MoH',
    employerPhone: null,
    employerAddress: null,
    employeeNo: null,
    addresses: [
      { isActive: true, label: 'Residential', street: '12 Acacia', suburb: null, city: 'Windhoek', region: null, country: 'Namibia' },
    ],
    bankAccounts: [
      { isActive: true, bankName: 'Bank Windhoek', accountNumber: '620', branchName: null, accountHolderName: 'Selma N', accountType: 'Savings' },
    ],
    references: [{ name: 'Helena', phone: '+264811234567' }],
  },
  schedule: [
    { number: 1, dueAt: new Date('2026-08-14'), amount: 390000 },
    { number: 2, dueAt: new Date('2026-09-14'), amount: 390000 },
  ],
};

describe('AgreementsService', () => {
  const loanFindFirst = jest.fn();
  const documentCreate = jest.fn();
  const documentFindFirst = jest.fn();

  const prismaMock = {
    loan: { findFirst: loanFindFirst },
    document: { create: documentCreate, findFirst: documentFindFirst, findUnique: jest.fn() },
  };
  const storageMock = {
    save: jest.fn().mockResolvedValue({ key: 'documents/agreement.pdf' }),
    safeAccessUrl: jest.fn().mockResolvedValue('https://files/agreement.pdf'),
    read: jest.fn(),
  };
  const settingsMock = {
    getLenderIdentity: jest.fn().mockResolvedValue(lenderIdentity),
    resolveFeeSettings: jest.fn().mockResolvedValue({ monthlyRate: 0.05 }),
  };

  let service: AgreementsService;

  beforeEach(async () => {
    jest.clearAllMocks();
    storageMock.save.mockResolvedValue({ key: 'documents/agreement.pdf' });
    storageMock.safeAccessUrl.mockResolvedValue('https://files/agreement.pdf');
    documentCreate.mockImplementation((args: { data: Record<string, unknown> }) =>
      Promise.resolve({ id: 'doc_1', uploadedAt: new Date(), fileName: 'loan-agreement.pdf', ...args.data }),
    );

    const moduleRef = await Test.createTestingModule({
      providers: [
        AgreementsService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: StorageService, useValue: storageMock },
        { provide: SettingsService, useValue: settingsMock },
        { provide: MailService, useValue: { sendAgreement: jest.fn() } },
      ],
    }).compile();

    service = moduleRef.get(AgreementsService);
  });

  it('404s when the loan belongs to another tenant', async () => {
    loanFindFirst.mockResolvedValue(null);
    await expect(service.generateForLoan('tenant_1', 'loan_x')).rejects.toThrow(NotFoundException);
  });

  it('generates, stores, and links a loan_agreement document', async () => {
    loanFindFirst.mockResolvedValue(loanPayload);

    const view = await service.generateForLoan('tenant_1', 'loan_1');

    expect(loanFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'loan_1', tenantId: 'tenant_1' } }),
    );
    // A PDF buffer was stored...
    const saved = storageMock.save.mock.calls[0][0];
    expect(saved.contentType).toBe('application/pdf');
    expect(saved.buffer.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    // ...and linked to the loan + borrower as a loan_agreement.
    expect(documentCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          loanId: 'loan_1',
          borrowerId: 'bor_1',
          kind: DocumentKind.LoanAgreement,
        }),
      }),
    );
    expect(view.url).toBe('https://files/agreement.pdf');
  });
});
