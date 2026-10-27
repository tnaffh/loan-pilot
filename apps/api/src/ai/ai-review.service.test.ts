import { Test } from '@nestjs/testing';
import { ConflictException } from '@nestjs/common';
import {
  AiAuthenticity,
  AiDocumentType,
  AiProvider,
  AiRecommendation,
  AiReviewStatus,
  AiRiskLevel,
  UserRole,
  type AiReviewOutput,
  type SessionUser,
} from '@loan-pilot/domain';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../documents/storage.service';
import { AiReviewService } from './ai-review.service';
import { AiSettingsService, type ActiveAiConfig } from './ai-settings.service';
import { AiProviderError } from './providers/ai-provider';

const user: SessionUser = {
  id: 'u1',
  email: 'officer@rfs.na',
  phone: null,
  name: 'Officer',
  role: UserRole.LenderAdmin,
  tenantId: 't1',
  tenantSlug: 'rfs',
  roleId: 'r1',
  permissions: ['applications:read', 'ai:review'],
};

const application = {
  id: 'app1',
  tenantId: 't1',
  firstName: 'Helena',
  lastName: 'Ndapewa',
  idNumber: '90010100123',
  dateOfBirth: '1990-01-01',
  phone: '0811234567',
  email: 'h@x.na',
  addrStreet: '1 Main',
  addrSuburb: null,
  addrCity: 'Windhoek',
  addrRegion: null,
  addrCountry: 'Namibia',
  gender: 'Female',
  employer: 'MoE',
  employeeNo: null,
  occupation: 'Teacher',
  employmentType: 'civil_servant',
  declaredIncome: 1_000_000,
  bankName: 'Bank Windhoek',
  bankAccountNumber: '8001',
  bankAccountHolder: 'H Ndapewa',
  bankBranchName: null,
  bankBranchCode: null,
  accountType: 'Savings',
  type: 'payday',
  amount: 300_000,
  termMonths: 1,
  quotedInstalment: 390_000,
  quotedTotal: 390_000,
  purpose: null,
  submittedAt: new Date('2026-10-10T00:00:00Z'),
  documents: [
    {
      id: 'doc-1',
      kind: 'bank_statement',
      url: 'documents/a.pdf',
      fileName: 'statement.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 10,
      uploadedAt: new Date('2026-10-10T00:00:00Z'),
    },
    {
      id: 'doc-sig',
      kind: 'signature',
      url: 'documents/s.png',
      fileName: 'signature.png',
      mimeType: 'image/png',
      sizeBytes: 10,
      uploadedAt: new Date('2026-10-10T00:00:00Z'),
    },
    {
      id: 'doc-heic',
      kind: 'id_document',
      url: 'documents/id.heic',
      fileName: 'id.heic',
      mimeType: 'image/heic',
      sizeBytes: 10,
      uploadedAt: new Date('2026-10-10T00:00:00Z'),
    },
  ],
};

const output: AiReviewOutput = {
  summary: 'Looks fine.',
  score: 75,
  riskLevel: AiRiskLevel.Medium,
  recommendation: AiRecommendation.Approve,
  recommendationReason: 'Consistent.',
  conditions: [],
  documents: [
    {
      documentId: 'doc-1',
      detectedType: AiDocumentType.BankStatement,
      authenticity: AiAuthenticity.AppearsGenuine,
      periodStart: null,
      periodEnd: null,
      notes: '',
    },
  ],
  checks: [],
  redFlags: [],
  income: {
    verifiedNetMonthlyIncome: 10000,
    payslipNetPay: null,
    payslipGrossPay: null,
    employerOnPayslip: null,
    payDay: null,
    salaryCredits: [],
  },
  obligations: { otherLenders: [], failedDebitOrderCount: 0 },
  statement: {
    bankName: null,
    accountHolder: null,
    accountNumber: null,
    accountType: null,
    isTransactionalAccount: null,
  },
};

