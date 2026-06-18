import type {
  ActivityEvent,
  AffordabilityResult,
  ApplicationStatus,
  EmploymentType,
  ExpenseKind,
  LoanStatus,
  LoanType,
  PaymentMethod,
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

export interface ApplicationDocument {
  id: string;
  kind: string;
  url: string;
  fileName: string;
  mimeType: string | null;
  sizeBytes: number | null;
  uploadedAt: string;
}

export interface ApplicationDetail extends ApplicationRow {
  idNumber: string;
  dateOfBirth: string;
  phone: string;
  email: string;
  addrStreet: string;
  addrSuburb: string | null;
  addrCity: string;
  addrRegion: string | null;
  addrCountry: string;
  maritalStatus: string | null;
  employmentType: EmploymentType;
  employer: string;
  occupation: string;
  bankName: string;
  bankAccountNumber: string;
  bankBranchName: string | null;
  bankBranchCode: string | null;
  bankAccountHolder: string;
  accountType: string;
  purpose: string | null;
  declineReason: string | null;
  decidedAt: string | null;
  documents: ApplicationDocument[];
  activity: ActivityEvent[];
}

export interface BorrowerAddress {
  id: string;
  label: string | null;
  street: string;
  suburb: string | null;
  city: string;
  region: string | null;
  country: string;
  isActive: boolean;
}

export interface BorrowerBankAccount {
  id: string;
  bankName: string;
  accountNumber: string;
  branchName: string | null;
  branchCode: string | null;
  accountHolderName: string;
  accountType: string;
  isActive: boolean;
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

export interface PaymentRow {
  id: string;
  paidAt: string;
  amount: number;
  method: PaymentMethod;
  badDebt: boolean;
  note: string | null;
}

export interface LoanRow {
  id: string;
  type: LoanType;
  principal: number;
  financeCharge: number;
  bankCharges: number;
  namfisaLevy: number;
  stampDuty: number;
  interestRate: number;
  total: number;
  termMonths: number;
  instalment: number;
  instalmentsPaid: number;
  instalmentsTotal: number;
  balance: number;
  status: LoanStatus;
  collateral: string | null;
  daysLate: number;
  originMonth: string | null;
  note: string | null;
  disbursedAt: string | null;
  nextDueAt: string | null;
  borrower: { id: string; firstName: string; lastName: string };
}

export interface LoanDetail extends LoanRow {
  borrower: { id: string; firstName: string; lastName: string; idNumber: string };
  writeOffReason: string | null;
  closedAt: string | null;
  schedule: ScheduleItem[];
  payments: PaymentRow[];
  activity: ActivityEvent[];
}

export interface ExpenseRow {
  id: string;
  kind: ExpenseKind;
  category: string;
  period: string | null;
  incurredAt: string | null;
  amount: number;
  note: string | null;
}

export interface ExpenseTotals {
  totalExpenses: number;
  totalDrawings: number;
  net: number;
}

export interface InvestmentRow {
  id: string;
  name: string;
  period: string | null;
  contributedAt: string | null;
  amount: number;
  note: string | null;
}

export interface InvestmentTotals {
  total: number;
  count: number;
}

export interface MonthlyPoint {
  month: string;
  label: string;
  disbursed: number;
  collected: number;
  expenses: number;
}

export interface LenderSeries {
  monthly: MonthlyPoint[];
  statusMix: { status: string; count: number }[];
  topExpenseCategories: { category: string; amount: number }[];
}

export interface BorrowerDetail extends Omit<BorrowerRow, '_count'> {
  loans: (Omit<LoanRow, 'borrower'> & { schedule: ScheduleItem[] })[];
  addresses: BorrowerAddress[];
  bankAccounts: BorrowerBankAccount[];
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
      disbursed: number;
      collected: number;
      expenses: number;
      drawings: number;
      invested: number;
      netProfit: number;
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
