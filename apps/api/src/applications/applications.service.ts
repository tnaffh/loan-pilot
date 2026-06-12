import { Injectable } from '@nestjs/common';
import type { LoanApplication, Prisma } from '@prisma/client';
import {
  assessAffordability,
  quote,
  toCents,
  type CreateApplicationInput,
} from '@loan-pilot/domain';
import { PrismaService } from '../prisma/prisma.service';

export type ApplicationWithReferences = Prisma.LoanApplicationGetPayload<{
  include: { references: true };
}>;

@Injectable()
export class ApplicationsService {
  constructor(private readonly prisma: PrismaService) {}

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
}
