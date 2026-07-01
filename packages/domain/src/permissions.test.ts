import { ALL_PERMISSIONS, PERMISSIONS, SYSTEM_ROLE_PERMISSIONS, isPermission } from './permissions';
import { UserRole } from './enums';
import { hasPermission, type SessionUser } from './auth';

const user = (over: Partial<SessionUser>): SessionUser => ({
  id: 'u',
  email: 'u@x.na',
  name: 'U',
  role: UserRole.LenderStaff,
  tenantId: 't',
  tenantSlug: 's',
  roleId: 'r',
  permissions: [],
  ...over,
});

describe('permissions catalog', () => {
  it('has unique keys and a matching ALL_PERMISSIONS', () => {
    expect(new Set(PERMISSIONS).size).toBe(PERMISSIONS.length);
    expect(ALL_PERMISSIONS).toEqual(PERMISSIONS);
  });

  it('narrows known keys with isPermission', () => {
    expect(isPermission('loans:write')).toBe(true);
    expect(isPermission('nonsense')).toBe(false);
  });

  it('Administrator holds every permission; Staff is a strict subset without finance/admin', () => {
    expect(SYSTEM_ROLE_PERMISSIONS.administrator).toEqual([...PERMISSIONS]);
    for (const permission of SYSTEM_ROLE_PERMISSIONS.staff) {
      expect(SYSTEM_ROLE_PERMISSIONS.administrator).toContain(permission);
    }
    expect(SYSTEM_ROLE_PERMISSIONS.staff.length).toBeLessThan(PERMISSIONS.length);
    for (const denied of ['finance:read', 'finance:write', 'settings:write', 'users:manage', 'roles:manage'] as const) {
      expect(SYSTEM_ROLE_PERMISSIONS.staff).not.toContain(denied);
    }
  });
});

describe('hasPermission', () => {
  it('grants platform operators every permission implicitly', () => {
    const platform = user({ role: UserRole.Platform, permissions: [] });
    for (const permission of PERMISSIONS) {
      expect(hasPermission(platform, permission)).toBe(true);
    }
  });

  it('grants borrowers nothing', () => {
    const borrower = user({ role: UserRole.Borrower, permissions: [] });
    expect(hasPermission(borrower, 'loans:read')).toBe(false);
  });

  it('checks lender users against their resolved set', () => {
    const staff = user({ permissions: [...SYSTEM_ROLE_PERMISSIONS.staff] });
    expect(hasPermission(staff, 'loans:write')).toBe(true);
    expect(hasPermission(staff, 'finance:read')).toBe(false);
    expect(hasPermission(staff, 'users:manage')).toBe(false);
  });
});
