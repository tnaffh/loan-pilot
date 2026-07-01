import type { Prisma } from '@prisma/client';
import {
  ALL_PERMISSIONS,
  UserRole,
  isPermission,
  type Permission,
  type SessionUser,
} from '@loan-pilot/domain';

/** Everything needed to build a SessionUser: the tenant slug and the custom
 * role's permission set. Shared by the login flow and the JWT strategy so the
 * session shape is resolved in exactly one place. */
export const USER_SESSION_INCLUDE = {
  tenant: true,
  customRole: true,
} satisfies Prisma.UserInclude;

export type UserForSession = Prisma.UserGetPayload<{ include: typeof USER_SESSION_INCLUDE }>;

/** Prisma returns the role column as a string literal; map it to the domain enum. */
const ROLE_MAP: Record<string, UserRole> = {
  platform: UserRole.Platform,
  lender_admin: UserRole.LenderAdmin,
  lender_staff: UserRole.LenderStaff,
  borrower: UserRole.Borrower,
};

/**
 * Resolve a user's effective permissions: platform operators implicitly hold
 * every permission; borrowers hold none; lender users inherit their custom
 * role's set (unknown keys are dropped defensively).
 */
const resolvePermissions = (user: UserForSession, role: UserRole): Permission[] => {
  if (role === UserRole.Platform) {
    return [...ALL_PERMISSIONS];
  }
  if (role === UserRole.Borrower) {
    return [];
  }
  return (user.customRole?.permissions ?? []).filter(isPermission);
};

/** Build the SessionUser carried on the request / issued in the login response. */
export const buildSessionUser = (user: UserForSession): SessionUser => {
  const role = ROLE_MAP[user.role] ?? UserRole.Borrower;
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role,
    tenantId: user.tenantId,
    tenantSlug: user.tenant?.slug ?? null,
    roleId: user.roleId,
    permissions: resolvePermissions(user, role),
  };
};
