-- AlterTable
ALTER TABLE "Borrower" ADD COLUMN     "collexiaClientNo" TEXT;

-- CreateIndex
-- Unique per tenant; NULLs are allowed to coexist (borrowers not yet on Collexia).
CREATE UNIQUE INDEX "Borrower_tenantId_collexiaClientNo_key" ON "Borrower"("tenantId", "collexiaClientNo");
