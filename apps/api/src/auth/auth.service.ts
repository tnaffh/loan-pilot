import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { compare, hash } from 'bcryptjs';
import type { Prisma, User } from '@prisma/client';
import {
  UserRole,
  UserStatus,
  type AcceptInviteInput,
  type ChangePasswordInput,
  type LoginInput,
  type ResetPasswordInput,
  type SessionUser,
} from '@loan-pilot/domain';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { hashToken, newToken } from '../common/tokens';
import type { OAuthProfile } from './google.strategy';
import { buildSessionUser, USER_SESSION_INCLUDE, type UserForSession } from './session';

const BCRYPT_ROUNDS = 10;
const RESET_TTL_MS = 60 * 60 * 1000; // 1 hour

export interface JwtPayload {
  sub: string;
  email: string;
  name: string;
  role: UserRole;
  tenantId: string | null;
  tenantSlug: string | null;
}

export interface LoginResponse {
  accessToken: string;
  user: SessionUser;
}

/** Outcome of an OAuth login: a token on success, or a reason to surface. */
export type OAuthResult = { ok: true; token: string } | { ok: false; error: string };

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly mail: MailService,
  ) {}

  private async issue(user: UserForSession): Promise<LoginResponse> {
    const sessionUser = buildSessionUser(user);
    const payload: JwtPayload = {
      sub: sessionUser.id,
      email: sessionUser.email,
      name: sessionUser.name,
      role: sessionUser.role,
      tenantId: sessionUser.tenantId,
      tenantSlug: sessionUser.tenantSlug,
    };
    return { accessToken: await this.jwt.signAsync(payload), user: sessionUser };
  }

  private withTenant(id: string): Promise<UserForSession | null> {
    return this.prisma.user.findUnique({ where: { id }, include: USER_SESSION_INCLUDE });
  }

  async login(input: LoginInput): Promise<LoginResponse> {
    const user = await this.prisma.user.findUnique({
      where: { email: input.email.toLowerCase() },
      include: USER_SESSION_INCLUDE,
    });
    if (!user || !user.passwordHash || !(await compare(input.password, user.passwordHash))) {
      throw new UnauthorizedException('Invalid email or password');
    }
    if (user.status === UserStatus.Disabled) {
      throw new UnauthorizedException('This account has been disabled');
    }
    await this.prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    return this.issue(user);
  }

  /**
   * Staff Google sign-in: invite-only + domain-locked. (The `flow` argument is
   * the seam for a future borrower flow that auto-provisions accounts.)
   */
  async handleOAuth(profile: OAuthProfile, flow: 'staff' = 'staff'): Promise<OAuthResult> {
    void flow;
    const allowed = (this.config.get<string>('OAUTH_ALLOWED_DOMAINS') ?? '')
      .split(',')
      .map((domain) => domain.trim().toLowerCase())
      .filter(Boolean);
    const domain = profile.email.split('@')[1] ?? '';
    if (allowed.length > 0 && !allowed.includes(domain)) {
      return { ok: false, error: 'domain_not_allowed' };
    }

    const user = await this.prisma.user.findUnique({
      where: { email: profile.email },
      include: USER_SESSION_INCLUDE,
    });
    if (!user) {
      return { ok: false, error: 'not_invited' };
    }
    if (user.status === UserStatus.Disabled) {
      return { ok: false, error: 'account_disabled' };
    }

    await this.prisma.authAccount.upsert({
      where: {
        provider_providerAccountId: {
          provider: profile.provider,
          providerAccountId: profile.providerAccountId,
        },
      },
      update: {},
      create: { userId: user.id, provider: profile.provider, providerAccountId: profile.providerAccountId },
    });
    const refreshed = await this.prisma.user.update({
      where: { id: user.id },
      data: {
        status: UserStatus.Active,
        lastLoginAt: new Date(),
        image: user.image ?? profile.picture ?? null,
        inviteTokenHash: null,
        inviteExpiresAt: null,
      },
      include: USER_SESSION_INCLUDE,
    });
    const { accessToken } = await this.issue(refreshed);
    return { ok: true, token: accessToken };
  }

  // ----- invite acceptance ---------------------------------------------------

  async invitePreview(token: string): Promise<{ email: string; name: string }> {
    const user = await this.requireValidToken('invite', token);
    return { email: user.email, name: user.name };
  }

  async acceptInvite(input: AcceptInviteInput): Promise<LoginResponse> {
    const user = await this.requireValidToken('invite', input.token);
    const updated = await this.prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash: await hash(input.password, BCRYPT_ROUNDS),
        status: UserStatus.Active,
        inviteTokenHash: null,
        inviteExpiresAt: null,
        lastLoginAt: new Date(),
      },
      include: USER_SESSION_INCLUDE,
    });
    return this.issue(updated);
  }

  // ----- password change / reset --------------------------------------------

  async changePassword(userId: string, input: ChangePasswordInput): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new UnauthorizedException();
    }
    if (!user.passwordHash || !(await compare(input.currentPassword, user.passwordHash))) {
      throw new BadRequestException('Your current password is incorrect');
    }
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash: await hash(input.newPassword, BCRYPT_ROUNDS) },
    });
  }

  /** Always resolves (no account enumeration); emails a reset link when the user exists. */
  async forgotPassword(email: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    if (!user || user.status === UserStatus.Disabled) {
      return;
    }
    const token = newToken();
    await this.prisma.user.update({
      where: { id: user.id },
      data: { resetTokenHash: hashToken(token), resetExpiresAt: new Date(Date.now() + RESET_TTL_MS) },
    });
    const dashboard = (this.config.get<string>('DASHBOARD_URL') ?? 'http://localhost:3001').replace(/\/+$/, '');
    await this.mail.sendPasswordReset(user.email, user.name, `${dashboard}/reset-password?token=${token}`);
  }

  async resetPreview(token: string): Promise<{ email: string }> {
    const user = await this.requireValidToken('reset', token);
    return { email: user.email };
  }

  async resetPassword(input: ResetPasswordInput): Promise<LoginResponse> {
    const user = await this.requireValidToken('reset', input.token);
    const updated = await this.prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash: await hash(input.password, BCRYPT_ROUNDS),
        status: UserStatus.Active,
        resetTokenHash: null,
        resetExpiresAt: null,
        lastLoginAt: new Date(),
      },
      include: USER_SESSION_INCLUDE,
    });
    return this.issue(updated);
  }

  /** Find the user owning a valid, unexpired invite/reset token (or 400). */
  private async requireValidToken(kind: 'invite' | 'reset', token: string): Promise<User> {
    const tokenHash = hashToken(token);
    const where: Prisma.UserWhereInput =
      kind === 'invite'
        ? { inviteTokenHash: tokenHash, inviteExpiresAt: { gt: new Date() } }
        : { resetTokenHash: tokenHash, resetExpiresAt: { gt: new Date() } };
    const user = await this.prisma.user.findFirst({ where });
    if (!user) {
      throw new BadRequestException('This link is invalid or has expired');
    }
    return user;
  }
}