describe('AiReviewService', () => {
  const review = jest.fn();
  const config: ActiveAiConfig = {
    provider: AiProvider.Anthropic,
    model: 'claude-opus-5-5',
    apiKey: 'sk-test',
    client: {
      provider: AiProvider.Anthropic,
      limits: {
        maxPdfBytes: 1000,
        maxImageBytes: 1000,
        maxTotalBytes: 5000,
        imageTypes: ['image/jpeg', 'image/png'],
      },
      review,
      verify: jest.fn(),
    },
  };
  const reviewUpdate = jest.fn().mockResolvedValue({});
  const prismaMock = {
    aiReview: {
      create: jest.fn().mockResolvedValue({ id: 'rev1', status: AiReviewStatus.Running }),
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
      update: reviewUpdate,
      updateMany: jest.fn(),
    },
    loanApplication: { findFirst: jest.fn().mockResolvedValue(application) },
    borrower: { findFirst: jest.fn().mockResolvedValue(null) },
    document: { findMany: jest.fn().mockResolvedValue([]) },
  };

  /** The applicant has a borrower profile holding a statement sent in later. */
  const withProfileStatement = () => {
    prismaMock.borrower.findFirst.mockResolvedValue({ id: 'bor1', loans: [] });
    prismaMock.document.findMany.mockResolvedValue([
      {
        id: 'doc-profile',
        kind: 'bank_statement',
        url: 'documents/later.pdf',
        fileName: 'statement-later.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 10,
        applicationId: null,
        borrowerId: 'bor1',
        uploadedAt: new Date('2026-10-20T00:00:00Z'),
      },
    ]);
  };

  afterEach(() => {
    prismaMock.borrower.findFirst.mockResolvedValue(null);
    prismaMock.document.findMany.mockResolvedValue([]);
  });
  const storageMock = { tryRead: jest.fn().mockResolvedValue(Buffer.from('%PDF-1.7\n%%EOF')) };
  const settingsMock = { resolveActive: jest.fn().mockResolvedValue(config) };
  let service: AiReviewService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        AiReviewService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: StorageService, useValue: storageMock },
        { provide: AiSettingsService, useValue: settingsMock },
      ],
    }).compile();

    service = moduleRef.get(AiReviewService);
  });

  it('fails reviews cut off by a restart when the API starts', async () => {
    prismaMock.aiReview.updateMany.mockResolvedValueOnce({ count: 1 });

    await service.onApplicationBootstrap();

    expect(prismaMock.aiReview.updateMany).toHaveBeenCalledWith({
      where: { status: AiReviewStatus.Running },
      data: expect.objectContaining({
        status: AiReviewStatus.Failed,
        error: expect.stringContaining('server restarted'),
      }),
    });
  });

  it('refuses to start a second review while one is running', async () => {
    jest.spyOn(service, 'execute').mockResolvedValue();
    prismaMock.aiReview.findFirst.mockResolvedValueOnce({ id: 'running' });
    await expect(service.startForApplication('t1', user, 'app1')).rejects.toThrow(
      ConflictException,
    );
    expect(prismaMock.aiReview.create).not.toHaveBeenCalled();
  });

  it('starts a running review and hands it to the background runner', async () => {
    const execute = jest.spyOn(service, 'execute').mockResolvedValue();
    const started = await service.startForApplication('t1', user, 'app1');

    expect(started.status).toBe(AiReviewStatus.Running);
    expect(prismaMock.aiReview.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          applicationId: 'app1',
          requestedByName: 'Officer',
          model: 'claude-opus-5-5',
        }),
      }),
    );
    expect(execute).toHaveBeenCalledWith('rev1', 't1', { applicationId: 'app1' }, config, {
      documentIds: [],
      notes: null,
    });
  });

  it('offers the application files ticked and profile files unticked, never signatures', async () => {
    withProfileStatement();

    const options = await service.documentOptionsForApplication('t1', 'app1');

    expect(options.map((option) => [option.id, option.source, option.selected])).toEqual([
      ['doc-1', 'application', true],
      ['doc-heic', 'application', false],
      ['doc-profile', 'profile', false],
    ]);
    expect(options[1]?.unsupported).toContain('image/heic');
  });

  it('stores the chosen documents and notes, and rejects documents not on offer', async () => {
    const execute = jest.spyOn(service, 'execute').mockResolvedValue();

    withProfileStatement();
    await expect(
      service.startForApplication('t1', user, 'app1', { documentIds: ['someone-elses-doc'] }),
    ).rejects.toThrow('not available for this review');

    await service.startForApplication('t1', user, 'app1', {
      documentIds: ['doc-profile'],
      notes: 'Statement came later via WhatsApp.',
    });

    expect(prismaMock.aiReview.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          documentIds: ['doc-profile'],
          notes: 'Statement came later via WhatsApp.',
        }),
      }),
    );
    expect(execute).toHaveBeenCalledWith('rev1', 't1', { applicationId: 'app1' }, config, {
      documentIds: ['doc-profile'],
      notes: 'Statement came later via WhatsApp.',
    });
  });

  it('reviews only the chosen files, counts a profile statement as present, and passes notes', async () => {
    withProfileStatement();
    review.mockResolvedValue({
      output,
      model: 'claude-opus-5-5',
      usage: { inputTokens: 1000, outputTokens: 500, cacheReadTokens: 0, cacheWriteTokens: 0 },
    });

    await service.execute('rev1', 't1', { applicationId: 'app1' }, config, {
      documentIds: ['doc-profile'],
      notes: 'Ignore the file labelled bank statement on the application — it is a payslip.',
    });

    const content: { type: string; text?: string }[] = review.mock.calls[0][0].content;
    const texts = content.flatMap((part) => (part.text ? [part.text] : []));

    expect(content.filter((part) => part.type === 'pdf')).toHaveLength(1);
    expect(texts[0]).toContain('id: doc-profile');
    expect(texts[0]).toContain("held on: the borrower's profile");
    const closing = texts[texts.length - 1] ?? '';

    expect(closing).toContain('it is a payslip');
    expect(closing).not.toContain('Required document not uploaded: 3-month bank statement');
    expect(closing).toContain('Required document not uploaded: Latest payslip');
  });

  it('sends only reviewable documents, with system findings, and stores the capped report', async () => {
    review.mockResolvedValue({
      output,
      model: 'claude-opus-5-5',
      usage: { inputTokens: 1000, outputTokens: 500, cacheReadTokens: 0, cacheWriteTokens: 0 },
    });
    await service.execute('rev1', 't1', { applicationId: 'app1' }, config);

    const request = review.mock.calls[0][0];
    const types = request.content.map((part: { type: string }) => part.type);

    expect(types.filter((type: string) => type === 'pdf')).toHaveLength(1);
    expect(types).not.toContain('image');
    const closing = request.content[request.content.length - 1].text;

    expect(closing).toContain('captured as "Savings"');
    expect(closing).toContain('Required document not uploaded: Latest payslip.');
    expect(closing).toContain('id.heic: file type image/heic is not supported');

    const saved = reviewUpdate.mock.calls[0][0].data;

    expect(saved.status).toBe(AiReviewStatus.Completed);
    // Instalment N$3,900 on verified N$10,000 is 39% — affordability passes, approval stands.
    expect(saved.recommendation).toBe(AiRecommendation.Approve);
    expect(saved.report.affordability.result).toBe('pass');
    expect(saved.report.skippedDocuments).toEqual([
      { fileName: 'id.heic', reason: 'file type image/heic is not supported for AI review' },
    ]);
    expect(saved.costUsd).toBeCloseTo(0.014);
  });

  it('records a provider failure on the review instead of throwing', async () => {
    review.mockRejectedValue(new AiProviderError('Claude rejected the API key.', 'auth'));
    await expect(
      service.execute('rev1', 't1', { applicationId: 'app1' }, config),
    ).resolves.toBeUndefined();
    expect(reviewUpdate).toHaveBeenCalledWith({
      where: { id: 'rev1' },
      data: expect.objectContaining({
        status: AiReviewStatus.Failed,
        error: 'Claude rejected the API key.',
      }),
    });
  });

  it('fails cleanly when the output does not match the contract', async () => {
    review.mockResolvedValue({
      output: { summary: 'partial' },
      model: 'claude-opus-5-5',
      usage: { inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0 },
    });
    await service.execute('rev1', 't1', { applicationId: 'app1' }, config);
    expect(reviewUpdate.mock.calls[0][0].data).toMatchObject({
      status: AiReviewStatus.Failed,
      error: 'The AI returned an incomplete review. Try again.',
    });
  });
});
