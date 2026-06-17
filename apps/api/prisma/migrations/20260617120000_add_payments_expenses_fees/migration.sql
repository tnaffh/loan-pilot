-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('eft', 'cash', 'debit_order', 'deposit', 'ewallet', 'payroll', 'revolved');

-- CreateEnum
CREATE TYPE "ExpenseKind" AS ENUM ('expense', 'refund');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "LoanStatus" ADD VALUE 'partly_paid';
ALTER TYPE "LoanStatus" ADD VALUE 'written_off';

-- AlterTable
ALTER TABLE "Borrower" ADD COLUMN     "gender" TEXT,
ADD COLUMN     "payDay" TEXT;

-- AlterTable
ALTER TABLE "Loan" ADD COLUMN     "bankCharges" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "externalRef" TEXT,
ADD COLUMN     "interestRate" DOUBLE PRECISION NOT NULL DEFAULT 0.3,
ADD COLUMN     "namfisaLevy" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "originMonth" TEXT,
ADD COLUMN     "stampDuty" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "loanId" TEXT NOT NULL,
    "paidAt" TIMESTAMP(3) NOT NULL,
    "amount" INTEGER NOT NULL,
    "method" "PaymentMethod" NOT NULL DEFAULT 'cash',
    "badDebt" BOOLEAN NOT NULL DEFAULT false,
    "externalRef" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Expense" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "kind" "ExpenseKind" NOT NULL DEFAULT 'expense',
    "category" TEXT NOT NULL,
    "period" TEXT,
    "incurredAt" TIMESTAMP(3),
    "amount" INTEGER NOT NULL,
    "externalRef" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Expense_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Payment_tenantId_idx" ON "Payment"("tenantId");

-- CreateIndex
CREATE INDEX "Payment_loanId_idx" ON "Payment"("loanId");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_tenantId_externalRef_key" ON "Payment"("tenantId", "externalRef");

-- CreateIndex
CREATE INDEX "Expense_tenantId_idx" ON "Expense"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "Expense_tenantId_externalRef_key" ON "Expense"("tenantId", "externalRef");

-- CreateIndex
CREATE UNIQUE INDEX "Loan_tenantId_externalRef_key" ON "Loan"("tenantId", "externalRef");

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_loanId_fkey" FOREIGN KEY ("loanId") REFERENCES "Loan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

