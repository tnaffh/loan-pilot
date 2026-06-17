import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { LoanApplication, Prisma } from '@prisma/client';
import {
  ApplicationStatus,
  assessAffordability,
  quote,
  toCents,
  type CreateApplicationInput,
  type UpdateApplicationStatusInput,
} from '@loan-pilot/domain';
import { PrismaService } from '../prisma/prisma.service';
import { LoansService } from '../loans/loans.service';

export type ApplicationWithReferences = Prisma.LoanApplicationGetPayload<{
  include: { references: true };
}>;

export interface ApplicationDecision {
  application: LoanApplication;
  loanId: string | null;
}

@Injectable()
export class ApplicationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly loans: LoansService,
  ) {}

  /**
   * Price the requested loan and assess affordability, then persist the
   * application (with its references) under the resolved tenant.
   */
  async create(tenantId: string, input: CreateApplicationInput): Promise<LoanApplication> {
    const principalCents = toCents(input.amount);
    const monthlyIncomeCents = toCents(input.monthlyIncome);

    const loanQuote = quote({
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
      address: input.address,
      maritalStatus: input.maritalStatus || null,
      type: input.loanType,
      amount: principalCents,
      termMonths: input.termMonths,
      purpose: input.purpose || null,
      declaredIncome: monthlyIncomeCents,
      employmentType: input.employmentType,
      employer: input.employer,
      occupation: input.occupation,
      bank: input.bank,
      accountType: input.accountType,
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

  /**
   * Decide a pending application. Approval creates the borrower (if new) and
   * disburses the quoted loan atomically with the status change.
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
        data: { status: input.status },
      });

      return { application: updated, loanId: loan?.id ?? null };
    });
  }
}
