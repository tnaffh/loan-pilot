import { Test } from '@nestjs/testing';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { UserRole, UserStatus, type SessionUser } from '@loan-pilot/domain';
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
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    userCreate.mockImplementation((args: { data: Record<string, unknown> }) =>
      Promise.resolve({ id: 'user_new', accounts: [], createdAt: new Date(), ...args.data }),
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

  it('invites a staff user, emails them and returns an accept URL', async () => {
    userFindUnique.mockResolvedValue(null); // email unused
    const result = await service.invite(admin, {
      name: 'Sam Staff',
      email: 'sam@rfs.na',
      role: UserRole.LenderStaff,
    });
    const created = userCreate.mock.calls[0][0].data;
    expect(created.status).toBe(UserStatus.Invited);
    expect(created.tenantId).toBe('tenant_1');
    expect(created.inviteTokenHash).toEqual(expect.any(String));
    expect(sendInvite).toHaveBeenCalled();
    expect(result.acceptUrl).toContain('https://pilot.example.com/invite/accept?token=');
  });

  it('forbids a lender admin from assigning the platform role', async () => {
    await expect(
      service.invite(admin, { name: 'X', email: 'x@rfs.na', role: UserRole.Platform }),
    ).rejects.toThrow(ForbiddenException);
    expect(userCreate).not.toHaveBeenCalled();
  });

  it('rejects inviting an email that already exists', async () => {
    userFindUnique.mockResolvedValue({ id: 'existing' });
    await expect(
      service.invite(admin, { name: 'Dup', email: 'dup@rfs.na', role: UserRole.LenderStaff }),
    ).rejects.toThrow();
  });

  it('blocks disabling the last active admin', async () => {
    userFindUnique.mockResolvedValue({
      id: 'admin_2',
      tenantId: 'tenant_1',
      role: UserRole.LenderAdmin,
      status: UserStatus.Active,
    });
    userCount.mockResolvedValue(0); // no other active admins
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
      status: UserStatus.Active,
    });
    await expect(service.remove(admin, 'admin_1')).rejects.toThrow(BadRequestException);
    expect(userDelete).not.toHaveBeenCalled();
  });

  it('hides users from other tenants (out of scope = not found)', async () => {
    userFindUnique.mockResolvedValue({
      id: 'other',
      tenantId: 'tenant_2',
      role: UserRole.LenderStaff,
      status: UserStatus.Active,
    });
    await expect(service.update(admin, 'other', { name: 'Nope' })).rejects.toThrow(NotFoundException);
  });
});
