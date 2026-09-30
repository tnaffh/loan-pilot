import type {
  AffordabilityResult,
  ApplicationStatus,
  LoanStatus,
  LoanType,
  RepaymentStatus,
  SessionUser,
} from '@loan-pilot/domain';

/** API payload shapes the app reads. Money is integer N$ cents unless noted. */

export interface LoginResponse {
  accessToken: string;
  user: SessionUser;
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
  daysLate: number;
  disbursedAt: string | null;
  nextDueAt: string | null;
  closedAt: string | null;
  createdAt: string;
}

export interface ScheduleItem {
  id: string;
  number: number;
  dueAt: string;
  amount: number;
  status: RepaymentStatus;
  paidAt: string | null;
}

export interface PaymentRow {
  id: string;
  paidAt: string;
  amount: number;
  method: string;
}

export interface LoanDetail extends LoanRow {
  schedule: ScheduleItem[];
  payments: PaymentRow[];
}

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
    type: LoanType;
    principal: number;
    financeCharge: number;
    total: number;
    termMonths: number;
    instalment: number;
    disbursedAt: string | null;
    status: LoanStatus;
  };
  lines: StatementLine[];
  defaultInterestAccrued: number;
  outstandingBalance: number;
}

/** GET /applications/mine */
export interface MyApplication {
  id: string;
  status: ApplicationStatus;
  type: LoanType;
  amount: number;
  termMonths: number;
  quotedTotal: number;
  quotedInstalment: number;
  affordability: AffordabilityResult;
  submittedAt: string;
  decidedAt: string | null;
  declineReason: string | null;
}

/** POST /applications — note: this one reports money in major N$ units. */
export interface ApplicationResult {
  id: string;
  status: ApplicationStatus;
  affordability: AffordabilityResult;
  affordabilityRatio: number;
  quotedTotal: number;
  quotedInstalment: number;
  submittedAt: string;
}
