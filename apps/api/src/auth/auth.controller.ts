import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import {
  acceptInviteSchema,
  changePasswordSchema,
  forgotPasswordSchema,
  loginSchema,
  resetPasswordSchema,
  type AcceptInviteInput,
  type ChangePasswordInput,
  type ForgotPasswordInput,
  type LoginInput,
  type ResetPasswordInput,
  type SessionUser,
} from '@loan-pilot/domain';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { AuthService, type LoginResponse } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { GoogleAuthGuard } from './google-auth.guard';
import { CurrentUser } from './current-user.decorator';
import type { OAuthProfile } from './google.strategy';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: ConfigService,
  ) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(@Body(new ZodValidationPipe(loginSchema)) body: LoginInput): Promise<LoginResponse> {
    return this.auth.login(body);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@CurrentUser() user: SessionUser): SessionUser {
    return user;
  }

  // ----- Google OAuth --------------------------------------------------------

  @Get('google')
  @UseGuards(GoogleAuthGuard)
  google(): void {
    // GoogleAuthGuard redirects to Google; nothing to return.
  }

  @Get('google/callback')
  @UseGuards(GoogleAuthGuard)
  async googleCallback(
    @Req() req: Request & { user?: OAuthProfile },
    @Res() res: Response,
  ): Promise<void> {
    const dashboard = this.dashboardUrl();
    if (!req.user) {
      res.redirect(`${dashboard}/login?error=oauth`);
      return;
    }
    const result = await this.auth.handleOAuth(req.user);
    if (result.ok) {
      res.redirect(`${dashboard}/auth/callback?token=${result.token}`);
    } else {
      res.redirect(`${dashboard}/login?error=${result.error}`);
    }
  }

  // ----- invite acceptance ---------------------------------------------------

  @Get('invite/:token')
  invitePreview(@Param('token') token: string): Promise<{ email: string; name: string }> {
    return this.auth.invitePreview(token);
  }

  @Post('invite/accept')
  @HttpCode(HttpStatus.OK)
  acceptInvite(
    @Body(new ZodValidationPipe(acceptInviteSchema)) body: AcceptInviteInput,
  ): Promise<LoginResponse> {
    return this.auth.acceptInvite(body);
  }

  // ----- password change / reset --------------------------------------------

  @Post('change-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(JwtAuthGuard)
  async changePassword(
    @CurrentUser() user: SessionUser,
    @Body(new ZodValidationPipe(changePasswordSchema)) body: ChangePasswordInput,
  ): Promise<void> {
    await this.auth.changePassword(user.id, body);
  }

  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  async forgotPassword(
    @Body(new ZodValidationPipe(forgotPasswordSchema)) body: ForgotPasswordInput,
  ): Promise<{ ok: true }> {
    await this.auth.forgotPassword(body.email);
    return { ok: true };
  }

  @Get('reset/:token')
  resetPreview(@Param('token') token: string): Promise<{ email: string }> {
    return this.auth.resetPreview(token);
  }

  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  resetPassword(
    @Body(new ZodValidationPipe(resetPasswordSchema)) body: ResetPasswordInput,
  ): Promise<LoginResponse> {
    return this.auth.resetPassword(body);
  }

  private dashboardUrl(): string {
    return (this.config.get<string>('DASHBOARD_URL') ?? 'http://localhost:3001').replace(/\/+$/, '');
  }
}
