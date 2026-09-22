-- AlterTable
ALTER TABLE "Loan" ADD COLUMN     "initialsDocumentId" TEXT;

-- AlterTable
ALTER TABLE "LoanApplication" ADD COLUMN     "initialsDocumentId" TEXT;

-- AlterTable
ALTER TABLE "TenantSettings" ADD COLUMN     "companyStamp" TEXT,
ADD COLUMN     "principalOfficerInitials" TEXT,
ADD COLUMN     "principalOfficerName" TEXT,
ADD COLUMN     "principalOfficerSignature" TEXT,
ADD COLUMN     "website" TEXT;
