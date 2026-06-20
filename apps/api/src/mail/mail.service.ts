import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';

const BRAND_NAVY = '#25397a';
const BRAND_LIME = '#d7df21';

/**
 * Transactional email via Resend (HTTP API — no SMTP egress concerns on Cloud
 * Run). When `RESEND_API_KEY` is unset, emails are logged instead of sent so
 * local development works without credentials; callers also surface the link
 * directly, so provisioning never hard-blocks on email delivery.
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly from: string;
  private readonly client: Resend | null;

  constructor(config: ConfigService) {
    const apiKey = config.get<string>('RESEND_API_KEY');
    this.from = config.get<string>('MAIL_FROM') ?? 'LoanPilot <onboarding@resend.dev>';
    this.client = apiKey ? new Resend(apiKey) : null;
  }

  async sendInvite(email: string, name: string, acceptUrl: string): Promise<void> {
    await this.send(
      email,
      'You have been invited to LoanPilot',
      this.template({
        heading: `Welcome, ${name}`,
        body: 'An administrator has invited you to LoanPilot. Set your password to activate your account.',
        cta: 'Accept invitation',
        url: acceptUrl,
        note: 'This invitation expires in 7 days.',
      }),
    );
  }

  async sendPasswordReset(email: string, name: string, resetUrl: string): Promise<void> {
    await this.send(
      email,
      'Reset your LoanPilot password',
      this.template({
        heading: `Hi ${name}`,
        body: 'We received a request to reset your password. If this was you, choose a new one below.',
        cta: 'Reset password',
        url: resetUrl,
        note: 'This link expires in 1 hour. If you did not request it, you can ignore this email.',
      }),
    );
  }

  private async send(to: string, subject: string, html: string): Promise<void> {
    if (!this.client) {
      this.logger.warn(`[mail disabled] to=${to} subject="${subject}" — set RESEND_API_KEY to send`);
      return;
    }
    const { error } = await this.client.emails.send({ from: this.from, to, subject, html });
    if (error) {
      // Don't fail the request — the caller surfaces the link as a fallback.
      this.logger.error(`Resend failed for ${to}: ${error.message}`);
    }
  }

  private template(parts: {
    heading: string;
    body: string;
    cta: string;
    url: string;
    note: string;
  }): string {
    return `<!doctype html>
<html>
  <body style="margin:0;background:#f7f6f3;font-family:Arial,Helvetica,sans-serif;color:#16191c;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:32px 0;">
      <tr><td align="center">
        <table role="presentation" width="480" cellpadding="0" cellspacing="0"
               style="background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #ececec;">
          <tr><td style="background:${BRAND_NAVY};padding:20px 28px;">
            <span style="color:#ffffff;font-size:18px;font-weight:700;">Loan<span style="color:${BRAND_LIME};">Pilot</span></span>
          </td></tr>
          <tr><td style="padding:28px;">
            <h1 style="margin:0 0 12px;font-size:20px;">${parts.heading}</h1>
            <p style="margin:0 0 24px;font-size:15px;line-height:1.5;color:#3a3f45;">${parts.body}</p>
            <a href="${parts.url}"
               style="display:inline-block;background:${BRAND_NAVY};color:#ffffff;text-decoration:none;
                      padding:12px 22px;border-radius:9px;font-weight:600;font-size:15px;">${parts.cta}</a>
            <p style="margin:24px 0 0;font-size:12px;color:#8a9099;">${parts.note}</p>
            <p style="margin:8px 0 0;font-size:12px;color:#8a9099;word-break:break-all;">${parts.url}</p>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;
  }
}
