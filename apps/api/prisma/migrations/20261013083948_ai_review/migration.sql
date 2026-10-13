-- CreateEnum
CREATE TYPE "AiReviewStatus" AS ENUM ('running', 'completed', 'failed');

-- CreateEnum
CREATE TYPE "AiRecommendation" AS ENUM ('approve', 'approve_with_conditions', 'refer', 'decline');

-- AlterTable
ALTER TABLE "TenantSettings" ADD COLUMN     "aiProvider" TEXT;

-- CreateTable
CREATE TABLE "AiProviderCredential" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "apiKeyCipher" TEXT NOT NULL,
    "apiKeyHint" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "updatedByName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiProviderCredential_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiReview" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "applicationId" TEXT,
    "borrowerId" TEXT,
    "status" "AiReviewStatus" NOT NULL DEFAULT 'running',
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "recommendation" "AiRecommendation",
    "score" INTEGER,
    "report" JSONB,
    "error" TEXT,
    "documentCount" INTEGER NOT NULL DEFAULT 0,
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,
    "costUsd" DOUBLE PRECISION,
    "requestedById" TEXT,
    "requestedByName" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "AiReview_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AiProviderCredential_tenantId_provider_key" ON "AiProviderCredential"("tenantId", "provider");

-- CreateIndex
CREATE INDEX "AiReview_tenantId_applicationId_idx" ON "AiReview"("tenantId", "applicationId");

-- CreateIndex
CREATE INDEX "AiReview_tenantId_borrowerId_idx" ON "AiReview"("tenantId", "borrowerId");

-- AddForeignKey
ALTER TABLE "AiProviderCredential" ADD CONSTRAINT "AiProviderCredential_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiReview" ADD CONSTRAINT "AiReview_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiReview" ADD CONSTRAINT "AiReview_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "LoanApplication"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiReview" ADD CONSTRAINT "AiReview_borrowerId_fkey" FOREIGN KEY ("borrowerId") REFERENCES "Borrower"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: grant the new 'ai:review' permission to every built-in
-- Administrator role, keeping existing rows in step with SYSTEM_ROLE_PERMISSIONS
-- in @loan-pilot/domain. Staff do not get it — each review is billed, so an
-- administrator grants it deliberately (Roles → clone Staff → add AI review).
UPDATE "Role"
SET "permissions" = array_append("permissions", 'ai:review')
WHERE "key" = 'administrator' AND NOT ('ai:review' = ANY("permissions"));
