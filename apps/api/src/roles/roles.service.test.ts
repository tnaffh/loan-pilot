import { Test } from '@nestjs/testing';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { UserRole, type SessionUser } from '@loan-pilot/domain';
import { RolesService } from './roles.service';
import { PrismaService } from '../prisma/prisma.service';

describe('RolesService', () => {
  const roleFindFirst = jest.fn();
  const roleCreate = jest.fn();
  const roleUpdate = jest.fn();
  const roleDelete = jest.fn();
  const roleFindMany = jest.fn();

  const prismaMock = {
    role: {
      findFirst: roleFindFirst,
      findMany: roleFindMany,
      create: roleCreate,
      update: roleUpdate,
      delete: roleDelete,
    },
  };

  let service: RolesService;

  const admin: SessionUser = {
    id: 'admin_1',
    email: 'admin@rfs.na',
    name: 'Admin',
    role: UserRole.LenderAdmin,
    tenantId: 'tenant_1',
    tenantSlug: 'rfs',
    roleId: 'role_admin',
    permissions: ['roles:manage'],
  };

  const systemRole = (over: Record<string, unknown> = {}) => ({
    id: 'role_sys',
    tenantId: 'tenant_1',
    name: 'Administrator',
    permissions: ['loans:read'],
    isSystem: true,
    key: 'administrator',
    createdAt: new Date(),
    _count: { users: 0 },
    ...over,
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [RolesService, { provide: PrismaService, useValue: prismaMock }],
    }).compile();
    service = moduleRef.get(RolesService);
  });

  it('blocks editing a system role', async () => {
    roleFindFirst.mockResolvedValue(systemRole());
    await expect(service.update(admin, 'role_sys', { name: 'X' })).rejects.toThrow(ForbiddenException);
    expect(roleUpdate).not.toHaveBeenCalled();
  });

  it('blocks deleting a system role', async () => {
    roleFindFirst.mockResolvedValue(systemRole());
    await expect(service.remove(admin, 'role_sys')).rejects.toThrow(ForbiddenException);
    expect(roleDelete).not.toHaveBeenCalled();
  });

  it('blocks deleting a role that still has members', async () => {
    roleFindFirst.mockResolvedValue(
      systemRole({ isSystem: false, key: null, name: 'Collections', _count: { users: 2 } }),
    );
    await expect(service.remove(admin, 'role_x')).rejects.toThrow(BadRequestException);
    expect(roleDelete).not.toHaveBeenCalled();
  });

  it('clones a role into a new editable custom role', async () => {
    roleFindFirst.mockResolvedValue(systemRole({ permissions: ['loans:read', 'loans:write'] }));
    roleFindMany.mockResolvedValue([{ name: 'Administrator' }]);
    roleCreate.mockResolvedValue(
      systemRole({ id: 'role_clone', isSystem: false, key: null, name: 'Administrator (copy)' }),
    );
    const row = await service.clone(admin, 'role_sys');
    expect(roleCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          name: 'Administrator (copy)',
          permissions: ['loans:read', 'loans:write'],
          isSystem: false,
        }),
      }),
    );
    expect(row.isSystem).toBe(false);
  });

  it('hides roles from other tenants (out of scope = not found)', async () => {
    roleFindFirst.mockResolvedValue(null);
    await expect(service.update(admin, 'role_other', { name: 'X' })).rejects.toThrow(NotFoundException);
  });
});
