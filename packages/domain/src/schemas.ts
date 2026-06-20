import { z } from 'zod';
import {
  ApplicationStatus,
  EmploymentType,
  ExpenseKind,
  LoanType,
  PaymentMethod,
  PlanId,
  UserRole,
  UserStatus,
} from './enums';
import { ageOnDate, isAdult, isPlausibleId, isPlausiblePhone, parseNamibianId } from './identity';
import { MAX_TERM_MONTHS } from './loan-math';

/** A personal reference, as required by the loan agreement (minimum one). */
export const referenceSchema = z.object({
  name: z.string().min(2, 'Reference name is required'),
  phone: z
    .string()
    .min(6, 'Reference phone is required')
    .refine(isPlausiblePhone, 'Enter a valid phone number'),
});
export type ReferenceInput = z.infer<typeof referenceSchema>;

/**
 * Full bank-account details. A borrower may hold several of these (with one
 * active); an application captures the one the applicant submits.
 */
export const bankAccountSchema = z.object({
  bankName: z.string().min(1, 'Bank name is required'),
  accountNumber: z.string().min(4, 'A valid account number is required'),
  branchName: z.string().max(120).optional().or(z.literal('')),
  branchCode: z.string().max(40).optional().or(z.literal('')),
  accountHolderName: z.string().min(1, 'Account holder name is required'),
  accountType: z.string().min(1, 'Account type is required'),
});
export type BankAccountInput = z.infer<typeof bankAccountSchema>;

/** A structured postal/residential address. Borrowers may hold several (one active). */
export const addressSchema = z.object({
  label: z.string().max(40).optional().or(z.literal('')),
  street: z.string().min(3, 'Street address is required'),
  suburb: z.string().max(120).optional().or(z.literal('')),
  city: z.string().min(1, 'City is required'),
  region: z.string().max(120).optional().or(z.literal('')),
  country: z.string().min(1).default('Namibia'),
});
export type AddressInput = z.infer<typeof addressSchema>;

/**
 * The public loan-application payload. Monetary values are submitted in
 * major Namibian Dollar units and converted to cents server-side.
 */
export const createApplicationSchema = z.object({
  // Step 1 — the loan
  loanType: z.nativeEnum(LoanType),
  amount: z.coerce.number().int().min(500, 'Minimum amount is N$ 500').max(500000),
  termMonths: z.coerce.number().int().min(1).max(MAX_TERM_MONTHS),
  purpose: z.string().max(280).optional().or(z.literal('')),

  // Step 2 — personal
  firstName: z.string().min(1, 'First name is required'),
  lastName: z.string().min(1, 'Surname is required'),
  idNumber: z
    .string()
    .min(6, 'A valid ID or passport number is required')
    .refine(isPlausibleId, 'Enter a valid Namibian ID or passport number'),
  dateOfBirth: z
    .string()
    .min(1, 'Date of birth is required')
    .refine((value) => ageOnDate(value) !== null, 'Enter a valid date of birth')
    .refine((value) => isAdult(value), 'Applicant must be at least 18 years old'),
  phone: z
    .string()
    .min(6, 'A contact number is required')
    .refine(isPlausiblePhone, 'Enter a valid phone number'),
  email: z.string().email('A valid email is required'),
  address: addressSchema,
  maritalStatus: z.string().optional().or(z.literal('')),

  // Step 3 — employment & bank
  employmentType: z.nativeEnum(EmploymentType),
  employer: z.string().min(1, 'Employer is required'),
  occupation: z.string().min(1, 'Occupation is required'),
  monthlyIncome: z.coerce.number().int().min(1, 'Monthly income is required'),
  bankAccount: bankAccountSchema,

  // Step 4 — references & consent
  references: z.array(referenceSchema).min(1, 'At least one reference is required').max(4),
  consent: z.literal(true, {
    errorMap: () => ({ message: 'You must agree to the terms to continue' }),
  }),
}).superRefine((value, ctx) => {
  // When the ID is a Namibian national ID, its encoded birth date must agree
  // with the supplied date of birth. Passports carry no such data, so skip.
  const parsed = parseNamibianId(value.idNumber);
  if (parsed.isNamibianId && parsed.dateOfBirth && parsed.dateOfBirth !== value.dateOfBirth) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['dateOfBirth'],
      message: 'Date of birth does not match the ID number',
    });
  }
});
export type CreateApplicationInput = z.infer<typeof createApplicationSchema>;

