import { z } from 'zod';
import { EmploymentType, LoanType } from './enums';
import { MAX_TERM_MONTHS } from './loan-math';

/** A personal reference, as required by the loan agreement (minimum two). */
export const referenceSchema = z.object({
  name: z.string().min(2, 'Reference name is required'),
  phone: z.string().min(6, 'Reference phone is required'),
});
export type ReferenceInput = z.infer<typeof referenceSchema>;

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
  idNumber: z.string().min(6, 'A valid ID or passport number is required'),
  dateOfBirth: z.string().min(4, 'Date of birth is required'),
  phone: z.string().min(6, 'A contact number is required'),
  email: z.string().email('A valid email is required'),
  address: z.string().min(4, 'Residential address is required'),
  maritalStatus: z.string().optional().or(z.literal('')),

  // Step 3 — employment & bank
  employmentType: z.nativeEnum(EmploymentType),
  employer: z.string().min(1, 'Employer is required'),
  occupation: z.string().min(1, 'Occupation is required'),
  monthlyIncome: z.coerce.number().int().min(1, 'Monthly income is required'),
  bank: z.string().min(1, 'Bank is required'),
  accountType: z.string().min(1, 'Account type is required'),

  // Step 4 — references & consent
  references: z.array(referenceSchema).min(2, 'Two references are required').max(4),
  consent: z.literal(true, {
    errorMap: () => ({ message: 'You must agree to the terms to continue' }),
  }),
});
export type CreateApplicationInput = z.infer<typeof createApplicationSchema>;

/** Credentials for the authenticated dashboard (used from Phase 2). */
export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});
export type LoginInput = z.infer<typeof loginSchema>;
