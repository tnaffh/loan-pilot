import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { UserStatus, type SessionUser } from '@loan-pilot/domain';
import { PrismaService } from '../prisma/prisma.service';
import { buildSessionUser, USER_SESSION_INCLUDE } from './session';
import type { JwtPayload } from './auth.service';

export const JWT_DEFAULT_SECRET = 'loanpilot-dev-secret-change-me';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('JWT_SECRET') ?? JWT_DEFAULT_SECRET,
    });
  }

  /**
   * Resolve the session from the DB on every request (the token only carries the
   * user id via `sub`). This keeps role, permissions, and disabled-status LIVE —
   * a role's permission edit or a user being disabled takes effect immediately,
   * not when the 7-day token expires.
   */
  async validate(payload: JwtPayload): Promise<SessionUser> {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      include: USER_SESSION_INCLUDE,
    });
    if (!user || user.status === UserStatus.Disabled) {
      throw new UnauthorizedException();
    }
    return buildSessionUser(user);
  }
}
