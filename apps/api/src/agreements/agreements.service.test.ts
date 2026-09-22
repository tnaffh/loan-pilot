import { Test } from '@nestjs/testing';
import { Logger, NotFoundException } from '@nestjs/common';
import { DocumentKind } from '@loan-pilot/domain';
import { AgreementsService } from './agreements.service';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../documents/storage.service';
import { SettingsService } from '../settings/settings.service';
import { MailService } from '../mail/mail.service';

const lenderIdentity = {
  name: 'Raccoons Financial Services',
  town: 'Windhoek',
  logoUrl: null,
  legalName: 'Raccoons Financial Services CC',
  namfisaLicenceNo: '25/11/1471',
  registrationNo: null,
  physicalAddress: 'Erf 863',
  postalAddress: null,
  contactPhone: '+264818789138',
  contactEmail: 'racoonsfs@gmail.com',
  website: 'www.raccoonsfinance.com',
  principalOfficerName: 'Eufemia Nghifenwa',
  principalOfficerSignatureUrl: null,
  principalOfficerInitialsUrl: null,
  companyStampUrl: null,
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
  initialsDocumentId: null,
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

  const documentFindMany = jest.fn().mockResolvedValue([]);
  const prismaMock = {
    loan: { findFirst: loanFindFirst },
    document: {
      create: documentCreate,
      findFirst: documentFindFirst,
      findUnique: jest.fn(),
      findMany: documentFindMany,
    },
  };
  const storageMock = {
    save: jest.fn().mockResolvedValue({ key: 'documents/agreement.pdf' }),
    safeAccessUrl: jest.fn().mockResolvedValue('https://files/agreement.pdf'),
    read: jest.fn(),
    tryRead: jest.fn().mockResolvedValue(null),
  };
  const settingsMock = {
    getLenderIdentity: jest.fn().mockResolvedValue(lenderIdentity),
    resolveFeeSettings: jest.fn().mockResolvedValue({ monthlyRate: 0.05 }),
    getSigningAssets: jest.fn().mockResolvedValue({
      officerName: 'Eufemia Nghifenwa',
      officerSignaturePng: null,
      officerInitialsPng: null,
      stampPng: null,
    }),
  };
  const mailMock = { sendAgreement: jest.fn(), sendCollateralAgreement: jest.fn() };

  let service: AgreementsService;

  beforeEach(async () => {
    jest.clearAllMocks();
    documentFindMany.mockResolvedValue([]);
    documentFindFirst.mockResolvedValue(null);
    storageMock.save.mockResolvedValue({ key: 'documents/agreement.pdf' });
    storageMock.safeAccessUrl.mockResolvedValue('https://files/agreement.pdf');
    storageMock.tryRead.mockResolvedValue(null);
    documentCreate.mockImplementation((args: { data: Record<string, unknown> }) =>
      Promise.resolve({ id: 'doc_1', uploadedAt: new Date(), ...args.data }),
    );

    const moduleRef = await Test.createTestingModule({
      providers: [
        AgreementsService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: StorageService, useValue: storageMock },
        { provide: SettingsService, useValue: settingsMock },
        { provide: MailService, useValue: mailMock },
      ],
    }).compile();

    service = moduleRef.get(AgreementsService);
  });

  it('404s when the loan belongs to another tenant', async () => {
    loanFindFirst.mockResolvedValue(null);
    await expect(service.generateForLoan('tenant_1', 'loan_x')).rejects.toThrow(NotFoundException);
  });

  it('generates, stores, and links a loan_agreement document named after the borrower', async () => {
    loanFindFirst.mockResolvedValue(loanPayload);

    const view = await service.generateForLoan('tenant_1', 'loan_1');

    expect(loanFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'loan_1', tenantId: 'tenant_1' } }),
    );
    // A PDF buffer was stored...
    const saved = storageMock.save.mock.calls[0][0];
    expect(saved.contentType).toBe('application/pdf');
    expect(saved.buffer.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    // ...and linked to the loan + borrower as a loan_agreement, under a readable name.
    expect(documentCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          loanId: 'loan_1',
          borrowerId: 'bor_1',
          kind: DocumentKind.LoanAgreement,
          fileName: expect.stringMatching(/^Loan Agreement - Selma N - \d{4}-\d{2}-\d{2}\.pdf$/),
        }),
      }),
    );
    expect(view.url).toBe('https://files/agreement.pdf');
    expect(view.fileName).toMatch(/^Loan Agreement - Selma N - /);
  });

  it('generates, stores, and links a collateral_agreement document', async () => {
    loanFindFirst.mockResolvedValue({
      ...loanPayload,
      collateralItem: 'Toyota Corolla 2015',
      collateralIdentifier: 'N 12345 W',
      collateralDescription: 'Silver sedan',
      collateralCondition: 'Good',
      collateralValue: 8500000,
    });

    const view = await service.generateCollateralForLoan('tenant_1', 'loan_1');

    const saved = storageMock.save.mock.calls[0][0];
    expect(saved.buffer.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    expect(documentCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          loanId: 'loan_1',
          borrowerId: 'bor_1',
          kind: DocumentKind.CollateralAgreement,
          fileName: expect.stringMatching(/^Collateral Agreement - Selma N - /),
        }),
      }),
    );
    expect(view.url).toBe('https://files/agreement.pdf');
  });

  it('404s collateral generation for another tenant', async () => {
    loanFindFirst.mockResolvedValue(null);
    await expect(service.generateCollateralForLoan('tenant_1', 'loan_x')).rejects.toThrow(
      NotFoundException,
    );
  });

  describe('refreshForLoan (after a loan edit)', () => {
    it('regenerates an existing loan agreement and emails the borrower the updated copy', async () => {
      loanFindFirst.mockResolvedValue(loanPayload);
      documentFindFirst.mockImplementation(({ where }: { where: { kind: string } }) =>
        Promise.resolve(
          where.kind === DocumentKind.LoanAgreement
            ? { id: 'doc_old', url: 'documents/old.pdf', fileName: 'Loan Agreement - old.pdf' }
            : null,
        ),
      );

      await service.refreshForLoan('tenant_1', 'loan_1');

      expect(storageMock.save).toHaveBeenCalledTimes(1);
      expect(documentCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ kind: DocumentKind.LoanAgreement }),
        }),
      );
      expect(mailMock.sendAgreement).toHaveBeenCalledWith(
        'selma@example.na',
        'Selma N',
        'Raccoons Financial Services CC',
        expect.any(Buffer),
        expect.stringMatching(/^Loan Agreement - Selma N - /),
        { updated: true },
      );
      // No collateral agreement existed, so none was produced.
      expect(mailMock.sendCollateralAgreement).not.toHaveBeenCalled();
    });

    it('leaves a loan with no generated agreement alone', async () => {
      loanFindFirst.mockResolvedValue(loanPayload);
      documentFindFirst.mockResolvedValue(null);

      await service.refreshForLoan('tenant_1', 'loan_1');

      expect(storageMock.save).not.toHaveBeenCalled();
      expect(mailMock.sendAgreement).not.toHaveBeenCalled();
    });

    it('regenerates without emailing when the borrower has no email address', async () => {
      loanFindFirst.mockResolvedValue({
        ...loanPayload,
        borrower: { ...loanPayload.borrower, email: '' },
      });
      documentFindFirst.mockImplementation(({ where }: { where: { kind: string } }) =>
        Promise.resolve(where.kind === DocumentKind.LoanAgreement ? { id: 'doc_old' } : null),
      );

      await service.refreshForLoan('tenant_1', 'loan_1');

      expect(storageMock.save).toHaveBeenCalledTimes(1);
      expect(mailMock.sendAgreement).not.toHaveBeenCalled();
    });

    it('never throws — a storage failure is logged so the loan edit still stands', async () => {
      const logged = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
      loanFindFirst.mockResolvedValue(loanPayload);
      documentFindFirst.mockResolvedValue({ id: 'doc_old' });
      storageMock.save.mockRejectedValue(new Error('bucket offline'));

      await expect(service.refreshForLoan('tenant_1', 'loan_1')).resolves.toBeUndefined();
      expect(logged).toHaveBeenCalledWith(
        expect.stringContaining('loan_1'),
        expect.stringContaining('bucket offline'),
      );
      logged.mockRestore();
    });
  });
});
