import { PlanId, UserRole } from './enums';
import type { Permission } from './permissions';

/** The authenticated user shape returned by the API and stored client-side. */
export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  tenantId: string | null;
  tenantSlug: string | null;
  /** The custom role assigned to a lender user (null for platform/borrower). */
  roleId: string | null;
  /** Resolved capability set; platform implicitly holds every permission. */
  permissions: Permission[];
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
 * The single source of truth for capability checks, used by BOTH the API guard
 * and the dashboard. Platform operators pass every permission implicitly;
 * everyone else is checked against their resolved permission set (borrowers
 * carry an empty set, so lender permissions never apply to them).
 */
export const hasPermission = (
  user: Pick<SessionUser, 'role' | 'permissions'>,
  permission: Permission,
): boolean => isPlatform(user.role) || user.permissions.includes(permission);

export const hasAnyPermission = (
  user: Pick<SessionUser, 'role' | 'permissions'>,
  ...permissions: Permission[]
): boolean => permissions.some((permission) => hasPermission(user, permission));

/** Convenience alias mirroring the dashboard's `can(user, permission)` call site. */
export const can = hasPermission;

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
