import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { $Enums, Loan, LoanApplication, Prisma } from '@prisma/client';
import {
  LoanStatus,
  LoanType,
  RepaymentStatus,
  addMonths,
  buildLoanActivity,
  daysBetween,
  fromCents,
  penaltyInterest,
  quote,
  toCents,
  type ActivityEvent,
  type CancelLoanInput,
  type CreateLoanInput,
  type LoanQuote,
  type LoanQuoteInput,
  type RecordRepaymentInput,
  type SessionUser,
  type SettleLoanInput,
  type UpdateLoanInput,
  type WriteOffLoanInput,
} from '@loan-pilot/domain';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService, type AuditEntry } from '../audit/audit.service';

export type LoanWithBorrower = Prisma.LoanGetPayload<{
  include: { borrower: { select: { id: true; firstName: true; lastName: true } } };
}>;

export type LoanWithDetails = Prisma.LoanGetPayload<{
  include: {
    borrower: { select: { id: true; firstName: true; lastName: true; idNumber: true } };
    schedule: true;
    payments: true;
  };
}> & { activity: ActivityEvent[]; audit: AuditEntry[] };

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

/** Loan fields shown in the audit trail, in display form (money major, dates ISO). */
const loanAuditMap = (loan: Loan): Record<string, unknown> => ({
  principal: fromCents(loan.principal),
  financeCharge: fromCents(loan.financeCharge),
  total: fromCents(loan.total),
  termMonths: loan.termMonths,
  interestRate: loan.interestRate,
  instalment: fromCents(loan.instalment),
  balance: fromCents(loan.balance),
  status: loan.status,
  collateral: loan.collateral,
  originMonth: loan.originMonth,
  note: loan.note,
  bankCharges: fromCents(loan.bankCharges),
  namfisaLevy: fromCents(loan.namfisaLevy),
  stampDuty: fromCents(loan.stampDuty),
  disbursedAt: loan.disbursedAt ? loan.disbursedAt.toISOString().slice(0, 10) : null,
  nextDueAt: loan.nextDueAt ? loan.nextDueAt.toISOString().slice(0, 10) : null,
});

/** Join a structured borrower address into a single statement line. */
const formatAddressLine = (address?: {
  street: string;
  suburb: string | null;
  city: string;
  region: string | null;
  country: string;
}): string =>
  address
    ? [address.street, address.suburb, address.city, address.region, address.country]
        .filter(Boolean)
        .join(', ')
    : '';

