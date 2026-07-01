import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { LoanApplication, Prisma } from '@prisma/client';
import {
  ApplicationStatus,
  LoanType,
  assessAffordability,
  buildApplicationActivity,
  isPlaceholderId,
  toCents,
  type ActivityEvent,
  type CreateApplicationInput,
  type FeeSettings,
  type UpdateApplicationStatusInput,
} from '@loan-pilot/domain';
import { PrismaService } from '../prisma/prisma.service';
import { LoansService } from '../loans/loans.service';
import { SettingsService } from '../settings/settings.service';
import { StorageService } from '../documents/storage.service';

export type ApplicationWithReferences = Prisma.LoanApplicationGetPayload<{
  include: { references: true };
}>;

export type ApplicationWithDetail = Prisma.LoanApplicationGetPayload<{
  include: { references: true; documents: true };
}>;

/** A document with its storage key resolved to an openable URL (null when the
 * URL could not be signed — see {@link StorageService.safeAccessUrl}). */
type ResolvedDocument = Omit<ApplicationWithDetail['documents'][number], 'url'> & {
  url: string | null;
};

/** An existing borrower whose ID number matches the application — surfaced at
 * review so the reviewer sees a returning borrower before approving (approval
 * links to them automatically via the upsert in {@link LoansService}). */
export interface MatchedBorrower {
  id: string;
  firstName: string;
  lastName: string;
  idNumber: string;
  loanCount: number;
}

export type ApplicationDetail = Omit<ApplicationWithDetail, 'documents'> & {
  documents: ResolvedDocument[];
  activity: ActivityEvent[];
  existingBorrower: MatchedBorrower | null;
};

export interface ApplicationDecision {
  application: LoanApplication;
  loanId: string | null;
}

/** Public pricing config for the marketing calculators: the active rate per loan
 * type (null falls back to the loan type's standard rate) plus the tenant's fee
 * settings, so the client can gross loans up exactly as {@link LoansService} does. */
export interface PricingConfig {
  rates: Record<LoanType, number | null>;
  feeSettings: FeeSettings;
}

