import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import {
  AGEING_BUCKETS,
  COLLECTION_METHOD_LABELS,
  ExpenseKind,
  LOAN_COUNT_BANDS,
  LOAN_PURPOSE_LABELS,
  LOAN_VALUE_BANDS,
  LoanStatus,
  LoanType,
  NAMFISA_MANUAL_FIELDS,
  RepaymentStatus,
  TERM_BANDS,
  ageingBucketFor,
  termBandKeyFor,
  bandKeyFor,
  figure,
  formatMonthLabel,
  formatQuarterLabel,
  isManualMoneyField,
  isOpenLoanStatus,
  monthKeyOf,
  monthRange,
  namfisaCollectionMethod,
  normaliseGender,
  purposeFallbackForLoanType,
  quarterDueDate,
  quarterEndDate,
  quarterKeyOf,
  quarterRange,
  toCents,
  type AmountBand,
  type AvailablePeriods,
  type BandedMatrix,
  type BandedRow,
  type Cents,
  type CollectionMethod,
  type LabelledValue,
  type LoanCredit,
  type LoanStatusValue,
  type LoanTypeValue,
  type MonthlyReport,
  type MonthlyReportLoanRow,
  type QuarterlyReturn,
  type RegulatoryFigures,
  type ReportGender,
  type ReportLender,
  type ReportPeriodInfo,
  type ReportDataQuality,
  type ReportWarning,
  type SaveRegulatoryReturnInput,
  type TermBucket,
} from '@loan-pilot/domain';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { StorageService } from '../documents/storage.service';
import type { LetterheadDetails } from '../common/pdf/document-layout';
import { renderMonthlyReportPdf } from './monthly-report-pdf';
import { renderMonthlyReportXlsx } from './monthly-report-xlsx';
import { renderQuarterlyReturnPdf } from './quarterly-return-pdf';
import {
  bookAt,
  buildLedgers,
  bookValueAt,
  creditsInPeriod,
  outstandingAt,
  writeOffsInPeriod,
  type LoanLedger,
} from './reports.reconstruction';

/** The loan shape both reports work from. */
const REPORT_LOAN_SELECT = {
  id: true,
  borrowerId: true,
  status: true,
  type: true,
  principal: true,
  financeCharge: true,
  total: true,
  termMonths: true,
  instalmentsTotal: true,
  instalment: true,
  interestRate: true,
  namfisaLevy: true,
  stampDuty: true,
  insurance: true,
  bankCharges: true,
  balance: true,
  purpose: true,
  collateral: true,
  collateralItem: true,
  disbursedAt: true,
  closedAt: true,
  borrower: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      idNumber: true,
      phone: true,
      gender: true,
      monthlyIncome: true,
      collexiaClientNo: true,
    },
  },
} as const;

interface ReportLoan {
  id: string;
  borrowerId: string;
  status: LoanStatusValue;
  type: LoanTypeValue;
  principal: number;
  financeCharge: number;
  total: number;
  termMonths: number;
  instalmentsTotal: number;
  instalment: number;
  interestRate: number;
  namfisaLevy: number;
  stampDuty: number;
  insurance: number;
  bankCharges: number;
  balance: number;
  purpose: string | null;
  collateral: string | null;
  collateralItem: string | null;
  disbursedAt: Date | null;
  closedAt: Date | null;
  borrower: {
    id: string;
    firstName: string;
    lastName: string;
    idNumber: string;
    phone: string;
    gender: string | null;
    monthlyIncome: number;
    collexiaClientNo: string | null;
  };
}

/** A blank gender × band accumulator. */
const blankRow = (bands: readonly AmountBand[]): { bands: Record<string, number>; total: number } => ({
  bands: Object.fromEntries(bands.map((band) => [band.key, 0])),
  total: 0,
});

interface MatrixEntry {
  readonly gender: ReportGender;
  /** The amount that decides which band the row lands in. */
  readonly bandCents: Cents;
  /** What to accumulate — the amount itself for a value matrix, 1 for a count. */
  readonly value: number;
}

/**
 * Build one gender × amount-band matrix. Rows whose banding amount is zero or
 * negative are dropped rather than forced into the first band.
 */
