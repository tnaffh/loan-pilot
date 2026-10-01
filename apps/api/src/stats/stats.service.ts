import { Injectable } from '@nestjs/common';
import {
  ApplicationStatus,
  ExpenseKind,
  LoanStatus,
  OPEN_LOAN_STATUSES,
  TenantStatus,
  hasPermission,
  isBorrower,
  isPlatform,
  monthKeyOf,
  type SessionUser,
} from '@loan-pilot/domain';
import { PrismaService } from '../prisma/prisma.service';
import { requireTenantId } from '../common/tenant';
import { buildLedgers, type LoanLedger } from '../reports/reports.reconstruction';

export interface LenderOverview {
  kind: 'lender';
  // Operational figures — visible to every lender role.
  activeLoans: number;
  arrearsLoans: number;
  bookValue: number;
  arrearsValue: number;
  pendingApplications: number;
  borrowers: number;
  // Sensitive financials — only populated for lender admins (omitted for staff).
  // Lifetime cash flows (cents): disbursed principal, collected payments,
  // operating expenses, and the resulting net profit. Capital movements
  // (owner drawings out, capital invested in) are tracked separately — they
  // affect the cash/capital position, not profit.
  disbursed?: number;
  collected?: number;
  expenses?: number;
  drawings?: number;
  invested?: number;
  income?: number;
  netProfit?: number;
  // Cash available to lend: openingBalance + capital + collected + income −
  // disbursed − expenses − drawings.
  openingBalance?: number;
  availableBalance?: number;
  // For the Finance reconciliation: what commonly separates availableBalance
  // from the bank. Loans approved but not yet marked as paid out are counted as
  // cash out while the money may still be in the account; undated entries are
  // counted from the start of the records.
  unreleased?: { count: number; principal: number };
  undated?: { count: number; capital: number; costs: number; income: number };
  // The bank balance the lender last recorded, and the day it was true.
  bankBalance?: number | null;
  bankBalanceAt?: string | null;
}

export interface PlatformOverview {
  kind: 'platform';
  tenants: number;
  activeTenants: number;
  totalBookValue: number;
  totalBorrowers: number;
}

export interface BorrowerOverview {
  kind: 'borrower';
  activeLoans: number;
  outstandingBalance: number;
  nextDueAt: string | null;
  nextInstalment: number | null;
}

export type OverviewStats = LenderOverview | PlatformOverview | BorrowerOverview;

export interface MonthlyPoint {
  month: string; // YYYY-MM
  label: string; // e.g. "Oct 2023"
  disbursed: number;
  collected: number;
  expenses: number;
}

export interface LenderSeries {
  monthly: MonthlyPoint[];
  statusMix: { status: string; count: number }[];
  topExpenseCategories: { category: string; amount: number }[];
}

const MONTH_LABELS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];
/** Bucket a date into a "YYYY-MM" key, or null. */
const monthKey = (date: Date | null): string | null => (date ? monthKeyOf(date) : null);
const monthLabel = (key: string): string => {
  const [year, month] = key.split('-');
  return `${MONTH_LABELS[Number(month) - 1] ?? month} ${year}`;
};

/** Loans that are still on the book, as a Prisma `in` filter. */
const OPEN_STATUSES = [...OPEN_LOAN_STATUSES];

@Injectable()
export class StatsService {
  constructor(private readonly prisma: PrismaService) {}

  overview(user: SessionUser): Promise<OverviewStats> {
    if (isPlatform(user.role)) {
      return this.platformOverview();
    }
    if (isBorrower(user.role)) {
      return this.borrowerOverview(user.id);
    }
    // Sensitive financials require the finance permission; others get the operational subset.
    return this.lenderOverview(requireTenantId(user), hasPermission(user, 'finance:read'));
  }

