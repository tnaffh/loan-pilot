import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { $Enums, Loan, LoanApplication, Prisma } from '@prisma/client';
import {
  CollexiaStatus,
  DocumentKind,
  LoanStatus,
  LoanType,
  RepaymentStatus,
  addMonths,
  assessArrears,
  buildLoanActivity,
  computeFees,
  daysBetween,
  fromCents,
  quote,
  toCents,
  type ActivityEvent,
  type ArrearsAssessment,
  type CancelLoanInput,
  type CreateLoanInput,
  type LoanFees,
  type LoanQuote,
  type LoanQuoteInput,
  type MarkCollexiaInput,
  type MarkDisbursementInput,
  type RecordRepaymentInput,
  type SessionUser,
  type SettleLoanInput,
  type UpdateLoanInput,
  type WriteOffLoanInput,
} from '@loan-pilot/domain';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService, type AuditEntry } from '../audit/audit.service';
import { SettingsService } from '../settings/settings.service';
import { DocumentsService, type DocumentView } from '../documents/documents.service';

export type LoanWithBorrower = Prisma.LoanGetPayload<{
  include: { borrower: { select: { id: true; firstName: true; lastName: true } } };
}>;

export type LoanWithDetails = Prisma.LoanGetPayload<{
  include: {
    borrower: {
      select: { id: true; firstName: true; lastName: true; idNumber: true; collexiaClientNo: true };
    };
    schedule: true;
    payments: true;
  };
}> & {
  activity: ActivityEvent[];
  audit: AuditEntry[];
  // Live arrears derived from the schedule + today (not persisted). `daysLate`
  // here reflects real lateness; `payoff` = balance + accrued default interest.
  defaultInterest: number;
  overdueAmount: number;
  payoff: number;
  // The borrower's documents, resolved to openable URLs — shown read-only on the
  // staff loan page (empty for the borrower's own portal view).
  borrowerDocuments: DocumentView[];
  // Photos of the pledged collateral (collateral loans), resolved to openable URLs.
  collateralPhotos: DocumentView[];
};

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
  defaultInterestAccrued: number;
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
  insurance: fromCents(loan.insurance),
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
    private readonly settings: SettingsService,
    private readonly documents: DocumentsService,
  ) {}

  /**
   * Resolve the rate plan and fee amounts for a new loan from the tenant's
   * settings. A per-loan `interestRateOverride` (incl. 0 for a promo) wins over
   * the product rate; with neither, pricing falls back to the loan type's
   * standard rate. Returns everything {@link quote} needs.
   */
  private async resolvePricing(
    tenantId: string,
    params: {
      principalCents: number;
      type: LoanType;
      productId?: string;
      interestRateOverride?: number;
      bankChargesCents?: number;
    },
  ): Promise<{
    interestRate: number | undefined;
    monthlyRate: number;
    productId: string | null;
    fees: LoanFees;
  }> {
    const [feeSettings, product] = await Promise.all([
      this.settings.resolveFeeSettings(tenantId),
      this.settings.resolveProduct(tenantId, params.productId || undefined, params.type),
    ]);
    const interestRate = params.interestRateOverride ?? product?.interestRate;
    const fees = computeFees(params.principalCents, feeSettings, params.bankChargesCents ?? 0);
    return { interestRate, monthlyRate: feeSettings.monthlyRate, productId: product?.id ?? null, fees };
  }

  /**
   * Price a loan for a tenant using its default product and fee settings. Used
   * for the indicative application quote so it matches what is charged on
   * approval.
   */
  async priceQuote(
    tenantId: string,
    params: { principalCents: number; termMonths: number; type: LoanType },
  ): Promise<LoanQuote> {
    const { interestRate, monthlyRate, fees } = await this.resolvePricing(tenantId, {
      principalCents: params.principalCents,
      type: params.type,
    });
    return quote({
      principalCents: params.principalCents,
      termMonths: params.termMonths,
      type: params.type,
      interestRate,
      monthlyRate,
      fees,
    });
  }

  /** Pure pricing preview — no persistence. Grosses the loan up by the tenant's fees. */
  async quotePreview(tenantId: string, input: LoanQuoteInput): Promise<LoanQuote> {
    const principalCents = toCents(input.amount);
    const { interestRate, monthlyRate, fees } = await this.resolvePricing(tenantId, {
      principalCents,
      type: input.loanType,
      productId: input.productId || undefined,
      interestRateOverride: input.interestRate,
      bankChargesCents: input.bankCharges !== undefined ? toCents(input.bankCharges) : 0,
    });
    return quote({
      principalCents,
      termMonths: input.termMonths,
      type: input.loanType,
      interestRate,
      monthlyRate,
      fees,
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

  /**
   * Live arrears for a loan, derived from its schedule and the as-of date — never
   * persisted. Returns zeros for terminal loans (closed loans accrue nothing).
   */
  private async deriveArrears(
    tenantId: string,
    status: $Enums.LoanStatus,
    schedule: readonly { amount: number; dueAt: Date; status: $Enums.RepaymentStatus }[],
    asOf: Date = new Date(),
  ): Promise<ArrearsAssessment> {
    const open =
      status === LoanStatus.Active ||
      status === LoanStatus.Arrears ||
      status === LoanStatus.PartlyPaid;
    if (!open) {
      return { overdueCents: 0, defaultInterestCents: 0, daysLate: 0, monthsLateMax: 0 };
    }
    const { monthlyRate } = await this.settings.resolveFeeSettings(tenantId);
    return assessArrears(
      schedule.map((item) => ({
        amountCents: item.amount,
        dueAt: item.dueAt,
        paid: item.status === RepaymentStatus.Paid,
      })),
      asOf,
      monthlyRate,
    );
  }

  async findOne(tenantId: string, id: string): Promise<LoanWithDetails> {
    const loan = await this.prisma.loan.findFirst({
      where: { id, tenantId },
      include: {
        borrower: {
          select: { id: true, firstName: true, lastName: true, idNumber: true, collexiaClientNo: true },
        },
        schedule: { orderBy: { number: 'asc' } },
        payments: { orderBy: { paidAt: 'desc' } },
      },
    });
    if (!loan) {
      throw new NotFoundException('Loan not found');
    }
    const arrears = await this.deriveArrears(tenantId, loan.status, loan.schedule);
    return {
      ...loan,
      daysLate: arrears.daysLate,
      activity: buildLoanActivity(loan, loan.payments),
      audit: await this.audit.listFor(tenantId, 'loan', id),
      defaultInterest: arrears.defaultInterestCents,
      overdueAmount: arrears.overdueCents,
      payoff: loan.balance + arrears.defaultInterestCents,
      borrowerDocuments: await this.documents.listForBorrower(tenantId, loan.borrowerId),
      collateralPhotos: await this.documents.listForLoan(tenantId, id, DocumentKind.CollateralPhoto),
    };
  }

  async findOneForBorrowerUser(userId: string, id: string): Promise<LoanWithDetails> {
    const borrowerId = await this.resolveBorrowerId(userId);
    const loan = await this.prisma.loan.findFirst({
      where: { id, borrowerId },
      include: {
        borrower: {
          select: { id: true, firstName: true, lastName: true, idNumber: true, collexiaClientNo: true },
        },
        schedule: { orderBy: { number: 'asc' } },
        payments: { orderBy: { paidAt: 'desc' } },
      },
    });
    if (!loan) {
      throw new NotFoundException('Loan not found');
    }
    const arrears = await this.deriveArrears(loan.tenantId, loan.status, loan.schedule);
    // Borrowers don't see the staff audit trail; documents are only surfaced on
    // the staff loan page.
    return {
      ...loan,
      daysLate: arrears.daysLate,
      activity: buildLoanActivity(loan, loan.payments),
      audit: [],
      defaultInterest: arrears.defaultInterestCents,
      overdueAmount: arrears.overdueCents,
      payoff: loan.balance + arrears.defaultInterestCents,
      borrowerDocuments: [],
      collateralPhotos: [],
    };
  }

  /** Disburse a new loan to an existing borrower of the tenant. */
  async create(tenantId: string, input: CreateLoanInput): Promise<Loan> {
    const borrower = await this.prisma.borrower.findFirst({
      where: { id: input.borrowerId, tenantId },
    });
    if (!borrower) {
      throw new NotFoundException('Borrower not found');
    }

    const principalCents = toCents(input.amount);
    const { interestRate, monthlyRate, productId, fees } = await this.resolvePricing(tenantId, {
      principalCents,
      type: input.loanType,
      productId: input.productId || undefined,
      interestRateOverride: input.interestRate,
      bankChargesCents: input.bankCharges !== undefined ? toCents(input.bankCharges) : 0,
    });
    const loanQuote = quote({
      principalCents,
      termMonths: input.termMonths,
      type: input.loanType,
      interestRate,
      monthlyRate,
      fees,
    });

    return this.prisma.loan.create({
      data: this.buildLoanCreateData({
        tenantId,
        borrowerId: borrower.id,
        loanQuote,
        type: input.loanType,
        productId,
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
        employerPhone: application.employerPhone,
        employerAddress: application.employerAddress,
        employeeNo: application.employeeNo,
        occupation: application.occupation,
        monthlyIncome: application.declaredIncome,
        employmentType: application.employmentType,
        maritalStatus: application.maritalStatus,
      },
      create: {
        tenant: { connect: { id: application.tenantId } },
        firstName: application.firstName,
        lastName: application.lastName,
        idNumber: application.idNumber,
        phone: application.phone,
        email: application.email,
        employer: application.employer,
        employerPhone: application.employerPhone,
        employerAddress: application.employerAddress,
        employeeNo: application.employeeNo,
        occupation: application.occupation,
        monthlyIncome: application.declaredIncome,
        employmentType: application.employmentType,
        maritalStatus: application.maritalStatus,
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

    // A distinct postal address (labelled), when the applicant supplied one.
    if (application.postalStreet && application.postalCity) {
      await tx.borrowerAddress.create({
        data: {
          borrowerId: borrower.id,
          label: 'Postal',
          street: application.postalStreet,
          suburb: application.postalSuburb,
          city: application.postalCity,
          region: application.postalRegion,
          country: application.postalCountry ?? 'Namibia',
          isActive: false,
        },
      });
    }

    // Carry the application's references onto the borrower (replacing any prior
    // set) so agreements can be regenerated with them.
    const references = await tx.applicationReference.findMany({
      where: { applicationId: application.id },
      select: { name: true, phone: true },
    });
    await tx.borrowerReference.deleteMany({ where: { borrowerId: borrower.id } });
    if (references.length > 0) {
      await tx.borrowerReference.createMany({
        data: references.map((reference) => ({
          borrowerId: borrower.id,
          name: reference.name,
          phone: reference.phone,
        })),
      });
    }

    // Carry the application's uploaded documents (incl. the captured signature)
    // onto the borrower so they persist beyond the application.
    await tx.document.updateMany({
      where: { applicationId: application.id },
      data: { borrowerId: borrower.id },
    });

    const type = LOAN_TYPE_FROM_DB[application.type];
    const { interestRate, monthlyRate, productId, fees } = await this.resolvePricing(
      application.tenantId,
      { principalCents: application.amount, type },
    );
    const loanQuote = quote({
      principalCents: application.amount,
      monthlyRate,
      termMonths: application.termMonths,
      type,
      interestRate,
      fees,
    });

    // Structured collateral (collateral loans) + a legacy free-text summary so
    // the loan list / edit form keep rendering the single `collateral` string.
    const collateralDetail = application.collateralItem
      ? {
          item: application.collateralItem,
          identifier: application.collateralIdentifier,
          description: application.collateralDescription,
          condition: application.collateralCondition,
          value: application.collateralValue,
        }
      : null;
    const collateralSummary = application.collateralItem
      ? [application.collateralItem, application.collateralIdentifier].filter(Boolean).join(' · ')
      : null;

    const loan = await tx.loan.create({
      data: this.buildLoanCreateData({
        tenantId: application.tenantId,
        borrowerId: borrower.id,
        loanQuote,
        type,
        productId,
        collateral: collateralSummary,
        collateralDetail,
        disbursedAt: new Date(),
        agreement: {
          tcVersion: application.tcVersion,
          tcAcceptedAt: application.tcAcceptedAt,
          signatureDocumentId: application.signatureDocumentId,
        },
      }),
    });

    // Attach the collateral photos to the loan too (they're already relinked to
    // the borrower above); this lets the loan page + collateral agreement use them.
    await tx.document.updateMany({
      where: { applicationId: application.id, kind: DocumentKind.CollateralPhoto },
      data: { loanId: loan.id },
    });

    return loan;
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
      const loan = await tx.loan.findFirst({
        where: { id: loanId, tenantId },
        include: { schedule: true },
      });
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
      // Payoff = outstanding balance + any default interest accrued (as of the
      // settlement date) on overdue instalments. Default interest is realised
      // through the payment amount; stored totals are not rewritten.
      const arrears = await this.deriveArrears(tenantId, loan.status, loan.schedule, paidAt);
      const payoff = loan.balance + arrears.defaultInterestCents;
      await tx.payment.create({
        data: {
          tenant: { connect: { id: tenantId } },
          loan: { connect: { id: loan.id } },
          paidAt,
          amount: payoff,
          method: input.method,
          note:
            input.note ||
            (arrears.defaultInterestCents > 0
              ? 'Early settlement (incl. default interest)'
              : 'Early settlement'),
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
      if (input.insurance !== undefined) data.insurance = toCents(input.insurance);

      // Financial core — re-price only when it actually changes, and only when
      // unpaid. Re-pricing grosses the loan up by its (post-edit) fees, so a loan
      // with no fees re-prices identically to before. Fee-only edits are stored
      // without recomputing the total, leaving existing loans untouched.
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
        const feeSettings = await this.settings.resolveFeeSettings(tenantId);
        // The NAMFISA levy and insurance are a fraction of the loan amount, so
        // recompute them from the new principal unless the edit explicitly
        // overrides them. Stamp duty and bank charges are flat — keep the loan's
        // (or the overridden) value.
        const scaled = computeFees(newPrincipal, feeSettings);
        const effectiveFees: LoanFees = {
          namfisaLevyCents:
            input.namfisaLevy !== undefined ? toCents(input.namfisaLevy) : scaled.namfisaLevyCents,
          stampDutyCents: input.stampDuty !== undefined ? toCents(input.stampDuty) : loan.stampDuty,
          insuranceCents:
            input.insurance !== undefined ? toCents(input.insurance) : scaled.insuranceCents,
          bankChargesCents:
            input.bankCharges !== undefined ? toCents(input.bankCharges) : loan.bankCharges,
        };
        const { monthlyRate } = feeSettings;
        const q = quote({
          principalCents: newPrincipal,
          termMonths: newTerm,
          type: LOAN_TYPE_FROM_DB[loan.type],
          interestRate: newRate,
          monthlyRate,
          fees: effectiveFees,
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
        // Persist the fee amounts the re-price used so the stored columns track
        // the new principal (e.g. the NAMFISA levy, which scales with the amount).
        data.namfisaLevy = effectiveFees.namfisaLevyCents;
        data.stampDuty = effectiveFees.stampDutyCents;
        data.insurance = effectiveFees.insuranceCents;
        data.bankCharges = effectiveFees.bankChargesCents;
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

  /** Mark whether the loan's funds have physically left the lender's account. */
  async markDisbursement(
    tenantId: string,
    actor: SessionUser,
    id: string,
    input: MarkDisbursementInput,
  ): Promise<Loan> {
    const loan = await this.prisma.loan.findFirst({ where: { id, tenantId } });
    if (!loan) {
      throw new NotFoundException('Loan not found');
    }
    if (loan.fundsReleased === input.released) {
      return loan;
    }
    const updated = await this.prisma.loan.update({
      where: { id },
      data: {
        fundsReleased: input.released,
        fundsReleasedAt: input.released ? (loan.fundsReleasedAt ?? new Date()) : null,
      },
    });
    await this.audit.record(tenantId, actor, {
      entity: 'loan',
      entityId: id,
      action: 'disbursement_updated',
      changes: [
        {
          field: 'disbursedFromAccount',
          from: loan.fundsReleased ? 'yes' : 'no',
          to: input.released ? 'yes' : 'no',
        },
      ],
    });
    return updated;
  }

  /** Set the loan's Collexia debt-order loading state. */
  async markCollexia(
    tenantId: string,
    actor: SessionUser,
    id: string,
    input: MarkCollexiaInput,
  ): Promise<Loan> {
    const loan = await this.prisma.loan.findFirst({ where: { id, tenantId } });
    if (!loan) {
      throw new NotFoundException('Loan not found');
    }
    if (loan.collexiaStatus === input.status) {
      return loan;
    }
    const updated = await this.prisma.loan.update({
      where: { id },
      data: {
        collexiaStatus: input.status,
        collexiaMarkedAt: input.status === CollexiaStatus.Pending ? null : new Date(),
      },
    });
    await this.audit.record(tenantId, actor, {
      entity: 'loan',
      entityId: id,
      action: 'collexia_updated',
      changes: [{ field: 'collexiaStatus', from: loan.collexiaStatus, to: input.status }],
    });
    return updated;
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
    const { monthlyRate } = await this.settings.resolveFeeSettings(tenantId);
    return this.buildStatement(loan, monthlyRate);
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
    const { monthlyRate } = await this.settings.resolveFeeSettings(loan.tenantId);
    return this.buildStatement(loan, monthlyRate);
  }

  private buildStatement(
    loan: Prisma.LoanGetPayload<{
      include: {
        borrower: { include: { addresses: true } };
        tenant: { select: { name: true; town: true } };
        schedule: true;
      };
    }>,
    monthlyRate: number,
  ): LoanStatement {
    const openedAt = loan.disbursedAt ?? loan.createdAt;
    const lines: StatementLine[] = [];

    // The principal debt (loan + fees), then the finance charge and any bank
    // charges, accumulated into the opening balance. Zero-value fees are omitted,
    // so loans priced before fees were tracked render exactly as before.
    const charges = [
      { amount: loan.principal, description: 'Principal advanced' },
      { amount: loan.stampDuty, description: 'Stamp duty' },
      { amount: loan.insurance, description: 'Insurance' },
      { amount: loan.namfisaLevy, description: 'NAMFISA levy' },
      {
        amount: loan.financeCharge,
        description: 'Finance charge (NAMFISA ≤30% of principal debt)',
      },
      { amount: loan.bankCharges, description: 'Bank charges' },
    ].filter((charge) => charge.amount > 0);

    charges.reduce((balance, charge) => {
      const next = balance + charge.amount;
      lines.push({
        date: openedAt.toISOString(),
        description: charge.description,
        debit: charge.amount,
        credit: 0,
        balance: next,
      });
      return next;
    }, 0);

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

    // Default interest accrued on overdue, unpaid instalments (5%/month
    // compounding, uncapped) as of today. Derived, never persisted.
    const now = new Date();
    const arrears = assessArrears(
      loan.schedule.map((item) => ({
        amountCents: item.amount,
        dueAt: item.dueAt,
        paid: item.status === RepaymentStatus.Paid,
      })),
      now,
      monthlyRate,
    );
    if (arrears.defaultInterestCents > 0) {
      lines.push({
        date: now.toISOString(),
        description: 'Default interest (5%/month, NAMFISA)',
        debit: arrears.defaultInterestCents,
        credit: 0,
        balance: runningBalance + arrears.defaultInterestCents,
      });
    }

    return {
      generatedAt: now.toISOString(),
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
      defaultInterestAccrued: arrears.defaultInterestCents,
      outstandingBalance: runningBalance + arrears.defaultInterestCents,
    };
  }

  private buildLoanCreateData({
    tenantId,
    borrowerId,
    loanQuote,
    type,
    productId,
    collateral,
    collateralDetail,
    disbursedAt,
    agreement,
  }: {
    tenantId: string;
    borrowerId: string;
    loanQuote: LoanQuote;
    type: LoanType;
    productId: string | null;
    collateral: string | null;
    // Structured collateral carried from the application (collateral loans only).
    collateralDetail?: {
      item: string | null;
      identifier: string | null;
      description: string | null;
      condition: string | null;
      value: number | null;
    } | null;
    disbursedAt: Date;
    // Terms acceptance + signature carried from the application (absent for
    // loans created directly against an existing borrower).
    agreement?: {
      tcVersion: string | null;
      tcAcceptedAt: Date | null;
      signatureDocumentId: string | null;
    };
  }): Prisma.LoanCreateInput {
    return {
      tenant: { connect: { id: tenantId } },
      borrower: { connect: { id: borrowerId } },
      ...(productId ? { product: { connect: { id: productId } } } : {}),
      tcVersion: agreement?.tcVersion ?? null,
      tcAcceptedAt: agreement?.tcAcceptedAt ?? null,
      signatureDocumentId: agreement?.signatureDocumentId ?? null,
      type,
      principal: loanQuote.principalCents,
      financeCharge: loanQuote.financeChargeCents,
      interestRate: loanQuote.interestRate,
      namfisaLevy: loanQuote.namfisaLevyCents,
      stampDuty: loanQuote.stampDutyCents,
      insurance: loanQuote.insuranceCents,
      bankCharges: loanQuote.bankChargesCents,
      total: loanQuote.totalCents,
      termMonths: loanQuote.termMonths,
      instalment: loanQuote.instalmentCents,
      instalmentsPaid: 0,
      instalmentsTotal: loanQuote.termMonths,
      balance: loanQuote.totalCents,
      status: LoanStatus.Active,
      collateral,
      collateralItem: collateralDetail?.item ?? null,
      collateralIdentifier: collateralDetail?.identifier ?? null,
      collateralDescription: collateralDetail?.description ?? null,
      collateralCondition: collateralDetail?.condition ?? null,
      collateralValue: collateralDetail?.value ?? null,
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