/** Credentials for the authenticated dashboard (used from Phase 2). */
export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});
export type LoginInput = z.infer<typeof loginSchema>;

/** A new password — shared minimum used by invite-accept and reset. */
const passwordField = z.string().min(8, 'Password must be at least 8 characters');

/**
 * Invite a staff user. `role` is constrained to the staff roles here; the API
 * re-validates that the acting admin may actually assign it (see assignableRoles).
 */
export const inviteUserSchema = z.object({
  name: z.string().min(1, 'A name is required'),
  email: z.string().email('A valid email is required'),
  role: z.union([
    z.literal(UserRole.LenderAdmin),
    z.literal(UserRole.LenderStaff),
    z.literal(UserRole.Platform),
  ]),
});
export type InviteUserInput = z.infer<typeof inviteUserSchema>;

/** Update a user's name, role, and/or status. */
export const updateUserSchema = z.object({
  name: z.string().min(1).optional(),
  role: z.nativeEnum(UserRole).optional(),
  status: z.nativeEnum(UserStatus).optional(),
});
export type UpdateUserInput = z.infer<typeof updateUserSchema>;

/** Accept an invitation by setting an initial password. */
export const acceptInviteSchema = z.object({
  token: z.string().min(10),
  password: passwordField,
});
export type AcceptInviteInput = z.infer<typeof acceptInviteSchema>;

/** Change your own password while signed in. */
export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Your current password is required'),
  newPassword: passwordField,
});
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

/** Request a password-reset email. */
export const forgotPasswordSchema = z.object({
  email: z.string().email('A valid email is required'),
});
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

/** Set a new password from a reset link. */
export const resetPasswordSchema = z.object({
  token: z.string().min(10),
  password: passwordField,
});
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

/**
 * Lender-captured borrower record. `monthlyIncome` is submitted in major
 * Namibian Dollar units and converted to cents server-side.
 */
export const createBorrowerSchema = z.object({
  firstName: z.string().min(1, 'First name is required'),
  lastName: z.string().min(1, 'Surname is required'),
  idNumber: z
    .string()
    .min(6, 'A valid ID or passport number is required')
    .refine(isPlausibleId, 'Enter a valid Namibian ID or passport number'),
  phone: z
    .string()
    .min(6, 'A contact number is required')
    .refine(isPlausiblePhone, 'Enter a valid phone number'),
  email: z.string().email('A valid email is required'),
  address: addressSchema,
  employer: z.string().min(1, 'Employer is required'),
  occupation: z.string().min(1, 'Occupation is required'),
  monthlyIncome: z.coerce.number().int().min(1, 'Monthly income is required'),
  employmentType: z.nativeEnum(EmploymentType),
  bankAccount: bankAccountSchema,
});
export type CreateBorrowerInput = z.infer<typeof createBorrowerSchema>;

// Bank account / address are managed via their own endpoints; omit them here.
export const updateBorrowerSchema = createBorrowerSchema
  .omit({ address: true, bankAccount: true })
  .partial();
export type UpdateBorrowerInput = z.infer<typeof updateBorrowerSchema>;

/** Add or replace a borrower address / bank account from the dashboard. */
export const createBorrowerAddressSchema = addressSchema;
export type CreateBorrowerAddressInput = z.infer<typeof createBorrowerAddressSchema>;
export const createBorrowerBankAccountSchema = bankAccountSchema;
export type CreateBorrowerBankAccountInput = z.infer<typeof createBorrowerBankAccountSchema>;

/** Inputs for a loan quote preview. `amount` is in major N$ units. */
export const loanQuoteSchema = z.object({
  loanType: z.nativeEnum(LoanType),
  amount: z.coerce.number().int().min(500, 'Minimum amount is N$ 500').max(500000),
  termMonths: z.coerce.number().int().min(1).max(MAX_TERM_MONTHS),
});
export type LoanQuoteInput = z.infer<typeof loanQuoteSchema>;

