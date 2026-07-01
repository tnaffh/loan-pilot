import { z } from 'zod';
import {
  ApplicationStatus,
  EmploymentType,
  ExpenseKind,
  LoanStatus,
  LoanType,
  PaymentMethod,
  PlanId,
  UserRole,
  UserStatus,
} from './enums';
import { ageOnDate, isAdult, isPlausibleId, isPlausiblePhone, parseNamibianId } from './identity';
import { MAX_FINANCE_CHARGE_RATE, MAX_TERM_MONTHS } from './loan-math';
import { isPermission, type Permission } from './permissions';

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

/** A single known permission key (validated against the fixed catalog). */
const permissionSchema = z.custom<Permission>(
  (value) => typeof value === 'string' && isPermission(value),
  'Unknown permission',
);

/**
 * Invite a user. Lender admins assign a tenant `roleId`; platform operators
 * assign `role: Platform` (no roleId). The API re-validates that the actor may
 * assign the chosen role/roleId and that it belongs to their tenant.
 */
export const inviteUserSchema = z.object({
  name: z.string().min(1, 'A name is required'),
  email: z.string().email('A valid email is required'),
  roleId: z.string().min(1).optional(),
  role: z.nativeEnum(UserRole).optional(),
});
export type InviteUserInput = z.infer<typeof inviteUserSchema>;

/** Update a user's name, assigned role, and/or status. */
export const updateUserSchema = z.object({
  name: z.string().min(1).optional(),
  roleId: z.string().min(1).optional(),
  status: z.nativeEnum(UserStatus).optional(),
});
export type UpdateUserInput = z.infer<typeof updateUserSchema>;

/** Create or edit a custom role: a name plus a set of catalog permissions. */
export const createRoleSchema = z.object({
  name: z.string().min(1, 'A role name is required').max(60),
  permissions: z.array(permissionSchema).default([]),
});
export type CreateRoleInput = z.infer<typeof createRoleSchema>;

export const updateRoleSchema = createRoleSchema.partial();
export type UpdateRoleInput = z.infer<typeof updateRoleSchema>;

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

// Correct a borrower's details. Bank account / address are edited via their own
// endpoints; omit them here. Adds the audit-only fields the import sets.
export const updateBorrowerSchema = createBorrowerSchema
  .omit({ address: true, bankAccount: true })
  .extend({
    // Email is optional when correcting imported records (many have none).
    email: z.string().email('A valid email is required').optional().or(z.literal('')),
    gender: z.string().max(40).optional().or(z.literal('')),
    payDay: z.string().max(40).optional().or(z.literal('')),
    status: z.string().max(40).optional().or(z.literal('')),
    since: z.string().optional().or(z.literal('')),
  })
  .partial();
export type UpdateBorrowerInput = z.infer<typeof updateBorrowerSchema>;

/** Curated option lists for the borrower edit form (columns stay free strings). */
export const GENDER_OPTIONS = ['Male', 'Female', 'Other'] as const;

/** Add the English ordinal suffix to a day number (1 → "1st", 22 → "22nd"). */
const ordinalDay = (n: number): string => {
  const suffix = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return `${n}${suffix[(v - 20) % 10] ?? suffix[v] ?? suffix[0]}`;
};

// "End of month" plus every calendar day (1st–31st).
export const PAY_DAY_OPTIONS: readonly string[] = [
  'End of month',
  ...Array.from({ length: 31 }, (_, i) => ordinalDay(i + 1)),
];

/** Absorb a duplicate borrower into the current one (survivor = the URL :id). */
export const mergeBorrowerSchema = z.object({
  duplicateId: z.string().min(1, 'Select a borrower to merge'),
});
export type MergeBorrowerInput = z.infer<typeof mergeBorrowerSchema>;

/** Add or replace a borrower address / bank account from the dashboard. */
export const createBorrowerAddressSchema = addressSchema;
export type CreateBorrowerAddressInput = z.infer<typeof createBorrowerAddressSchema>;
export const createBorrowerBankAccountSchema = bankAccountSchema;
export type CreateBorrowerBankAccountInput = z.infer<typeof createBorrowerBankAccountSchema>;

/** Edit an existing address / bank account in place (audit correction). */
export const updateAddressSchema = addressSchema.partial();
export type UpdateAddressInput = z.infer<typeof updateAddressSchema>;
export const updateBankAccountSchema = bankAccountSchema.partial();
export type UpdateBankAccountInput = z.infer<typeof updateBankAccountSchema>;

/**
 * Lender-wide fee settings. Levy and insurance are fractions of the loan amount
 * (e.g. 0.0103 = 1.03%); `stampDuty` and `insuranceFlat` are major N$ amounts
 * converted to cents server-side. These feed every loan's fee calculation.
 */
