-- CreateEnum
CREATE TYPE "LoanPurpose" AS ENUM ('business', 'housing', 'education', 'furniture', 'consumption', 'other');

-- AlterTable
ALTER TABLE "Loan" ADD COLUMN     "purpose" "LoanPurpose";

-- AlterTable
ALTER TABLE "LoanApplication" ADD COLUMN     "gender" TEXT,
ADD COLUMN     "purposeCategory" "LoanPurpose";

-- CreateTable
CREATE TABLE "RegulatoryReturn" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "figures" JSONB NOT NULL DEFAULT '{}',
    "notes" TEXT,
    "updatedByName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RegulatoryReturn_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RegulatoryReturn_tenantId_idx" ON "RegulatoryReturn"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "RegulatoryReturn_tenantId_period_key" ON "RegulatoryReturn"("tenantId", "period");

-- AddForeignKey
ALTER TABLE "RegulatoryReturn" ADD CONSTRAINT "RegulatoryReturn_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Backfill: grant the new 'reports:write' permission to every built-in
-- Administrator role, keeping existing rows in step with SYSTEM_ROLE_PERMISSIONS
-- in @loan-pilot/domain (a drift test asserts parity). Staff do not get it.
UPDATE "Role"
SET "permissions" = array_append("permissions", 'reports:write')
WHERE "key" = 'administrator' AND NOT ('reports:write' = ANY("permissions"));
