import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  type OnApplicationBootstrap,
} from '@nestjs/common';
import type { AiReview, Document, Loan, Prisma } from '@prisma/client';
import {
  APPLICATION_DOCUMENT_SLOTS,
  AI_REVIEW_OUTPUT_JSON_SCHEMA,
  AiReviewStatus,
  ApplicationStatus,
  DocumentKind,
  LoanStatus,
  LoanType,
  aiReviewOutputSchema,
  buildAiReviewReport,
  estimateAiCostUsd,
  formatNad,
  isDocumentSlotRequired,
  isOpenLoanStatus,
  isPlaceholderId,
  parseNamibianId,
  type AiReviewDocumentOption,
  type Cents,
  type SessionUser,
  type StartAiReviewInput,
} from '@loan-pilot/domain';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../documents/storage.service';
import { findApplicantBorrowerId } from '../common/applicant-borrower';
import { AiSettingsService, type ActiveAiConfig } from './ai-settings.service';
import { AiProviderError, type AiProviderLimits } from './providers/ai-provider';
import { inspectDocument } from './document-forensics';
import {
  REVIEW_SYSTEM_PROMPT,
  buildReviewContent,
  type ReviewCase,
  type ReviewDocument,
  type ReviewFactSection,
} from './review-prompt';

/** A review as the dashboard reads it. `report` is an AiReviewReport (cents). */
export type AiReviewView = Omit<
  AiReview,
  | 'tenantId'
  | 'applicationId'
  | 'borrowerId'
  | 'requestedById'
  | 'inputTokens'
  | 'outputTokens'
  | 'documentIds'
>;

const VIEW_SELECT = {
  id: true,
  status: true,
  provider: true,
  model: true,
  recommendation: true,
  score: true,
  report: true,
  error: true,
  documentCount: true,
  notes: true,
  costUsd: true,
  requestedByName: true,
  startedAt: true,
  completedAt: true,
} satisfies Prisma.AiReviewSelect;

/**
 * A review still "running" after this long was lost. Longer than the slowest a
 * provider call may take (see the client timeout and retries in each provider).
 */
const STALE_AFTER_MS = 20 * 60 * 1000;

const INTERRUPTED =
  'The review was interrupted because the server restarted (e.g. during a deploy). Run it again.';
const HISTORY_LIMIT = 10;

/** Supporting documents worth reading, in the order the reviewer should see them. */
const REVIEW_ORDER: readonly string[] = [
  DocumentKind.IdDocument,
  DocumentKind.Payslip,
  DocumentKind.BankStatement,
  DocumentKind.ProofOfResidence,
];
/** Generated or captured by LoanPilot itself — nothing to verify. */
const NOT_REVIEWED = new Set<string>([
  DocumentKind.Signature,
  DocumentKind.Initials,
  DocumentKind.LoanAgreement,
  DocumentKind.CollateralAgreement,
  DocumentKind.CollateralPhoto,
]);
/** A borrower accumulates documents over the years; review the newest few per kind. */
const BORROWER_PER_KIND: Record<string, number> = {
  [DocumentKind.IdDocument]: 1,
  [DocumentKind.Payslip]: 2,
  [DocumentKind.BankStatement]: 4,
  [DocumentKind.ProofOfResidence]: 1,
};
const BORROWER_PER_OTHER_KIND = 2;

const MB = 1024 * 1024;

/** File types any provider can read; others are listed but cannot be included. */
const READABLE_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
]);

type Subject = { applicationId: string } | { borrowerId: string };

/** A document a review may include: where it is held, and whether it is ticked by default. */
interface Candidate {
  document: Document;
  source: 'application' | 'profile';
  selected: boolean;
}