/** Disburse a new loan to an existing borrower. */
export const createLoanSchema = loanQuoteSchema.extend({
  borrowerId: z.string().min(1, 'A borrower is required'),
  collateral: z.string().max(200).optional().or(z.literal('')),
});
export type CreateLoanInput = z.infer<typeof createLoanSchema>;

/** Record a repayment against the next due instalment. */
export const recordRepaymentSchema = z.object({
  paidAt: z.string().datetime().optional(),
});
export type RecordRepaymentInput = z.infer<typeof recordRepaymentSchema>;

/**
 * Record an actual payment against a loan. `amount` is submitted in major
 * Namibian Dollar units and converted to cents server-side.
 */
export const createPaymentSchema = z.object({
  loanId: z.string().min(1, 'A loan is required'),
  amount: z.coerce.number().min(1, 'A payment amount is required'),
  method: z.nativeEnum(PaymentMethod).default(PaymentMethod.Cash),
  paidAt: z.string().min(4, 'A payment date is required'),
  badDebt: z.coerce.boolean().optional(),
  note: z.string().max(280).optional().or(z.literal('')),
});
export type CreatePaymentInput = z.infer<typeof createPaymentSchema>;

/**
 * Record an operating expense or owner drawing for the lender. `amount` is
 * submitted in major Namibian Dollar units and converted to cents server-side.
 */
export const createExpenseSchema = z.object({
  kind: z.nativeEnum(ExpenseKind).default(ExpenseKind.Expense),
  category: z.string().min(1, 'A category is required'),
  amount: z.coerce.number().min(0.01, 'An amount is required'),
  period: z.string().max(40).optional().or(z.literal('')),
  incurredAt: z.string().optional().or(z.literal('')),
  note: z.string().max(280).optional().or(z.literal('')),
});
export type CreateExpenseInput = z.infer<typeof createExpenseSchema>;

/**
 * Record capital injected into the cash-loan book (an "Additional Investment").
 * `amount` is submitted in major Namibian Dollar units and converted to cents
 * server-side.
 */
export const createInvestmentSchema = z.object({
  name: z.string().min(1, 'A name is required'),
  amount: z.coerce.number().min(0.01, 'An amount is required'),
  period: z.string().max(40).optional().or(z.literal('')),
  contributedAt: z.string().optional().or(z.literal('')),
  note: z.string().max(280).optional().or(z.literal('')),
});
export type CreateInvestmentInput = z.infer<typeof createInvestmentSchema>;

/**
 * Move a loan application along its lifecycle: into Review (triage), Approved
 * (disburses the loan) or Declined. `reason` is captured on a decline and shown
 * in the application's activity timeline.
 */
export const updateApplicationStatusSchema = z.object({
  status: z.union([
    z.literal(ApplicationStatus.Review),
    z.literal(ApplicationStatus.Approved),
    z.literal(ApplicationStatus.Declined),
  ]),
  reason: z.string().max(500).optional().or(z.literal('')),
});
export type UpdateApplicationStatusInput = z.infer<typeof updateApplicationStatusSchema>;

/**
 * Settle a loan early by clearing the full outstanding balance in one payment.
 * The amount is the server-held balance (cents), so it is never sent by the
 * client — only how and when the payoff was made.
 */
export const settleLoanSchema = z.object({
  method: z.nativeEnum(PaymentMethod).default(PaymentMethod.Cash),
  paidAt: z.string().min(4, 'A payment date is required'),
  note: z.string().max(280).optional().or(z.literal('')),
});
export type SettleLoanInput = z.infer<typeof settleLoanSchema>;

/** Write off an unrecoverable loan as bad debt; the reason is required. */
export const writeOffLoanSchema = z.object({
  reason: z.string().min(3, 'A reason is required').max(500),
});
export type WriteOffLoanInput = z.infer<typeof writeOffLoanSchema>;

/** White-label branding returned by GET /api/tenants/me; bridges the Prisma row to the domain shape. */
export const tenantBrandingSchema = z.object({
  slug: z.string(),
  name: z.string(),
  short: z.string(),
  accent: z.string(),
  plan: z.nativeEnum(PlanId),
});
