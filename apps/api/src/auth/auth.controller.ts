import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import {
  acceptInviteSchema,
  changePasswordSchema,
  forgotPasswordSchema,
  loginSchema,
  otpRequestSchema,
  otpVerifySchema,
  resetPasswordSchema,
  type AcceptInviteInput,
  type ChangePasswordInput,
  type ForgotPasswordInput,
  type LoginInput,
  type OtpRequestInput,
  type OtpVerifyInput,
  type ResetPasswordInput,
  type SessionUser,
} from '@loan-pilot/domain';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { TenantsService } from '../tenants/tenants.service';
import { AuthService, type LoginResponse } from './auth.service';
import { OtpService } from './otp.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { GoogleAuthGuard } from './google-auth.guard';
import { CurrentUser } from './current-user.decorator';
import type { OAuthProfile } from './google.strategy';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly otp: OtpService,
    private readonly tenants: TenantsService,
    private readonly config: ConfigService,
  ) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(@Body(new ZodValidationPipe(loginSchema)) body: LoginInput): Promise<LoginResponse> {
    return this.auth.login(body);
  }

  // ----- borrower SMS-code sign-in (mobile app) -----------------------------
  // Public; the tenant comes from x-tenant. Per-number limits live in
  // OtpService; the per-IP throttle below blunts spraying many numbers.

  @Post('otp/request')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 10, ttl: 10 * 60 * 1000 } })
  async requestOtp(
    @Body(new ZodValidationPipe(otpRequestSchema)) body: OtpRequestInput,
    @Headers('x-tenant') tenantSlug?: string,
  ): Promise<void> {
    const tenant = await this.tenants.resolveForPublicRequest(tenantSlug);
    await this.otp.request(tenant, body.phone);
  }

  @Post('otp/verify')
  @HttpCode(HttpStatus.OK)
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 20, ttl: 10 * 60 * 1000 } })
  async verifyOtp(
    @Body(new ZodValidationPipe(otpVerifySchema)) body: OtpVerifyInput,
    @Headers('x-tenant') tenantSlug?: string,
  ): Promise<LoginResponse> {
    const tenant = await this.tenants.resolveForPublicRequest(tenantSlug);
    return this.otp.verify(tenant.id, body.phone, body.code);
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
    return (this.config.get<string>('DASHBOARD_URL') ?? 'http://localhost:3001').replace(
      /\/+$/,
      '',
    );
  }
}
