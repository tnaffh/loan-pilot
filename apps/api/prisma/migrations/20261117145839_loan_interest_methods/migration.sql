-- CreateEnum
CREATE TYPE "InterestMethod" AS ENUM ('payday', 'monthly_renewal', 'term_loan');

-- CreateEnum
CREATE TYPE "RenewalBasis" AS ENUM ('principal', 'balance');

-- AlterTable
ALTER TABLE "Loan" ADD COLUMN     "annualRate" DOUBLE PRECISION,
ADD COLUMN     "bonRate" DOUBLE PRECISION,
ADD COLUMN     "interestMethod" "InterestMethod" NOT NULL DEFAULT 'payday',
ADD COLUMN     "marginRate" DOUBLE PRECISION,
ADD COLUMN     "renewalBasis" "RenewalBasis",
ADD COLUMN     "renewalCharges" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "LoanProduct" ADD COLUMN     "marginRate" DOUBLE PRECISION,
ADD COLUMN     "method" "InterestMethod" NOT NULL DEFAULT 'payday',
ADD COLUMN     "renewalBasis" "RenewalBasis";

-- AlterTable
ALTER TABLE "RepaymentScheduleItem" ADD COLUMN     "interest" INTEGER,
ADD COLUMN     "principalPortion" INTEGER;

-- AlterTable
ALTER TABLE "TenantSettings" ADD COLUMN     "bonRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "maxLongTermMonths" INTEGER NOT NULL DEFAULT 60,
ADD COLUMN     "renewalGraceDays" INTEGER NOT NULL DEFAULT 3;

-- CreateTable
CREATE TABLE "LoanRenewal" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "loanId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "renewedAt" TIMESTAMP(3) NOT NULL,
    "base" INTEGER NOT NULL,
    "rate" DOUBLE PRECISION NOT NULL,
    "charge" INTEGER NOT NULL,
    "newDueAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LoanRenewal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LoanRenewal_tenantId_idx" ON "LoanRenewal"("tenantId");

-- CreateIndex
CREATE INDEX "LoanRenewal_loanId_idx" ON "LoanRenewal"("loanId");

-- CreateIndex
CREATE UNIQUE INDEX "LoanRenewal_loanId_number_key" ON "LoanRenewal"("loanId", "number");

-- AddForeignKey
ALTER TABLE "LoanRenewal" ADD CONSTRAINT "LoanRenewal_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoanRenewal" ADD CONSTRAINT "LoanRenewal_loanId_fkey" FOREIGN KEY ("loanId") REFERENCES "Loan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