const buildMatrix = (bands: readonly AmountBand[], entries: readonly MatrixEntry[]): BandedMatrix => {
  const acc: Record<ReportGender, { bands: Record<string, number>; total: number }> = {
    male: blankRow(bands),
    female: blankRow(bands),
    other: blankRow(bands),
    unknown: blankRow(bands),
  };
  const total = blankRow(bands);

  for (const entry of entries) {
    const key = bandKeyFor(bands, entry.bandCents);
    if (key === null) {
      continue;
    }
    const row = acc[entry.gender];
    row.bands[key] = (row.bands[key] ?? 0) + entry.value;
    row.total += entry.value;
    total.bands[key] = (total.bands[key] ?? 0) + entry.value;
    total.total += entry.value;
  }

  const freeze = (row: { bands: Record<string, number>; total: number }): BandedRow => row;
  return {
    bands,
    male: freeze(acc.male),
    female: freeze(acc.female),
    other: freeze(acc.other),
    unknown: freeze(acc.unknown),
    total: freeze(total),
  };
};

/** Sum a numeric field over a list. */
const sumBy = <T>(rows: readonly T[], pick: (row: T) => number): number =>
  rows.reduce((total, row) => total + pick(row), 0);

const isoDate = (date: Date): string => date.toISOString().slice(0, 10);

@Injectable()
export class ReportsService {
  private readonly logger = new Logger(ReportsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly storage: StorageService,
  ) {}

  // ── Rendered files ─────────────────────────────────────────────────────

  async quarterlyPdf(tenantId: string, period: string): Promise<Buffer> {
    const [report, letterhead] = await Promise.all([
      this.quarterly(tenantId, period),
      this.letterhead(tenantId),
    ]);
    return renderQuarterlyReturnPdf(report, letterhead.lender, letterhead.logoPng);
  }

  async monthlyPdf(tenantId: string, month: string): Promise<Buffer> {
    const [report, letterhead] = await Promise.all([
      this.monthly(tenantId, month),
      this.letterhead(tenantId),
    ]);
    return renderMonthlyReportPdf(report, letterhead.lender, letterhead.logoPng);
  }

  async monthlyXlsx(tenantId: string, month: string): Promise<Buffer> {
    return renderMonthlyReportXlsx(await this.monthly(tenantId, month));
  }

  /**
   * The lender identity and logo the report PDFs share with loan agreements, so
   * a return carries the same letterhead the borrower already sees.
   */
  private async letterhead(
    tenantId: string,
  ): Promise<{ lender: LetterheadDetails; logoPng: Buffer | null }> {
    const [identity, tenant] = await Promise.all([
      this.settings.getLenderIdentity(tenantId),
      this.prisma.tenant.findUnique({ where: { id: tenantId }, select: { logoUrl: true } }),
    ]);
    return {
      lender: {
        name: identity.legalName ?? identity.name ?? 'Lender',
        legalName: identity.legalName,
        namfisaLicenceNo: identity.namfisaLicenceNo,
        registrationNo: identity.registrationNo,
        physicalAddress: identity.physicalAddress,
        postalAddress: identity.postalAddress,
        contactPhone: identity.contactPhone,
        contactEmail: identity.contactEmail,
        town: identity.town,
      },
      logoPng: await this.readLogo(tenant?.logoUrl ?? null),
    };
  }

  /** Read the tenant logo, degrading to no logo rather than failing the report. */
  private async readLogo(key: string | null): Promise<Buffer | null> {
    if (!key || /^https?:\/\//i.test(key)) {
      return null;
    }
    try {
      return await this.storage.read(key);
    } catch (error) {
      this.logger.error(
        'Failed to read the tenant logo for a report',
        error instanceof Error ? error.stack : String(error),
      );
      return null;
    }
  }

  /** The months and quarters this tenant actually has activity in, newest first. */
  async periods(tenantId: string): Promise<AvailablePeriods> {
    const [loanBounds, paymentBounds] = await Promise.all([
      this.prisma.loan.aggregate({
        where: { tenantId, disbursedAt: { not: null } },
        _min: { disbursedAt: true },
        _max: { disbursedAt: true },
      }),
      this.prisma.payment.aggregate({
        where: { tenantId },
        _min: { paidAt: true },
        _max: { paidAt: true },
      }),
    ]);

    const candidates = [
      loanBounds._min.disbursedAt,
      loanBounds._max.disbursedAt,
      paymentBounds._min.paidAt,
      paymentBounds._max.paidAt,
    ].filter((value): value is Date => value instanceof Date);

    if (candidates.length === 0) {
      const now = new Date();
      return {
        months: [{ key: monthKeyOf(now), label: formatMonthLabel(monthKeyOf(now)) }],
        quarters: [{ key: quarterKeyOf(now), label: formatQuarterLabel(quarterKeyOf(now)) }],
      };
    }

    const earliest = new Date(Math.min(...candidates.map((date) => date.getTime())));
    // Always run through to today, so the current (incomplete) period is offered.
    const latest = new Date(Math.max(Date.now(), ...candidates.map((date) => date.getTime())));

    const months: { key: string; label: string }[] = [];
    const quarters: { key: string; label: string }[] = [];
    const seenQuarters = new Set<string>();
    const cursor = {
      at: new Date(Date.UTC(earliest.getUTCFullYear(), earliest.getUTCMonth(), 1)),
    };
    while (cursor.at.getTime() <= latest.getTime()) {
      const monthKey = monthKeyOf(cursor.at);
      months.push({ key: monthKey, label: formatMonthLabel(monthKey) });
      const quarterKey = quarterKeyOf(cursor.at);
      if (!seenQuarters.has(quarterKey)) {
        seenQuarters.add(quarterKey);
        quarters.push({ key: quarterKey, label: formatQuarterLabel(quarterKey) });
      }
      cursor.at = new Date(Date.UTC(cursor.at.getUTCFullYear(), cursor.at.getUTCMonth() + 1, 1));
    }

    return { months: months.reverse(), quarters: quarters.reverse() };
  }