export const feeSettingsSchema = z.object({
  namfisaLevyRate: z.coerce.number().min(0).max(1),
  stampDuty: z.coerce.number().min(0),
  insuranceRate: z.coerce.number().min(0).max(1),
  insuranceFlat: z.coerce.number().min(0),
  monthlyRate: z.coerce.number().min(0).max(0.05).optional(),
});
export type FeeSettingsInput = z.infer<typeof feeSettingsSchema>;

/**
 * A named interest-rate plan ("product"). `interestRate` is a fraction capped at
 * the NAMFISA ceiling; promotional rates (e.g. 0.25, or 0 for an interest-free
 * loan) are expressed here. Products can be deactivated rather than deleted.
 */
export const loanProductSchema = z.object({
  name: z.string().min(1, 'A product name is required').max(80),
  loanType: z.nativeEnum(LoanType).optional(),
  interestRate: z.coerce.number().min(0).max(MAX_FINANCE_CHARGE_RATE),
  active: z.coerce.boolean().optional(),
  isDefault: z.coerce.boolean().optional(),
});
export type LoanProductInput = z.infer<typeof loanProductSchema>;

/** Edit an existing product (incl. toggling `active`). All fields optional. */
export const updateLoanProductSchema = loanProductSchema.partial();
export type UpdateLoanProductInput = z.infer<typeof updateLoanProductSchema>;

/**
 * Inputs for a loan quote preview. `amount` is in major N$ units. An optional
 * `productId` selects a rate plan; `interestRate` (fraction) overrides it for a
 * one-off promotional rate. `bankCharges` is a flat major-N$ add-on.
 */
export const loanQuoteSchema = z.object({
  loanType: z.nativeEnum(LoanType),
  amount: z.coerce.number().int().min(500, 'Minimum amount is N$ 500').max(500000),
  termMonths: z.coerce.number().int().min(1).max(MAX_TERM_MONTHS),
  productId: z.string().optional().or(z.literal('')),
  interestRate: z.coerce.number().min(0).max(MAX_FINANCE_CHARGE_RATE).optional(),
  bankCharges: z.coerce.number().min(0).optional(),
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
 * Record operational income that is not a loan repayment or owner capital (e.g.
 * recoveries, admin fees). `amount` is submitted in major Namibian Dollar units
 * and converted to cents server-side.
 */
export const createIncomeSchema = z.object({
  category: z.string().min(1, 'A category is required'),
  amount: z.coerce.number().min(0.01, 'An amount is required'),
  period: z.string().max(40).optional().or(z.literal('')),
  incurredAt: z.string().optional().or(z.literal('')),
  note: z.string().max(280).optional().or(z.literal('')),
});
export type CreateIncomeInput = z.infer<typeof createIncomeSchema>;

/** Set the lender's opening/bank balance (major N$), used by available balance. */
export const openingBalanceSchema = z.object({
  openingBalance: z.coerce.number(),
});
export type OpeningBalanceInput = z.infer<typeof openingBalanceSchema>;

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

/**
 * Correct imported loan data. All optional. "Safe" fields apply any time; the
 * financial core (`amount` = principal in major N$, `termMonths`, `interestRate`)
 * is only accepted by the server while the loan has no payments, in which case it
 * re-prices. `status` is limited to the non-terminal book states (closure goes
 * through settle / write-off / cancel). Money fees are major N$.
 */
export const updateLoanSchema = z.object({
  disbursedAt: z.string().optional().or(z.literal('')),
  nextDueAt: z.string().optional().or(z.literal('')),
  status: z
    .union([
      z.literal(LoanStatus.Active),
      z.literal(LoanStatus.Arrears),
      z.literal(LoanStatus.PartlyPaid),
    ])
    .optional(),
  collateral: z.string().max(200).optional().or(z.literal('')),
  originMonth: z.string().max(40).optional().or(z.literal('')),
  note: z.string().max(500).optional().or(z.literal('')),
  bankCharges: z.coerce.number().min(0).optional(),
  namfisaLevy: z.coerce.number().min(0).optional(),
  stampDuty: z.coerce.number().min(0).optional(),
  insurance: z.coerce.number().min(0).optional(),
  amount: z.coerce.number().int().min(500).max(500000).optional(),
  termMonths: z.coerce.number().int().min(1).max(MAX_TERM_MONTHS).optional(),
  interestRate: z.coerce.number().min(0).max(MAX_FINANCE_CHARGE_RATE).optional(),
});
export type UpdateLoanInput = z.infer<typeof updateLoanSchema>;

/** Cancel a payment-free loan (created in error / fell through); reason required. */
export const cancelLoanSchema = z.object({
  reason: z.string().min(3, 'A reason is required').max(500),
});
export type CancelLoanInput = z.infer<typeof cancelLoanSchema>;

/** White-label branding returned by GET /api/tenants/me; bridges the Prisma row to the domain shape. */
export const tenantBrandingSchema = z.object({
  slug: z.string(),
  name: z.string(),
  short: z.string(),
  accent: z.string(),
  plan: z.nativeEnum(PlanId),
});
