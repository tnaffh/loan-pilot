import type {
  AffordabilityResult,
  ApplicationStatus,
  EmploymentType,
  LoanStatus,
  LoanType,
  RepaymentStatus,
} from '@loan-pilot/domain';

/**
 * Shapes of authenticated API responses. All monetary fields are integer
 * N$ cents — display with formatNad() from @loan-pilot/domain.
 */

export interface ApplicationRow {
  id: string;
  firstName: string;
  lastName: string;
  type: LoanType;
  amount: number;
  termMonths: number;
  declaredIncome: number;
  quotedTotal: number;
  quotedInstalment: number;
  affordability: AffordabilityResult;
  affordabilityRatio: number;
  status: ApplicationStatus;
  submittedAt: string;
  references: { id: string; name: string; phone: string }[];
}

export interface ApplicationDecision {
  application: ApplicationRow;
  loanId: string | null;
}

export interface BorrowerRow {
  id: string;
  firstName: string;
  lastName: string;
  idNumber: string;
  phone: string;
  email: string;
  employer: string;
  occupation: string;
  monthlyIncome: number;
  employmentType: EmploymentType;
  bank: string;
  accountType: string;
  address: string;
  status: string;
  since: string;
  _count: { loans: number };
}

export interface ScheduleItem {
  id: string;
  number: number;
  dueAt: string;
  amount: number;
  status: RepaymentStatus;
  paidAt: string | null;
}

export interface LoanRow {
  id: string;
  type: LoanType;
  principal: number;
  financeCharge: number;
  total: number;
  termMonths: number;
  instalment: number;
  instalmentsPaid: number;
  instalmentsTotal: number;
  balance: number;
  status: LoanStatus;
  collateral: string | null;
  daysLate: number;
  disbursedAt: string | null;
  nextDueAt: string | null;
  borrower: { id: string; firstName: string; lastName: string };
}

export interface LoanDetail extends LoanRow {
  borrower: { id: string; firstName: string; lastName: string; idNumber: string };
  schedule: ScheduleItem[];
}

export interface BorrowerDetail extends Omit<BorrowerRow, '_count'> {
  loans: (Omit<LoanRow, 'borrower'> & { schedule: ScheduleItem[] })[];
}

export type OverviewStats =
  | {
      kind: 'lender';
      activeLoans: number;
      arrearsLoans: number;
      bookValue: number;
      arrearsValue: number;
      pendingApplications: number;
      borrowers: number;
    }
  | {
      kind: 'platform';
      tenants: number;
      activeTenants: number;
      totalBookValue: number;
      totalBorrowers: number;
    }
  | {
      kind: 'borrower';
      activeLoans: number;
      outstandingBalance: number;
      nextDueAt: string | null;
      nextInstalment: number | null;
    };
