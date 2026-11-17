import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { $Enums, Loan, LoanApplication, Prisma } from '@prisma/client';
import {
  CollexiaStatus,
  DocumentKind,
  INTEREST_METHOD_LABEL,
  InterestMethod,
  LoanStatus,
  LoanType,
  MAX_TERM_MONTHS,
  RENEWAL_TERM_MONTHS,
  RenewalBasis,
  RepaymentStatus,
  UserRole,
  addMonths,
  amortisedUnearnedInterest,
  assessArrears,
  buildLoanActivity,
  computeFees,
  daysBetween,
  fromCents,
  isInstalmentSettled,
  phoneKey,
  priceLoan,
  toCents,
  type ActivityEvent,
  type ArrearsAssessment,
  type CancelLoanInput,
  type ChangeLoanMethodInput,
  type CreateLoanInput,
  type LoanFees,
  type LoanPurposeValue,
  type LoanQuote,
  type LoanQuoteInput,
  type MarkCollexiaInput,
  type MarkDisbursementInput,
  type RecordRepaymentInput,
  type SessionUser,
  type SettleLoanInput,
  type UpdateLoanInput,
  type WaiveLoanInput,
  type WriteOffLoanInput,
} from '@loan-pilot/domain';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService, type AuditEntry } from '../audit/audit.service';
import { SettingsService } from '../settings/settings.service';
import { DocumentsService, type DocumentView } from '../documents/documents.service';
import { AgreementsService } from '../agreements/agreements.service';
import { deriveScheduleProgress } from '../payments/schedule-progress';
import { LoanCalculationService, isOpenLoan, renewalStateFor } from './loan-calculation.service';

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
    renewals: true;
  };
}> & {
  activity: ActivityEvent[];
  audit: AuditEntry[];
  // Live arrears derived from the schedule + today (not persisted). `daysLate`
  // here reflects real lateness; `payoff` = balance + accrued default interest.
  defaultInterest: number;
  overdueAmount: number;
  payoff: number;
  // Term loans: interest not yet earned, rebated if the loan is settled today
  // (already taken off `payoff`). 0 for other methods.
  unearnedInterest: number;
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

const METHOD_FROM_DB: Record<$Enums.InterestMethod, InterestMethod> = {
  payday: InterestMethod.Payday,
  monthly_renewal: InterestMethod.MonthlyRenewal,
  term_loan: InterestMethod.TermLoan,
};

const BASIS_FROM_DB: Record<$Enums.RenewalBasis, RenewalBasis> = {
  principal: RenewalBasis.Principal,
  balance: RenewalBasis.Balance,
};

/** Everything needed to price a loan under its calculation method. */
interface ResolvedPricing {
  /** Monthly finance rate (payday / monthly renewal); undefined = the type's standard rate. */
  interestRate: number | undefined;
  monthlyRate: number;
  productId: string | null;
  fees: LoanFees;
  method: InterestMethod;
  /** Monthly renewal only. */
  renewalBasis: RenewalBasis | null;
  /** Term loans only: the yearly rate and its two parts, and the lender's max term. */
  annualRate: number | null;
  bonRate: number | null;
  marginRate: number | null;
  maxTermMonths: number | null;
}

/** What a loan would look like under another calculation method. */
export interface MethodChangePreview {
  method: InterestMethod;
  termMonths: number;
  instalment: number;
  total: number;
  balance: number;
  nextDueAt: string | null;
  /** Monthly renewal: how many renewals have already fallen due, and their sum. */
  renewals: number;
  renewalCharges: number;
  /** Payday / term loan: default interest on instalments already overdue. */
  defaultInterest: number;
  payoff: number;
  current: { total: number; balance: number; defaultInterest: number; payoff: number };
}

/** Loan fields shown in the audit trail, in display form (money major, dates ISO). */
const loanAuditMap = (loan: Loan): Record<string, unknown> => ({
  principal: fromCents(loan.principal),
  financeCharge: fromCents(loan.financeCharge),
  total: fromCents(loan.total),
  termMonths: loan.termMonths,
  interestRate: loan.interestRate,
  calculationMethod: loan.interestMethod ? INTEREST_METHOD_LABEL[loan.interestMethod] : null,
  renewalBasis: loan.renewalBasis ?? null,
  annualRate: loan.annualRate ?? null,
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

/**
 * The audited loan fields that are printed on a generated agreement. An edit
 * that changes any of them leaves the stored PDF stale, so the agreement is
 * regenerated after such an edit commits.
 */
const AGREEMENT_FIELDS = [
  'principal',
  'financeCharge',
  'total',
  'termMonths',
  'interestRate',
  'calculationMethod',
  'annualRate',
  'instalment',
  'bankCharges',
  'namfisaLevy',
  'stampDuty',
  'insurance',
  'disbursedAt',
] as const;

const agreementFieldsChanged = (
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): boolean => AGREEMENT_FIELDS.some((field) => String(before[field]) !== String(after[field]));

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
    private readonly agreements: AgreementsService,
    private readonly calculation: LoanCalculationService,
  ) {}

  /**
   * Resolve the rate plan, calculation method and fee amounts for a new loan from
   * the tenant's settings. A per-loan `interestRateOverride` (incl. 0 for a
   * promo) wins over the product rate; with neither, pricing falls back to the
   * loan type's standard rate. The method is the one asked for, else the rate
   * plan's, else payday. Returns everything {@link priceLoan} needs.
   */
  private async resolvePricing(
    tenantId: string,
    params: {
      principalCents: number;
      type: LoanType;
      productId?: string;
      interestRateOverride?: number;
      bankChargesCents?: number;
      method?: InterestMethod;
      renewalBasis?: RenewalBasis;
      marginRate?: number;
    },
  ): Promise<ResolvedPricing> {
    const [feeSettings, product] = await Promise.all([
      this.settings.resolveFeeSettings(tenantId),
      this.settings.resolveProduct(tenantId, params.productId || undefined, params.type),
    ]);
    const productMethod = product?.method ? METHOD_FROM_DB[product.method] : InterestMethod.Payday;
    const method = params.method ?? productMethod;
    // A term-loan plan's `interestRate` is unused (its rate is BoN + margin), so
    // it must not leak into a monthly finance rate.
    const productRate =
      productMethod === InterestMethod.TermLoan ? undefined : product?.interestRate;
    const fees = computeFees(params.principalCents, feeSettings, params.bankChargesCents ?? 0);
    const base = {
      interestRate: params.interestRateOverride ?? productRate,
      monthlyRate: feeSettings.monthlyRate,
      productId: product?.id ?? null,
      fees,
      method,
    };

    if (method === InterestMethod.TermLoan) {
      const { bonRate, maxLongTermMonths } = await this.settings.resolveMethodSettings(tenantId);
      const marginRate = params.marginRate ?? product?.marginRate ?? 0;

      return {
        ...base,
        renewalBasis: null,
        annualRate: bonRate + marginRate,
        bonRate,
        marginRate,
        maxTermMonths: maxLongTermMonths,
      };
    }

    const productBasis = product?.renewalBasis ? BASIS_FROM_DB[product.renewalBasis] : null;

    return {
      ...base,
      renewalBasis:
        method === InterestMethod.MonthlyRenewal
          ? (params.renewalBasis ?? productBasis ?? RenewalBasis.Principal)
          : null,
      annualRate: null,
      bonRate: null,
      marginRate: null,
      maxTermMonths: null,
    };
  }

  /**
   * Price a loan under its resolved method. The domain rejects an impossible
   * term (e.g. a payday loan over 5 months) with a RangeError; that is the
   * caller's input, so it is reported as a bad request.
   */
  private price(
    pricing: ResolvedPricing,
    params: { principalCents: number; termMonths: number; type: LoanType },
  ): LoanQuote {
    try {
      return priceLoan({
        method: pricing.method,
        principalCents: params.principalCents,
        termMonths: params.termMonths,
        type: params.type,
        interestRate: pricing.interestRate,
        monthlyRate: pricing.monthlyRate,
        fees: pricing.fees,
        annualRate: pricing.annualRate ?? undefined,
        maxTermMonths: pricing.maxTermMonths ?? undefined,
      });
    } catch (error) {
      if (error instanceof RangeError) {
        throw new BadRequestException(error.message);
      }

      throw error;
    }
  }

  /**
   * Price a loan for a tenant using its default product and fee settings. Used
   * for the indicative application quote so it matches what is charged on
   * approval. Applications are always payday loans; other methods are set by
   * staff on the loan itself.
   */
  async priceQuote(
    tenantId: string,
    params: { principalCents: number; termMonths: number; type: LoanType },
  ): Promise<LoanQuote> {
    const pricing = await this.resolvePricing(tenantId, {
      principalCents: params.principalCents,
      type: params.type,
      method: InterestMethod.Payday,
    });

    return this.price(pricing, params);
  }

  /** Pure pricing preview — no persistence. Grosses the loan up by the tenant's fees. */
  async quotePreview(tenantId: string, input: LoanQuoteInput): Promise<LoanQuote> {
    const principalCents = toCents(input.amount);
    const pricing = await this.resolvePricing(tenantId, {
      principalCents,
      type: input.loanType,
      productId: input.productId || undefined,
      interestRateOverride: input.interestRate,
      bankChargesCents: input.bankCharges !== undefined ? toCents(input.bankCharges) : 0,
      method: input.method,
      renewalBasis: input.renewalBasis,
      marginRate: input.marginRate,
    });

    return this.price(pricing, {
      principalCents,
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
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { borrowerId: true },
    });
    // An applicant signed in before approval has no borrower yet: no loans.
    const borrowerId = user?.borrowerId;

    if (!borrowerId) {
      return [];
    }

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
    method?: $Enums.InterestMethod,
  ): Promise<ArrearsAssessment> {
    const open =
      status === LoanStatus.Active ||
      status === LoanStatus.Arrears ||
      status === LoanStatus.PartlyPaid;

    if (!open) {
      return { overdueCents: 0, defaultInterestCents: 0, daysLate: 0, monthsLateMax: 0 };
    }

    const { monthlyRate } = await this.settings.resolveFeeSettings(tenantId);

    const arrears = assessArrears(
      schedule.map((item) => ({
        amountCents: item.amount,
        dueAt: item.dueAt,
        paid: item.status === RepaymentStatus.Paid,
      })),
      asOf,
      monthlyRate,
    );

    // A monthly-renewal loan renews instead of accruing default interest.
    return method === InterestMethod.MonthlyRenewal
      ? { ...arrears, defaultInterestCents: 0 }
      : arrears;
  }

  /**
   * Interest a term loan would be rebated if settled on `asOf`: the interest of
   * instalments whose month has not started. 0 for every other method.
   */
  private unearnedInterest(
    loan: Pick<Loan, 'interestMethod' | 'status' | 'balance'>,
    schedule: readonly { dueAt: Date; interest: number | null; status: $Enums.RepaymentStatus }[],
    asOf: Date = new Date(),
  ): number {
    if (loan.interestMethod !== InterestMethod.TermLoan || !isOpenLoan(loan.status)) {
      return 0;
    }

    const unearned = amortisedUnearnedInterest(
      schedule.map((item) => ({
        dueAt: item.dueAt,
        interestCents: item.interest ?? 0,
        settled: isInstalmentSettled(item.status),
      })),
      asOf,
    );

    return Math.min(unearned, loan.balance);
  }

  /**
   * Bring a monthly-renewal loan up to date before it is read, so the renewals,
   * total and due date shown are today's. Other methods need no refresh.
   */
  private async refreshIfRenewing(where: Prisma.LoanWhereInput): Promise<void> {
    const loan = await this.prisma.loan.findFirst({
      where,
      select: { id: true, interestMethod: true, status: true },
    });

    if (loan?.interestMethod === InterestMethod.MonthlyRenewal && isOpenLoan(loan.status)) {
      await this.calculation.refresh(loan.id);
    }
  }

  async findOne(tenantId: string, id: string): Promise<LoanWithDetails> {
    await this.refreshIfRenewing({ id, tenantId });

    const loan = await this.prisma.loan.findFirst({
      where: { id, tenantId },
      include: {
        borrower: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            idNumber: true,
            collexiaClientNo: true,
          },
        },
        schedule: { orderBy: { number: 'asc' } },
        payments: { orderBy: { paidAt: 'desc' } },
        renewals: { orderBy: { number: 'asc' } },
      },
    });

    if (!loan) {
      throw new NotFoundException('Loan not found');
    }

    const arrears = await this.deriveArrears(
      tenantId,
      loan.status,
      loan.schedule,
      new Date(),
      loan.interestMethod,
    );
    const unearnedInterest = this.unearnedInterest(loan, loan.schedule);

    return {
      ...loan,
      daysLate: arrears.daysLate,
      activity: buildLoanActivity(loan, loan.payments),
      audit: await this.audit.listFor(tenantId, 'loan', id),
      defaultInterest: arrears.defaultInterestCents,
      overdueAmount: arrears.overdueCents,
      payoff: loan.balance - unearnedInterest + arrears.defaultInterestCents,
      unearnedInterest,
      borrowerDocuments: await this.documents.listForBorrower(tenantId, loan.borrowerId),
      collateralPhotos: await this.documents.listForLoan(
        tenantId,
        id,
        DocumentKind.CollateralPhoto,
      ),
    };
  }

  async findOneForBorrowerUser(userId: string, id: string): Promise<LoanWithDetails> {
    const borrowerId = await this.resolveBorrowerId(userId);

    await this.refreshIfRenewing({ id, borrowerId });

    const loan = await this.prisma.loan.findFirst({
      where: { id, borrowerId },
      include: {
        borrower: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            idNumber: true,
            collexiaClientNo: true,
          },
        },
        schedule: { orderBy: { number: 'asc' } },
        payments: { orderBy: { paidAt: 'desc' } },
        renewals: { orderBy: { number: 'asc' } },
      },
    });

    if (!loan) {
      throw new NotFoundException('Loan not found');
    }

    const arrears = await this.deriveArrears(
      loan.tenantId,
      loan.status,
      loan.schedule,
      new Date(),
      loan.interestMethod,
    );
    const unearnedInterest = this.unearnedInterest(loan, loan.schedule);

    // Borrowers don't see the staff audit trail; documents are only surfaced on
    // the staff loan page.
    return {
      ...loan,
      daysLate: arrears.daysLate,
      activity: buildLoanActivity(loan, loan.payments),
      audit: [],
      defaultInterest: arrears.defaultInterestCents,
      overdueAmount: arrears.overdueCents,
      payoff: loan.balance - unearnedInterest + arrears.defaultInterestCents,
      unearnedInterest,
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
    const pricing = await this.resolvePricing(tenantId, {
      principalCents,
      type: input.loanType,
      productId: input.productId || undefined,
      interestRateOverride: input.interestRate,
      bankChargesCents: input.bankCharges !== undefined ? toCents(input.bankCharges) : 0,
      method: input.method,
      renewalBasis: input.renewalBasis,
      marginRate: input.marginRate,
    });
    const loanQuote = this.price(pricing, {
      principalCents,
      termMonths: input.termMonths,
      type: input.loanType,
    });

    return this.prisma.loan.create({
      data: this.buildLoanCreateData({
        tenantId,
        borrowerId: borrower.id,
        loanQuote,
        type: input.loanType,
        pricing,
        collateral: input.collateral || null,
        purpose: input.purpose ?? null,
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
        phoneKey: phoneKey(application.phone),
        email: application.email,
        employer: application.employer,
        employerPhone: application.employerPhone,
        employerAddress: application.employerAddress,
        employeeNo: application.employeeNo,
        occupation: application.occupation,
        monthlyIncome: application.declaredIncome,
        employmentType: application.employmentType,
        maritalStatus: application.maritalStatus,
        // Only fill a blank: a correction made on the borrower after intake
        // must not be overwritten by an older application snapshot.
        ...(application.gender ? { gender: application.gender } : {}),
      },
      create: {
        tenant: { connect: { id: application.tenantId } },
        firstName: application.firstName,
        lastName: application.lastName,
        idNumber: application.idNumber,
        phone: application.phone,
        phoneKey: phoneKey(application.phone),
        email: application.email,
        employer: application.employer,
        employerPhone: application.employerPhone,
        employerAddress: application.employerAddress,
        employeeNo: application.employeeNo,
        occupation: application.occupation,
        monthlyIncome: application.declaredIncome,
        employmentType: application.employmentType,
        maritalStatus: application.maritalStatus,
        gender: application.gender,
      },
    });

    // An applicant who already signed in to the mobile app by SMS code has a
    // borrower login with no Borrower yet; link it now so their loans appear
    // without signing in again. Skipped if another login already holds it.
    const applicantPhone = phoneKey(application.phone);

    if (applicantPhone) {
      const alreadyLinked = await tx.user.findFirst({
        where: { borrowerId: borrower.id },
        select: { id: true },
      });

      if (!alreadyLinked) {
        const login = await tx.user.findFirst({
          where: {
            tenantId: application.tenantId,
            phone: applicantPhone,
            role: UserRole.Borrower,
            borrowerId: null,
          },
          select: { id: true },
        });

        if (login) {
          await tx.user.update({ where: { id: login.id }, data: { borrowerId: borrower.id } });
        }
      }
    }

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
    // onto the borrower so they persist beyond the application. Files attached
    // from the borrower's own profile are already there — skip them (same
    // storage key) so the profile doesn't list them twice.
    const onProfile = await tx.document.findMany({
      where: { borrowerId: borrower.id },
      select: { url: true },
    });

    await tx.document.updateMany({
      where: {
        applicationId: application.id,
        ...(onProfile.length > 0
          ? { url: { notIn: onProfile.map((document) => document.url) } }
          : {}),
      },
      data: { borrowerId: borrower.id },
    });

    const type = LOAN_TYPE_FROM_DB[application.type];
    // Applications are always payday loans; staff set another method on the loan.
    const pricing = await this.resolvePricing(application.tenantId, {
      principalCents: application.amount,
      type,
      method: InterestMethod.Payday,
    });
    const loanQuote = this.price(pricing, {
      principalCents: application.amount,
      termMonths: application.termMonths,
      type,
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
        pricing,
        collateral: collateralSummary,
        collateralDetail,
        purpose: application.purposeCategory,
        disbursedAt: new Date(),
        agreement: {
          tcVersion: application.tcVersion,
          tcAcceptedAt: application.tcAcceptedAt,
          signatureDocumentId: application.signatureDocumentId,
          initialsDocumentId: application.initialsDocumentId,
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

      if (loan.interestMethod === InterestMethod.MonthlyRenewal) {
        throw new BadRequestException(
          'A monthly renewal loan has no fixed instalments — record a payment or settle it instead',
        );
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
      const daysLate =
        nextUnpaid && nextUnpaid.dueAt < now ? daysBetween(nextUnpaid.dueAt, now) : 0;
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
   * Settle a loan early: clear what is owed in one payment, mark every remaining
   * instalment paid, and close the loan as settled. What is owed depends on the
   * method:
   * - payday: the balance plus default interest on overdue instalments;
   * - monthly renewal: the balance including every renewal up to the payment date;
   * - term loan: the balance less interest not yet earned, plus default interest.
   */
  settle(tenantId: string, loanId: string, input: SettleLoanInput): Promise<Loan> {
    return this.prisma.$transaction(async (tx) => {
      const found = await tx.loan.findFirst({
        where: { id: loanId, tenantId },
        include: { schedule: true },
      });

      if (!found) {
        throw new NotFoundException('Loan not found');
      }

      if (found.status === LoanStatus.Settled || found.status === LoanStatus.Closed) {
        throw new BadRequestException('This loan is already settled');
      }

      if (found.status === LoanStatus.WrittenOff) {
        throw new BadRequestException('This loan has been written off');
      }

      const paidAt = new Date(input.paidAt);
      const renewing = found.interestMethod === InterestMethod.MonthlyRenewal;
      // A monthly-renewal loan is first brought up to the payment date, so the
      // payoff includes exactly the renewals that had fallen due by then.
      const payments = renewing
        ? await tx.payment.findMany({
            where: { loanId: found.id },
            select: { amount: true, paidAt: true },
          })
        : [];
      const renewalState = renewing
        ? renewalStateFor(
            found,
            payments,
            (await this.settings.resolveMethodSettings(tenantId)).renewalGraceDays,
            paidAt,
          )
        : null;
      const loan = renewalState
        ? {
            ...(await this.calculation.writeRenewalState(tx, found, renewalState)),
            balance: renewalState.position.owedCents,
          }
        : found;

      if (loan.balance <= 0) {
        throw new BadRequestException('This loan has no outstanding balance');
      }

      // Default interest (as of the settlement date) on overdue instalments is
      // realised through the payment amount; stored totals are not rewritten for
      // it. A term loan's unearned interest is rebated: it comes off the payoff
      // and off the loan's total and finance charge.
      const arrears = await this.deriveArrears(
        tenantId,
        loan.status,
        found.schedule,
        paidAt,
        loan.interestMethod,
      );
      const rebate = this.unearnedInterest(loan, found.schedule, paidAt);
      const payoff = loan.balance - rebate + arrears.defaultInterestCents;
      const defaultNote =
        rebate > 0
          ? 'Early settlement (unearned interest rebated)'
          : arrears.defaultInterestCents > 0
            ? 'Early settlement (incl. default interest)'
            : 'Early settlement';

      await tx.payment.create({
        data: {
          tenant: { connect: { id: tenantId } },
          loan: { connect: { id: loan.id } },
          paidAt,
          amount: payoff,
          method: input.method,
          note: input.note || defaultNote,
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
          ...(rebate > 0
            ? { total: loan.total - rebate, financeCharge: loan.financeCharge - rebate }
            : {}),
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
   * Settle a loan by waiving what is still owed, with a reason.
   *
   * For the borrower who repaid all but a small remainder — a debit-order
   * rounding or a loading error — and whom the lender lets go: the loan reads
   * *settled*, not written off, while the waived amount is still reported as bad
   * debt (the NAMFISA return and the monthly report count it exactly like a
   * write-off, see `writeOffsInPeriod`). A written-off loan may be converted
   * this way, keeping the date it left the book, which is how one written off
   * over a few dollars is put right.
   *
   * The remaining instalments are marked *waived*, never paid: the reporting
   * ledger reads a paid instalment as money received.
   */
  waive(
    tenantId: string,
    actor: SessionUser,
    loanId: string,
    input: WaiveLoanInput,
  ): Promise<Loan> {
    return this.prisma.$transaction(async (tx) => {
      const loan = await tx.loan.findFirst({ where: { id: loanId, tenantId } });

      if (!loan) {
        throw new NotFoundException('Loan not found');
      }

      if (loan.status === LoanStatus.Settled || loan.status === LoanStatus.Closed) {
        throw new BadRequestException('This loan is already settled');
      }

      if (loan.status === LoanStatus.Cancelled) {
        throw new BadRequestException('A cancelled loan has nothing to waive');
      }

      if (loan.balance <= 0) {
        throw new BadRequestException('This loan has no outstanding balance to waive');
      }

      const waived = loan.waived + loan.balance;

      await tx.repaymentScheduleItem.updateMany({
        where: { loanId: loan.id, status: { not: RepaymentStatus.Paid } },
        data: { status: RepaymentStatus.Waived },
      });
      const updated = await tx.loan.update({
        where: { id: loan.id },
        data: {
          status: LoanStatus.Settled,
          balance: 0,
          waived,
          waiveReason: input.reason,
          writeOffReason: null,
          instalmentsPaid: loan.instalmentsTotal,
          daysLate: 0,
          nextDueAt: null,
          // A written-off loan already left the book on its write-off date; keep it.
          closedAt: loan.closedAt ?? new Date(),
        },
      });

      await this.audit.record(
        tenantId,
        actor,
        {
          entity: 'loan',
          entityId: loan.id,
          action: 'waived',
          changes: [
            { field: 'status', from: loan.status, to: LoanStatus.Settled },
            {
              field: 'waived',
              from: String(fromCents(loan.waived)),
              to: String(fromCents(waived)),
            },
            { field: 'reason', from: loan.writeOffReason, to: input.reason },
          ],
        },
        tx,
      );

      return updated;
    });
  }

  /**
   * Correct imported loan data. Safe fields (dates, status, collateral, origin
   * month, note, fees) apply any time; the financial core (principal/term/rate)
   * is only changeable while the loan has no payments, in which case it re-prices
   * and rebuilds the schedule. All changes are audited. Any generated agreement
   * is regenerated afterwards when a field printed on it changed.
   */
  async update(
    tenantId: string,
    actor: SessionUser,
    id: string,
    input: UpdateLoanInput,
  ): Promise<Loan> {
    const { updated, agreementStale } = await this.prisma.$transaction(async (tx) => {
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
        newPrincipal !== loan.principal ||
        newTerm !== loan.termMonths ||
        newRate !== loan.interestRate;

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
        const method = METHOD_FROM_DB[loan.interestMethod ?? InterestMethod.Payday];
        const maxTermMonths =
          method === InterestMethod.TermLoan
            ? (await this.settings.resolveMethodSettings(tenantId)).maxLongTermMonths
            : null;
        // Re-price under the loan's own method. A term loan keeps the yearly
        // rate it was priced at; `newRate` is its (unused) monthly finance rate.
        const q = this.price(
          {
            interestRate: newRate,
            monthlyRate: feeSettings.monthlyRate,
            productId: loan.productId,
            fees: effectiveFees,
            method,
            renewalBasis: null,
            annualRate: loan.annualRate ?? 0,
            bonRate: loan.bonRate,
            marginRate: loan.marginRate,
            maxTermMonths,
          },
          { principalCents: newPrincipal, termMonths: newTerm, type: LOAN_TYPE_FROM_DB[loan.type] },
        );
        const disbursedAt = input.disbursedAt
          ? new Date(input.disbursedAt)
          : (loan.disbursedAt ?? loan.createdAt);

        data.principal = q.principalCents;
        data.financeCharge = q.financeChargeCents;
        data.total = q.totalCents;
        data.termMonths = q.termMonths;
        data.instalment = q.instalmentCents;
        data.instalmentsTotal = q.schedule.length;
        data.balance = q.totalCents;
        data.interestRate = newRate;
        // Renewals are re-derived from the new figures after the commit.
        data.renewalCharges = 0;
        await tx.loanRenewal.deleteMany({ where: { loanId: id } });
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
            interest: item.interestCents ?? null,
            principalPortion: item.principalCents ?? null,
          })),
        };
      }

      const before = loanAuditMap(loan);
      const updated = await tx.loan.update({ where: { id }, data });
      const after = loanAuditMap(updated);

      await this.audit.record(
        tenantId,
        actor,
        {
          entity: 'loan',
          entityId: id,
          action: 'updated',
          changes: this.audit.diff(before, after, Object.keys(before)),
        },
        tx,
      );

      return { updated, agreementStale: agreementFieldsChanged(before, after) };
    });

    // A monthly-renewal loan's renewals follow from its dates and figures, so
    // re-derive them after any edit.
    if (updated.interestMethod === InterestMethod.MonthlyRenewal) {
      await this.calculation.refresh(id);
    }

    // After the commit, so a PDF/storage failure can never roll the edit back
    // (refreshForLoan logs rather than throws).
    if (agreementStale) {
      await this.agreements.refreshForLoan(tenantId, id);
    }

    return updated;
  }

  /**
   * Work out what a loan becomes under a calculation method. The loan is priced
   * afresh from its origination inputs — its principal, its stored fee amounts
   * and its disbursement date — and its payments are then laid against the new
   * figures. Nothing is written; {@link changeMethod} stores the result and
   * {@link previewMethodChange} shows it.
   */
  private async planMethodChange(
    tenantId: string,
    loan: Prisma.LoanGetPayload<{ include: { schedule: true; payments: true } }>,
    input: ChangeLoanMethodInput,
    now: Date,
  ): Promise<{
    quote: LoanQuote;
    method: InterestMethod;
    renewalBasis: RenewalBasis | null;
    interestRate: number;
    annualRate: number | null;
    bonRate: number | null;
    marginRate: number | null;
    disbursedAt: Date;
    preview: MethodChangePreview;
  }> {
    if (!isOpenLoan(loan.status)) {
      throw new BadRequestException('The method of a closed loan can no longer be changed');
    }

    if (loan.waived > 0) {
      throw new BadRequestException('The method of a loan with a waived amount cannot be changed');
    }

    const current = METHOD_FROM_DB[loan.interestMethod];
    const { method } = input;
    const [feeSettings, methodSettings] = await Promise.all([
      this.settings.resolveFeeSettings(tenantId),
      this.settings.resolveMethodSettings(tenantId),
    ]);
    const interestRate = input.interestRate ?? loan.interestRate;
    const termLoan = method === InterestMethod.TermLoan;
    // A loan already on a term loan keeps the BoN rate it was priced at; one
    // moving onto it takes today's.
    const bonRate = termLoan
      ? current === InterestMethod.TermLoan && loan.bonRate !== null
        ? loan.bonRate
        : methodSettings.bonRate
      : null;
    const marginRate = termLoan ? (input.marginRate ?? loan.marginRate ?? 0) : null;
    const annualRate = bonRate !== null && marginRate !== null ? bonRate + marginRate : null;
    const renewalBasis =
      method === InterestMethod.MonthlyRenewal
        ? (input.renewalBasis ??
          (loan.renewalBasis ? BASIS_FROM_DB[loan.renewalBasis] : RenewalBasis.Principal))
        : null;

    if (
      method === InterestMethod.Payday &&
      input.termMonths === undefined &&
      loan.termMonths > MAX_TERM_MONTHS
    ) {
      throw new BadRequestException(`Choose a term of 1 to ${MAX_TERM_MONTHS} months`);
    }

    const termMonths =
      method === InterestMethod.MonthlyRenewal
        ? RENEWAL_TERM_MONTHS
        : (input.termMonths ?? loan.termMonths);
    const quote = this.price(
      {
        interestRate,
        monthlyRate: feeSettings.monthlyRate,
        productId: loan.productId,
        fees: {
          namfisaLevyCents: loan.namfisaLevy,
          stampDutyCents: loan.stampDuty,
          insuranceCents: loan.insurance,
          bankChargesCents: loan.bankCharges,
        },
        method,
        renewalBasis,
        annualRate,
        bonRate,
        marginRate,
        maxTermMonths: termLoan ? methodSettings.maxLongTermMonths : null,
      },
      { principalCents: loan.principal, termMonths, type: LOAN_TYPE_FROM_DB[loan.type] },
    );
    const disbursedAt = loan.disbursedAt ?? loan.createdAt;
    const payments = [...loan.payments].sort((a, b) => a.paidAt.getTime() - b.paidAt.getTime());
    const collected = payments.reduce((sum, payment) => sum + payment.amount, 0);

    // Lay the payments against the new schedule to see what is overdue.
    const rows = quote.schedule.map((item) => ({
      id: String(item.number),
      amount: item.amountCents,
      dueAt: addMonths(disbursedAt, item.number),
      status: RepaymentStatus.Due,
      paidAt: null,
      interest: item.interestCents ?? null,
    }));
    const progress = deriveScheduleProgress(rows, payments, now);
    const renewal =
      method === InterestMethod.MonthlyRenewal
        ? renewalStateFor(
            {
              ...loan,
              total: quote.totalCents,
              financeCharge: quote.financeChargeCents,
              renewalCharges: 0,
              interestRate: quote.interestRate,
              renewalBasis,
            },
            payments,
            methodSettings.renewalGraceDays,
            now,
          )
        : null;
    const total = renewal ? renewal.position.totalCents : quote.totalCents;
    const balance = Math.max(0, total - collected);
    const defaultInterest = renewal
      ? 0
      : assessArrears(
          rows.map((row, index) => ({
            amountCents: row.amount,
            dueAt: row.dueAt,
            paid: index < progress.instalmentsPaid,
          })),
          now,
          feeSettings.monthlyRate,
        ).defaultInterestCents;
    const unearned = termLoan
      ? Math.min(
          balance,
          amortisedUnearnedInterest(
            rows.map((row, index) => ({
              dueAt: row.dueAt,
              interestCents: row.interest ?? 0,
              settled: index < progress.instalmentsPaid,
            })),
            now,
          ),
        )
      : 0;
    const nextDueAt = renewal ? renewal.position.nextDueAt : progress.nextDueAt;
    const currentArrears = await this.deriveArrears(
      tenantId,
      loan.status,
      loan.schedule,
      now,
      loan.interestMethod,
    );
    const currentUnearned = this.unearnedInterest(loan, loan.schedule, now);

    return {
      quote,
      method,
      renewalBasis,
      interestRate,
      annualRate,
      bonRate,
      marginRate,
      disbursedAt,
      preview: {
        method,
        termMonths: quote.termMonths,
        instalment: renewal ? total : quote.instalmentCents,
        total,
        balance,
        nextDueAt: balance > 0 && nextDueAt ? nextDueAt.toISOString() : null,
        renewals: renewal ? renewal.position.renewals.length : 0,
        renewalCharges: renewal ? renewal.position.chargesCents : 0,
        defaultInterest,
        payoff: balance - unearned + defaultInterest,
        current: {
          total: loan.total,
          balance: loan.balance,
          defaultInterest: currentArrears.defaultInterestCents,
          payoff: loan.balance - currentUnearned + currentArrears.defaultInterestCents,
        },
      },
    };
  }

  private async loadForMethodChange(
    tenantId: string,
    id: string,
  ): Promise<Prisma.LoanGetPayload<{ include: { schedule: true; payments: true } }>> {
    await this.refreshIfRenewing({ id, tenantId });

    const loan = await this.prisma.loan.findFirst({
      where: { id, tenantId },
      include: { schedule: { orderBy: { number: 'asc' } }, payments: true },
    });

    if (!loan) {
      throw new NotFoundException('Loan not found');
    }

    return loan;
  }

  /** What the loan would owe under another method, next to what it owes now. */
  async previewMethodChange(
    tenantId: string,
    id: string,
    input: ChangeLoanMethodInput,
  ): Promise<MethodChangePreview> {
    const loan = await this.loadForMethodChange(tenantId, id);

    return (await this.planMethodChange(tenantId, loan, input, new Date())).preview;
  }

  /**
   * Change how a loan is calculated (or the settings of its current method). The
   * loan is re-derived from its start under the new method, so the change works
   * in either direction: moving a late payday loan to monthly renewal adds a
   * renewal for each month it has been unpaid, and moving it back removes them
   * and lets default interest apply to the overdue instalment instead. Audited;
   * the agreement is regenerated afterwards.
   */
  async changeMethod(
    tenantId: string,
    actor: SessionUser,
    id: string,
    input: ChangeLoanMethodInput,
  ): Promise<Loan> {
    const loan = await this.loadForMethodChange(tenantId, id);
    const plan = await this.planMethodChange(tenantId, loan, input, new Date());
    const { quote } = plan;

    await this.prisma.$transaction(async (tx) => {
      await tx.loanRenewal.deleteMany({ where: { loanId: id } });
      await tx.repaymentScheduleItem.deleteMany({ where: { loanId: id } });

      const updated = await tx.loan.update({
        where: { id },
        data: {
          interestMethod: plan.method,
          renewalBasis: plan.renewalBasis,
          interestRate: plan.interestRate,
          annualRate: plan.annualRate,
          bonRate: plan.bonRate,
          marginRate: plan.marginRate,
          renewalCharges: 0,
          financeCharge: quote.financeChargeCents,
          total: quote.totalCents,
          termMonths: quote.termMonths,
          instalment: quote.instalmentCents,
          instalmentsTotal: quote.schedule.length,
          schedule: {
            create: quote.schedule.map((item) => ({
              number: item.number,
              amount: item.amountCents,
              dueAt: addMonths(plan.disbursedAt, item.number),
              status: RepaymentStatus.Due,
              interest: item.interestCents ?? null,
              principalPortion: item.principalCents ?? null,
            })),
          },
        },
      });
      const before = loanAuditMap(loan);
      // The audit shows where the loan lands once renewals are derived, not the
      // intermediate origination figures.
      const after = {
        ...loanAuditMap(updated),
        total: fromCents(plan.preview.total),
        balance: fromCents(plan.preview.balance),
        instalment: fromCents(plan.preview.instalment),
      };

      await this.audit.record(
        tenantId,
        actor,
        {
          entity: 'loan',
          entityId: id,
          action: 'method_changed',
          changes: this.audit.diff(before, after, Object.keys(before)),
        },
        tx,
      );
    });

    // Derive renewals (monthly renewal) and lay the payments against the new
    // schedule: balance, status, instalment progress and next due date.
    await this.calculation.refresh(id);
    await this.agreements.refreshForLoan(tenantId, id);

    return this.prisma.loan.findFirstOrThrow({ where: { id, tenantId } });
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
    await this.refreshIfRenewing({ id: loanId, tenantId });

    const loan = await this.prisma.loan.findFirst({
      where: { id: loanId, tenantId },
      include: {
        borrower: { include: { addresses: { where: { isActive: true }, take: 1 } } },
        tenant: { select: { name: true, town: true } },
        schedule: { orderBy: { number: 'asc' } },
        payments: { orderBy: { paidAt: 'asc' } },
        renewals: { orderBy: { number: 'asc' } },
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

    await this.refreshIfRenewing({ id: loanId, borrowerId });

    const loan = await this.prisma.loan.findFirst({
      where: { id: loanId, borrowerId },
      include: {
        borrower: { include: { addresses: { where: { isActive: true }, take: 1 } } },
        tenant: { select: { name: true, town: true } },
        schedule: { orderBy: { number: 'asc' } },
        payments: { orderBy: { paidAt: 'asc' } },
        renewals: { orderBy: { number: 'asc' } },
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
        payments: true;
        renewals: true;
      };
    }>,
    monthlyRate: number,
  ): LoanStatement {
    const renewing = loan.interestMethod === InterestMethod.MonthlyRenewal;
    const termLoan = loan.interestMethod === InterestMethod.TermLoan;
    const pct = (rate: number): string => `${Math.round(rate * 10000) / 100}%`;
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
        // Renewal charges are listed on their own dates below.
        amount: loan.financeCharge - loan.renewalCharges,
        description: termLoan
          ? `Interest (${pct(loan.annualRate ?? 0)} a year, reducing balance)`
          : 'Finance charge (NAMFISA ≤30% of principal debt)',
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
    // A monthly-renewal loan has no fixed instalments: its statement is each
    // renewal charge and each payment actually received, in date order.
    const movements = renewing
      ? [
          ...loan.renewals.map((renewal) => ({
            date: renewal.renewedAt,
            description: `Renewal ${renewal.number} (${pct(renewal.rate)} of ${fromCents(renewal.base).toFixed(2)})`,
            debit: renewal.charge,
            credit: 0,
          })),
          ...loan.payments.map((payment) => ({
            date: payment.paidAt,
            description: 'Payment received',
            debit: 0,
            credit: payment.amount,
          })),
        ].sort((a, b) => a.date.getTime() - b.date.getTime())
      : paidItems.map((item) => ({
          date: item.paidAt ?? openedAt,
          description: `Instalment ${item.number} received`,
          debit: 0,
          credit: item.amount,
        }));
    const runningBalance = movements.reduce((balance, movement) => {
      const next = balance + movement.debit - movement.credit;

      lines.push({
        date: movement.date.toISOString(),
        description: movement.description,
        debit: movement.debit,
        credit: movement.credit,
        balance: next,
      });

      return next;
    }, loan.total - loan.renewalCharges);

    // Default interest accrued on overdue, unpaid instalments (5%/month
    // compounding, uncapped) as of today. Derived, never persisted.
    const now = new Date();
    const assessed = assessArrears(
      loan.schedule.map((item) => ({
        amountCents: item.amount,
        dueAt: item.dueAt,
        paid: item.status === RepaymentStatus.Paid,
      })),
      now,
      monthlyRate,
    );
    // A monthly-renewal loan renews instead of accruing default interest.
    const arrears = renewing ? { ...assessed, defaultInterestCents: 0 } : assessed;

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
    pricing,
    collateral,
    collateralDetail,
    purpose,
    disbursedAt,
    agreement,
  }: {
    tenantId: string;
    borrowerId: string;
    loanQuote: LoanQuote;
    type: LoanType;
    /** The resolved rate plan and calculation method the quote was priced with. */
    pricing: ResolvedPricing;
    collateral: string | null;
    /** NAMFISA purpose category (Part 7.3); null on loans captured without one. */
    purpose?: LoanPurposeValue | null;
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
      initialsDocumentId: string | null;
    };
  }): Prisma.LoanCreateInput {
    const termLoan = pricing.method === InterestMethod.TermLoan;

    return {
      tenant: { connect: { id: tenantId } },
      borrower: { connect: { id: borrowerId } },
      ...(pricing.productId ? { product: { connect: { id: pricing.productId } } } : {}),
      interestMethod: pricing.method,
      renewalBasis: pricing.renewalBasis,
      annualRate: pricing.annualRate,
      bonRate: pricing.bonRate,
      marginRate: pricing.marginRate,
      tcVersion: agreement?.tcVersion ?? null,
      tcAcceptedAt: agreement?.tcAcceptedAt ?? null,
      signatureDocumentId: agreement?.signatureDocumentId ?? null,
      initialsDocumentId: agreement?.initialsDocumentId ?? null,
      type,
      principal: loanQuote.principalCents,
      financeCharge: loanQuote.financeChargeCents,
      // `interestRate` is always the monthly finance rate. A term loan is priced
      // on its yearly rate instead (`annualRate`), so it keeps the plan's monthly
      // rate (or the column default) in case it is later moved to another method.
      ...(termLoan
        ? pricing.interestRate !== undefined
          ? { interestRate: pricing.interestRate }
          : {}
        : { interestRate: loanQuote.interestRate }),
      namfisaLevy: loanQuote.namfisaLevyCents,
      stampDuty: loanQuote.stampDutyCents,
      insurance: loanQuote.insuranceCents,
      bankCharges: loanQuote.bankChargesCents,
      total: loanQuote.totalCents,
      termMonths: loanQuote.termMonths,
      instalment: loanQuote.instalmentCents,
      instalmentsPaid: 0,
      instalmentsTotal: loanQuote.schedule.length,
      balance: loanQuote.totalCents,
      status: LoanStatus.Active,
      purpose: purpose ?? null,
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
          interest: item.interestCents ?? null,
          principalPortion: item.principalCents ?? null,
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
