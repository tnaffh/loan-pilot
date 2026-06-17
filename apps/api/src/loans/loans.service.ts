import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { $Enums, Loan, LoanApplication, Prisma } from '@prisma/client';
import {
  LoanStatus,
  LoanType,
  RepaymentStatus,
  addMonths,
  daysBetween,
  penaltyInterest,
  quote,
  toCents,
  type CreateLoanInput,
  type LoanQuote,
  type LoanQuoteInput,
  type RecordRepaymentInput,
} from '@loan-pilot/domain';
import { PrismaService } from '../prisma/prisma.service';

export type LoanWithBorrower = Prisma.LoanGetPayload<{
  include: { borrower: { select: { id: true; firstName: true; lastName: true } } };
}>;

export type LoanWithDetails = Prisma.LoanGetPayload<{
  include: {
    borrower: { select: { id: true; firstName: true; lastName: true; idNumber: true } };
    schedule: true;
  };
}>;

export interface StatementLine {
  date: string;
  description: string;
  debit: number;
  credit: number;
  balance: number;
}

export interface LoanStatement {
  generatedAt: string;
  lender: { name: string; town: string | null };
  borrower: { name: string; idNumber: string; address: string };
  loan: {
    id: string;
    type: $Enums.LoanType;
    principal: number;
    financeCharge: number;
    total: number;
    termMonths: number;
    instalment: number;
    disbursedAt: string | null;
    status: $Enums.LoanStatus;
  };
  lines: StatementLine[];
  penaltyAccrued: number;
  outstandingBalance: number;
}

/** Prisma returns enum columns as string literals; map them back to domain enums. */
const LOAN_TYPE_FROM_DB: Record<$Enums.LoanType, LoanType> = {
  payday: LoanType.Payday,
  business: LoanType.Business,
  collateral: LoanType.Collateral,
};

@Injectable()
export class LoansService {
  constructor(private readonly prisma: PrismaService) {}

  /** Pure pricing preview — no persistence. All values in cents. */
  quotePreview(input: LoanQuoteInput): LoanQuote {
    return quote({
      principalCents: toCents(input.amount),
      termMonths: input.termMonths,
      type: input.loanType,
    });
  }

