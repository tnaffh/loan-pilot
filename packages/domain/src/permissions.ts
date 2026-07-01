/**
 * Granular permission catalog shared by the API (enforcement via the
 * PermissionsGuard) and the dashboard (UX gating via `can()`). Permissions are
 * fixed code constants — NOT database rows. Custom roles hold a subset of these
 * keys; the two built-in system roles (Administrator, Staff) are seeded per
 * tenant from {@link SYSTEM_ROLE_PERMISSIONS}.
 *
 * Each key maps to the `@Roles(...)` gate it replaces:
 *   loans:write      quote / create / repayments / settle
 *   loans:manage     edit / cancel / write-off (admin-only, destructive)
 *   borrowers:manage merge duplicates (admin-only)
 *   finance:*        expenses / income / investments + levies report
 *   settings:write   fee, opening-balance, and product mutations
 *   reports:read     lender series + financial detail on the overview
 */
export const PERMISSIONS = [
  'loans:read',
  'loans:write',
  'loans:manage',
  'borrowers:read',
  'borrowers:write',
  'borrowers:manage',
  'applications:read',
  'applications:write',
  'applications:decide',
  'payments:read',
  'payments:write',
  'finance:read',
  'finance:write',
  'settings:read',
  'settings:write',
  'reports:read',
  'users:manage',
  'roles:manage',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

export const ALL_PERMISSIONS: readonly Permission[] = PERMISSIONS;

const PERMISSION_SET: ReadonlySet<string> = new Set(PERMISSIONS);

/** Narrow an arbitrary string (e.g. a DB column value) to a known Permission. */
export const isPermission = (value: string): value is Permission => PERMISSION_SET.has(value);

export const PERMISSION_LABELS: Record<Permission, string> = {
  'loans:read': 'View loans',
  'loans:write': 'Create loans & record repayments',
  'loans:manage': 'Edit, cancel & write off loans',
  'borrowers:read': 'View borrowers',
  'borrowers:write': 'Create & edit borrowers',
  'borrowers:manage': 'Merge duplicate borrowers',
  'applications:read': 'View applications',
  'applications:write': 'Capture applications',
  'applications:decide': 'Approve & decline applications',
  'payments:read': 'View payments',
  'payments:write': 'Record payments',
  'finance:read': 'View finance (income, expenses, drawings, levies)',
  'finance:write': 'Manage finance entries',
  'settings:read': 'View rates & fees',
  'settings:write': 'Edit rates, fees & products',
  'reports:read': 'View reports & analytics',
  'users:manage': 'Manage team members',
  'roles:manage': 'Manage roles & permissions',
};

export interface PermissionGroup {
  label: string;
  permissions: Permission[];
}

/** Logical grouping for the roles permission-toggle matrix. */
export const PERMISSION_GROUPS: PermissionGroup[] = [
  { label: 'Loans', permissions: ['loans:read', 'loans:write', 'loans:manage'] },
  { label: 'Borrowers', permissions: ['borrowers:read', 'borrowers:write', 'borrowers:manage'] },
  {
    label: 'Applications',
    permissions: ['applications:read', 'applications:write', 'applications:decide'],
  },
  { label: 'Payments', permissions: ['payments:read', 'payments:write'] },
  { label: 'Finance', permissions: ['finance:read', 'finance:write'] },
  { label: 'Settings', permissions: ['settings:read', 'settings:write'] },
  { label: 'Reports', permissions: ['reports:read'] },
  { label: 'Administration', permissions: ['users:manage', 'roles:manage'] },
];

/** Stable keys for the two non-deletable built-in roles seeded per tenant. */
export type SystemRoleKey = 'administrator' | 'staff';

export const SYSTEM_ROLE_LABELS: Record<SystemRoleKey, string> = {
  administrator: 'Administrator',
  staff: 'Staff',
};

/** Staff mirrors the previous `lender_staff` capability exactly. */
const STAFF_PERMISSIONS: Permission[] = [
  'loans:read',
  'loans:write',
  'borrowers:read',
  'borrowers:write',
  'applications:read',
  'applications:write',
  'applications:decide',
  'payments:read',
  'payments:write',
  'settings:read',
  'reports:read',
];

/** Permission sets for the built-in roles — single-sourced so the migration,
 * seed, and backfill all agree (a drift test asserts this). */
export const SYSTEM_ROLE_PERMISSIONS: Record<SystemRoleKey, Permission[]> = {
  administrator: [...PERMISSIONS],
  staff: STAFF_PERMISSIONS,
};
