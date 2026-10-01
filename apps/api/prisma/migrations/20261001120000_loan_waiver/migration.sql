-- AlterEnum
ALTER TYPE "RepaymentStatus" ADD VALUE 'waived';

-- AlterTable
ALTER TABLE "Loan" ADD COLUMN     "waiveReason" TEXT,
ADD COLUMN     "waived" INTEGER NOT NULL DEFAULT 0;
