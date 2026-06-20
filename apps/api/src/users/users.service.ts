import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Prisma, User } from '@prisma/client';
import {
  UserRole,
  UserStatus,
  assignableRoles,
  type InviteUserInput,
  type SessionUser,
  type UpdateUserInput,
} from '@loan-pilot/domain';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { hashToken, newToken } from '../common/tokens';

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export interface UserRow {
  id: string;
  name: string;
  email: string;
  role: string;
  status: string;
  image: string | null;
  hasPassword: boolean;
  providers: string[];
  lastLoginAt: string | null;
  createdAt: string;
}

type UserWithAccounts = Prisma.UserGetPayload<{ include: { accounts: true } }>;

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
      include: { accounts: true },
      orderBy: { createdAt: 'asc' },
    });
    return users.map((user) => this.toRow(user));
  }

  async invite(
    actor: SessionUser,
    input: InviteUserInput,
  ): Promise<{ user: UserRow; acceptUrl: string }> {
    this.assertCanAssign(actor, input.role);

    const existing = await this.prisma.user.findUnique({ where: { email: input.email } });
    if (existing) {
      throw new ConflictException('A user with this email already exists');
    }

    const token = newToken();
    const user = await this.prisma.user.create({
      data: {
        email: input.email,
        name: input.name,
        role: input.role,
        status: UserStatus.Invited,
        passwordHash: null,
        tenantId: actor.role === UserRole.Platform ? null : actor.tenantId,
        invitedById: actor.id,
        inviteTokenHash: hashToken(token),
        inviteExpiresAt: new Date(Date.now() + INVITE_TTL_MS),
      },
      include: { accounts: true },
    });

    const acceptUrl = `${this.dashboardUrl()}/invite/accept?token=${token}`;
    await this.mail.sendInvite(user.email, user.name, acceptUrl);
    return { user: this.toRow(user), acceptUrl };
  }

  async update(actor: SessionUser, id: string, input: UpdateUserInput): Promise<UserRow> {
    const target = await this.requireInScope(actor, id);

    if (input.role && input.role !== target.role) {
      this.assertCanAssign(actor, input.role);
      if (target.id === actor.id) {
        throw new BadRequestException('You cannot change your own role');
      }
      await this.assertNotLastAdmin(target);
    }
    if (input.status && input.status !== target.status) {
      if (target.id === actor.id) {
        throw new BadRequestException('You cannot change your own status');
      }
      if (input.status === UserStatus.Disabled) {
        await this.assertNotLastAdmin(target);
      }
    }

    const updated = await this.prisma.user.update({
      where: { id },
      data: {
        name: input.name ?? undefined,
        role: input.role ?? undefined,
        status: input.status ?? undefined,
      },
      include: { accounts: true },
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
    await this.assertNotLastAdmin(target);
    await this.prisma.user.delete({ where: { id } });
  }

  // ----- helpers -------------------------------------------------------------

  private dashboardUrl(): string {
    return (this.config.get<string>('DASHBOARD_URL') ?? 'http://localhost:3001').replace(/\/+$/, '');
  }

  private assertCanAssign(actor: SessionUser, role: UserRole): void {
    if (!assignableRoles(actor.role).includes(role)) {
      throw new ForbiddenException('You cannot assign this role');
    }
  }

  /** Load a user and confirm the actor administers it (same tenant / platform). */
  private async requireInScope(actor: SessionUser, id: string): Promise<User> {
    const target = await this.prisma.user.findUnique({ where: { id } });
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

  /** Block removing/disabling/demoting the last active admin of a tenant. */
  private async assertNotLastAdmin(target: User): Promise<void> {
    if (target.role !== UserRole.LenderAdmin || target.status !== UserStatus.Active) {
      return;
    }
    const otherAdmins = await this.prisma.user.count({
      where: {
        tenantId: target.tenantId,
        role: UserRole.LenderAdmin,
        status: UserStatus.Active,
        id: { not: target.id },
      },
    });
    if (otherAdmins === 0) {
      throw new BadRequestException('A tenant must keep at least one active admin');
    }
  }

  private toRow(user: UserWithAccounts): UserRow {
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      status: user.status,
      image: user.image,
      hasPassword: user.passwordHash !== null,
      providers: user.accounts.map((account) => account.provider),
      lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
      createdAt: user.createdAt.toISOString(),
    };
  }
}
