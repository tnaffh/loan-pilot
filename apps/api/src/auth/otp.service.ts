import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomInt, timingSafeEqual } from 'node:crypto';
import type { Tenant } from '@prisma/client';
import { UserRole, UserStatus, phoneKey } from '@loan-pilot/domain';
import { PrismaService } from '../prisma/prisma.service';
import { SmsService } from '../sms/sms.service';
import { AuthService, type LoginResponse } from './auth.service';
import { USER_SESSION_INCLUDE, type UserForSession } from './session';
import { JWT_DEFAULT_SECRET } from './jwt.strategy';

export const OTP_TTL_MS = 5 * 60 * 1000;
export const OTP_RESEND_COOLDOWN_MS = 60 * 1000;
export const OTP_HOURLY_CAP = 5;
export const OTP_MAX_ATTEMPTS = 5;

const INVALID_CODE = 'That code is incorrect or has expired';

/**
 * SMS one-time-code sign-in for borrowers (the mobile app). A code is only sent
 * to a number the lender already knows — on a borrower or an application — and
 * the request always succeeds silently, so the endpoint can't be used to probe
 * which numbers are customers. Verifying a code finds or creates the borrower's
 * `User` (role borrower, keyed by tenant + phone) and links it to their
 * `Borrower` record once one exists.
 */
