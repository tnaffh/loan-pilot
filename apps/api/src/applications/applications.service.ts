import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { LoanApplication, Prisma } from '@prisma/client';
import {
  ApplicationStatus,
  assessAffordability,
  buildApplicationActivity,
  toCents,
  type ActivityEvent,
  type CreateApplicationInput,
  type UpdateApplicationStatusInput,
} from '@loan-pilot/domain';
import { PrismaService } from '../prisma/prisma.service';
import { LoansService } from '../loans/loans.service';
import { StorageService } from '../documents/storage.service';

export type ApplicationWithReferences = Prisma.LoanApplicationGetPayload<{
  include: { references: true };
}>;

export type ApplicationWithDetail = Prisma.LoanApplicationGetPayload<{
  include: { references: true; documents: true };
}>;

export type ApplicationDetail = ApplicationWithDetail & { activity: ActivityEvent[] };

export interface ApplicationDecision {
  application: LoanApplication;
  loanId: string | null;
}

@Injectable()
export class ApplicationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly loans: LoansService,
    private readonly storage: StorageService,
  ) {}

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
    // Resolve each document's storage key to a browser-openable URL.
    const documents = await Promise.all(
      application.documents.map(async (document) => ({
        ...document,
        url: await this.storage.accessUrl(document.url),
      })),
    );
    return { ...application, documents, activity: buildApplicationActivity(application) };
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
          declineReason:
            input.status === ApplicationStatus.Declined ? input.reason || null : null,
        },
      });

      return { application: updated, loanId: loan?.id ?? null };
    });
  }
}