@Injectable()
export class ApplicationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly loans: LoansService,
    private readonly settings: SettingsService,
    private readonly storage: StorageService,
  ) {}

  /**
   * The active interest rate per loan type and the fee settings for a tenant,
   * used by the public loan calculators so their estimate matches the quote a
   * borrower actually receives.
   */
  async pricingConfig(tenantId: string): Promise<PricingConfig> {
    const resolveRate = async (type: LoanType): Promise<number | null> => {
      const product = await this.settings.resolveProduct(tenantId, undefined, type);
      return product?.interestRate ?? null;
    };
    const [feeSettings, payday, business, collateral] = await Promise.all([
      this.settings.resolveFeeSettings(tenantId),
      resolveRate(LoanType.Payday),
      resolveRate(LoanType.Business),
      resolveRate(LoanType.Collateral),
    ]);
    // An exhaustive literal so a new LoanType is a compile error here, not a gap.
    const rates: Record<LoanType, number | null> = {
      [LoanType.Payday]: payday,
      [LoanType.Business]: business,
      [LoanType.Collateral]: collateral,
    };
    return { rates, feeSettings };
  }

  /**
   * Price the requested loan and assess affordability, then persist the
   * application (with its references) under the resolved tenant.
   */
  async create(tenantId: string, input: CreateApplicationInput): Promise<LoanApplication> {
    const principalCents = toCents(input.amount);
    const monthlyIncomeCents = toCents(input.monthlyIncome);

    const loanQuote = await this.loans.priceQuote(tenantId, {
      principalCents,
      termMonths: input.termMonths,
      type: input.loanType,
    });

    const assessment = assessAffordability({
      monthlyIncomeCents,
      instalmentCents: loanQuote.instalmentCents,
    });

    const data: Prisma.LoanApplicationCreateInput = {
      tenant: { connect: { id: tenantId } },
      firstName: input.firstName,
      lastName: input.lastName,
      idNumber: input.idNumber,
      dateOfBirth: input.dateOfBirth,
      phone: input.phone,
      email: input.email,
      addrStreet: input.address.street,
      addrSuburb: input.address.suburb || null,
      addrCity: input.address.city,
      addrRegion: input.address.region || null,
      addrCountry: input.address.country,
      maritalStatus: input.maritalStatus || null,
      type: input.loanType,
      amount: principalCents,
      termMonths: input.termMonths,
      purpose: input.purpose || null,
      declaredIncome: monthlyIncomeCents,
      employmentType: input.employmentType,
      employer: input.employer,
      occupation: input.occupation,
      bankName: input.bankAccount.bankName,
      bankAccountNumber: input.bankAccount.accountNumber,
      bankBranchName: input.bankAccount.branchName || null,
      bankBranchCode: input.bankAccount.branchCode || null,
      bankAccountHolder: input.bankAccount.accountHolderName,
      accountType: input.bankAccount.accountType,
      quotedTotal: loanQuote.totalCents,
      quotedInstalment: loanQuote.instalmentCents,
      affordabilityRatio: assessment.ratio,
      affordability: assessment.result,
      references: {
        create: input.references.map((reference) => ({
          name: reference.name,
          phone: reference.phone,
        })),
      },
    };

    return this.prisma.loanApplication.create({ data });
  }

  findAllForTenant(tenantId: string): Promise<ApplicationWithReferences[]> {
    return this.prisma.loanApplication.findMany({
      where: { tenantId },
      include: { references: true },
      orderBy: { submittedAt: 'desc' },
    });
  }

  /** Full application for the review sheet/detail, with a derived activity timeline. */
  async findOneForTenant(tenantId: string, id: string): Promise<ApplicationDetail> {
    const application = await this.prisma.loanApplication.findFirst({
      where: { id, tenantId },
      include: { references: true, documents: { orderBy: { uploadedAt: 'desc' } } },
    });
    if (!application) {
      throw new NotFoundException('Application not found');
    }
    // Resolve each document's storage key to a browser-openable URL. URL signing
    // can fail (e.g. GCS perms) — degrade that document to a null URL rather than
    // failing the whole detail request.
    const documents = await Promise.all(
      application.documents.map(async (document) => ({
        ...document,
        url: await this.storage.safeAccessUrl(document.url),
      })),
    );
    return {
      ...application,
      documents,
      activity: buildApplicationActivity(application),
      existingBorrower: await this.matchExistingBorrower(tenantId, application.idNumber),
    };
  }

  /**
   * Find a borrower in the tenant whose ID number matches the application, so
   * the review sheet can flag a returning borrower. Placeholder/blank IDs never
   * match (they aren't real identifiers), avoiding false positives.
   */
  private async matchExistingBorrower(
    tenantId: string,
    idNumber: string,
  ): Promise<MatchedBorrower | null> {
    if (!idNumber || isPlaceholderId(idNumber)) {
      return null;
    }
    const borrower = await this.prisma.borrower.findFirst({
      where: { tenantId, idNumber },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        idNumber: true,
        _count: { select: { loans: true } },
      },
    });
    if (!borrower) {
      return null;
    }
    return {
      id: borrower.id,
      firstName: borrower.firstName,
      lastName: borrower.lastName,
      idNumber: borrower.idNumber,
      loanCount: borrower._count.loans,
    };
  }

  /**
   * Move an application along its lifecycle. Approval creates the borrower (if
   * new) and disburses the quoted loan atomically with the status change;
   * Review is a triage step; Decline records the reason.
   */
  updateStatus(
    tenantId: string,
    id: string,
    input: UpdateApplicationStatusInput,
  ): Promise<ApplicationDecision> {
    return this.prisma.$transaction(async (tx) => {
      const application = await tx.loanApplication.findFirst({ where: { id, tenantId } });
      if (!application) {
        throw new NotFoundException('Application not found');
      }
      if (
        application.status === ApplicationStatus.Approved ||
        application.status === ApplicationStatus.Declined
      ) {
        throw new ConflictException('This application has already been decided');
      }

      const loan =
        input.status === ApplicationStatus.Approved
          ? await this.loans.createForApplication(tx, application)
          : null;

      const updated = await tx.loanApplication.update({
        where: { id },
        data: {
          status: input.status,
          decidedAt: new Date(),
          declineReason: input.status === ApplicationStatus.Declined ? input.reason || null : null,
        },
      });

      return { application: updated, loanId: loan?.id ?? null };
    });
  }
}
