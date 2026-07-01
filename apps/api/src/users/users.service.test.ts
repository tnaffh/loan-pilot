import { Test } from '@nestjs/testing';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import {
  SYSTEM_ROLE_PERMISSIONS,
  UserRole,
  UserStatus,
  type SessionUser,
} from '@loan-pilot/domain';
import { UsersService } from './users.service';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { ConfigService } from '@nestjs/config';

describe('UsersService', () => {
  const userFindUnique = jest.fn();
  const userFindMany = jest.fn();
  const userCreate = jest.fn();
  const userUpdate = jest.fn();
  const userCount = jest.fn();
  const userDelete = jest.fn();
  const roleFindFirst = jest.fn();
  const sendInvite = jest.fn().mockResolvedValue(undefined);

  const prismaMock = {
    user: {
      findUnique: userFindUnique,
      findMany: userFindMany,
      create: userCreate,
      update: userUpdate,
      count: userCount,
      delete: userDelete,
    },
    role: { findFirst: roleFindFirst },
  };
  const mailMock = { sendInvite, sendPasswordReset: jest.fn() };
  const configMock = { get: (key: string) => (key === 'DASHBOARD_URL' ? 'https://pilot.example.com' : undefined) };

  let service: UsersService;

  const admin: SessionUser = {
    id: 'admin_1',
    email: 'admin@rfs.na',
    name: 'Admin',
    role: UserRole.LenderAdmin,
    tenantId: 'tenant_1',
    tenantSlug: 'rfs',
    roleId: 'role_admin',
    permissions: [...SYSTEM_ROLE_PERMISSIONS.administrator],
  };

  const staffRole = {
    id: 'role_staff',
    tenantId: 'tenant_1',
    name: 'Staff',
    permissions: SYSTEM_ROLE_PERMISSIONS.staff,
    isSystem: true,
    key: 'staff',
  };
  const managerRole = { permissions: ['users:manage'] };

  beforeEach(async () => {
    jest.clearAllMocks();
    userCreate.mockImplementation((args: { data: Record<string, unknown> }) =>
      Promise.resolve({ id: 'user_new', accounts: [], customRole: staffRole, createdAt: new Date(), ...args.data }),
    );
    const moduleRef = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: MailService, useValue: mailMock },
        { provide: ConfigService, useValue: configMock },
      ],
    }).compile();
    service = moduleRef.get(UsersService);
  });

  it('invites a user with the assigned role, emails them and returns an accept URL', async () => {
    roleFindFirst.mockResolvedValue(staffRole);
    userFindUnique.mockResolvedValue(null); // email unused
    const result = await service.invite(admin, {
      name: 'Sam Staff',
      email: 'sam@rfs.na',
      roleId: 'role_staff',
    });
    const created = userCreate.mock.calls[0][0].data;
    expect(created.status).toBe(UserStatus.Invited);
    expect(created.tenantId).toBe('tenant_1');
    expect(created.roleId).toBe('role_staff');
    expect(created.role).toBe(UserRole.LenderStaff); // staff role lacks users:manage
    expect(sendInvite).toHaveBeenCalled();
    expect(result.acceptUrl).toContain('https://pilot.example.com/invite/accept?token=');
  });

  it('forbids assigning a role from another tenant', async () => {
    roleFindFirst.mockResolvedValue(null); // role not in the actor's tenant
    await expect(
      service.invite(admin, { name: 'X', email: 'x@rfs.na', roleId: 'role_other' }),
    ).rejects.toThrow(ForbiddenException);
    expect(userCreate).not.toHaveBeenCalled();
  });

  it('requires a role when inviting a lender user', async () => {
    await expect(service.invite(admin, { name: 'X', email: 'x@rfs.na' })).rejects.toThrow(
      BadRequestException,
    );
  });

  it('rejects inviting an email that already exists', async () => {
    roleFindFirst.mockResolvedValue(staffRole);
    userFindUnique.mockResolvedValue({ id: 'existing' });
    await expect(
      service.invite(admin, { name: 'Dup', email: 'dup@rfs.na', roleId: 'role_staff' }),
    ).rejects.toThrow();
  });

  it('blocks disabling the last active user manager', async () => {
    userFindUnique.mockResolvedValue({
      id: 'admin_2',
      tenantId: 'tenant_1',
      role: UserRole.LenderAdmin,
      roleId: 'role_admin',
      status: UserStatus.Active,
      customRole: managerRole,
    });
    userCount.mockResolvedValue(0); // no other active managers
    await expect(
      service.update(admin, 'admin_2', { status: UserStatus.Disabled }),
    ).rejects.toThrow(BadRequestException);
    expect(userUpdate).not.toHaveBeenCalled();
  });

  it('prevents deleting your own account', async () => {
    userFindUnique.mockResolvedValue({
      id: 'admin_1',
      tenantId: 'tenant_1',
      role: UserRole.LenderAdmin,
      roleId: 'role_admin',
      status: UserStatus.Active,
      customRole: managerRole,
    });
    await expect(service.remove(admin, 'admin_1')).rejects.toThrow(BadRequestException);
    expect(userDelete).not.toHaveBeenCalled();
  });

  it('hides users from other tenants (out of scope = not found)', async () => {
    userFindUnique.mockResolvedValue({
      id: 'other',
      tenantId: 'tenant_2',
      role: UserRole.LenderStaff,
      roleId: 'role_x',
      status: UserStatus.Active,
      customRole: staffRole,
    });
    await expect(service.update(admin, 'other', { name: 'Nope' })).rejects.toThrow(NotFoundException);
  });
});
