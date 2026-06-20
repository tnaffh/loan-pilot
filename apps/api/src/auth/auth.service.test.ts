import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { UserStatus } from '@loan-pilot/domain';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import type { OAuthProfile } from './google.strategy';

describe('AuthService.handleOAuth', () => {
  const userFindUnique = jest.fn();
  const userUpdate = jest.fn();
  const accountUpsert = jest.fn().mockResolvedValue({});

  const prismaMock = {
    user: { findUnique: userFindUnique, update: userUpdate },
    authAccount: { upsert: accountUpsert },
  };
  const jwtMock = { signAsync: jest.fn().mockResolvedValue('jwt-token') };
  const configMock = {
    get: (key: string) => (key === 'OAUTH_ALLOWED_DOMAINS' ? 'raccoonsfinance.com' : undefined),
  };
  const mailMock = { sendInvite: jest.fn(), sendPasswordReset: jest.fn() };

  let service: AuthService;

  const profile: OAuthProfile = {
    provider: 'google',
    providerAccountId: 'g-123',
    email: 'staff@raccoonsfinance.com',
    name: 'Staff Member',
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: JwtService, useValue: jwtMock },
        { provide: ConfigService, useValue: configMock },
        { provide: MailService, useValue: mailMock },
      ],
    }).compile();
    service = moduleRef.get(AuthService);
  });

  it('rejects an email outside the allowed domains', async () => {
    const result = await service.handleOAuth({ ...profile, email: 'someone@gmail.com' });
    expect(result).toEqual({ ok: false, error: 'domain_not_allowed' });
    expect(userFindUnique).not.toHaveBeenCalled();
  });

  it('rejects a non-invited account (invite-only)', async () => {
    userFindUnique.mockResolvedValue(null);
    const result = await service.handleOAuth(profile);
    expect(result).toEqual({ ok: false, error: 'not_invited' });
  });

  it('rejects a disabled account', async () => {
    userFindUnique.mockResolvedValue({ id: 'u1', status: UserStatus.Disabled });
    const result = await service.handleOAuth(profile);
    expect(result).toEqual({ ok: false, error: 'account_disabled' });
  });

  it('links the provider, activates the user and issues a token', async () => {
    userFindUnique.mockResolvedValue({
      id: 'u1',
      email: profile.email,
      name: profile.name,
      role: 'lender_staff',
      status: UserStatus.Invited,
      tenantId: 'tenant_1',
      image: null,
    });
    userUpdate.mockResolvedValue({
      id: 'u1',
      email: profile.email,
      name: profile.name,
      role: 'lender_staff',
      tenantId: 'tenant_1',
      tenant: { slug: 'rfs' },
    });
    const result = await service.handleOAuth(profile);
    expect(accountUpsert).toHaveBeenCalled();
    expect(userUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: UserStatus.Active }) }),
    );
    expect(result).toEqual({ ok: true, token: 'jwt-token' });
  });
});
