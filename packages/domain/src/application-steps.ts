import { AffordabilityResult, DocumentKind, EmploymentType, LoanType } from './enums';

/**
 * The public application's step structure, shared by the website form and the
 * mobile app so both walk applicants through the same five screens and gate
 * each one on the same fields of `createApplicationSchema`.
 */
export const APPLICATION_STEPS = [
  'Your loan',
  'Personal',
  'Employment & bank',
  'References & docs',
  'Review & sign',
] as const;

/** The form fields validated before leaving each step (react-hook-form paths). */
export const APPLICATION_STEP_FIELDS = [
  [
    'loanType',
    'amount',
    'termMonths',
    'purpose',
    'purposeCategory',
    'collateral.item',
    'collateral.identifier',
    'collateral.description',
    'collateral.condition',
    'collateral.estimatedValue',
  ],
  [
    'firstName',
    'lastName',
    'idNumber',
    'dateOfBirth',
    'phone',
    'email',
    'address.street',
    'address.city',
    'address.country',
    'postalSameAsResidential',
    'postalAddress',
    'maritalStatus',
    'gender',
  ],
  [
    'employmentType',
    'employer',
    'employerPhone',
    'employerAddress',
    'employeeNo',
    'occupation',
    'monthlyIncome',
    'bankAccount.bankName',
    'bankAccount.accountNumber',
    'bankAccount.accountHolderName',
    'bankAccount.accountType',
  ],
  ['references', 'consent'],
  ['tcAccepted', 'tcVersion', 'signature', 'initials'],
] as const;

export interface ApplicationDocumentSlot {
  kind: DocumentKind;
  label: string;
  required?: boolean;
}

/** Supporting documents uploaded alongside an application (outside the zod payload). */
export const APPLICATION_DOCUMENT_SLOTS: readonly ApplicationDocumentSlot[] = [
  { kind: DocumentKind.IdDocument, label: 'ID / passport copy', required: true },
  { kind: DocumentKind.Payslip, label: 'Latest payslip', required: true },
  { kind: DocumentKind.BankStatement, label: '3-month bank statement', required: true },
  { kind: DocumentKind.ProofOfResidence, label: 'Proof of residence' },
];

/**
 * Whether a document slot is required for the loan type. Collateral loans make
 * the payslip and bank statement optional: the pledged asset secures the loan.
 */
export const isDocumentSlotRequired = (
  slot: ApplicationDocumentSlot,
  loanType: LoanType,
): boolean =>
  Boolean(slot.required) &&
  !(
    loanType === LoanType.Collateral &&
    (slot.kind === DocumentKind.Payslip || slot.kind === DocumentKind.BankStatement)
  );

export const EMPLOYMENT_TYPE_OPTIONS: readonly { value: EmploymentType; label: string }[] = [
  { value: EmploymentType.PermanentlyEmployed, label: 'Permanently employed' },
  { value: EmploymentType.CivilServant, label: 'Civil servant' },
  { value: EmploymentType.SelfEmployed, label: 'Self-employed' },
  { value: EmploymentType.Contract, label: 'Contract' },
  { value: EmploymentType.Pensioner, label: 'Pensioner' },
];

export const BANK_ACCOUNT_TYPES = ['Savings', 'Cheque', 'Transmission'] as const;

export const MARITAL_STATUS_OPTIONS = [
  'Single',
  'Married',
  'Divorced',
  'Widowed',
  'Other',
] as const;

/** Applicant-facing wording for the affordability outcome returned on submit. */
export const AFFORDABILITY_OUTCOME_COPY: Record<`${AffordabilityResult}`, string> = {
  [AffordabilityResult.Pass]:
    'Great news — based on what you told us, this loan looks comfortably affordable.',
  [AffordabilityResult.Review]:
    'Your application needs a quick manual review by our team. We will be in touch shortly.',
  [AffordabilityResult.Fail]:
    'Based on the income provided, this amount may stretch your budget. Our team will suggest a more affordable option.',
};
