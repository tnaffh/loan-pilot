-- AlterTable
ALTER TABLE "Loan" ADD COLUMN     "closedAt" TIMESTAMP(3),
ADD COLUMN     "writeOffReason" TEXT;

-- AlterTable
ALTER TABLE "LoanApplication" ADD COLUMN     "decidedAt" TIMESTAMP(3),
ADD COLUMN     "declineReason" TEXT;