  /** Borrowers still missing a gender, for the backfill worklist. */
  async dataQuality(tenantId: string): Promise<ReportDataQuality> {
    const missingGender = { tenantId, OR: [{ gender: null }, { gender: '' }] };
    const [borrowersTotal, borrowersMissingGender, sample] = await Promise.all([
      this.prisma.borrower.count({ where: { tenantId } }),
      this.prisma.borrower.count({ where: missingGender }),
      this.prisma.borrower.findMany({
        where: missingGender,
        select: { id: true, firstName: true, lastName: true, idNumber: true },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
    ]);

    return {
      borrowersTotal,
      borrowersMissingGender,
      sample: sample.map((borrower) => ({
        id: borrower.id,
        name: `${borrower.firstName} ${borrower.lastName}`.trim(),
        idNumber: borrower.idNumber,
      })),
    };
  }

  // ── Shared loading ─────────────────────────────────────────────────────

  /**
   * Load every loan disbursed before `end` with its full credit history. Three
   * queries, then all bucketing happens in memory — the ledgers are needed at
   * both the opening and closing instants, so there is no useful lower bound.
   */
  private async loadLedgers(tenantId: string, end: Date) {
    const [loans, payments, scheduleItems] = await Promise.all([
      this.prisma.loan.findMany({
        where: { tenantId, disbursedAt: { not: null, lt: end } },
        select: REPORT_LOAN_SELECT,
      }),
      this.prisma.payment.findMany({
        where: { tenantId, paidAt: { lt: end } },
        select: { loanId: true, paidAt: true, amount: true, method: true },
      }),
      this.prisma.repaymentScheduleItem.findMany({
        where: {
          loan: { tenantId },
          status: RepaymentStatus.Paid,
          paidAt: { not: null, lt: end },
        },
        select: { loanId: true, amount: true, paidAt: true, status: true },
      }),
    ]);

    return buildLedgers<ReportLoan>({ loans, payments, scheduleItems });
  }

  private async lender(tenantId: string): Promise<ReportLender> {
    const identity = await this.settings.getLenderIdentity(tenantId);
    return {
      name: identity.legalName ?? identity.name ?? 'Lender',
      licenceNo: identity.namfisaLicenceNo,
    };
  }

  /** Loans disbursed within the period, newest first. */
  private disbursedIn(
    ledgers: Map<string, LoanLedger<ReportLoan>>,
    start: Date,
    end: Date,
  ): LoanLedger<ReportLoan>[] {
    return [...ledgers.values()]
      .filter(({ loan }) => {
        if (loan.status === LoanStatus.Cancelled || !loan.disbursedAt) {
          return false;
        }
        const at = loan.disbursedAt.getTime();
        return at >= start.getTime() && at < end.getTime();
      })
      .sort(
        (a, b) => (b.loan.disbursedAt?.getTime() ?? 0) - (a.loan.disbursedAt?.getTime() ?? 0),
      );
  }

  /** Split credits into the return's four collection methods. */
  private splitByMethod(credits: readonly LoanCredit[]) {
    const totals: Record<CollectionMethod, number> = {
      payroll: 0,
      debit_order: 0,
      cash: 0,
      other: 0,
    };
    for (const credit of credits) {
      // A schedule-derived credit has no recorded method, so it reports as other.
      const method = credit.method === null ? 'other' : namfisaCollectionMethod(credit.method);
      totals[method] += credit.amountCents;
    }
    return totals;
  }

  // ── NAMFISA quarterly return ───────────────────────────────────────────

  async quarterly(tenantId: string, period: string): Promise<QuarterlyReturn> {
    const range = quarterRange(period);
    const endDate = quarterEndDate(period);
    const dueDate = quarterDueDate(period);
    if (!range || !endDate || !dueDate) {
      throw new BadRequestException('Expected a quarter like 2026-Q2');
    }

    const [ledgerMap, lender, manual] = await Promise.all([
      this.loadLedgers(tenantId, range.end),
      this.lender(tenantId),
      this.figures(tenantId, period),
    ]);
    const ledgers = [...ledgerMap.values()];

    const periodInfo: ReportPeriodInfo = {
      key: period,
      label: formatQuarterLabel(period),
      startDate: isoDate(range.start),
      endDate: isoDate(endDate),
      dueDate: isoDate(dueDate),
    };

    const disbursed = this.disbursedIn(ledgerMap, range.start, range.end);
    const closing = bookAt(ledgers, range.end);
    const credits = creditsInPeriod(ledgers, range.start, range.end);
    const writeOffs = writeOffsInPeriod(ledgers, range.start, range.end);

    // ── Part 14 ──────────────────────────────────────────────────────────
    const disbursementsByTerm: TermBucket[] = TERM_BANDS.map((band) => ({
      key: band.key,
      label: band.valueLabel,
      months: band.months,
      value: sumBy(
        disbursed.filter(({ loan }) => termBandKeyFor(loan.termMonths) === band.key),
        ({ loan }) => loan.principal,
      ),
    }));

    const namfisaLevies = sumBy(disbursed, ({ loan }) => loan.namfisaLevy);
    const stampDuties = sumBy(disbursed, ({ loan }) => loan.stampDuty);
    const insurance = sumBy(disbursed, ({ loan }) => loan.insurance);
    const otherFees = sumBy(disbursed, ({ loan }) => loan.bankCharges);
    const repayments = this.splitByMethod(credits);

    const writtenOffInPeriod = sumBy(writeOffs, (entry) => entry.amountCents);
    const openingProvision = figure(manual, 'openingBadDebtProvision');
    const provisionRaised = figure(manual, 'badDebtProvisionRaised');

    const ageing: LabelledValue[] = AGEING_BUCKETS.map((bucket) => ({
      key: bucket.key,
      label: bucket.label,
      value: sumBy(
        closing.filter((entry) => ageingBucketFor(entry.ageing.daysLate) === bucket.key),
        (entry) => entry.outstandingCents,
      ),
    }));

    // ── Parts 15 and 7.2 ─────────────────────────────────────────────────
    // The loan matrices carry one row per loan; the salary matrices one row per
    // distinct borrower, which is why five extra loans do not become five extra
    // salaries. The lender's approved return does exactly this.
    const loanEntries = disbursed.map(({ loan }) => ({
      gender: normaliseGender(loan.borrower.gender),
      bandCents: loan.principal,
      value: loan.principal,
    }));
    const borrowers = new Map<string, ReportLoan['borrower']>();
    for (const { loan } of disbursed) {
      borrowers.set(loan.borrowerId, loan.borrower);
    }
    const salaryEntries = [...borrowers.values()].map((borrower) => ({
      gender: normaliseGender(borrower.gender),
      bandCents: borrower.monthlyIncome,
      value: borrower.monthlyIncome,
    }));

    const countOf = (entries: readonly MatrixEntry[]): MatrixEntry[] =>
      entries.map((entry) => ({ ...entry, value: 1 }));

    // ── Parts 7.1 and 7.3 ────────────────────────────────────────────────
    const debtors = new Set(closing.map((entry) => entry.ledger.loan.borrowerId));
    const inArrears = closing.filter((entry) => ageingBucketFor(entry.ageing.daysLate) !== 'current');

    const loansByPurpose: LabelledValue[] = Object.entries(LOAN_PURPOSE_LABELS).map(
      ([key, label]) => ({
        key,
        label,
        value: disbursed.filter(({ loan }) => this.purposeKey(loan) === key).length,
      }),
    );

    const loansByCollectionMethod: LabelledValue[] = (
      ['payroll', 'debit_order', 'cash', 'other'] as const
    ).map((method) => ({
      key: method,
      label: COLLECTION_METHOD_LABELS[method],
      value: disbursed.filter((ledger) => this.dominantMethod(ledger) === method).length,
    }));

    const secured = disbursed.filter(({ loan }) => this.isSecured(loan)).length;

    // ── Parts D3 and 1.1 ─────────────────────────────────────────────────
    const [otherIncomeRows] = await Promise.all([
      this.prisma.income.aggregate({
        where: { tenantId, incurredAt: { gte: range.start, lt: range.end } },
        _sum: { amount: true },
      }),
    ]);
    const interestOnLoans = sumBy(disbursed, ({ loan }) => loan.financeCharge);
    const badDebtsRecovered = figure(manual, 'badDebtsRecovered');
    const otherIncome = (otherIncomeRows._sum.amount ?? 0) + figure(manual, 'otherIncomeAdjustment');

    const liabilityOther: LabelledValue[] = NAMFISA_MANUAL_FIELDS.filter((field) =>
      field.key.startsWith('liability'),
    ).map((field) => ({ key: field.key, label: field.label, value: figure(manual, field.key) }));

    const derivedBook = bookValueAt(ledgers, range.end);
    const storedBook = sumBy(
      ledgers.filter(({ loan }) => isOpenLoanStatus(loan.status)),
      ({ loan }) => loan.balance,
    );

    const coverage = {
      loansInPeriod: disbursed.length,
      loansMissingGender: disbursed.filter(
        ({ loan }) => normaliseGender(loan.borrower.gender) === 'unknown',
      ).length,
      loansMissingPurpose: disbursed.filter(({ loan }) => loan.purpose === null).length,
    };

    return {
      period: periodInfo,
      lender,
      financial: {
        openingBookValue: bookValueAt(ledgers, range.start),
        closingBookValue: derivedBook,
        disbursedTotal: sumBy(disbursed, ({ loan }) => loan.principal),
        disbursementsByTerm,
        feesCharged: {
          namfisaLevies,
          stampDuties,
          insurance,
          otherFees,
          total: namfisaLevies + stampDuties + insurance + otherFees,
        },
        interestOnOutstanding: sumBy(closing, (entry) => entry.ledger.loan.financeCharge),
        repayments: {
          payroll: repayments.payroll,
          debitOrder: repayments.debit_order,
          cash: repayments.cash,
          other: repayments.other,
          total:
            repayments.payroll + repayments.debit_order + repayments.cash + repayments.other,
        },
        badDebts: {
          openingProvision,
          writtenOffInPeriod,
          provisionRaised,
          closingProvision: openingProvision + provisionRaised - writtenOffInPeriod,
        },
        rescheduledValue: figure(manual, 'rescheduledValue'),
        ageing,
      },
      valueMatrices: {
        loansByGender: buildMatrix(LOAN_VALUE_BANDS, loanEntries),
        salariesByGender: buildMatrix(LOAN_VALUE_BANDS, salaryEntries),
      },
      nonFinancial: {
        complaints: {
          lodged: figure(manual, 'complaintsLodged'),
          resolved:
            figure(manual, 'complaintsForEntity') + figure(manual, 'complaintsForComplainant'),
          forEntity: figure(manual, 'complaintsForEntity'),
          forComplainant: figure(manual, 'complaintsForComplainant'),
          unresolved: figure(manual, 'complaintsUnresolved'),
        },
        debtorsOutstanding: debtors.size,
        loansDisbursed: disbursed.length,
        activeClients: debtors.size,
        loansOutstanding: {
          current: closing.length - inArrears.length,
          arrears: inArrears.length,
          total: closing.length,
        },
        disbursementsByTerm: TERM_BANDS.map((band) => ({
          key: band.key,
          label: band.countLabel,
          months: band.months,
          value: disbursed.filter(({ loan }) => termBandKeyFor(loan.termMonths) === band.key).length,
        })),
        loansByPurpose,
        loansByCollectionMethod,
        writtenOffCount: writeOffs.length,
        rescheduledCount: figure(manual, 'rescheduledCount'),
        security: { secured, unsecured: disbursed.length - secured },
        outlets: figure(manual, 'outlets'),
        otherBusiness: NAMFISA_MANUAL_FIELDS.filter((field) =>
          field.key.startsWith('business'),
        ).map((field) => ({
          key: field.key,
          label: field.label,
          value: figure(manual, field.key),
        })),
      },
      countMatrices: {
        loansByGender: buildMatrix(LOAN_COUNT_BANDS, countOf(loanEntries)),
        salariesByGender: buildMatrix(LOAN_COUNT_BANDS, countOf(salaryEntries)),
      },
      income: {
        interestOnLoans,
        defaultInterest: 0,
        badDebtsRecovered,
        otherIncome,
        total: interestOnLoans + badDebtsRecovered + otherIncome,
      },
      liabilities: {
        namfisaLevy: namfisaLevies,
        stampDuty: stampDuties,
        other: liabilityOther,
        total: namfisaLevies + stampDuties + sumBy(liabilityOther, (row) => row.value),
      },
      manual,
      reconciliation: {
        derived: derivedBook,
        stored: storedBook,
        variance: derivedBook - storedBook,
      },
      coverage,
      warnings: this.warnings({
        coverage,
        manual,
        credits,
        variance: derivedBook - storedBook,
      }),
    };
  }

  // ── Monthly management report ──────────────────────────────────────────

  async monthly(tenantId: string, month: string): Promise<MonthlyReport> {
    const range = monthRange(month);
    if (!range) {
      throw new BadRequestException('Expected a month like 2026-02');
    }
    const lastDay = new Date(range.end.getTime() - 86_400_000);

    const [ledgerMap, lender, expenseRows, investmentAgg, incomeAgg, settings] = await Promise.all([
      this.loadLedgers(tenantId, range.end),
      this.lender(tenantId),
      this.prisma.expense.groupBy({
        by: ['kind'],
        where: { tenantId, incurredAt: { gte: range.start, lt: range.end } },
        _sum: { amount: true },
      }),
      this.prisma.investment.aggregate({
        where: { tenantId, contributedAt: { gte: range.start, lt: range.end } },
        _sum: { amount: true },
      }),
      this.prisma.income.aggregate({
        where: { tenantId, incurredAt: { gte: range.start, lt: range.end } },
        _sum: { amount: true },
      }),
      this.prisma.tenantSettings.findUnique({
        where: { tenantId },
        select: { openingBalance: true },
      }),
    ]);
    const ledgers = [...ledgerMap.values()];

    const disbursed = this.disbursedIn(ledgerMap, range.start, range.end);
    const closing = bookAt(ledgers, range.end);
    const credits = creditsInPeriod(ledgers, range.start, range.end);
    const methods = this.splitByMethod(credits);

    const expenses = expenseRows.find((row) => row.kind === ExpenseKind.Expense)?._sum.amount ?? 0;
    const drawings = expenseRows.find((row) => row.kind === ExpenseKind.Drawing)?._sum.amount ?? 0;
    const capitalIn = investmentAgg._sum.amount ?? 0;
    const otherIncome = incomeAgg._sum.amount ?? 0;
    const collected = sumBy(credits, (credit) => credit.amountCents);
    const disbursedValue = sumBy(disbursed, ({ loan }) => loan.principal);
    const closingBookValue = sumBy(closing, (entry) => entry.outstandingCents);

    // Cash position as at month end, on the same basis as the dashboard overview
    // (opening balance + capital + collections + income − advances − costs), but
    // accumulated over everything up to this month's end rather than all time.
    const [lifetime] = await Promise.all([this.lifetimeFlows(tenantId, range.end)]);
    const availableFunds =
      (settings?.openingBalance ?? 0) +
      lifetime.invested +
      lifetime.collected +
      lifetime.income -
      lifetime.disbursed -
      lifetime.expenses -
      lifetime.drawings;

    const arrears = closing.filter(
      (entry) => ageingBucketFor(entry.ageing.daysLate) !== 'current',
    );

    const expenseBreakdown = await this.expenseBreakdown(tenantId, range.start, range.end);

    const loans: MonthlyReportLoanRow[] = disbursed.map((ledger) => {
      const { loan } = ledger;
      return {
        loanId: loan.id,
        clientNo: loan.borrower.collexiaClientNo,
        borrowerName: `${loan.borrower.firstName} ${loan.borrower.lastName}`.trim(),
        idNumber: loan.borrower.idNumber,
        phone: loan.borrower.phone,
        gender: normaliseGender(loan.borrower.gender),
        monthlyIncome: loan.borrower.monthlyIncome,
        principal: loan.principal,
        financeCharge: loan.financeCharge,
        interestRate: loan.interestRate,
        bankCharges: loan.bankCharges,
        namfisaLevy: loan.namfisaLevy,
        stampDuty: loan.stampDuty,
        insurance: loan.insurance,
        total: loan.total,
        instalment: loan.instalment,
        termMonths: loan.termMonths,
        balance: outstandingAt(ledger, range.end),
        status: loan.status,
        disbursedAt: loan.disbursedAt ? loan.disbursedAt.toISOString() : null,
      };
    });

    const derivedBook = closingBookValue;
    const storedBook = sumBy(
      ledgers.filter(({ loan }) => isOpenLoanStatus(loan.status)),
      ({ loan }) => loan.balance,
    );

    return {
      period: {
        key: month,
        label: formatMonthLabel(month),
        startDate: isoDate(range.start),
        endDate: isoDate(lastDay),
        dueDate: null,
      },
      lender,
      summary: {
        openingBookValue: bookValueAt(ledgers, range.start),
        closingBookValue,
        loansDisbursed: disbursed.length,
        disbursedValue,
        interestBooked: sumBy(disbursed, ({ loan }) => loan.financeCharge),
        expectedRepayable: sumBy(disbursed, ({ loan }) => loan.total),
        collected,
        collectionsByMethod: (['payroll', 'debit_order', 'cash', 'other'] as const).map(
          (method) => ({
            key: method,
            label: COLLECTION_METHOD_LABELS[method],
            value: methods[method],
          }),
        ),
        expenses,
        drawings,
        otherIncome,
        capitalIn,
        namfisaLevies: sumBy(disbursed, ({ loan }) => loan.namfisaLevy),
        stampDuties: sumBy(disbursed, ({ loan }) => loan.stampDuty),
        insurance: sumBy(disbursed, ({ loan }) => loan.insurance),
        bankCharges: sumBy(disbursed, ({ loan }) => loan.bankCharges),
        availableFunds,
        totalCapital: availableFunds + closingBookValue,
        arrearsLoans: arrears.length,
        arrearsValue: sumBy(arrears, (entry) => entry.outstandingCents),
        netCashMovement: collected - disbursedValue - expenses,
      },
      loans,
      expenseBreakdown,
      reconciliation: {
        derived: derivedBook,
        stored: storedBook,
        variance: derivedBook - storedBook,
      },
      warnings: this.warnings({
        coverage: {
          loansInPeriod: disbursed.length,
          loansMissingGender: disbursed.filter(
            ({ loan }) => normaliseGender(loan.borrower.gender) === 'unknown',
          ).length,
          loansMissingPurpose: disbursed.filter(({ loan }) => loan.purpose === null).length,
        },
        manual: {},
        credits,
        variance: derivedBook - storedBook,
        includeManual: false,
      }),
    };
  }

  /** Cash flows from the beginning of time up to `end`, for the cash position. */
  private async lifetimeFlows(tenantId: string, end: Date) {
    const [disbursedAgg, collectedAgg, expenseRows, investedAgg, incomeAgg] = await Promise.all([
      this.prisma.loan.aggregate({
        where: { tenantId, disbursedAt: { not: null, lt: end }, status: { not: LoanStatus.Cancelled } },
        _sum: { principal: true },
      }),
      this.prisma.payment.aggregate({
        where: { tenantId, paidAt: { lt: end } },
        _sum: { amount: true },
      }),
      this.prisma.expense.groupBy({
        by: ['kind'],
        where: { tenantId, incurredAt: { lt: end } },
        _sum: { amount: true },
      }),
      this.prisma.investment.aggregate({
        where: { tenantId, contributedAt: { lt: end } },
        _sum: { amount: true },
      }),
      this.prisma.income.aggregate({
        where: { tenantId, incurredAt: { lt: end } },
        _sum: { amount: true },
      }),
    ]);
    return {
      disbursed: disbursedAgg._sum.principal ?? 0,
      collected: collectedAgg._sum.amount ?? 0,
      expenses: expenseRows.find((row) => row.kind === ExpenseKind.Expense)?._sum.amount ?? 0,
      drawings: expenseRows.find((row) => row.kind === ExpenseKind.Drawing)?._sum.amount ?? 0,
      invested: investedAgg._sum.amount ?? 0,
      income: incomeAgg._sum.amount ?? 0,
    };
  }

  private async expenseBreakdown(
    tenantId: string,
    start: Date,
    end: Date,
  ): Promise<LabelledValue[]> {
    const rows = await this.prisma.expense.groupBy({
      by: ['category'],
      where: { tenantId, kind: ExpenseKind.Expense, incurredAt: { gte: start, lt: end } },
      _sum: { amount: true },
    });
    return rows
      .map((row) => ({ key: row.category, label: row.category, value: row._sum.amount ?? 0 }))
      .sort((a, b) => b.value - a.value);
  }

  // ── Classification helpers ─────────────────────────────────────────────

  private purposeKey(loan: ReportLoan): string {
    return loan.purpose ?? purposeFallbackForLoanType(loan.type);
  }

  /** Secured when the loan is a collateral loan or names a pledged asset. */
  private isSecured(loan: ReportLoan): boolean {
    return (
      loan.type === LoanType.Collateral ||
      Boolean(loan.collateralItem) ||
      Boolean(loan.collateral && loan.collateral.trim().length > 0)
    );
  }

  /** The method a loan is mostly repaid by; `other` when nothing is recorded. */
  private dominantMethod(ledger: LoanLedger<ReportLoan>): CollectionMethod {
    const totals = this.splitByMethod(ledger.credits);
    const ranked = (['payroll', 'debit_order', 'cash', 'other'] as const)
      .map((method) => ({ method, amount: totals[method] }))
      .sort((a, b) => b.amount - a.amount);
    const top = ranked[0];
    return top && top.amount > 0 ? top.method : 'other';
  }

  private warnings({
    coverage,
    manual,
    credits,
    variance,
    includeManual = true,
  }: {
    coverage: { loansInPeriod: number; loansMissingGender: number; loansMissingPurpose: number };
    manual: RegulatoryFigures;
    credits: readonly LoanCredit[];
    variance: number;
    includeManual?: boolean;
  }): ReportWarning[] {
    const warnings: ReportWarning[] = [];

    if (coverage.loansMissingGender > 0) {
      warnings.push({
        code: 'gender_coverage',
        severity: 'warning',
        message:
          `Gender is not recorded for ${coverage.loansMissingGender} of ${coverage.loansInPeriod} ` +
          'loans this period. Those rows sit in the Unspecified column, so the gender splits ' +
          'under-report until the borrowers are updated.',
      });
    }
    if (coverage.loansMissingPurpose > 0) {
      warnings.push({
        code: 'purpose_coverage',
        severity: 'info',
        message:
          `${coverage.loansMissingPurpose} of ${coverage.loansInPeriod} loans predate the purpose ` +
          'field and are classified from their loan type (business loans as Business, everything ' +
          'else as Consumption).',
      });
    }

    const unmethoded = credits.filter((credit) => credit.method === null);
    if (unmethoded.length > 0) {
      warnings.push({
        code: 'unreconciled_repayments',
        severity: 'warning',
        message:
          `${unmethoded.length} repayment(s) were recorded by marking an instalment paid rather ` +
          'than capturing a payment, so no collection method is known. They are reported under ' +
          '“Other”.',
      });
    }

    if (variance !== 0) {
      warnings.push({
        code: 'book_reconciliation',
        severity: 'warning',
        message:
          'The book rebuilt from the payment history differs from the sum of stored loan ' +
          'balances. The rebuilt figure is reported; the difference is shown so it can be ' +
          'investigated.',
      });
    }

    if (includeManual && Object.keys(manual).length === 0) {
      warnings.push({
        code: 'manual_missing',
        severity: 'warning',
        message:
          'Complaints, provisioning, rescheduling, branches and the Part 1.1 liabilities have not ' +
          'been captured for this quarter. Those lines report as zero until they are entered.',
      });
    }

    warnings.push({
      code: 'income_basis',
      severity: 'info',
      message:
        'Borrower income is stored as a single monthly figure. NAMFISA asks for gross salary; ' +
        'imported records captured net.',
    });

    return warnings;
  }

  // ── Saved operator figures ─────────────────────────────────────────────

  /** The manually-captured figures for a quarter; an empty map when none saved. */
  async figures(tenantId: string, period: string): Promise<RegulatoryFigures> {
    const row = await this.prisma.regulatoryReturn.findUnique({
      where: { tenantId_period: { tenantId, period } },
      select: { figures: true },
    });
    if (!row || row.figures === null || typeof row.figures !== 'object' || Array.isArray(row.figures)) {
      return {};
    }
    // The column is untyped JSON; keep only known keys with numeric values.
    const parsed: RegulatoryFigures = {};
    for (const [key, value] of Object.entries(row.figures)) {
      if (typeof value === 'number' && Number.isFinite(value)) {
        parsed[key] = value;
      }
    }
    return parsed;
  }

  async saveFigures(
    tenantId: string,
    period: string,
    input: SaveRegulatoryReturnInput,
    actorName: string,
  ): Promise<{ period: string; figures: RegulatoryFigures; notes: string | null }> {
    if (!quarterRange(period)) {
      throw new BadRequestException('Expected a quarter like 2026-Q2');
    }
    // Money arrives in major N$ like every other payload; counts pass through.
    const figures: RegulatoryFigures = {};
    for (const [key, value] of Object.entries(input.figures)) {
      figures[key] = isManualMoneyField(key) ? toCents(value) : Math.round(value);
    }

    const row = await this.prisma.regulatoryReturn.upsert({
      where: { tenantId_period: { tenantId, period } },
      create: {
        tenant: { connect: { id: tenantId } },
        period,
        figures,
        notes: input.notes || null,
        updatedByName: actorName,
      },
      update: { figures, notes: input.notes || null, updatedByName: actorName },
      select: { period: true, notes: true },
    });
    return { period: row.period, figures, notes: row.notes };
  }
}
