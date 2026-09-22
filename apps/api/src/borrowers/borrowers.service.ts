import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { $Enums, Borrower, BorrowerAddress, BorrowerBankAccount, Prisma } from '@prisma/client';
import {
  LoanStatus,
  RepaymentStatus,
  assessArrears,
  fromCents,
  toCents,
  type CreateBorrowerAddressInput,
  type CreateBorrowerBankAccountInput,
  type CreateBorrowerInput,
  type SessionUser,
  type UpdateAddressInput,
  type UpdateBankAccountInput,
  type UpdateBorrowerInput,
} from '@loan-pilot/domain';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService, type AuditEntry } from '../audit/audit.service';
import { DocumentsService, type DocumentView } from '../documents/documents.service';
import { StorageService } from '../documents/storage.service';
import { SettingsService } from '../settings/settings.service';
import { documentFileName } from '../common/file-name';
import { renderStatementLetterPdf } from './statement-letter-pdf';

export type BorrowerWithLoanCount = Prisma.BorrowerGetPayload<{
  include: { _count: { select: { loans: true } } };
}>;

export type BorrowerWithLoans = Prisma.BorrowerGetPayload<{
  include: {
    loans: { include: { schedule: true } };
    addresses: true;
    bankAccounts: true;
  };
}> & { audit: AuditEntry[]; documents: DocumentView[] };

/** One open account on a borrower's statement letter, with its live position. */
export interface StatementLoan {
  id: string;
  type: $Enums.LoanType;
  disbursedAt: Date | null;
  principal: number;
  instalmentsPaid: number;
  instalmentsTotal: number;
  nextDueAt: Date | null;
  balance: number;
  /** Default interest accrued on overdue instalments to date (cents). */
  defaultInterest: number;
  /** balance + defaultInterest — what settles the account today. */
  payoff: number;
  status: $Enums.LoanStatus;
}

/**
 * A borrower's statement of account (proof of indebtedness / good standing):
 * the accounts still open with their live payoff, the outstanding total, and
 * the settled history as a count. Rendered as a signed PDF letter.
 */
export interface BorrowerStatement {
  generatedAt: Date;
  /** Short human reference printed on the letter (borrower id + issue date). */
  reference: string;
  borrower: { name: string; idNumber: string; address: string; phone: string; email: string };
  /** Only loans still open (active / in arrears / partly paid). */
  loans: StatementLoan[];
  totals: { outstanding: number; lifetimeBorrowed: number; openLoans: number; settledLoans: number };
  hasOutstanding: boolean;
}

/** A rendered statement letter and the file name to serve it under. */
export interface StatementLetterFile {
  pdf: Buffer;
  fileName: string;
}

const OPEN_STATUSES: $Enums.LoanStatus[] = [
  LoanStatus.Active,
  LoanStatus.Arrears,
  LoanStatus.PartlyPaid,
];

/** Borrower fields shown in the audit trail (money/date in display form). */
const borrowerAuditMap = (b: Borrower): Record<string, unknown> => ({
  firstName: b.firstName,
  lastName: b.lastName,
  idNumber: b.idNumber,
  phone: b.phone,
  email: b.email,
  employer: b.employer,
  occupation: b.occupation,
  monthlyIncome: fromCents(b.monthlyIncome),
  employmentType: b.employmentType,
  gender: b.gender,
  payDay: b.payDay,
  collexiaClientNo: b.collexiaClientNo,
  status: b.status,
  since: b.since.toISOString().slice(0, 10),
});

const addressAuditMap = (a: BorrowerAddress): Record<string, unknown> => ({
  label: a.label,
  street: a.street,
  suburb: a.suburb,
  city: a.city,
  region: a.region,
  country: a.country,
});

/** Normalise a name for duplicate matching — mirrors the RFS import dedupe. */
const nameKey = (first: string, last: string): string =>
  `${first} ${last}`.trim().replace(/\s+/g, ' ').toLowerCase();

const bankAuditMap = (a: BorrowerBankAccount): Record<string, unknown> => ({
  bankName: a.bankName,
  accountNumber: a.accountNumber,
  branchName: a.branchName,
  branchCode: a.branchCode,
  accountHolderName: a.accountHolderName,
  accountType: a.accountType,
});

/** Map a validated address input to the create payload (active by default). */
const addressData = (input: CreateBorrowerAddressInput) => ({
  label: input.label || null,
  street: input.street,
  suburb: input.suburb || null,
  city: input.city,
  region: input.region || null,
  country: input.country,
});

