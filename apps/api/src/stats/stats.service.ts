import { Injectable } from '@nestjs/common';
import {
  ApplicationStatus,
  ExpenseKind,
  LoanStatus,
  TenantStatus,
  hasPermission,
  isBorrower,
  isPlatform,
  type SessionUser,
} from '@loan-pilot/domain';
import { PrismaService } from '../prisma/prisma.service';
import { requireTenantId } from '../common/tenant';

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
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];
/** Bucket a date into a "YYYY-MM" key, or null. */
const monthKey = (date: Date | null): string | null =>
  date ? `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}` : null;
const monthLabel = (key: string): string => {
  const [year, month] = key.split('-');
  return `${MONTH_LABELS[Number(month) - 1] ?? month} ${year}`;
};

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
    const [loans, payments, expenses, statusGroups] = await Promise.all([
      this.prisma.loan.findMany({
        where: { tenantId, disbursedAt: { not: null } },
        select: { disbursedAt: true, principal: true },
      }),
      this.prisma.payment.findMany({ where: { tenantId }, select: { paidAt: true, amount: true } }),
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
      const created: MonthlyPoint = { month: key, label: monthLabel(key), disbursed: 0, collected: 0, expenses: 0 };
      buckets.set(key, created);
      return created;
    };

    for (const loan of loans) {
      const key = monthKey(loan.disbursedAt);
      if (key) {
        bucket(key).disbursed += loan.principal;
      }
    }
    for (const payment of payments) {
      const key = monthKey(payment.paidAt);
      if (key) {
        bucket(key).collected += payment.amount;
      }
    }
    for (const expense of expenses) {
      const key = monthKey(expense.incurredAt);
      if (key && expense.kind === ExpenseKind.Expense) {
        bucket(key).expenses += expense.amount;
      }
    }

    // Clamp to the register's real window; a few imported rows carry
    // mis-parsed dates (e.g. a stray 2029) that would otherwise stretch the axis.
    const monthly = [...buckets.values()]
      .filter((point) => point.month >= '2023-10' && point.month <= '2026-12')
      .sort((a, b) => a.month.localeCompare(b.month));

    const categoryTotals = new Map<string, number>();
    for (const expense of expenses) {
      if (expense.kind === ExpenseKind.Expense) {
        categoryTotals.set(expense.category, (categoryTotals.get(expense.category) ?? 0) + expense.amount);
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

  private async lenderOverview(
    tenantId: string,
    includeSensitive: boolean,
  ): Promise<LenderOverview> {
    const [
      book,
      arrears,
      pendingApplications,
      borrowers,
      disbursed,
      collected,
      expenseSums,
      invested,
      incomeAgg,
      settings,
    ] = await Promise.all([
        this.prisma.loan.aggregate({
          where: { tenantId, status: { in: [LoanStatus.Active, LoanStatus.Arrears] } },
          _sum: { balance: true },
          _count: true,
        }),
        // Live arrears: any open loan whose next instalment is past due, even if
        // no repayment has been recorded to flip its stored status yet.
        this.prisma.loan.aggregate({
          where: {
            tenantId,
            status: { in: [LoanStatus.Active, LoanStatus.Arrears, LoanStatus.PartlyPaid] },
            nextDueAt: { lt: new Date() },
          },
          _sum: { balance: true },
          _count: true,
        }),
        this.prisma.loanApplication.count({
          where: {
            tenantId,
            status: { in: [ApplicationStatus.Pending, ApplicationStatus.Review] },
          },
        }),
        this.prisma.borrower.count({ where: { tenantId } }),
        this.prisma.loan.aggregate({ where: { tenantId }, _sum: { principal: true } }),
        this.prisma.payment.aggregate({ where: { tenantId }, _sum: { amount: true } }),
        this.prisma.expense.groupBy({
          by: ['kind'],
          where: { tenantId },
          _sum: { amount: true },
        }),
        this.prisma.investment.aggregate({ where: { tenantId }, _sum: { amount: true } }),
        this.prisma.income.aggregate({ where: { tenantId }, _sum: { amount: true } }),
        this.prisma.tenantSettings.findUnique({
          where: { tenantId },
          select: { openingBalance: true },
        }),
      ]);

    const expenses =
      expenseSums.find((row) => row.kind === ExpenseKind.Expense)?._sum.amount ?? 0;
    const drawings = expenseSums.find((row) => row.kind === ExpenseKind.Drawing)?._sum.amount ?? 0;
    const collectedTotal = collected._sum.amount ?? 0;
    const disbursedTotal = disbursed._sum.principal ?? 0;
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
        openingBalance + investedTotal + collectedTotal + incomeTotal - disbursedTotal - expenses - drawings,
    };
  }

  private async platformOverview(): Promise<PlatformOverview> {
    const [tenants, activeTenants, book, totalBorrowers] = await Promise.all([
      this.prisma.tenant.count(),
      this.prisma.tenant.count({ where: { status: TenantStatus.Active } }),
      this.prisma.loan.aggregate({
        where: { status: { in: [LoanStatus.Active, LoanStatus.Arrears] } },
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
          status: { in: [LoanStatus.Active, LoanStatus.Arrears] },
        },
        _sum: { balance: true },
        _count: true,
      }),
      this.prisma.loan.findFirst({
        where: {
          borrowerId: user.borrowerId,
          status: { in: [LoanStatus.Active, LoanStatus.Arrears] },
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
