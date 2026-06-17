import { Injectable } from '@nestjs/common';
import {
  ApplicationStatus,
  ExpenseKind,
  LoanStatus,
  TenantStatus,
  isBorrower,
  isPlatform,
  type SessionUser,
} from '@loan-pilot/domain';
import { PrismaService } from '../prisma/prisma.service';
import { requireTenantId } from '../common/tenant';

export interface LenderOverview {
  kind: 'lender';
  activeLoans: number;
  arrearsLoans: number;
  bookValue: number;
  arrearsValue: number;
  pendingApplications: number;
  borrowers: number;
  // Lifetime cash flows (cents): disbursed principal, collected payments,
  // operating expenses, refunds, and the resulting net.
  disbursed: number;
  collected: number;
  expenses: number;
  refunds: number;
  netProfit: number;
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
    return this.lenderOverview(requireTenantId(user));
  }

  private async lenderOverview(tenantId: string): Promise<LenderOverview> {
    const [book, arrears, pendingApplications, borrowers, disbursed, collected, expenseSums] =
      await Promise.all([
        this.prisma.loan.aggregate({
          where: { tenantId, status: { in: [LoanStatus.Active, LoanStatus.Arrears] } },
          _sum: { balance: true },
          _count: true,
        }),
        this.prisma.loan.aggregate({
          where: { tenantId, status: LoanStatus.Arrears },
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
      ]);

    const expenses =
      expenseSums.find((row) => row.kind === ExpenseKind.Expense)?._sum.amount ?? 0;
    const refunds = expenseSums.find((row) => row.kind === ExpenseKind.Refund)?._sum.amount ?? 0;
    const collectedTotal = collected._sum.amount ?? 0;
    const disbursedTotal = disbursed._sum.principal ?? 0;

    return {
      kind: 'lender',
      activeLoans: book._count,
      arrearsLoans: arrears._count,
      bookValue: book._sum.balance ?? 0,
      arrearsValue: arrears._sum.balance ?? 0,
      pendingApplications,
      borrowers,
      disbursed: disbursedTotal,
      collected: collectedTotal,
      expenses,
      refunds,
      // Net = interest earned (collected − disbursed principal) − expenses + refunds.
      netProfit: collectedTotal - disbursedTotal - expenses + refunds,
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