/** Map a validated bank-account input to the create payload. */
const bankAccountData = (input: CreateBorrowerBankAccountInput) => ({
  bankName: input.bankName,
  accountNumber: input.accountNumber,
  branchName: input.branchName || null,
  branchCode: input.branchCode || null,
  accountHolderName: input.accountHolderName,
  accountType: input.accountType,
});

const DUPLICATE_KEY_CODE = 'P2002';

const isDuplicateKeyError = (error: unknown): boolean =>
  typeof error === 'object' &&
  error !== null &&
  'code' in error &&
  error.code === DUPLICATE_KEY_CODE;

/** The columns named by a P2002 error, joined — lets us tell which unique
 * constraint was violated (idNumber vs collexiaClientNo). */
const duplicateConstraint = (error: unknown): string => {
  if (typeof error !== 'object' || error === null || !('meta' in error)) return '';
  const meta = error.meta;
  if (typeof meta !== 'object' || meta === null || !('target' in meta)) return '';
  const target = meta.target;
  return Array.isArray(target) ? target.join(',') : String(target ?? '');
};

/** Map a borrower duplicate-key error to the right human message. */
const borrowerDuplicateMessage = (error: unknown): string =>
  duplicateConstraint(error).includes('collexia')
    ? 'This Collexia client number is already assigned to another borrower'
    : 'A borrower with this ID number already exists';

