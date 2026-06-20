/**
 * Domain enumerations shared across API, web and mobile.
 * String-valued enums; the values match the Prisma enum values exactly so the
 * same identifiers flow from HTTP payloads through validation to the database.
 */

export enum LoanType {
  Payday = 'payday',
  Business = 'business',
  Collateral = 'collateral',
}

export enum LoanStatus {
  Active = 'active',
  Arrears = 'arrears',
  PartlyPaid = 'partly_paid',
  Settled = 'settled',
  WrittenOff = 'written_off',
  Closed = 'closed',
}

export enum PaymentMethod {
  Eft = 'eft',
  Cash = 'cash',
  DebitOrder = 'debit_order',
  Deposit = 'deposit',
  Ewallet = 'ewallet',
  Payroll = 'payroll',
  Revolved = 'revolved',
}

export enum ExpenseKind {
  Expense = 'expense',
  // An owner withdrawal / dividend ("Investment Cash-out"); a distribution of
  // profit rather than an operating cost, so excluded from net profit.
  Drawing = 'drawing',
}

export enum ApplicationStatus {
  Pending = 'pending',
  Review = 'review',
  Approved = 'approved',
  Declined = 'declined',
}

export enum AffordabilityResult {
  Pass = 'pass',
  Review = 'review',
  Fail = 'fail',
}

export enum RepaymentStatus {
  Paid = 'paid',
  Due = 'due',
  Overdue = 'overdue',
}

export enum InvoiceStatus {
  Paid = 'paid',
  Overdue = 'overdue',
  Pending = 'pending',
}

export enum EmploymentType {
  PermanentlyEmployed = 'permanently_employed',
  CivilServant = 'civil_servant',
  SelfEmployed = 'self_employed',
  Contract = 'contract',
  Pensioner = 'pensioner',
}

export enum PlanId {
  Starter = 'starter',
  Growth = 'growth',
  Pro = 'pro',
}

export enum TenantStatus {
  Active = 'active',
  Trial = 'trial',
  Suspended = 'suspended',
}

export enum UserRole {
  Platform = 'platform',
  LenderAdmin = 'lender_admin',
  LenderStaff = 'lender_staff',
  Borrower = 'borrower',
}

export enum UserStatus {
  Active = 'active',
  // Invited but has not yet accepted (set a password) or signed in via a provider.
  Invited = 'invited',
  Disabled = 'disabled',
}

export enum AuthProvider {
  Password = 'password',
  Google = 'google',
}

export enum DocumentKind {
  ProofOfResidence = 'proof_of_residence',
  IdDocument = 'id_document',
  Payslip = 'payslip',
  BankStatement = 'bank_statement',
}