@Injectable()
export class LoansService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

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
      orderBy: [{ disbursedAt: 'desc' }, { createdAt: 'desc' }],
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
        payments: { orderBy: { paidAt: 'desc' } },
      },
    });
    if (!loan) {
      throw new NotFoundException('Loan not found');
    }
    return {
      ...loan,
      activity: buildLoanActivity(loan, loan.payments),
      audit: await this.audit.listFor(tenantId, 'loan', id),
    };
  }

  async findOneForBorrowerUser(userId: string, id: string): Promise<LoanWithDetails> {
    const borrowerId = await this.resolveBorrowerId(userId);
    const loan = await this.prisma.loan.findFirst({
      where: { id, borrowerId },
      include: {
        borrower: { select: { id: true, firstName: true, lastName: true, idNumber: true } },
        schedule: { orderBy: { number: 'asc' } },
        payments: { orderBy: { paidAt: 'desc' } },
      },
    });
    if (!loan) {
      throw new NotFoundException('Loan not found');
    }
    // Borrowers don't see the staff audit trail.
    return { ...loan, activity: buildLoanActivity(loan, loan.payments), audit: [] };
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
        employer: application.employer,
        occupation: application.occupation,
        monthlyIncome: application.declaredIncome,
        employmentType: application.employmentType,
      },
      create: {
        tenant: { connect: { id: application.tenantId } },
        firstName: application.firstName,
        lastName: application.lastName,
        idNumber: application.idNumber,
        phone: application.phone,
        email: application.email,
        employer: application.employer,
        occupation: application.occupation,
        monthlyIncome: application.declaredIncome,
        employmentType: application.employmentType,
      },
    });

    // Carry the application's address + bank snapshot onto the borrower as the
    // new active records (deactivating any previous active ones first).
    await tx.borrowerAddress.updateMany({
      where: { borrowerId: borrower.id, isActive: true },
      data: { isActive: false },
    });
    await tx.borrowerAddress.create({
      data: {
        borrowerId: borrower.id,
        label: 'Residential',
        street: application.addrStreet,
        suburb: application.addrSuburb,
        city: application.addrCity,
        region: application.addrRegion,
        country: application.addrCountry,
        isActive: true,
      },
    });
    await tx.borrowerBankAccount.updateMany({
      where: { borrowerId: borrower.id, isActive: true },
      data: { isActive: false },
    });
    await tx.borrowerBankAccount.create({
      data: {
        borrowerId: borrower.id,
        bankName: application.bankName,
        accountNumber: application.bankAccountNumber,
        branchName: application.bankBranchName,
        branchCode: application.bankBranchCode,
        accountHolderName: application.bankAccountHolder,
        accountType: application.accountType,
        isActive: true,
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

  /**
   * Settle a loan early: clear the full outstanding balance in one payment, mark
   * every remaining instalment paid, and close the loan as settled.
   */
  settle(tenantId: string, loanId: string, input: SettleLoanInput): Promise<Loan> {
    return this.prisma.$transaction(async (tx) => {
      const loan = await tx.loan.findFirst({ where: { id: loanId, tenantId } });
      if (!loan) {
        throw new NotFoundException('Loan not found');
      }
      if (loan.status === LoanStatus.Settled || loan.status === LoanStatus.Closed) {
        throw new BadRequestException('This loan is already settled');
      }
      if (loan.status === LoanStatus.WrittenOff) {
        throw new BadRequestException('This loan has been written off');
      }
      if (loan.balance <= 0) {
        throw new BadRequestException('This loan has no outstanding balance');
      }

      const paidAt = new Date(input.paidAt);
      await tx.payment.create({
        data: {
          tenant: { connect: { id: tenantId } },
          loan: { connect: { id: loan.id } },
          paidAt,
          amount: loan.balance,
          method: input.method,
          note: input.note || 'Early settlement',
        },
      });
      await tx.repaymentScheduleItem.updateMany({
        where: { loanId: loan.id, status: { not: RepaymentStatus.Paid } },
        data: { status: RepaymentStatus.Paid, paidAt },
      });

      return tx.loan.update({
        where: { id: loan.id },
        data: {
          balance: 0,
          status: LoanStatus.Settled,
          instalmentsPaid: loan.instalmentsTotal,
          daysLate: 0,
          nextDueAt: null,
          closedAt: paidAt,
        },
      });
    });
  }

  /** Write off an unrecoverable loan as bad debt; it leaves the active book. */
  async writeOff(tenantId: string, loanId: string, input: WriteOffLoanInput): Promise<Loan> {
    const loan = await this.prisma.loan.findFirst({ where: { id: loanId, tenantId } });
    if (!loan) {
      throw new NotFoundException('Loan not found');
    }
    if (loan.status === LoanStatus.WrittenOff) {
      throw new BadRequestException('This loan is already written off');
    }
    if (loan.status === LoanStatus.Settled || loan.status === LoanStatus.Closed) {
      throw new BadRequestException('A settled loan cannot be written off');
    }
    return this.prisma.loan.update({
      where: { id: loan.id },
      data: { status: LoanStatus.WrittenOff, writeOffReason: input.reason, closedAt: new Date() },
    });
  }

  /**
   * Correct imported loan data. Safe fields (dates, status, collateral, origin
   * month, note, fees) apply any time; the financial core (principal/term/rate)
   * is only changeable while the loan has no payments, in which case it re-prices
   * and rebuilds the schedule. All changes are audited.
   */
  async update(
    tenantId: string,
    actor: SessionUser,
    id: string,
    input: UpdateLoanInput,
  ): Promise<Loan> {
    return this.prisma.$transaction(async (tx) => {
      const loan = await tx.loan.findFirst({
        where: { id, tenantId },
        include: { _count: { select: { payments: true } } },
      });
      if (!loan) {
        throw new NotFoundException('Loan not found');
      }
      if (
        loan.status === LoanStatus.Settled ||
        loan.status === LoanStatus.WrittenOff ||
        loan.status === LoanStatus.Cancelled ||
        loan.status === LoanStatus.Closed
      ) {
        throw new BadRequestException('A closed loan can no longer be edited');
      }

      const data: Prisma.LoanUpdateInput = {};
      if (input.disbursedAt) data.disbursedAt = new Date(input.disbursedAt);
      if (input.nextDueAt) data.nextDueAt = new Date(input.nextDueAt);
      if (input.status) data.status = input.status;
      if (input.collateral !== undefined) data.collateral = input.collateral || null;
      if (input.originMonth !== undefined) data.originMonth = input.originMonth || null;
      if (input.note !== undefined) data.note = input.note || null;
      if (input.bankCharges !== undefined) data.bankCharges = toCents(input.bankCharges);
      if (input.namfisaLevy !== undefined) data.namfisaLevy = toCents(input.namfisaLevy);
      if (input.stampDuty !== undefined) data.stampDuty = toCents(input.stampDuty);

      // Financial core — re-price only when it actually changes, and only when unpaid.
      const newPrincipal = input.amount !== undefined ? toCents(input.amount) : loan.principal;
      const newTerm = input.termMonths ?? loan.termMonths;
      const newRate = input.interestRate ?? loan.interestRate;
      const coreChanged =
        newPrincipal !== loan.principal || newTerm !== loan.termMonths || newRate !== loan.interestRate;
      if (coreChanged) {
        if (loan._count.payments > 0) {
          throw new BadRequestException(
            'The amount, term or rate of a loan with payments cannot be changed',
          );
        }
        const q = quote({
          principalCents: newPrincipal,
          termMonths: newTerm,
          type: LOAN_TYPE_FROM_DB[loan.type],
          financeChargeRate: newRate,
        });
        const disbursedAt = input.disbursedAt
          ? new Date(input.disbursedAt)
          : (loan.disbursedAt ?? loan.createdAt);
        data.principal = q.principalCents;
        data.financeCharge = q.financeChargeCents;
        data.total = q.totalCents;
        data.termMonths = q.termMonths;
        data.instalment = q.instalmentCents;
        data.instalmentsTotal = q.termMonths;
        data.balance = q.totalCents;
        data.interestRate = newRate;
        await tx.repaymentScheduleItem.deleteMany({ where: { loanId: id } });
        data.schedule = {
          create: q.schedule.map((item) => ({
            number: item.number,
            amount: item.amountCents,
            dueAt: addMonths(disbursedAt, item.number),
            status: RepaymentStatus.Due,
          })),
        };
      }

      const before = loanAuditMap(loan);
      const updated = await tx.loan.update({ where: { id }, data });
      await this.audit.record(
        tenantId,
        actor,
        {
          entity: 'loan',
          entityId: id,
          action: 'updated',
          changes: this.audit.diff(before, loanAuditMap(updated), Object.keys(before)),
        },
        tx,
      );
      return updated;
    });
  }

  /** Cancel a payment-free loan (created in error / fell through). Audited. */
  async cancel(
    tenantId: string,
    actor: SessionUser,
    id: string,
    input: CancelLoanInput,
  ): Promise<Loan> {
    return this.prisma.$transaction(async (tx) => {
      const loan = await tx.loan.findFirst({
        where: { id, tenantId },
        include: { _count: { select: { payments: true } } },
      });
      if (!loan) {
        throw new NotFoundException('Loan not found');
      }
      if (
        loan.status === LoanStatus.Cancelled ||
        loan.status === LoanStatus.Settled ||
        loan.status === LoanStatus.WrittenOff
      ) {
        throw new BadRequestException('This loan is already closed');
      }
      if (loan._count.payments > 0) {
        throw new BadRequestException(
          "A loan with payments can't be cancelled — write it off instead",
        );
      }
      const updated = await tx.loan.update({
        where: { id },
        data: {
          status: LoanStatus.Cancelled,
          balance: 0,
          daysLate: 0,
          nextDueAt: null,
          closedAt: new Date(),
          cancelReason: input.reason,
        },
      });
      await this.audit.record(
        tenantId,
        actor,
        {
          entity: 'loan',
          entityId: id,
          action: 'cancelled',
          changes: [
            { field: 'status', from: loan.status, to: LoanStatus.Cancelled },
            { field: 'reason', from: null, to: input.reason },
          ],
        },
        tx,
      );
      return updated;
    });
  }

  /** NAMFISA-compliant statement: every charge and payment with a running balance. */
  async statement(tenantId: string, loanId: string): Promise<LoanStatement> {
    const loan = await this.prisma.loan.findFirst({
      where: { id: loanId, tenantId },
      include: {
        borrower: { include: { addresses: { where: { isActive: true }, take: 1 } } },
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
        borrower: { include: { addresses: { where: { isActive: true }, take: 1 } } },
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
        borrower: { include: { addresses: true } };
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
        address: formatAddressLine(loan.borrower.addresses[0]),
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
