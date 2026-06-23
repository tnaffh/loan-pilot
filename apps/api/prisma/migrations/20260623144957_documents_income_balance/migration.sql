-- AlterTable
ALTER TABLE "Document" ADD COLUMN     "borrowerId" TEXT;

-- AlterTable
ALTER TABLE "TenantSettings" ADD COLUMN     "openingBalance" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "Income" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "period" TEXT,
    "incurredAt" TIMESTAMP(3),
    "amount" INTEGER NOT NULL,
    "externalRef" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Income_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Income_tenantId_idx" ON "Income"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "Income_tenantId_externalRef_key" ON "Income"("tenantId", "externalRef");

-- CreateIndex
CREATE INDEX "Document_borrowerId_idx" ON "Document"("borrowerId");

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_borrowerId_fkey" FOREIGN KEY ("borrowerId") REFERENCES "Borrower"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Income" ADD CONSTRAINT "Income_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
