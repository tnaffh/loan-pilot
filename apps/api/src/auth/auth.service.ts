import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { compare } from 'bcryptjs';
import type { Prisma } from '@prisma/client';
import { type LoginInput, type SessionUser, UserRole } from '@loan-pilot/domain';
import { PrismaService } from '../prisma/prisma.service';

type UserWithTenant = Prisma.UserGetPayload<{ include: { tenant: true } }>;

const ROLE_MAP: Record<string, UserRole> = {
  platform: UserRole.Platform,
  lender_admin: UserRole.LenderAdmin,
  lender_staff: UserRole.LenderStaff,
  borrower: UserRole.Borrower,
};

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

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  private toSessionUser(user: UserWithTenant): SessionUser {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: ROLE_MAP[user.role] ?? UserRole.Borrower,
      tenantId: user.tenantId,
      tenantSlug: user.tenant?.slug ?? null,
    };
  }

  async login(input: LoginInput): Promise<LoginResponse> {
    const user = await this.prisma.user.findUnique({
      where: { email: input.email },
      include: { tenant: true },
    });

    if (!user || !(await compare(input.password, user.passwordHash))) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const sessionUser = this.toSessionUser(user);
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
}