@Injectable()
export class BorrowersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly documents: DocumentsService,
    private readonly settings: SettingsService,
    private readonly storage: StorageService,
  ) {}

  findAllForTenant(tenantId: string): Promise<BorrowerWithLoanCount[]> {
    return this.prisma.borrower.findMany({
      where: { tenantId },
      include: { _count: { select: { loans: true } } },
      orderBy: { since: 'desc' },
    });
  }

  async findOneForTenant(tenantId: string, id: string): Promise<BorrowerWithLoans> {
    const borrower = await this.prisma.borrower.findFirst({
      where: { id, tenantId },
      include: {
        loans: {
          include: { schedule: { orderBy: { number: 'asc' } } },
          orderBy: { createdAt: 'desc' },
        },
        addresses: { orderBy: [{ isActive: 'desc' }, { createdAt: 'desc' }] },
        bankAccounts: { orderBy: [{ isActive: 'desc' }, { createdAt: 'desc' }] },
      },
    });
    if (!borrower) {
      throw new NotFoundException('Borrower not found');
    }
    return {
      ...borrower,
      audit: await this.audit.listFor(tenantId, 'borrower', id),
      documents: await this.documents.listForBorrower(tenantId, id),
    };
  }

  /**
   * Build a borrower's statement of account: their details, each loan still
   * open with its live payoff (balance + accrued default interest), and the
   * total outstanding. Settled loans only contribute to the history counts —
   * a statement is proof of what is owed today, not a ledger of every loan.
   */
  async statementLetter(tenantId: string, id: string): Promise<BorrowerStatement> {
    const borrower = await this.prisma.borrower.findFirst({
      where: { id, tenantId },
      include: {
        loans: {
          include: { schedule: { orderBy: { number: 'asc' } } },
          orderBy: { disbursedAt: 'desc' },
        },
        addresses: { where: { isActive: true }, take: 1 },
      },
    });
    if (!borrower) {
      throw new NotFoundException('Borrower not found');
    }
    const { monthlyRate } = await this.settings.resolveFeeSettings(tenantId);

    const now = new Date();
    const openLoans = borrower.loans.filter((loan) => OPEN_STATUSES.includes(loan.status));
    const loans: StatementLoan[] = openLoans.map((loan) => {
      const defaultInterest = assessArrears(
        loan.schedule.map((item) => ({
          amountCents: item.amount,
          dueAt: item.dueAt,
          paid: item.status === RepaymentStatus.Paid,
        })),
        now,
        monthlyRate,
      ).defaultInterestCents;
      return {
        id: loan.id,
        type: loan.type,
        disbursedAt: loan.disbursedAt,
        principal: loan.principal,
        instalmentsPaid: loan.instalmentsPaid,
        instalmentsTotal: loan.instalmentsTotal,
        nextDueAt: loan.nextDueAt,
        balance: loan.balance,
        defaultInterest,
        payoff: loan.balance + defaultInterest,
        status: loan.status,
      };
    });
    const outstanding = loans.reduce((sum, loan) => sum + loan.payoff, 0);

    const address = borrower.addresses[0];
    return {
      generatedAt: now,
      reference: `${borrower.id.slice(-6).toUpperCase()}/${now.toISOString().slice(0, 10)}`,
      borrower: {
        name: `${borrower.firstName} ${borrower.lastName}`,
        idNumber: borrower.idNumber,
        phone: borrower.phone,
        email: borrower.email,
        address: address
          ? [address.street, address.suburb, address.city, address.region, address.country]
              .filter(Boolean)
              .join(', ')
          : '',
      },
      loans,
      totals: {
        outstanding,
        // Cancelled loans never advanced funds, so they are not "borrowed".
        lifetimeBorrowed: borrower.loans
          .filter((loan) => loan.status !== LoanStatus.Cancelled)
          .reduce((sum, loan) => sum + loan.principal, 0),
        openLoans: loans.length,
        settledLoans: borrower.loans.filter((loan) => loan.status === LoanStatus.Settled).length,
      },
      hasOutstanding: outstanding > 0,
    };
  }

  /**
   * The statement letter as a signed PDF: the account position above, on the
   * lender's letterhead, with the principal officer's signature and the
   * company stamp embedded — ready to hand over without further signing.
   */
  async statementLetterPdf(tenantId: string, id: string): Promise<StatementLetterFile> {
    const [statement, lender, signing] = await Promise.all([
      this.statementLetter(tenantId, id),
      this.settings.getLenderIdentity(tenantId),
      this.settings.getSigningAssets(tenantId),
    ]);
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { name: true, town: true, logoUrl: true },
    });
    const logoPng = await this.storage.tryRead(tenant?.logoUrl, `logo for tenant ${tenantId}`);
    const pdf = await renderStatementLetterPdf({
      statement,
      lender: {
        ...lender,
        name: lender.legalName || tenant?.name || lender.name || '',
        town: lender.town ?? tenant?.town ?? null,
      },
      logoPng,
      officerName: signing.officerName,
      officerSignaturePng: signing.officerSignaturePng,
      stampPng: signing.stampPng,
    });
    return {
      pdf,
      fileName: documentFileName('Statement of Account', statement.borrower.name, statement.generatedAt),
    };
  }

  async create(tenantId: string, input: CreateBorrowerInput): Promise<Borrower> {
    try {
      return await this.prisma.borrower.create({
        data: {
          tenant: { connect: { id: tenantId } },
          firstName: input.firstName,
          lastName: input.lastName,
          idNumber: input.idNumber,
          phone: input.phone,
          email: input.email,
          employer: input.employer,
          occupation: input.occupation,
          monthlyIncome: toCents(input.monthlyIncome),
          employmentType: input.employmentType,
          collexiaClientNo: input.collexiaClientNo || null,
          addresses: { create: [{ ...addressData(input.address), isActive: true }] },
          bankAccounts: { create: [{ ...bankAccountData(input.bankAccount), isActive: true }] },
        },
      });
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        throw new ConflictException(borrowerDuplicateMessage(error));
      }
      throw error;
    }
  }

  private async ensureBorrower(tenantId: string, id: string): Promise<void> {
    const borrower = await this.prisma.borrower.findFirst({ where: { id, tenantId } });
    if (!borrower) {
      throw new NotFoundException('Borrower not found');
    }
  }

  /** Add an address and make it the active one (deactivating the previous). */
  async addAddress(
    tenantId: string,
    borrowerId: string,
    input: CreateBorrowerAddressInput,
  ): Promise<BorrowerAddress> {
    await this.ensureBorrower(tenantId, borrowerId);
    return this.prisma.$transaction(async (tx) => {
      await tx.borrowerAddress.updateMany({
        where: { borrowerId, isActive: true },
        data: { isActive: false },
      });
      return tx.borrowerAddress.create({
        data: { borrowerId, ...addressData(input), isActive: true },
      });
    });
  }

  async activateAddress(
    tenantId: string,
    borrowerId: string,
    addressId: string,
  ): Promise<BorrowerAddress> {
    await this.ensureBorrower(tenantId, borrowerId);
    return this.prisma.$transaction(async (tx) => {
      const address = await tx.borrowerAddress.findFirst({ where: { id: addressId, borrowerId } });
      if (!address) {
        throw new NotFoundException('Address not found');
      }
      await tx.borrowerAddress.updateMany({
        where: { borrowerId, isActive: true },
        data: { isActive: false },
      });
      return tx.borrowerAddress.update({ where: { id: addressId }, data: { isActive: true } });
    });
  }

  /** Add a bank account and make it the active one (deactivating the previous). */
  async addBankAccount(
    tenantId: string,
    borrowerId: string,
    input: CreateBorrowerBankAccountInput,
  ): Promise<BorrowerBankAccount> {
    await this.ensureBorrower(tenantId, borrowerId);
    return this.prisma.$transaction(async (tx) => {
      await tx.borrowerBankAccount.updateMany({
        where: { borrowerId, isActive: true },
        data: { isActive: false },
      });
      return tx.borrowerBankAccount.create({
        data: { borrowerId, ...bankAccountData(input), isActive: true },
      });
    });
  }

  async activateBankAccount(
    tenantId: string,
    borrowerId: string,
    accountId: string,
  ): Promise<BorrowerBankAccount> {
    await this.ensureBorrower(tenantId, borrowerId);
    return this.prisma.$transaction(async (tx) => {
      const account = await tx.borrowerBankAccount.findFirst({
        where: { id: accountId, borrowerId },
      });
      if (!account) {
        throw new NotFoundException('Bank account not found');
      }
      await tx.borrowerBankAccount.updateMany({
        where: { borrowerId, isActive: true },
        data: { isActive: false },
      });
      return tx.borrowerBankAccount.update({ where: { id: accountId }, data: { isActive: true } });
    });
  }

  async update(
    tenantId: string,
    actor: SessionUser,
    id: string,
    input: UpdateBorrowerInput,
  ): Promise<Borrower> {
    const existing = await this.prisma.borrower.findFirst({ where: { id, tenantId } });
    if (!existing) {
      throw new NotFoundException('Borrower not found');
    }

    const { monthlyIncome, since, gender, payDay, status, collexiaClientNo, ...rest } = input;
    const data: Prisma.BorrowerUpdateInput = { ...rest };
    if (monthlyIncome !== undefined) data.monthlyIncome = toCents(monthlyIncome);
    if (since) data.since = new Date(since);
    if (gender !== undefined) data.gender = gender || null;
    if (payDay !== undefined) data.payDay = payDay || null;
    if (collexiaClientNo !== undefined) data.collexiaClientNo = collexiaClientNo || null;
    if (status) data.status = status;

    let updated: Borrower;
    try {
      updated = await this.prisma.borrower.update({ where: { id }, data });
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        throw new ConflictException(borrowerDuplicateMessage(error));
      }
      throw error;
    }

    const before = borrowerAuditMap(existing);
    await this.audit.record(tenantId, actor, {
      entity: 'borrower',
      entityId: id,
      action: 'updated',
      changes: this.audit.diff(before, borrowerAuditMap(updated), Object.keys(before)),
    });
    return updated;
  }

  /** Correct an existing address in place (audit trail). */
  async updateAddress(
    tenantId: string,
    actor: SessionUser,
    borrowerId: string,
    addressId: string,
    input: UpdateAddressInput,
  ): Promise<BorrowerAddress> {
    await this.ensureBorrower(tenantId, borrowerId);
    const existing = await this.prisma.borrowerAddress.findFirst({
      where: { id: addressId, borrowerId },
    });
    if (!existing) {
      throw new NotFoundException('Address not found');
    }
    const data: Prisma.BorrowerAddressUpdateInput = {};
    if (input.label !== undefined) data.label = input.label || null;
    if (input.street !== undefined) data.street = input.street;
    if (input.suburb !== undefined) data.suburb = input.suburb || null;
    if (input.city !== undefined) data.city = input.city;
    if (input.region !== undefined) data.region = input.region || null;
    if (input.country !== undefined) data.country = input.country;

    const updated = await this.prisma.borrowerAddress.update({ where: { id: addressId }, data });
    const before = addressAuditMap(existing);
    await this.audit.record(tenantId, actor, {
      entity: 'borrower',
      entityId: borrowerId,
      action: 'address_updated',
      changes: this.audit.diff(before, addressAuditMap(updated), Object.keys(before)),
    });
    return updated;
  }

  /** Correct an existing bank account in place (audit trail). */
  async updateBankAccount(
    tenantId: string,
    actor: SessionUser,
    borrowerId: string,
    accountId: string,
    input: UpdateBankAccountInput,
  ): Promise<BorrowerBankAccount> {
    await this.ensureBorrower(tenantId, borrowerId);
    const existing = await this.prisma.borrowerBankAccount.findFirst({
      where: { id: accountId, borrowerId },
    });
    if (!existing) {
      throw new NotFoundException('Bank account not found');
    }
    const data: Prisma.BorrowerBankAccountUpdateInput = {};
    if (input.bankName !== undefined) data.bankName = input.bankName;
    if (input.accountNumber !== undefined) data.accountNumber = input.accountNumber;
    if (input.branchName !== undefined) data.branchName = input.branchName || null;
    if (input.branchCode !== undefined) data.branchCode = input.branchCode || null;
    if (input.accountHolderName !== undefined) data.accountHolderName = input.accountHolderName;
    if (input.accountType !== undefined) data.accountType = input.accountType;

    const updated = await this.prisma.borrowerBankAccount.update({ where: { id: accountId }, data });
    const before = bankAuditMap(existing);
    await this.audit.record(tenantId, actor, {
      entity: 'borrower',
      entityId: borrowerId,
      action: 'bank_updated',
      changes: this.audit.diff(before, bankAuditMap(updated), Object.keys(before)),
    });
    return updated;
  }

  /**
   * Merge a duplicate borrower into the survivor (the one being viewed). Moves
   * the duplicate's loans, addresses, bank accounts, portal login and audit
   * history onto the survivor, then deletes the duplicate. Audited.
   */
  async mergeBorrowers(
    tenantId: string,
    actor: SessionUser,
    survivorId: string,
    duplicateId: string,
  ): Promise<BorrowerWithLoans> {
    if (survivorId === duplicateId) {
      throw new BadRequestException('Cannot merge a borrower into itself');
    }
    const survivor = await this.prisma.borrower.findFirst({
      where: { id: survivorId, tenantId },
      include: { user: { select: { id: true } } },
    });
    const duplicate = await this.prisma.borrower.findFirst({
      where: { id: duplicateId, tenantId },
      include: { user: { select: { id: true } }, _count: { select: { loans: true } } },
    });
    if (!survivor || !duplicate) {
      throw new NotFoundException('Borrower not found');
    }
    // User.borrowerId is unique — two portal logins can't both point at the survivor.
    if (survivor.user && duplicate.user) {
      throw new BadRequestException(
        'Both borrowers have a portal login. Resolve the duplicate login before merging.',
      );
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.loan.updateMany({
        where: { borrowerId: duplicateId },
        data: { borrowerId: survivorId },
      });
      // Reparent contact records as INACTIVE — the partial unique index
      // (one active address/account per borrower) forbids a second active row.
      await tx.borrowerAddress.updateMany({
        where: { borrowerId: duplicateId },
        data: { borrowerId: survivorId, isActive: false },
      });
      await tx.borrowerBankAccount.updateMany({
        where: { borrowerId: duplicateId },
        data: { borrowerId: survivorId, isActive: false },
      });
      if (duplicate.user) {
        await tx.user.update({
          where: { id: duplicate.user.id },
          data: { borrowerId: survivorId },
        });
      }
      await tx.auditEvent.updateMany({
        where: { tenantId, entity: 'borrower', entityId: duplicateId },
        data: { entityId: survivorId },
      });
      await tx.borrower.delete({ where: { id: duplicateId } });
      await this.audit.record(
        tenantId,
        actor,
        {
          entity: 'borrower',
          entityId: survivorId,
          action: 'merged',
          changes: [
            {
              field: 'mergedFrom',
              from: null,
              to: `${duplicate.firstName} ${duplicate.lastName} (${duplicate.idNumber})`,
            },
            { field: 'loansMoved', from: null, to: String(duplicate._count.loans) },
          ],
        },
        tx,
      );
    });

    return this.findOneForTenant(tenantId, survivorId);
  }

  /** Likely duplicates of a borrower within the tenant: same phone or same name. */
  async duplicateSuggestions(tenantId: string, id: string): Promise<BorrowerWithLoanCount[]> {
    const target = await this.prisma.borrower.findFirst({ where: { id, tenantId } });
    if (!target) {
      throw new NotFoundException('Borrower not found');
    }
    const candidates = await this.prisma.borrower.findMany({
      where: {
        tenantId,
        id: { not: id },
        OR: [
          { phone: target.phone },
          { firstName: { equals: target.firstName, mode: 'insensitive' } },
          { lastName: { equals: target.lastName, mode: 'insensitive' } },
        ],
      },
      include: { _count: { select: { loans: true } } },
      take: 25,
    });
    const targetName = nameKey(target.firstName, target.lastName);
    return candidates
      .filter(
        (c) => c.phone === target.phone || nameKey(c.firstName, c.lastName) === targetName,
      )
      .slice(0, 5);
  }
}
