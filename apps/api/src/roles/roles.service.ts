import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { type CreateRoleInput, type SessionUser, type UpdateRoleInput } from '@loan-pilot/domain';
import { PrismaService } from '../prisma/prisma.service';
import { requireTenantId } from '../common/tenant';

export interface RoleRow {
  id: string;
  name: string;
  permissions: string[];
  isSystem: boolean;
  key: string | null;
  userCount: number;
  createdAt: string;
}

type RoleWithCount = Prisma.RoleGetPayload<{ include: { _count: { select: { users: true } } } }>;

@Injectable()
export class RolesService {
  constructor(private readonly prisma: PrismaService) {}

  findAllForTenant(actor: SessionUser): Promise<RoleRow[]> {
    const tenantId = requireTenantId(actor);
    return this.prisma.role
      .findMany({
        where: { tenantId },
        include: { _count: { select: { users: true } } },
        orderBy: [{ isSystem: 'desc' }, { name: 'asc' }],
      })
      .then((roles) => roles.map((role) => this.toRow(role)));
  }

  async create(actor: SessionUser, input: CreateRoleInput): Promise<RoleRow> {
    const tenantId = requireTenantId(actor);
    const name = input.name.trim();
    await this.assertNameFree(tenantId, name);
    const role = await this.prisma.role.create({
      data: { tenantId, name, permissions: input.permissions, isSystem: false },
      include: { _count: { select: { users: true } } },
    });
    return this.toRow(role);
  }

  /** Duplicate a role (system or custom) into a new editable custom role. */
  async clone(actor: SessionUser, id: string): Promise<RoleRow> {
    const tenantId = requireTenantId(actor);
    const source = await this.requireRole(tenantId, id);
    const name = await this.uniqueName(tenantId, `${source.name} (copy)`);
    const role = await this.prisma.role.create({
      data: { tenantId, name, permissions: source.permissions, isSystem: false },
      include: { _count: { select: { users: true } } },
    });
    return this.toRow(role);
  }

  async update(actor: SessionUser, id: string, input: UpdateRoleInput): Promise<RoleRow> {
    const tenantId = requireTenantId(actor);
    const role = await this.requireRole(tenantId, id);
    if (role.isSystem) {
      throw new ForbiddenException('Built-in roles cannot be edited — clone one to customise it');
    }
    const name = input.name?.trim();
    if (name && name !== role.name) {
      await this.assertNameFree(tenantId, name);
    }
    const updated = await this.prisma.role.update({
      where: { id },
      data: { name: name ?? undefined, permissions: input.permissions ?? undefined },
      include: { _count: { select: { users: true } } },
    });
    return this.toRow(updated);
  }

  async remove(actor: SessionUser, id: string): Promise<void> {
    const tenantId = requireTenantId(actor);
    const role = await this.requireRole(tenantId, id);
    if (role.isSystem) {
      throw new ForbiddenException('Built-in roles cannot be deleted');
    }
    if (role._count.users > 0) {
      throw new BadRequestException(
        'Reassign the members of this role before deleting it',
      );
    }
    await this.prisma.role.delete({ where: { id } });
  }

  // ----- helpers -------------------------------------------------------------

  private async requireRole(tenantId: string, id: string): Promise<RoleWithCount> {
    const role = await this.prisma.role.findFirst({
      where: { id, tenantId },
      include: { _count: { select: { users: true } } },
    });
    if (!role) {
      throw new NotFoundException('Role not found');
    }
    return role;
  }

  private async assertNameFree(tenantId: string, name: string): Promise<void> {
    const existing = await this.prisma.role.findFirst({ where: { tenantId, name } });
    if (existing) {
      throw new ConflictException('A role with this name already exists');
    }
  }

  /** Append a numeric suffix until the name is free (for clone). */
  private async uniqueName(tenantId: string, base: string): Promise<string> {
    const existing = await this.prisma.role.findMany({
      where: { tenantId, name: { startsWith: base } },
      select: { name: true },
    });
    const taken = new Set(existing.map((role) => role.name));
    if (!taken.has(base)) {
      return base;
    }
    let suffix = 2;
    while (taken.has(`${base} ${suffix}`)) {
      suffix += 1;
    }
    return `${base} ${suffix}`;
  }

  private toRow(role: RoleWithCount): RoleRow {
    return {
      id: role.id,
      name: role.name,
      permissions: role.permissions,
      isSystem: role.isSystem,
      key: role.key,
      userCount: role._count.users,
      createdAt: role.createdAt.toISOString(),
    };
  }
}
