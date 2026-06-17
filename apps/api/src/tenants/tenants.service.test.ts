import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { PlanId, UserRole, type SessionUser } from '@loan-pilot/domain';
import { TenantsService } from './tenants.service';
import { PrismaService } from '../prisma/prisma.service';

describe('TenantsService.brandingForUser', () => {
  const findUnique = jest.fn();
  const prismaMock = { tenant: { findUnique } };
  let service: TenantsService;

  beforeEach(async () => {
    findUnique.mockReset();

    const moduleRef = await Test.createTestingModule({
      providers: [
        TenantsService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: ConfigService, useValue: { get: jest.fn() } },
      ],
    }).compile();

    service = moduleRef.get(TenantsService);
  });

  const lenderUser: SessionUser = {
    id: 'user_1',
    email: 'admin@raccoons.na',
    name: 'Eufemia N.',
    role: UserRole.LenderAdmin,
    tenantId: 'tenant_1',
    tenantSlug: 'rfs',
  };

  it('returns null for a platform user (no tenant)', async () => {
    const result = await service.brandingForUser({
      ...lenderUser,
      role: UserRole.Platform,
      tenantId: null,
      tenantSlug: null,
    });

    expect(result).toBeNull();
    expect(findUnique).not.toHaveBeenCalled();
  });

  it('returns parsed branding for a tenant user', async () => {
    findUnique.mockResolvedValue({
      slug: 'rfs',
      name: 'Raccoons Financial Services',
      short: 'RFS',
      accent: '#25397a',
      plan: PlanId.Growth,
    });

    const result = await service.brandingForUser(lenderUser);

    expect(result).toEqual({
      slug: 'rfs',
      name: 'Raccoons Financial Services',
      short: 'RFS',
      accent: '#25397a',
      plan: PlanId.Growth,
    });
  });

  it('returns null when the tenant row is missing', async () => {
    findUnique.mockResolvedValue(null);

    expect(await service.brandingForUser(lenderUser)).toBeNull();
  });
});
