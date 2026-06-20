import { Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthGuard } from '@nestjs/passport';
import type { Response } from 'express';

/**
 * Wraps the Passport 'google' guard but degrades gracefully when Google isn't
 * configured (no GOOGLE_CLIENT_ID) — the strategy isn't registered then, so we
 * redirect to the login page instead of 500-ing.
 */
@Injectable()
export class GoogleAuthGuard extends AuthGuard('google') implements CanActivate {
  constructor(private readonly config: ConfigService) {
    super();
  }

  override canActivate(context: ExecutionContext): ReturnType<CanActivate['canActivate']> {
    if (!this.config.get<string>('GOOGLE_CLIENT_ID')) {
      const dashboard = (
        this.config.get<string>('DASHBOARD_URL') ?? 'http://localhost:3001'
      ).replace(/\/+$/, '');
      const res = context.switchToHttp().getResponse<Response>();
      res.redirect(`${dashboard}/login?error=google_disabled`);
      return false;
    }
    return super.canActivate(context);
  }
}