  findAllForTenant(tenantId: string): Promise<LoanWithBorrower[]> {
    return this.prisma.loan.findMany({
      where: { tenantId },
      include: { borrower: { select: { id: true, firstName: true, lastName: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  /** Loans visible to a borrower-role user: only those on their own record. */
  async findAllForBorrowerUser(userId: string): Promise<LoanWithBorrower[]> {
    const borrowerId = await this.resolveBorrowerId(userId);
    return this.prisma.loan.findMany({
      where: { borrowerId },
      include: { borrower: { select: { id: true, firstName: true, lastName: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(tenantId: string, id: string): Promise<LoanWithDetails> {
    const loan = await this.prisma.loan.findFirst({
      where: { id, tenantId },
      include: {
        borrower: { select: { id: true, firstName: true, lastName: true, idNumber: true } },
        schedule: { orderBy: { number: 'asc' } },
      },
    });
    if (!loan) {
      throw new NotFoundException('Loan not found');
    }
    return loan;
  }

  async findOneForBorrowerUser(userId: string, id: string): Promise<LoanWithDetails> {
    const borrowerId = await this.resolveBorrowerId(userId);
    const loan = await this.prisma.loan.findFirst({
      where: { id, borrowerId },
      include: {
        borrower: { select: { id: true, firstName: true, lastName: true, idNumber: true } },
        schedule: { orderBy: { number: 'asc' } },
      },
    });
    if (!loan) {
      throw new NotFoundException('Loan not found');
    }
    return loan;
  }

  /** Disburse a new loan to an existing borrower of the tenant. */
  async create(tenantId: string, input: CreateLoanInput): Promise<Loan> {
    const borrower = await this.prisma.borrower.findFirst({
      where: { id: input.borrowerId, tenantId },
    });
    if (!borrower) {
      throw new NotFoundException('Borrower not found');
    }

    const loanQuote = quote({
      principalCents: toCents(input.amount),
      termMonths: input.termMonths,
      type: input.loanType,
    });

    return this.prisma.loan.create({
      data: this.buildLoanCreateData({
        tenantId,
        borrowerId: borrower.id,
        loanQuote,
        type: input.loanType,
        collateral: input.collateral || null,
        disbursedAt: new Date(),
      }),
    });
  }

  /**
   * Approve-flow loan creation inside an existing transaction: find or create
   * the borrower from the application's details, then disburse the quoted loan.
   */
  async createForApplication(
    tx: Prisma.TransactionClient,
    application: LoanApplication,
  ): Promise<Loan> {
    const borrower = await tx.borrower.upsert({
      where: {
        tenantId_idNumber: {
          tenantId: application.tenantId,
          idNumber: application.idNumber,
        },
      },
      update: {
        phone: application.phone,
        email: application.email,
        address: application.address,
        employer: application.employer,
        occupation: application.occupation,
        monthlyIncome: application.declaredIncome,
        employmentType: application.employmentType,
        bank: application.bank,
        accountType: application.accountType,
      },
      create: {
        tenant: { connect: { id: application.tenantId } },
        firstName: application.firstName,
        lastName: application.lastName,
        idNumber: application.idNumber,
        phone: application.phone,
        email: application.email,
        address: application.address,
        employer: application.employer,
        occupation: application.occupation,
        monthlyIncome: application.declaredIncome,
        employmentType: application.employmentType,
        bank: application.bank,
        accountType: application.accountType,
      },
    });

    const type = LOAN_TYPE_FROM_DB[application.type];
    const loanQuote = quote({
      principalCents: application.amount,
      termMonths: application.termMonths,
      type,
    });

    return tx.loan.create({
      data: this.buildLoanCreateData({
        tenantId: application.tenantId,
        borrowerId: borrower.id,
        loanQuote,
        type,
        collateral: null,
        disbursedAt: new Date(),
      }),
    });
  }

  /**
   * Record a repayment: mark the next unpaid instalment paid, reduce the
   * balance, and recompute the loan's status and next due date.
   */
  recordRepayment(tenantId: string, loanId: string, input: RecordRepaymentInput): Promise<Loan> {
    return this.prisma.$transaction(async (tx) => {
      const loan = await tx.loan.findFirst({
        where: { id: loanId, tenantId },
        include: { schedule: { orderBy: { number: 'asc' } } },
      });
      if (!loan) {
        throw new NotFoundException('Loan not found');
      }
      if (loan.status !== LoanStatus.Active && loan.status !== LoanStatus.Arrears) {
        throw new BadRequestException('This loan is already settled');
      }

      const nextItem = loan.schedule.find((item) => item.status !== RepaymentStatus.Paid);
      if (!nextItem) {
        throw new BadRequestException('No outstanding instalments on this loan');
      }

      const paidAt = input.paidAt ? new Date(input.paidAt) : new Date();
      await tx.repaymentScheduleItem.update({
        where: { id: nextItem.id },
        data: { status: RepaymentStatus.Paid, paidAt },
      });

      const nextUnpaid = loan.schedule.find(
        (item) => item.status !== RepaymentStatus.Paid && item.id !== nextItem.id,
      );
      const newBalance = Math.max(0, loan.balance - nextItem.amount);
      const settled = newBalance === 0 || !nextUnpaid;
      const now = new Date();
      const daysLate = nextUnpaid && nextUnpaid.dueAt < now ? daysBetween(nextUnpaid.dueAt, now) : 0;
      const status = settled
        ? LoanStatus.Settled
        : daysLate > 0
          ? LoanStatus.Arrears
          : LoanStatus.Active;

      return tx.loan.update({
        where: { id: loan.id },
        data: {
          balance: settled ? 0 : newBalance,
          instalmentsPaid: loan.instalmentsPaid + 1,
          nextDueAt: settled || !nextUnpaid ? null : nextUnpaid.dueAt,
          daysLate,
          status,
        },
      });
    });
  }

  /** NAMFISA-compliant statement: every charge and payment with a running balance. */
  async statement(tenantId: string, loanId: string): Promise<LoanStatement> {
    const loan = await this.prisma.loan.findFirst({
      where: { id: loanId, tenantId },
      include: {
        borrower: true,
        tenant: { select: { name: true, town: true } },
        schedule: { orderBy: { number: 'asc' } },
      },
    });
    if (!loan) {
      throw new NotFoundException('Loan not found');
    }
    return this.buildStatement(loan);
  }

  async statementForBorrowerUser(userId: string, loanId: string): Promise<LoanStatement> {
    const borrowerId = await this.resolveBorrowerId(userId);
    const loan = await this.prisma.loan.findFirst({
      where: { id: loanId, borrowerId },
      include: {
        borrower: true,
        tenant: { select: { name: true, town: true } },
        schedule: { orderBy: { number: 'asc' } },
      },
    });
    if (!loan) {
      throw new NotFoundException('Loan not found');
    }
    return this.buildStatement(loan);
  }

  private buildStatement(
    loan: Prisma.LoanGetPayload<{
      include: {
        borrower: true;
        tenant: { select: { name: true; town: true } };
        schedule: true;
      };
    }>,
  ): LoanStatement {
    const openedAt = loan.disbursedAt ?? loan.createdAt;
    const lines: StatementLine[] = [];

    lines.push({
      date: openedAt.toISOString(),
      description: 'Principal advanced',
      debit: loan.principal,
      credit: 0,
      balance: loan.principal,
    });
    lines.push({
      date: openedAt.toISOString(),
      description: 'Finance charge (NAMFISA ≤30% of principal)',
      debit: loan.financeCharge,
      credit: 0,
      balance: loan.total,
    });

    const paidItems = loan.schedule.filter(
      (item) => item.status === RepaymentStatus.Paid && item.paidAt,
    );
    const runningBalance = paidItems.reduce((balance, item) => {
      const next = balance - item.amount;
      lines.push({
        date: (item.paidAt ?? openedAt).toISOString(),
        description: `Instalment ${item.number} received`,
        debit: 0,
        credit: item.amount,
        balance: next,
      });
      return next;
    }, loan.total);

    const penaltyAccrued =
      loan.status === LoanStatus.Arrears
        ? penaltyInterest(loan.balance, Math.ceil(loan.daysLate / 30))
        : 0;

    return {
      generatedAt: new Date().toISOString(),
      lender: { name: loan.tenant.name, town: loan.tenant.town },
      borrower: {
        name: `${loan.borrower.firstName} ${loan.borrower.lastName}`,
        idNumber: loan.borrower.idNumber,
        address: loan.borrower.address,
      },
      loan: {
        id: loan.id,
        type: loan.type,
        principal: loan.principal,
        financeCharge: loan.financeCharge,
        total: loan.total,
        termMonths: loan.termMonths,
        instalment: loan.instalment,
        disbursedAt: loan.disbursedAt?.toISOString() ?? null,
        status: loan.status,
      },
      lines,
      penaltyAccrued,
      outstandingBalance: runningBalance + penaltyAccrued,
    };
  }

  private buildLoanCreateData({
    tenantId,
    borrowerId,
    loanQuote,
    type,
    collateral,
    disbursedAt,
  }: {
    tenantId: string;
    borrowerId: string;
    loanQuote: LoanQuote;
    type: LoanType;
    collateral: string | null;
    disbursedAt: Date;
  }): Prisma.LoanCreateInput {
    return {
      tenant: { connect: { id: tenantId } },
      borrower: { connect: { id: borrowerId } },
      type,
      principal: loanQuote.principalCents,
      financeCharge: loanQuote.financeChargeCents,
      total: loanQuote.totalCents,
      termMonths: loanQuote.termMonths,
      instalment: loanQuote.instalmentCents,
      instalmentsPaid: 0,
      instalmentsTotal: loanQuote.termMonths,
      balance: loanQuote.totalCents,
      status: LoanStatus.Active,
      collateral,
      disbursedAt,
      nextDueAt: addMonths(disbursedAt, 1),
      schedule: {
        create: loanQuote.schedule.map((item) => ({
          number: item.number,
          amount: item.amountCents,
          dueAt: addMonths(disbursedAt, item.number),
          status: RepaymentStatus.Due,
        })),
      },
    };
  }

  private async resolveBorrowerId(userId: string): Promise<string> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user?.borrowerId) {
      throw new NotFoundException('No borrower record is linked to this account');
    }
    return user.borrowerId;
  }
}
