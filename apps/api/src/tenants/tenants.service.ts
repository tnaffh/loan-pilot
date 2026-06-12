import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Tenant } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class TenantsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  findBySlug(slug: string): Promise<Tenant | null> {
    return this.prisma.tenant.findUnique({ where: { slug } });
  }

  /**
   * Resolve the tenant that an unauthenticated request (e.g. the public apply
   * form) belongs to. For now this is a single configured default tenant; later
   * phases resolve it from the request subdomain or the authenticated user.
   */
  async resolveForPublicRequest(slug?: string): Promise<Tenant> {
    const targetSlug = slug ?? this.config.get<string>('DEFAULT_TENANT_SLUG') ?? 'rfs';
    const tenant = await this.findBySlug(targetSlug);
    if (!tenant) {
      throw new NotFoundException(`Unknown tenant "${targetSlug}"`);
    }
    return tenant;
  }
}
