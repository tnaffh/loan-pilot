import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { UnauthorizedException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { UserRole, UserStatus } from '@loan-pilot/domain';
import { PrismaService } from '../prisma/prisma.service';
import { SmsService } from '../sms/sms.service';
import { AuthService } from './auth.service';
import { OTP_MAX_ATTEMPTS, OtpService } from './otp.service';

const PEPPER = 'test-secret';
const PHONE = '+264812345567';
const tenant = { id: 'tenant_1', name: 'Raccoons Financial Services' };
const hashOf = (code: string): string =>
  createHash('sha256').update(`${PEPPER}:${PHONE}:${code}`).digest('hex');

describe('OtpService', () => {
  const prismaMock = {
    borrower: { findFirst: jest.fn(), findMany: jest.fn() },
    loanApplication: { findFirst: jest.fn() },
    phoneOtp: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    user: { findMany: jest.fn(), create: jest.fn(), update: jest.fn() },
  };
  const smsMock = { send: jest.fn() };
  const authMock = { issue: jest.fn().mockResolvedValue({ accessToken: 'jwt', user: {} }) };
  const configMock = { get: (key: string) => (key === 'JWT_SECRET' ? PEPPER : undefined) };

  let service: OtpService;

  beforeEach(async () => {
    jest.resetAllMocks();
    authMock.issue.mockResolvedValue({ accessToken: 'jwt', user: {} });
    prismaMock.phoneOtp.findMany.mockResolvedValue([]);
    prismaMock.borrower.findMany.mockResolvedValue([]);
    prismaMock.user.findMany.mockResolvedValue([]);
    const moduleRef = await Test.createTestingModule({
      providers: [
        OtpService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: SmsService, useValue: smsMock },
        { provide: AuthService, useValue: authMock },
        { provide: ConfigService, useValue: configMock },
      ],
    }).compile();
    service = moduleRef.get(OtpService);
  });

  describe('request', () => {
    it('stays silent for a number the lender does not know (no enumeration)', async () => {
      prismaMock.borrower.findFirst.mockResolvedValue(null);
      prismaMock.loanApplication.findFirst.mockResolvedValue(null);
      await expect(service.request(tenant, '081 999 0000')).resolves.toBeUndefined();
      expect(prismaMock.phoneOtp.create).not.toHaveBeenCalled();
      expect(smsMock.send).not.toHaveBeenCalled();
    });

    it('texts a known number a 6-digit code and stores only its hash', async () => {
      prismaMock.borrower.findFirst.mockResolvedValue({ id: 'b1' });
      prismaMock.loanApplication.findFirst.mockResolvedValue(null);
      await service.request(tenant, '081 234 5567');

      expect(smsMock.send).toHaveBeenCalledWith(PHONE, expect.any(String));
      const body = String(smsMock.send.mock.calls[0]?.[1]);
      const code = /(\d{6})/.exec(body)?.[1] ?? '';
      expect(code).toMatch(/^\d{6}$/);
      const created = prismaMock.phoneOtp.create.mock.calls[0][0].data;
      expect(created.phone).toBe(PHONE);
      expect(created.codeHash).toBe(hashOf(code));
      expect(JSON.stringify(created)).not.toContain(code);
    });

    it('refuses to resend within the cooldown', async () => {
      prismaMock.borrower.findFirst.mockResolvedValue({ id: 'b1' });
      prismaMock.phoneOtp.findMany.mockResolvedValue([
        { createdAt: new Date(Date.now() - 20_000) },
      ]);
      await service.request(tenant, PHONE);
      expect(smsMock.send).not.toHaveBeenCalled();
    });

    it('caps sends per number per hour', async () => {
      prismaMock.borrower.findFirst.mockResolvedValue({ id: 'b1' });
      prismaMock.phoneOtp.findMany.mockResolvedValue(
        Array.from({ length: 5 }, (_unused, index) => ({
          createdAt: new Date(Date.now() - (index + 2) * 5 * 60_000),
        })),
      );
      await service.request(tenant, PHONE);
      expect(smsMock.send).not.toHaveBeenCalled();
    });
  });

  describe('verify', () => {
    const activeOtp = { id: 'otp1', codeHash: hashOf('123456'), attempts: 0 };

    it('rejects when there is no live code (expired or consumed)', async () => {
      prismaMock.phoneOtp.findFirst.mockResolvedValue(null);
      await expect(service.verify(tenant.id, PHONE, '123456')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it('counts a wrong guess and rejects it', async () => {
      prismaMock.phoneOtp.findFirst.mockResolvedValue(activeOtp);
      await expect(service.verify(tenant.id, PHONE, '000000')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(prismaMock.phoneOtp.update).toHaveBeenCalledWith({
        where: { id: 'otp1' },
        data: { attempts: { increment: 1 } },
      });
    });

    it('locks a code after too many attempts, even for the right code', async () => {
      prismaMock.phoneOtp.findFirst.mockResolvedValue({ ...activeOtp, attempts: OTP_MAX_ATTEMPTS });
      await expect(service.verify(tenant.id, PHONE, '123456')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(prismaMock.phoneOtp.updateMany).not.toHaveBeenCalled();
    });

    it('rejects a code consumed concurrently', async () => {
      prismaMock.phoneOtp.findFirst.mockResolvedValue(activeOtp);
      prismaMock.phoneOtp.updateMany.mockResolvedValue({ count: 0 });
      await expect(service.verify(tenant.id, PHONE, '123456')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it('creates a borrower login linked to the matching borrower', async () => {
      prismaMock.phoneOtp.findFirst.mockResolvedValue(activeOtp);
      prismaMock.phoneOtp.updateMany.mockResolvedValue({ count: 1 });
      prismaMock.borrower.findMany.mockResolvedValue([
        { id: 'b1', firstName: 'Helena', lastName: 'Kapenda', createdAt: new Date(), loans: [] },
      ]);
      prismaMock.user.create.mockResolvedValue({ id: 'u1', status: UserStatus.Active });

      await expect(service.verify(tenant.id, '081 234 5567', '123456')).resolves.toEqual({
        accessToken: 'jwt',
        user: {},
      });
      expect(prismaMock.user.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            tenantId: tenant.id,
            phone: PHONE,
            role: UserRole.Borrower,
            borrowerId: 'b1',
            name: 'Helena Kapenda',
          }),
        }),
      );
    });

    it('links an existing phone-only login once the borrower exists (approved later)', async () => {
      prismaMock.phoneOtp.findFirst.mockResolvedValue(activeOtp);
      prismaMock.phoneOtp.updateMany.mockResolvedValue({ count: 1 });
      prismaMock.borrower.findMany.mockResolvedValue([
        { id: 'b1', firstName: 'A', lastName: 'B', createdAt: new Date(), loans: [] },
      ]);
      prismaMock.user.findMany.mockResolvedValue([
        { id: 'u1', role: UserRole.Borrower, phone: PHONE, borrowerId: null },
      ]);
      prismaMock.user.update.mockResolvedValue({ id: 'u1', status: UserStatus.Active });

      await service.verify(tenant.id, PHONE, '123456');
      expect(prismaMock.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'u1' },
          data: expect.objectContaining({ borrowerId: 'b1' }),
        }),
      );
      expect(prismaMock.user.create).not.toHaveBeenCalled();
    });

    it('prefers the login already linked to the borrower and gives it the phone', async () => {
      prismaMock.phoneOtp.findFirst.mockResolvedValue(activeOtp);
      prismaMock.phoneOtp.updateMany.mockResolvedValue({ count: 1 });
      prismaMock.borrower.findMany.mockResolvedValue([
        { id: 'b1', firstName: 'A', lastName: 'B', createdAt: new Date(), loans: [] },
      ]);
      prismaMock.user.findMany.mockResolvedValue([
        { id: 'seeded', role: UserRole.Borrower, phone: null, borrowerId: 'b1' },
      ]);
      prismaMock.user.update.mockResolvedValue({ id: 'seeded', status: UserStatus.Active });

      await service.verify(tenant.id, PHONE, '123456');
      expect(prismaMock.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'seeded' },
          data: expect.objectContaining({ phone: PHONE }),
        }),
      );
    });

    it('never signs a staff account in by SMS code', async () => {
      prismaMock.phoneOtp.findFirst.mockResolvedValue(activeOtp);
      prismaMock.phoneOtp.updateMany.mockResolvedValue({ count: 1 });
      prismaMock.user.findMany.mockResolvedValue([
        { id: 'staff', role: UserRole.LenderAdmin, phone: PHONE, borrowerId: null },
      ]);
      await expect(service.verify(tenant.id, PHONE, '123456')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(authMock.issue).not.toHaveBeenCalled();
    });
  });
});
