import { PlanId, UserRole } from './enums';

/** The authenticated user shape returned by the API and stored client-side. */
export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  tenantId: string | null;
  tenantSlug: string | null;
}

/** White-label branding for the authenticated user's tenant (null for platform). */
export interface TenantBranding {
  slug: string;
  name: string;
  short: string;
  accent: string;
  plan: PlanId;
}

export const LENDER_ROLES: readonly UserRole[] = [UserRole.LenderAdmin, UserRole.LenderStaff];

export const isPlatform = (role: UserRole): boolean => role === UserRole.Platform;

export const isLender = (role: UserRole): boolean => LENDER_ROLES.includes(role);

export const isBorrower = (role: UserRole): boolean => role === UserRole.Borrower;

/** Roles allowed into the user-management admin section. */
export const canManageUsers = (role: UserRole): boolean =>
  role === UserRole.Platform || role === UserRole.LenderAdmin;

/**
 * The roles a given actor may assign to (or create) other users:
 * a tenant admin manages lender staff/admins; a platform operator manages
 * platform operators. Used by both the API (enforcement) and the dashboard
 * (which role options to show).
 */
export const assignableRoles = (actorRole: UserRole): UserRole[] => {
  if (actorRole === UserRole.Platform) {
    return [UserRole.Platform];
  }
  if (actorRole === UserRole.LenderAdmin) {
    return [UserRole.LenderAdmin, UserRole.LenderStaff];
  }
  return [];
};
