import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Prisma, Role } from '@prisma/client';
import {
  UserRole,
  UserStatus,
  type InviteUserInput,
  type SessionUser,
  type UpdateUserInput,
} from '@loan-pilot/domain';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { hashToken, newToken } from '../common/tokens';
import { requireTenantId } from '../common/tenant';

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export interface UserRow {
  id: string;
  name: string;
  email: string;
  role: string;
  roleId: string | null;
  roleName: string | null;
  status: string;
  image: string | null;
  hasPassword: boolean;
  providers: string[];
  lastLoginAt: string | null;
  createdAt: string;
}

type UserWithDetail = Prisma.UserGetPayload<{ include: { accounts: true; customRole: true } }>;
type UserWithRole = Prisma.UserGetPayload<{ include: { customRole: true } }>;

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly config: ConfigService,
  ) {}

  /** Users the actor administers: their tenant's staff, or platform operators. */
  async findAllForScope(actor: SessionUser): Promise<UserRow[]> {
    const where: Prisma.UserWhereInput =
      actor.role === UserRole.Platform
        ? { tenantId: null, role: UserRole.Platform }
        : { tenantId: actor.tenantId, role: { in: [UserRole.LenderAdmin, UserRole.LenderStaff] } };
    const users = await this.prisma.user.findMany({
      where,
      include: { accounts: true, customRole: true },
      orderBy: { createdAt: 'asc' },
    });
    return users.map((user) => this.toRow(user));
  }

  async invite(
    actor: SessionUser,
    input: InviteUserInput,
  ): Promise<{ user: UserRow; acceptUrl: string }> {
    const assignment = await this.resolveAssignment(actor, input.roleId);

    const existing = await this.prisma.user.findUnique({ where: { email: input.email } });
    if (existing) {
      throw new ConflictException('A user with this email already exists');
    }

    const token = newToken();
    const user = await this.prisma.user.create({
      data: {
        email: input.email,
        name: input.name,
        role: assignment.role,
        roleId: assignment.roleId,
        status: UserStatus.Invited,
        passwordHash: null,
        tenantId: assignment.tenantId,
        invitedById: actor.id,
        inviteTokenHash: hashToken(token),
        inviteExpiresAt: new Date(Date.now() + INVITE_TTL_MS),
      },
      include: { accounts: true, customRole: true },
    });

    const acceptUrl = `${this.dashboardUrl()}/invite/accept?token=${token}`;
    await this.mail.sendInvite(user.email, user.name, acceptUrl);
    return { user: this.toRow(user), acceptUrl };
  }

  async update(actor: SessionUser, id: string, input: UpdateUserInput): Promise<UserRow> {
    const target = await this.requireInScope(actor, id);
    const data: Prisma.UserUpdateInput = {};

    if (input.name) {
      data.name = input.name;
    }

    if (input.roleId && input.roleId !== target.roleId) {
      if (actor.role === UserRole.Platform) {
        throw new BadRequestException('Platform operators do not have assignable roles');
      }
      if (target.id === actor.id) {
        throw new BadRequestException('You cannot change your own role');
      }
      const role = await this.requireAssignableRole(actor, input.roleId);
      // Block a demotion that would leave the tenant with no user manager.
      if (hasUserManage(target.customRole) && !role.permissions.includes('users:manage')) {
        await this.assertNotLastUserManager(target);
      }
      data.customRole = { connect: { id: role.id } };
      data.role = role.permissions.includes('users:manage')
        ? UserRole.LenderAdmin
        : UserRole.LenderStaff;
    }

    if (input.status && input.status !== target.status) {
      if (target.id === actor.id) {
        throw new BadRequestException('You cannot change your own status');
      }
      if (input.status === UserStatus.Disabled) {
        await this.assertNotLastUserManager(target);
      }
      data.status = input.status;
    }

    const updated = await this.prisma.user.update({
      where: { id },
      data,
      include: { accounts: true, customRole: true },
    });
    return this.toRow(updated);
  }

  async resendInvite(actor: SessionUser, id: string): Promise<{ acceptUrl: string }> {
    const target = await this.requireInScope(actor, id);
    if (target.status !== UserStatus.Invited) {
      throw new BadRequestException('This user has already accepted their invitation');
    }
    const token = newToken();
    await this.prisma.user.update({
      where: { id },
      data: { inviteTokenHash: hashToken(token), inviteExpiresAt: new Date(Date.now() + INVITE_TTL_MS) },
    });
    const acceptUrl = `${this.dashboardUrl()}/invite/accept?token=${token}`;
    await this.mail.sendInvite(target.email, target.name, acceptUrl);
    return { acceptUrl };
  }

  async remove(actor: SessionUser, id: string): Promise<void> {
    const target = await this.requireInScope(actor, id);
    if (target.id === actor.id) {
      throw new BadRequestException('You cannot delete your own account');
    }
    await this.assertNotLastUserManager(target);
    await this.prisma.user.delete({ where: { id } });
  }

  // ----- helpers -------------------------------------------------------------

  private dashboardUrl(): string {
    return (this.config.get<string>('DASHBOARD_URL') ?? 'http://localhost:3001').replace(/\/+$/, '');
  }

  /** Resolve the account-type, tenant, and custom role for a new invite. */
  private async resolveAssignment(
    actor: SessionUser,
    roleId?: string,
  ): Promise<{ role: UserRole; roleId: string | null; tenantId: string | null }> {
    if (actor.role === UserRole.Platform) {
      return { role: UserRole.Platform, roleId: null, tenantId: null };
    }
    if (!roleId) {
      throw new BadRequestException('Select a role for this member');
    }
    const role = await this.requireAssignableRole(actor, roleId);
    return {
      role: role.permissions.includes('users:manage') ? UserRole.LenderAdmin : UserRole.LenderStaff,
      roleId: role.id,
      tenantId: requireTenantId(actor),
    };
  }

  /** A role must belong to the actor's tenant to be assignable. */
  private async requireAssignableRole(actor: SessionUser, roleId: string): Promise<Role> {
    const role = await this.prisma.role.findFirst({
      where: { id: roleId, tenantId: requireTenantId(actor) },
    });
    if (!role) {
      throw new ForbiddenException('That role is not available in your team');
    }
    return role;
  }

  /** Load a user and confirm the actor administers it (same tenant / platform). */
  private async requireInScope(actor: SessionUser, id: string): Promise<UserWithRole> {
    const target = await this.prisma.user.findUnique({ where: { id }, include: { customRole: true } });
    if (!target) {
      throw new NotFoundException('User not found');
    }
    const inScope =
      actor.role === UserRole.Platform
        ? target.tenantId === null && target.role === UserRole.Platform
        : target.tenantId === actor.tenantId &&
          (target.role === UserRole.LenderAdmin || target.role === UserRole.LenderStaff);
    if (!inScope) {
      throw new NotFoundException('User not found');
    }
    return target;
  }

  /** Block removing/disabling/demoting the last active user who can manage users. */
  private async assertNotLastUserManager(target: UserWithRole): Promise<void> {
    if (target.status !== UserStatus.Active || !hasUserManage(target.customRole)) {
      return;
    }
    const others = await this.prisma.user.count({
      where: {
        tenantId: target.tenantId,
        status: UserStatus.Active,
        id: { not: target.id },
        customRole: { permissions: { has: 'users:manage' } },
      },
    });
    if (others === 0) {
      throw new BadRequestException('A tenant must keep at least one member who can manage users');
    }
  }

  private toRow(user: UserWithDetail): UserRow {
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      roleId: user.roleId,
      roleName: user.customRole?.name ?? null,
      status: user.status,
      image: user.image,
      hasPassword: user.passwordHash !== null,
      providers: user.accounts.map((account) => account.provider),
      lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
      createdAt: user.createdAt.toISOString(),
    };
  }
}

/** True when a user's custom role grants the user-management permission. */
const hasUserManage = (role: { permissions: string[] } | null): boolean =>
  role?.permissions.includes('users:manage') ?? false;
