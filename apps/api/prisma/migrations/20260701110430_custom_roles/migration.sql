-- AlterTable
ALTER TABLE "User" ADD COLUMN     "roleId" TEXT;

-- CreateTable
CREATE TABLE "Role" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "permissions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "key" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Role_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Role_tenantId_idx" ON "Role"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "Role_tenantId_name_key" ON "Role"("tenantId", "name");

-- CreateIndex
CREATE INDEX "User_roleId_idx" ON "User"("roleId");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Role" ADD CONSTRAINT "Role_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Backfill: seed the two built-in system roles per tenant, then map existing
-- lender_admin -> Administrator and lender_staff -> Staff. Platform (tenantId
-- NULL) and borrower users keep roleId = NULL. Permission arrays mirror
-- SYSTEM_ROLE_PERMISSIONS in @loan-pilot/domain (a drift test asserts parity).
INSERT INTO "Role" ("id", "tenantId", "name", "permissions", "isSystem", "key", "createdAt", "updatedAt")
SELECT
    gen_random_uuid()::text, t."id", 'Administrator',
    ARRAY['loans:read','loans:write','loans:manage','borrowers:read','borrowers:write','borrowers:manage','applications:read','applications:write','applications:decide','payments:read','payments:write','finance:read','finance:write','settings:read','settings:write','reports:read','users:manage','roles:manage']::TEXT[],
    true, 'administrator', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Tenant" t;

INSERT INTO "Role" ("id", "tenantId", "name", "permissions", "isSystem", "key", "createdAt", "updatedAt")
SELECT
    gen_random_uuid()::text, t."id", 'Staff',
    ARRAY['loans:read','loans:write','borrowers:read','borrowers:write','applications:read','applications:write','applications:decide','payments:read','payments:write','settings:read','reports:read']::TEXT[],
    true, 'staff', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Tenant" t;

UPDATE "User" u SET "roleId" = r."id"
FROM "Role" r
WHERE r."tenantId" = u."tenantId" AND r."key" = 'administrator' AND u."role" = 'lender_admin';

UPDATE "User" u SET "roleId" = r."id"
FROM "Role" r
WHERE r."tenantId" = u."tenantId" AND r."key" = 'staff' AND u."role" = 'lender_staff';
