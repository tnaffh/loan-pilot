import { UserRole } from './enums';

/** The authenticated user shape returned by the API and stored client-side. */
export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  tenantId: string | null;
  tenantSlug: string | null;
}

export const LENDER_ROLES: readonly UserRole[] = [UserRole.LenderAdmin, UserRole.LenderStaff];

export const isPlatform = (role: UserRole): boolean => role === UserRole.Platform;

export const isLender = (role: UserRole): boolean => LENDER_ROLES.includes(role);

export const isBorrower = (role: UserRole): boolean => role === UserRole.Borrower;