const unsupportedReason = (document: Document): string | null => {
  if (/^https?:\/\//i.test(document.url)) return 'stored outside LoanPilot';

  return READABLE_TYPES.has(document.mimeType ?? '')
    ? null
    : `the AI cannot read ${document.mimeType ?? 'this file type'}`;
};

interface PreparedReview {
  review: ReviewCase;
  instalmentCents: Cents | null;
  declaredIncomeCents: Cents | null;
  internalObligationsCents: Cents;
}

const kindRank = (kind: string): number => {
  const index = REVIEW_ORDER.indexOf(kind);

  return index === -1 ? REVIEW_ORDER.length : index;
};

const nad = (cents: number | null | undefined): string | null =>
  cents == null ? null : formatNad(cents);

const asJson = (value: unknown): Prisma.InputJsonValue =>
  // A JSON round trip yields plain data Prisma accepts for a Json column.
  JSON.parse(JSON.stringify(value));

@Injectable()
export class AiReviewService implements OnApplicationBootstrap {
  private readonly logger = new Logger(AiReviewService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly aiSettings: AiSettingsService,
  ) {}

  /**
   * Reviews run inside this process, so any review still "running" when the API
   * starts was cut off by the restart (a deploy, a crash) and will never finish.
   * Fail them now so the officer sees why and can run again straight away,
   * instead of waiting out {@link STALE_AFTER_MS}. Assumes one API instance —
   * true for the docker-compose deploy; revisit before running replicas.
   */
  async onApplicationBootstrap(): Promise<void> {
    const { count } = await this.prisma.aiReview.updateMany({
      where: { status: AiReviewStatus.Running },
      data: { status: AiReviewStatus.Failed, error: INTERRUPTED, completedAt: new Date() },
    });

    if (count > 0) {
      this.logger.warn(`Marked ${count} AI review(s) interrupted by the restart as failed`);
    }
  }

  // ── Reads ──────────────────────────────────────────────────────────────

  async listForApplication(tenantId: string, applicationId: string): Promise<AiReviewView[]> {
    return this.list(tenantId, { applicationId });
  }

  async listForBorrower(tenantId: string, borrowerId: string): Promise<AiReviewView[]> {
    return this.list(tenantId, { borrowerId });
  }

  private async list(tenantId: string, subject: Subject): Promise<AiReviewView[]> {
    await this.expireStale(tenantId, subject);

    return this.prisma.aiReview.findMany({
      where: { tenantId, ...subject },
      orderBy: { startedAt: 'desc' },
      take: HISTORY_LIMIT,
      select: VIEW_SELECT,
    });
  }

  // ── Start (on the officer's click only — every review is billed) ───────

  async startForApplication(
    tenantId: string,
    user: SessionUser,
    applicationId: string,
    options: StartAiReviewInput = {},
  ): Promise<AiReviewView> {
    return this.start(tenantId, user, { applicationId }, options);
  }

  async startForBorrower(
    tenantId: string,
    user: SessionUser,
    borrowerId: string,
    options: StartAiReviewInput = {},
  ): Promise<AiReviewView> {
    return this.start(tenantId, user, { borrowerId }, options);
  }

  // ── Which documents a review may include ───────────────────────────────

  async documentOptionsForApplication(
    tenantId: string,
    applicationId: string,
  ): Promise<AiReviewDocumentOption[]> {
    return this.toOptions(await this.candidates(tenantId, { applicationId }));
  }

  async documentOptionsForBorrower(
    tenantId: string,
    borrowerId: string,
  ): Promise<AiReviewDocumentOption[]> {
    return this.toOptions(await this.candidates(tenantId, { borrowerId }));
  }

  private toOptions(candidates: Candidate[]): AiReviewDocumentOption[] {
    return candidates.map(({ document, source, selected }) => {
      const unsupported = unsupportedReason(document);

      return {
        id: document.id,
        kind: document.kind,
        fileName: document.fileName,
        mimeType: document.mimeType,
        sizeBytes: document.sizeBytes,
        uploadedAt: document.uploadedAt.toISOString(),
        source,
        selected: selected && !unsupported,
        unsupported,
      };
    });
  }

  /**
   * The documents a review may include. An application review offers its own
   * files (ticked) plus files on the applicant's borrower profile (unticked —
   * e.g. a statement sent later), skipping profile files already attached. A
   * borrower review offers the profile, ticking the newest few of each kind.
   * Generated files (signatures, agreements) are never offered.
   */
  private async candidates(tenantId: string, subject: Subject): Promise<Candidate[]> {
    const reviewable = (document: Document) => !NOT_REVIEWED.has(document.kind);

    if ('applicationId' in subject) {
      const application = await this.prisma.loanApplication.findFirst({
        where: { id: subject.applicationId, tenantId },
        include: { documents: { orderBy: { uploadedAt: 'desc' } } },
      });

      if (!application) {
        throw new NotFoundException('Application not found');
      }

      const borrowerId = await findApplicantBorrowerId(this.prisma, tenantId, application.idNumber);
      const profile = borrowerId
        ? await this.prisma.document.findMany({
            where: { borrowerId },
            orderBy: { uploadedAt: 'desc' },
          })
        : [];
      const onApplication = new Set(application.documents.map((document) => document.url));

      return [
        ...application.documents
          .filter(reviewable)
          .map((document) => ({ document, source: 'application' as const, selected: true })),
        ...profile
          .filter((document) => reviewable(document) && !onApplication.has(document.url))
          .map((document) => ({ document, source: 'profile' as const, selected: false })),
      ];
    }

    const borrower = await this.prisma.borrower.findFirst({
      where: { id: subject.borrowerId, tenantId },
      include: { documents: { orderBy: { uploadedAt: 'desc' } } },
    });

    if (!borrower) {
      throw new NotFoundException('Borrower not found');
    }

    const counts = new Map<string, number>();

    return borrower.documents.filter(reviewable).map((document) => {
      const seen = counts.get(document.kind) ?? 0;

      counts.set(document.kind, seen + 1);

      return {
        document,
        source: 'profile' as const,
        selected: seen < (BORROWER_PER_KIND[document.kind] ?? BORROWER_PER_OTHER_KIND),
      };
    });
  }

  /** The candidates a review uses: the officer's choice, or the default selection. */
  private async chosenDocuments(
    tenantId: string,
    subject: Subject,
    documentIds: string[],
  ): Promise<Document[]> {
    const candidates = await this.candidates(tenantId, subject);

    if (documentIds.length === 0) {
      return candidates.filter((candidate) => candidate.selected).map(({ document }) => document);
    }

    const wanted = new Set(documentIds);

    return candidates
      .filter(({ document }) => wanted.has(document.id))
      .map(({ document }) => document);
  }

  private async start(
    tenantId: string,
    user: SessionUser,
    subject: Subject,
    options: StartAiReviewInput,
  ): Promise<AiReviewView> {
    const documentIds = [...new Set(options.documentIds ?? [])];

    // Also confirms the application/borrower exists in this tenant.
    const candidates = await this.candidates(tenantId, subject);
    const known = new Set(candidates.map(({ document }) => document.id));

    if (documentIds.some((id) => !known.has(id))) {
      throw new BadRequestException(
        'Some of the chosen documents are not available for this review.',
      );
    }

    // Fails with a 400 telling an admin what to set up before anything is billed.
    const config = await this.aiSettings.resolveActive(tenantId);

    await this.expireStale(tenantId, subject);
    const running = await this.prisma.aiReview.findFirst({
      where: { tenantId, ...subject, status: AiReviewStatus.Running },
      select: { id: true },
    });

    if (running) {
      throw new ConflictException('A review is already running — wait for it to finish.');
    }

    const review = await this.prisma.aiReview.create({
      data: {
        tenantId,
        ...subject,
        provider: config.provider,
        model: config.model,
        documentIds,
        notes: options.notes || null,
        requestedById: user.id,
        requestedByName: user.name,
      },
      select: VIEW_SELECT,
    });

    // Reviews take a minute or two: run in the background and let the client poll.
    void this.execute(review.id, tenantId, subject, config, {
      documentIds,
      notes: options.notes || null,
    });

    return review;
  }

  /** Run one review to completion, recording the report or the failure. Never throws. */
  async execute(
    reviewId: string,
    tenantId: string,
    subject: Subject,
    config: ActiveAiConfig,
    choice: { documentIds: string[]; notes: string | null } = { documentIds: [], notes: null },
  ): Promise<void> {
    try {
      const chosen = await this.chosenDocuments(tenantId, subject, choice.documentIds);
      const prepared =
        'applicationId' in subject
          ? await this.prepareApplication(
              tenantId,
              subject.applicationId,
              chosen,
              config.client.limits,
            )
          : await this.prepareBorrower(tenantId, subject.borrowerId, chosen, config.client.limits);

      prepared.review.officerNotes = choice.notes;

      const result = await config.client.review({
        apiKey: config.apiKey,
        model: config.model,
        system: REVIEW_SYSTEM_PROMPT,
        content: buildReviewContent(prepared.review),
        outputSchema: AI_REVIEW_OUTPUT_JSON_SCHEMA,
      });

      const parsed = aiReviewOutputSchema.safeParse(result.output);

      if (!parsed.success) {
        this.logger.warn(
          `AI review ${reviewId}: output failed validation: ${parsed.error.message}`,
        );
        throw new AiProviderError(
          'The AI returned an incomplete review. Try again.',
          'invalid_output',
        );
      }

      const report = buildAiReviewReport({
        output: parsed.data,
        instalmentCents: prepared.instalmentCents,
        declaredIncomeCents: prepared.declaredIncomeCents,
        internalObligationsCents: prepared.internalObligationsCents,
        documents: prepared.review.documents.map((document) => ({
          id: document.id,
          fileName: document.fileName,
        })),
        skippedDocuments: prepared.review.skipped,
      });

      await this.prisma.aiReview.update({
        where: { id: reviewId },
        data: {
          status: AiReviewStatus.Completed,
          model: result.model,
          recommendation: report.recommendation,
          score: report.score,
          report: asJson(report),
          documentCount: prepared.review.documents.length,
          inputTokens:
            result.usage.inputTokens + result.usage.cacheReadTokens + result.usage.cacheWriteTokens,
          outputTokens: result.usage.outputTokens,
          costUsd: estimateAiCostUsd(config.provider, result.model, result.usage),
          completedAt: new Date(),
        },
      });
    } catch (error) {
      const message =
        error instanceof AiProviderError || error instanceof NotFoundException
          ? error.message
          : 'The review failed unexpectedly. Try again.';

      if (!(error instanceof AiProviderError)) {
        this.logger.error(
          `AI review ${reviewId} failed`,
          error instanceof Error ? error.stack : String(error),
        );
      }

      await this.prisma.aiReview
        .update({
          where: { id: reviewId },
          data: { status: AiReviewStatus.Failed, error: message, completedAt: new Date() },
        })
        .catch((updateError: unknown) =>
          this.logger.error(
            `Could not record failure of AI review ${reviewId}`,
            String(updateError),
          ),
        );
    }
  }

  /** Mark reviews lost mid-run (server restart) as failed so a new one can start. */
  private async expireStale(tenantId: string, subject: Subject): Promise<void> {
    await this.prisma.aiReview.updateMany({
      where: {
        tenantId,
        ...subject,
        status: AiReviewStatus.Running,
        startedAt: { lt: new Date(Date.now() - STALE_AFTER_MS) },
      },
      data: {
        status: AiReviewStatus.Failed,
        error: 'The review did not finish (the server may have restarted). Run it again.',
        completedAt: new Date(),
      },
    });
  }

  // ── Case preparation ───────────────────────────────────────────────────

  private async prepareApplication(
    tenantId: string,
    applicationId: string,
    chosen: Document[],
    limits: AiProviderLimits,
  ): Promise<PreparedReview> {
    const application = await this.prisma.loanApplication.findFirst({
      where: { id: applicationId, tenantId },
    });

    if (!application) {
      throw new NotFoundException('Application not found');
    }

    const returning =
      application.idNumber && !isPlaceholderId(application.idNumber)
        ? await this.prisma.borrower.findFirst({
            where: { tenantId, idNumber: application.idNumber },
            include: { loans: true },
          })
        : null;
    const internalObligationsCents = this.openInstalments(returning?.loans ?? []);

    const { documents, skipped } = await this.loadDocuments(chosen, limits, applicationId);

    // "Missing" is judged on what this review includes, so a statement taken
    // from the profile counts, and one the officer left out does not.
    const findings: string[] = [];
    const present = new Set(chosen.map((document) => document.kind));
    const loanType = Object.values(LoanType).find((type) => type === application.type);

    for (const slot of APPLICATION_DOCUMENT_SLOTS) {
      const required = loanType ? isDocumentSlotRequired(slot, loanType) : Boolean(slot.required);

      if (required && !present.has(slot.kind)) {
        findings.push(`Required document not uploaded: ${slot.label}.`);
      }
    }

    if (/savings|investment|deposit|money\s*market/i.test(application.accountType)) {
      findings.push(
        `The debit-order account on the application is captured as "${application.accountType}" — debit orders cannot be run on savings or investment accounts.`,
      );
    }

    const decodedId = parseNamibianId(application.idNumber);

    if (decodedId.isNamibianId && decodedId.dateOfBirth !== application.dateOfBirth) {
      findings.push(
        `The ID number encodes date of birth ${decodedId.dateOfBirth}, but the application states ${application.dateOfBirth}.`,
      );
    }

    findings.push(...this.trackRecordFindings(returning?.loans ?? []));

    const facts: ReviewFactSection[] = [
      {
        heading: 'Applicant (as captured on the application)',
        lines: [
          ['Name', `${application.firstName} ${application.lastName}`],
          ['ID number', application.idNumber],
          ['Date of birth', application.dateOfBirth],
          ['Gender', application.gender],
          ['Phone', application.phone],
          ['Email', application.email],
          [
            'Residential address',
            [
              application.addrStreet,
              application.addrSuburb,
              application.addrCity,
              application.addrRegion,
              application.addrCountry,
            ]
              .filter(Boolean)
              .join(', '),
          ],
          ['Employer', application.employer],
          ['Employee number', application.employeeNo],
          ['Occupation', application.occupation],
          ['Employment type', application.employmentType.replace(/_/g, ' ')],
          ['Declared monthly income', nad(application.declaredIncome)],
        ],
      },
      {
        heading: 'Debit-order bank account (as captured)',
        lines: [
          ['Bank', application.bankName],
          ['Account number', application.bankAccountNumber],
          ['Account holder', application.bankAccountHolder],
          ['Account type', application.accountType],
          [
            'Branch',
            [application.bankBranchName, application.bankBranchCode].filter(Boolean).join(' '),
          ],
        ],
      },
      {
        heading: 'Loan requested',
        lines: [
          ['Type', application.type],
          ['Amount', nad(application.amount)],
          ['Term', `${application.termMonths} month(s)`],
          ['Monthly instalment', nad(application.quotedInstalment)],
          ['Total repayable', nad(application.quotedTotal)],
          ['Purpose', application.purpose],
          ['Submitted on', application.submittedAt.toISOString().slice(0, 10)],
        ],
      },
      ...(returning ? [this.trackRecordFacts(returning.loans)] : []),
    ];

    return {
      review: {
        subject: returning
          ? 'a loan application from a returning borrower'
          : 'a new loan application',
        reviewDate: new Date(),
        facts,
        systemFindings: findings,
        documents,
        skipped,
        officerNotes: null,
      },
      instalmentCents: application.quotedInstalment,
      declaredIncomeCents: application.declaredIncome,
      internalObligationsCents,
    };
  }

  private async prepareBorrower(
    tenantId: string,
    borrowerId: string,
    chosen: Document[],
    limits: AiProviderLimits,
  ): Promise<PreparedReview> {
    const borrower = await this.prisma.borrower.findFirst({
      where: { id: borrowerId, tenantId },
      include: {
        loans: true,
        documents: { orderBy: { uploadedAt: 'desc' } },
        bankAccounts: { where: { isActive: true } },
        addresses: { where: { isActive: true } },
      },
    });

    if (!borrower) {
      throw new NotFoundException('Borrower not found');
    }

    // An open application by the same person is the instalment to assess.
    const pending =
      borrower.idNumber && !isPlaceholderId(borrower.idNumber)
        ? await this.prisma.loanApplication.findFirst({
            where: {
              tenantId,
              idNumber: borrower.idNumber,
              status: { in: [ApplicationStatus.Pending, ApplicationStatus.Review] },
            },
            orderBy: { submittedAt: 'desc' },
          })
        : null;

    const { documents, skipped } = await this.loadDocuments(chosen, limits, null);

    const findings: string[] = [];
    const present = new Set(borrower.documents.map((document) => document.kind));

    for (const slot of APPLICATION_DOCUMENT_SLOTS) {
      if (slot.required && !present.has(slot.kind)) {
        findings.push(`No ${slot.label.toLowerCase()} on file.`);
      }
    }

    const account = borrower.bankAccounts[0];

    if (account && /savings|investment|deposit|money\s*market/i.test(account.accountType)) {
      findings.push(
        `The active debit-order account on file is a "${account.accountType}" account — debit orders cannot be run on savings or investment accounts.`,
      );
    }

    findings.push(...this.trackRecordFindings(borrower.loans));

    const address = borrower.addresses[0];
    const facts: ReviewFactSection[] = [
      {
        heading: 'Borrower (as on file)',
        lines: [
          ['Name', `${borrower.firstName} ${borrower.lastName}`],
          ['ID number', borrower.idNumber],
          ['Gender', borrower.gender],
          ['Phone', borrower.phone],
          ['Email', borrower.email],
          [
            'Address',
            address
              ? [address.street, address.suburb, address.city, address.region, address.country]
                  .filter(Boolean)
                  .join(', ')
              : null,
          ],
          ['Employer', borrower.employer],
          ['Employee number', borrower.employeeNo],
          ['Occupation', borrower.occupation],
          ['Employment type', borrower.employmentType.replace(/_/g, ' ')],
          ['Monthly income on file', nad(borrower.monthlyIncome)],
          ['Pay day on file', borrower.payDay],
          ['Borrower since', borrower.since.toISOString().slice(0, 10)],
        ],
      },
      {
        heading: 'Debit-order bank account (as on file)',
        lines: account
          ? [
              ['Bank', account.bankName],
              ['Account number', account.accountNumber],
              ['Account holder', account.accountHolderName],
              ['Account type', account.accountType],
            ]
          : [['Account', 'none on file']],
      },
      this.trackRecordFacts(borrower.loans),
      ...(pending
        ? [
            {
              heading: 'Open application to assess',
              lines: [
                ['Amount', nad(pending.amount)],
                ['Term', `${pending.termMonths} month(s)`],
                ['Monthly instalment', nad(pending.quotedInstalment)],
              ] satisfies ReviewFactSection['lines'],
            },
          ]
        : []),
    ];

    return {
      review: {
        subject: pending
          ? 'an existing borrower who has an open loan application'
          : 'an existing borrower, to judge whether they are good for another loan',
        reviewDate: new Date(),
        facts,
        systemFindings: findings,
        documents,
        skipped,
        officerNotes: null,
      },
      instalmentCents: pending?.quotedInstalment ?? null,
      declaredIncomeCents: borrower.monthlyIncome > 0 ? borrower.monthlyIncome : null,
      internalObligationsCents: this.openInstalments(borrower.loans),
    };
  }

  /**
   * Read the reviewable documents, ID → payslip → statements first, skipping any
   * the provider cannot take (type or size) and reporting why.
   */
  private async loadDocuments(
    rows: Document[],
    limits: AiProviderLimits,
    /** The application under review, to tell its own files from profile files. */
    applicationId: string | null,
  ): Promise<{ documents: ReviewDocument[]; skipped: { fileName: string; reason: string }[] }> {
    const ordered = rows
      .filter((row) => !NOT_REVIEWED.has(row.kind))
      .sort((a, b) => kindRank(a.kind) - kindRank(b.kind));

    const documents: ReviewDocument[] = [];
    const skipped: { fileName: string; reason: string }[] = [];
    const imageTypes = new Set<string>(limits.imageTypes);

    for (const row of ordered) {
      const mimeType = row.mimeType ?? 'application/octet-stream';
      const isPdf = mimeType === 'application/pdf';
      const size = row.sizeBytes ?? 0;
      const usedBytes = documents.reduce((sum, document) => sum + document.data.length, 0);
      const skip = (reason: string) => skipped.push({ fileName: row.fileName, reason });

      if (/^https?:\/\//i.test(row.url)) {
        skip('stored outside LoanPilot');
      } else if (!isPdf && !imageTypes.has(mimeType)) {
        skip(`file type ${mimeType} is not supported for AI review`);
      } else if (size > (isPdf ? limits.maxPdfBytes : limits.maxImageBytes)) {
        skip(
          `too large for AI review (over ${Math.round((isPdf ? limits.maxPdfBytes : limits.maxImageBytes) / MB)} MB)`,
        );
      } else if (usedBytes + size > limits.maxTotalBytes) {
        skip('left out to keep the request within the size limit');
      } else {
        const data = await this.storage.tryRead(row.url, `document ${row.id} for AI review`);

        if (!data) {
          skip('could not be read from storage');
        } else if (data.length > (isPdf ? limits.maxPdfBytes : limits.maxImageBytes)) {
          skip('too large for AI review');
        } else {
          documents.push({
            id: row.id,
            kind: row.kind,
            source:
              applicationId && row.applicationId === applicationId ? 'application' : 'profile',
            fileName: row.fileName,
            uploadedAt: row.uploadedAt,
            mimeType,
            data,
            forensics: inspectDocument(data, mimeType),
          });
        }
      }
    }

    return { documents, skipped };
  }

  private openInstalments(loans: Loan[]): Cents {
    return loans
      .filter((loan) => isOpenLoanStatus(loan.status) && loan.balance > 0)
      .reduce((sum, loan) => sum + loan.instalment, 0);
  }

  private trackRecordFacts(loans: Loan[]): ReviewFactSection {
    const open = loans.filter((loan) => isOpenLoanStatus(loan.status));
    const count = (status: LoanStatus) => loans.filter((loan) => loan.status === status).length;
    const latest = [...loans].sort(
      (a, b) => (b.disbursedAt?.getTime() ?? 0) - (a.disbursedAt?.getTime() ?? 0),
    )[0];

    return {
      heading: "Track record with this lender (from the lender's own books — reliable)",
      lines: [
        ['Loans taken', loans.length],
        ['Open loans', open.length],
        ['Settled', count(LoanStatus.Settled)],
        ['Written off', count(LoanStatus.WrittenOff)],
        ['Most days late on any loan', Math.max(0, ...loans.map((loan) => loan.daysLate))],
        ['Outstanding balance', nad(open.reduce((sum, loan) => sum + loan.balance, 0))],
        ['Instalments due on open loans', nad(this.openInstalments(loans))],
        [
          'Most recent loan',
          latest
            ? `${nad(latest.principal)} on ${latest.disbursedAt?.toISOString().slice(0, 10) ?? 'unknown date'}, ${latest.status.replace(/_/g, ' ')}`
            : null,
        ],
      ],
    };
  }

  private trackRecordFindings(loans: Loan[]): string[] {
    const findings: string[] = [];
    const writtenOff = loans.filter((loan) => loan.status === LoanStatus.WrittenOff).length;

    if (writtenOff > 0) {
      findings.push(`${writtenOff} earlier loan(s) with this lender were written off as bad debt.`);
    }

    const late = loans.filter((loan) => isOpenLoanStatus(loan.status) && loan.daysLate > 0);

    if (late.length > 0) {
      findings.push(
        `${late.length} open loan(s) with this lender are in arrears (up to ${Math.max(...late.map((loan) => loan.daysLate))} days late).`,
      );
    }

    return findings;
  }
}