  /**
   * Time-series + distributions for the lender dashboard charts. The cash-flow
   * (`monthly`) and `topExpenseCategories` series are sensitive financials, so
   * they are returned empty for non-admins — only the operational `statusMix`
   * (loan-status donut) is shared with staff.
   */
  async lenderSeries(tenantId: string, includeSensitive: boolean): Promise<LenderSeries> {
    const [ledgers, expenses, statusGroups] = await Promise.all([
      this.ledgers(tenantId),
      this.prisma.expense.findMany({
        where: { tenantId },
        select: { incurredAt: true, amount: true, kind: true, category: true },
      }),
      this.prisma.loan.groupBy({ by: ['status'], where: { tenantId }, _count: true }),
    ]);

    // Merge the three cash flows into one per-month series.
    const buckets = new Map<string, MonthlyPoint>();
    const bucket = (key: string): MonthlyPoint => {
      const existing = buckets.get(key);
      if (existing) {
        return existing;
      }
      const created: MonthlyPoint = {
        month: key,
        label: monthLabel(key),
        disbursed: 0,
        collected: 0,
        expenses: 0,
      };
      buckets.set(key, created);
      return created;
    };

    for (const { loan, credits } of ledgers) {
      // Cancelled loans never paid out, so they are not a disbursement.
      const key = loan.status === LoanStatus.Cancelled ? null : monthKey(loan.disbursedAt);
      if (key) {
        bucket(key).disbursed += loan.principal;
      }
      for (const credit of credits) {
        bucket(monthKeyOf(credit.at)).collected += credit.amountCents;
      }
    }
    for (const expense of expenses) {
      const key = monthKey(expense.incurredAt);
      if (key && expense.kind === ExpenseKind.Expense) {
        bucket(key).expenses += expense.amount;
      }
    }

    // A month that has not happened yet cannot have cash flows; the few imported
    // rows with mis-parsed future dates would otherwise stretch the axis.
    const currentMonth = monthKeyOf(new Date());
    const monthly = [...buckets.values()]
      .filter((point) => point.month <= currentMonth)
      .sort((a, b) => a.month.localeCompare(b.month));

    const categoryTotals = new Map<string, number>();
    for (const expense of expenses) {
      if (expense.kind === ExpenseKind.Expense) {
        categoryTotals.set(
          expense.category,
          (categoryTotals.get(expense.category) ?? 0) + expense.amount,
        );
      }
    }
    const topExpenseCategories = [...categoryTotals.entries()]
      .map(([category, amount]) => ({ category, amount }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 6);

    const statusMix = statusGroups.map((group) => ({ status: group.status, count: group._count }));

    if (!includeSensitive) {
      return { monthly: [], statusMix, topExpenseCategories: [] };
    }
    return { monthly, statusMix, topExpenseCategories };
  }

  /**
   * Every disbursed loan with its reconciled repayment history — the same
   * ledger the reports are built from, so "collected to date" here agrees with
   * the monthly report's collections. Reading Payment rows alone would miss
   * repayments recorded by marking an instalment paid (see `reconcileCredits`).
   */
  private async ledgers(tenantId: string): Promise<LoanLedger[]> {
    const [loans, payments, scheduleItems] = await Promise.all([
      this.prisma.loan.findMany({
        where: { tenantId, disbursedAt: { not: null } },
        select: {
          id: true,
          borrowerId: true,
          status: true,
          total: true,
          principal: true,
          financeCharge: true,
          instalmentsTotal: true,
          disbursedAt: true,
          closedAt: true,
          waived: true,
        },
      }),
      this.prisma.payment.findMany({
        where: { tenantId },
        select: { loanId: true, paidAt: true, amount: true, method: true },
      }),
      this.prisma.repaymentScheduleItem.findMany({
        where: { loan: { tenantId }, status: 'paid', paidAt: { not: null } },
        select: { loanId: true, amount: true, paidAt: true, status: true },
      }),
    ]);
    return [...buildLedgers({ loans, payments, scheduleItems }).values()];
  }

  private async lenderOverview(
    tenantId: string,
    includeSensitive: boolean,
  ): Promise<LenderOverview> {
    const [
      book,
      arrears,
      unreleased,
      pendingApplications,
      borrowers,
      ledgers,
      expenseSums,
      invested,
      incomeAgg,
      settings,
      undatedCapital,
      undatedCosts,
      undatedIncome,
    ] = await Promise.all([
      // The book is every loan still open — including partly-paid ones.
      this.prisma.loan.aggregate({
        where: { tenantId, status: { in: OPEN_STATUSES } },
        _sum: { balance: true },
        _count: true,
      }),
      // Live arrears: any open loan with money owing whose next instalment is
      // past due, even if no repayment has been recorded to flip its stored
      // status yet (the same rule as `isLoanOverdue` in @loan-pilot/domain).
      this.prisma.loan.aggregate({
        where: {
          tenantId,
          status: { in: OPEN_STATUSES },
          balance: { gt: 0 },
          nextDueAt: { lt: new Date() },
        },
        _sum: { balance: true },
        _count: true,
      }),
      // Approved and counted as paid out, but the payout is not confirmed.
      this.prisma.loan.aggregate({
        where: {
          tenantId,
          status: { not: LoanStatus.Cancelled },
          disbursedAt: { not: null },
          fundsReleased: false,
        },
        _sum: { principal: true },
        _count: true,
      }),
      this.prisma.loanApplication.count({
        where: {
          tenantId,
          status: { in: [ApplicationStatus.Pending, ApplicationStatus.Review] },
        },
      }),
      this.prisma.borrower.count({ where: { tenantId } }),
      this.ledgers(tenantId),
      this.prisma.expense.groupBy({
        by: ['kind'],
        where: { tenantId },
        _sum: { amount: true },
      }),
      this.prisma.investment.aggregate({ where: { tenantId }, _sum: { amount: true } }),
      this.prisma.income.aggregate({ where: { tenantId }, _sum: { amount: true } }),
      this.prisma.tenantSettings.findUnique({
        where: { tenantId },
        select: { openingBalance: true, bankBalance: true, bankBalanceAt: true },
      }),
      this.prisma.investment.aggregate({
        where: { tenantId, contributedAt: null },
        _sum: { amount: true },
        _count: true,
      }),
      this.prisma.expense.aggregate({
        where: { tenantId, incurredAt: null },
        _sum: { amount: true },
        _count: true,
      }),
      this.prisma.income.aggregate({
        where: { tenantId, incurredAt: null },
        _sum: { amount: true },
        _count: true,
      }),
    ]);

    const expenses = expenseSums.find((row) => row.kind === ExpenseKind.Expense)?._sum.amount ?? 0;
    const drawings = expenseSums.find((row) => row.kind === ExpenseKind.Drawing)?._sum.amount ?? 0;
    // Cancelled loans never paid out, so their principal was never cash out.
    const disbursedTotal = ledgers.reduce(
      (sum, { loan }) => (loan.status === LoanStatus.Cancelled ? sum : sum + loan.principal),
      0,
    );
    const collectedTotal = ledgers.reduce(
      (sum, { credits }) => sum + credits.reduce((inner, credit) => inner + credit.amountCents, 0),
      0,
    );
    const investedTotal = invested._sum.amount ?? 0;
    const incomeTotal = incomeAgg._sum.amount ?? 0;
    const openingBalance = settings?.openingBalance ?? 0;

    const operational: LenderOverview = {
      kind: 'lender',
      activeLoans: book._count,
      arrearsLoans: arrears._count,
      bookValue: book._sum.balance ?? 0,
      arrearsValue: arrears._sum.balance ?? 0,
      pendingApplications,
      borrowers,
    };
    if (!includeSensitive) {
      return operational;
    }

    return {
      ...operational,
      disbursed: disbursedTotal,
      collected: collectedTotal,
      expenses,
      drawings,
      invested: investedTotal,
      income: incomeTotal,
      // Net profit = interest earned (collected − disbursed principal) − operating
      // expenses. Owner drawings and capital invested are financing, not P&L.
      netProfit: collectedTotal - disbursedTotal - expenses,
      openingBalance,
      // Cash on hand available to lend.
      availableBalance:
        openingBalance +
        investedTotal +
        collectedTotal +
        incomeTotal -
        disbursedTotal -
        expenses -
        drawings,
      unreleased: { count: unreleased._count, principal: unreleased._sum.principal ?? 0 },
      undated: {
        count: undatedCapital._count + undatedCosts._count + undatedIncome._count,
        capital: undatedCapital._sum.amount ?? 0,
        costs: undatedCosts._sum.amount ?? 0,
        income: undatedIncome._sum.amount ?? 0,
      },
      bankBalance: settings?.bankBalance ?? null,
      bankBalanceAt: settings?.bankBalanceAt?.toISOString() ?? null,
    };
  }

  private async platformOverview(): Promise<PlatformOverview> {
    const [tenants, activeTenants, book, totalBorrowers] = await Promise.all([
      this.prisma.tenant.count(),
      this.prisma.tenant.count({ where: { status: TenantStatus.Active } }),
      this.prisma.loan.aggregate({
        where: { status: { in: OPEN_STATUSES } },
        _sum: { balance: true },
      }),
      this.prisma.borrower.count(),
    ]);

    return {
      kind: 'platform',
      tenants,
      activeTenants,
      totalBookValue: book._sum.balance ?? 0,
      totalBorrowers,
    };
  }

  private async borrowerOverview(userId: string): Promise<BorrowerOverview> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user?.borrowerId) {
      return {
        kind: 'borrower',
        activeLoans: 0,
        outstandingBalance: 0,
        nextDueAt: null,
        nextInstalment: null,
      };
    }

    const [book, nextLoan] = await Promise.all([
      this.prisma.loan.aggregate({
        where: {
          borrowerId: user.borrowerId,
          status: { in: OPEN_STATUSES },
        },
        _sum: { balance: true },
        _count: true,
      }),
      this.prisma.loan.findFirst({
        where: {
          borrowerId: user.borrowerId,
          status: { in: OPEN_STATUSES },
          nextDueAt: { not: null },
        },
        orderBy: { nextDueAt: 'asc' },
      }),
    ]);

    return {
      kind: 'borrower',
      activeLoans: book._count,
      outstandingBalance: book._sum.balance ?? 0,
      nextDueAt: nextLoan?.nextDueAt?.toISOString() ?? null,
      nextInstalment: nextLoan?.instalment ?? null,
    };
  }
}
