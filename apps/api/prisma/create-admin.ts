/**
 * Bootstrap (or update) a lender-admin user — used to create the first sign-in
 * for a fresh deployment, where migrations have run but no users exist yet.
 * Idempotent: re-running updates the existing user. Never seeds demo data.
 *
 *   ADMIN_EMAIL=you@raccoonsfinance.com ADMIN_PASSWORD='a-strong-password' \
 *   ADMIN_NAME='Your Name' TENANT_SLUG=rfs pnpm --filter @loan-pilot/api db:create-admin
 *
 * If TENANT_SLUG doesn't exist yet it is created with minimal branding.
 */
import { PrismaClient } from '@prisma/client';
import { hashSync } from 'bcryptjs';
import {
  SYSTEM_ROLE_LABELS,
  SYSTEM_ROLE_PERMISSIONS,
  UserRole,
  UserStatus,
  type SystemRoleKey,
} from '@loan-pilot/domain';

const prisma = new PrismaClient();

/** Ensure a tenant's built-in system role exists and holds the current catalog. */
const ensureSystemRole = (tenantId: string, key: SystemRoleKey) =>
  prisma.role.upsert({
    where: { tenantId_name: { tenantId, name: SYSTEM_ROLE_LABELS[key] } },
    update: { permissions: SYSTEM_ROLE_PERMISSIONS[key], isSystem: true, key },
    create: {
      tenantId,
      name: SYSTEM_ROLE_LABELS[key],
      key,
      isSystem: true,
      permissions: SYSTEM_ROLE_PERMISSIONS[key],
    },
  });

const main = async (): Promise<void> => {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;
  const name = process.env.ADMIN_NAME?.trim() || 'Administrator';
  const slug = process.env.TENANT_SLUG?.trim() || 'rfs';

  if (!email || !password) {
    throw new Error('ADMIN_EMAIL and ADMIN_PASSWORD are required');
  }
  if (password.length < 8) {
    throw new Error('ADMIN_PASSWORD must be at least 8 characters');
  }

  const tenant =
    (await prisma.tenant.findUnique({ where: { slug } })) ??
    (await prisma.tenant.create({
      data: { slug, name: process.env.TENANT_NAME?.trim() || slug, short: slug.toUpperCase() },
    }));

  // Ensure the tenant has its built-in roles, then grant the admin the full one.
  const adminRole = await ensureSystemRole(tenant.id, 'administrator');
  await ensureSystemRole(tenant.id, 'staff');

  const passwordHash = hashSync(password, 10);
  const user = await prisma.user.upsert({
    where: { email },
    update: {
      name,
      role: UserRole.LenderAdmin,
      status: UserStatus.Active,
      passwordHash,
      tenantId: tenant.id,
      roleId: adminRole.id,
    },
    create: {
      email,
      name,
      role: UserRole.LenderAdmin,
      status: UserStatus.Active,
      passwordHash,
      tenantId: tenant.id,
      roleId: adminRole.id,
    },
  });

  console.log(`Admin ready: ${user.email} (${user.role}) on tenant "${tenant.slug}".`);
};

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
