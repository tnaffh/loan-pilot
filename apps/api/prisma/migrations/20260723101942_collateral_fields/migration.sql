-- AlterTable
ALTER TABLE "Loan" ADD COLUMN     "collateralCondition" TEXT,
ADD COLUMN     "collateralDescription" TEXT,
ADD COLUMN     "collateralIdentifier" TEXT,
ADD COLUMN     "collateralItem" TEXT,
ADD COLUMN     "collateralValue" INTEGER;

-- AlterTable
ALTER TABLE "LoanApplication" ADD COLUMN     "collateralCondition" TEXT,
ADD COLUMN     "collateralDescription" TEXT,
ADD COLUMN     "collateralIdentifier" TEXT,
ADD COLUMN     "collateralItem" TEXT,
ADD COLUMN     "collateralValue" INTEGER;
