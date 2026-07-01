import { Test } from '@nestjs/testing';
import { UserRole, type SessionUser } from '@loan-pilot/domain';
import { AuditService } from './audit.service';
import { PrismaService } from '../prisma/prisma.service';

describe('AuditService', () => {
  const auditCreate = jest.fn();
  const prismaMock = { auditEvent: { create: auditCreate, findMany: jest.fn() } };
  let service: AuditService;

  const actor: SessionUser = {
    id: 'user_1',
    email: 'a@b.na',
    name: 'Eufemia',
    role: UserRole.LenderAdmin,
    tenantId: 'tenant_1',
    tenantSlug: 'rfs',
    roleId: 'role_admin',
    permissions: [],
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [AuditService, { provide: PrismaService, useValue: prismaMock }],
    }).compile();
    service = moduleRef.get(AuditService);
  });

  it('diffs only the changed fields', () => {
    const changes = service.diff(
      { name: 'Old', id: '111', city: 'Windhoek' },
      { name: 'New', id: '111', city: 'Windhoek' },
      ['name', 'id', 'city'],
    );
    expect(changes).toEqual([{ field: 'name', from: 'Old', to: 'New' }]);
  });

  it('does not write an event when nothing changed', async () => {
    await service.record('tenant_1', actor, {
      entity: 'loan',
      entityId: 'loan_1',
      action: 'updated',
      changes: [],
    });
    expect(auditCreate).not.toHaveBeenCalled();
  });

  it('records the actor and changes', async () => {
    await service.record('tenant_1', actor, {
      entity: 'borrower',
      entityId: 'bor_1',
      action: 'updated',
      changes: [{ field: 'idNumber', from: '85', to: '86' }],
    });
    expect(auditCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ actorName: 'Eufemia', entity: 'borrower', action: 'updated' }),
      }),
    );
  });
});
