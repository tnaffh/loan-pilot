-- AlterEnum: replace the `refund` value with `drawing`. Any existing `refund`
-- rows are remapped to `expense` (the refund concept was removed; the rfs books
-- are re-imported from the register, which carries no refunds).
BEGIN;
CREATE TYPE "ExpenseKind_new" AS ENUM ('expense', 'drawing');
ALTER TABLE "Expense" ALTER COLUMN "kind" DROP DEFAULT;
ALTER TABLE "Expense" ALTER COLUMN "kind" TYPE "ExpenseKind_new" USING (
  CASE WHEN "kind"::text = 'refund' THEN 'expense' ELSE "kind"::text END::"ExpenseKind_new"
);
ALTER TYPE "ExpenseKind" RENAME TO "ExpenseKind_old";
ALTER TYPE "ExpenseKind_new" RENAME TO "ExpenseKind";
DROP TYPE "ExpenseKind_old";
ALTER TABLE "Expense" ALTER COLUMN "kind" SET DEFAULT 'expense';
COMMIT;

-- CreateTable
CREATE TABLE "Investment" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "period" TEXT,
    "contributedAt" TIMESTAMP(3),
    "amount" INTEGER NOT NULL,
    "externalRef" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Investment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Investment_tenantId_idx" ON "Investment"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "Investment_tenantId_externalRef_key" ON "Investment"("tenantId", "externalRef");

-- AddForeignKey
ALTER TABLE "Investment" ADD CONSTRAINT "Investment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