@Injectable()
export class OtpService {
  private readonly pepper: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly sms: SmsService,
    private readonly auth: AuthService,
    config: ConfigService,
  ) {
    this.pepper = config.get<string>('JWT_SECRET') ?? JWT_DEFAULT_SECRET;
  }

  async request(tenant: Pick<Tenant, 'id' | 'name'>, rawPhone: string): Promise<void> {
    const phone = phoneKey(rawPhone);
    if (!phone || !(await this.isKnownNumber(tenant.id, phone))) {
      return;
    }

    const now = Date.now();
    const recent = await this.prisma.phoneOtp.findMany({
      where: { tenantId: tenant.id, phone, createdAt: { gte: new Date(now - 60 * 60 * 1000) } },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    });
    const latest = recent[0];
    if (recent.length >= OTP_HOURLY_CAP) {
      return;
    }
    if (latest && now - latest.createdAt.getTime() < OTP_RESEND_COOLDOWN_MS) {
      return;
    }

    const code = randomInt(0, 1_000_000).toString().padStart(6, '0');
    await this.prisma.phoneOtp.create({
      data: {
        tenant: { connect: { id: tenant.id } },
        phone,
        codeHash: this.hash(phone, code),
        expiresAt: new Date(now + OTP_TTL_MS),
      },
    });
    await this.sms.send(
      phone,
      `${code} is your ${tenant.name} sign-in code. It expires in 5 minutes. Never share it with anyone.`,
    );
  }

  async verify(tenantId: string, rawPhone: string, code: string): Promise<LoginResponse> {
    const phone = phoneKey(rawPhone);
    if (!phone) {
      throw new UnauthorizedException(INVALID_CODE);
    }
    const otp = await this.prisma.phoneOtp.findFirst({
      where: { tenantId, phone, consumedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    });
    if (!otp || otp.attempts >= OTP_MAX_ATTEMPTS) {
      throw new UnauthorizedException(INVALID_CODE);
    }
    if (!this.matches(otp.codeHash, this.hash(phone, code))) {
      await this.prisma.phoneOtp.update({
        where: { id: otp.id },
        data: { attempts: { increment: 1 } },
      });
      throw new UnauthorizedException(INVALID_CODE);
    }
    // Consume atomically so two concurrent verifies can't both succeed.
    const consumed = await this.prisma.phoneOtp.updateMany({
      where: { id: otp.id, consumedAt: null },
      data: { consumedAt: new Date() },
    });
    if (consumed.count === 0) {
      throw new UnauthorizedException(INVALID_CODE);
    }

    const user = await this.provisionBorrowerUser(tenantId, phone);
    if (user.status === UserStatus.Disabled) {
      throw new UnauthorizedException('This account has been disabled');
    }
    return this.auth.issue(user);
  }

  private async isKnownNumber(tenantId: string, phone: string): Promise<boolean> {
    const [borrower, application] = await Promise.all([
      this.prisma.borrower.findFirst({
        where: { tenantId, phoneKey: phone },
        select: { id: true },
      }),
      this.prisma.loanApplication.findFirst({
        where: { tenantId, phoneKey: phone },
        select: { id: true },
      }),
    ]);
    return Boolean(borrower || application);
  }

  /**
   * The borrower record a phone belongs to. Duplicate borrowers can share a
   * number (legacy imports), so prefer the one with the most recent loan.
   */
  private async borrowerForPhone(tenantId: string, phone: string) {
    const candidates = await this.prisma.borrower.findMany({
      where: { tenantId, phoneKey: phone },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        createdAt: true,
        loans: { select: { createdAt: true }, orderBy: { createdAt: 'desc' }, take: 1 },
      },
    });
    const recency = (candidate: (typeof candidates)[number]): number =>
      (candidate.loans[0]?.createdAt ?? candidate.createdAt).getTime();
    return [...candidates].sort((a, b) => recency(b) - recency(a))[0] ?? null;
  }

  private async provisionBorrowerUser(tenantId: string, phone: string): Promise<UserForSession> {
    const borrower = await this.borrowerForPhone(tenantId, phone);
    const matches = await this.prisma.user.findMany({
      where: {
        tenantId,
        OR: [{ phone }, ...(borrower ? [{ borrowerId: borrower.id }] : [])],
      },
      include: USER_SESSION_INCLUDE,
    });
    // A user already linked to the borrower wins over a phone-only match: it is
    // the account that carries the loans (e.g. a portal login created by staff).
    const existing =
      matches.find((user) => borrower && user.borrowerId === borrower.id) ?? matches[0] ?? null;

    if (existing) {
      if (existing.role !== UserRole.Borrower) {
        throw new UnauthorizedException(INVALID_CODE);
      }
      const phoneHolder = matches.find((user) => user.phone === phone);
      const borrowerHolder = matches.find((user) => borrower && user.borrowerId === borrower.id);
      return this.prisma.user.update({
        where: { id: existing.id },
        data: {
          lastLoginAt: new Date(),
          ...(!phoneHolder ? { phone } : {}),
          ...(!existing.borrowerId && borrower && !borrowerHolder
            ? { borrowerId: borrower.id }
            : {}),
        },
        include: USER_SESSION_INCLUDE,
      });
    }

    return this.prisma.user.create({
      data: {
        tenantId,
        phone,
        role: UserRole.Borrower,
        status: UserStatus.Active,
        name: borrower
          ? `${borrower.firstName} ${borrower.lastName}`
          : await this.applicantName(tenantId, phone),
        borrowerId: borrower?.id ?? null,
        lastLoginAt: new Date(),
      },
      include: USER_SESSION_INCLUDE,
    });
  }

  private async applicantName(tenantId: string, phone: string): Promise<string> {
    const application = await this.prisma.loanApplication.findFirst({
      where: { tenantId, phoneKey: phone },
      orderBy: { submittedAt: 'desc' },
      select: { firstName: true, lastName: true },
    });
    return application ? `${application.firstName} ${application.lastName}` : 'Borrower';
  }

  private hash(phone: string, code: string): string {
    return createHash('sha256').update(`${this.pepper}:${phone}:${code}`).digest('hex');
  }

  private matches(storedHex: string, candidateHex: string): boolean {
    const stored = Buffer.from(storedHex, 'hex');
    const candidate = Buffer.from(candidateHex, 'hex');
    return stored.length === candidate.length && timingSafeEqual(stored, candidate);
  }
}
