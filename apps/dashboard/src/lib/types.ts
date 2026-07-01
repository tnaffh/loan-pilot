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
  UserRole,
  UserStatus,
} from '@loan-pilot/domain';

/**
 * Shapes of authenticated API responses. All monetary fields are integer
 * N$ cents — display with formatNad() from @loan-pilot/domain.
 */

export interface AuditChange {
  field: string;
  from: string | null;
  to: string | null;
}

export interface AuditEntry {
  id: string;
  actorName: string;
  action: string;
  changes: AuditChange[];
  createdAt: string;
}

export interface UserRow {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  roleId: string | null;
  roleName: string | null;
  status: UserStatus;
  image: string | null;
  hasPassword: boolean;
  providers: string[];
  lastLoginAt: string | null;
  createdAt: string;
}

export interface RoleRow {
  id: string;
  name: string;
  permissions: string[];
  isSystem: boolean;
  key: string | null;
  userCount: number;
  createdAt: string;
}

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
  url: string | null;
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
  existingBorrower: MatchedBorrower | null;
}

export interface MatchedBorrower {
  id: string;
  firstName: string;
  lastName: string;
  idNumber: string;
  loanCount: number;
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
  gender: string | null;
  payDay: string | null;
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
  cancelReason: string | null;
  closedAt: string | null;
  schedule: ScheduleItem[];
  payments: PaymentRow[];
  activity: ActivityEvent[];
  audit: AuditEntry[];
  // Live arrears derived server-side (cents). `payoff` = balance + defaultInterest.
  defaultInterest: number;
  overdueAmount: number;
  payoff: number;
  borrowerDocuments: DocumentRow[];
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

export interface IncomeRow {
  id: string;
  category: string;
  period: string | null;
  incurredAt: string | null;
  amount: number;
  note: string | null;
}

export interface DocumentRow {
  id: string;
  kind: string;
  url: string | null;
  fileName: string;
  uploadedAt: string;
}

export interface BorrowerStatement {
  generatedAt: string;
  lender: { name: string; short: string; town: string | null; logoUrl: string | null; accent: string };
  borrower: { name: string; idNumber: string; address: string; phone: string };
  loans: {
    id: string;
    type: LoanType;
    disbursedAt: string | null;
    principal: number;
    balance: number;
    payoff: number;
    status: LoanStatus;
  }[];
  totals: { outstanding: number; lifetimeBorrowed: number; openLoans: number; settledLoans: number };
  hasOutstanding: boolean;
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
  audit: AuditEntry[];
  documents: DocumentRow[];
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
      // Sensitive financials — only present for lender admins (the API omits them for staff).
      disbursed?: number;
      collected?: number;
      expenses?: number;
      drawings?: number;
      invested?: number;
      income?: number;
      netProfit?: number;
      openingBalance?: number;
      availableBalance?: number;
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
