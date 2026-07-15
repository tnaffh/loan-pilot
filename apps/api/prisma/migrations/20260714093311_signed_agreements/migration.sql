-- AlterTable
ALTER TABLE "Borrower" ADD COLUMN     "employeeNo" TEXT,
ADD COLUMN     "employerAddress" TEXT,
ADD COLUMN     "employerPhone" TEXT,
ADD COLUMN     "maritalStatus" TEXT;

-- AlterTable
ALTER TABLE "Document" ADD COLUMN     "loanId" TEXT;

-- AlterTable
ALTER TABLE "Loan" ADD COLUMN     "signatureDocumentId" TEXT,
ADD COLUMN     "tcAcceptedAt" TIMESTAMP(3),
ADD COLUMN     "tcVersion" TEXT;

-- AlterTable
ALTER TABLE "LoanApplication" ADD COLUMN     "employeeNo" TEXT,
ADD COLUMN     "employerAddress" TEXT,
ADD COLUMN     "employerPhone" TEXT,
ADD COLUMN     "postalCity" TEXT,
ADD COLUMN     "postalCountry" TEXT,
ADD COLUMN     "postalRegion" TEXT,
ADD COLUMN     "postalStreet" TEXT,
ADD COLUMN     "postalSuburb" TEXT,
ADD COLUMN     "signatureDocumentId" TEXT,
ADD COLUMN     "tcAcceptedAt" TIMESTAMP(3),
ADD COLUMN     "tcVersion" TEXT;

-- AlterTable
ALTER TABLE "TenantSettings" ADD COLUMN     "contactEmail" TEXT,
ADD COLUMN     "contactPhone" TEXT,
ADD COLUMN     "legalName" TEXT,
ADD COLUMN     "namfisaLicenceNo" TEXT,
ADD COLUMN     "physicalAddress" TEXT,
ADD COLUMN     "postalAddress" TEXT,
ADD COLUMN     "registrationNo" TEXT;

-- CreateTable
CREATE TABLE "BorrowerReference" (
    "id" TEXT NOT NULL,
    "borrowerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BorrowerReference_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BorrowerReference_borrowerId_idx" ON "BorrowerReference"("borrowerId");

-- CreateIndex
CREATE INDEX "Document_loanId_idx" ON "Document"("loanId");

-- AddForeignKey
ALTER TABLE "BorrowerReference" ADD CONSTRAINT "BorrowerReference_borrowerId_fkey" FOREIGN KEY ("borrowerId") REFERENCES "Borrower"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_loanId_fkey" FOREIGN KEY ("loanId") REFERENCES "Loan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill the new agreement permissions onto the built-in system roles so
-- already-provisioned tenants keep parity with SYSTEM_ROLE_PERMISSIONS
-- (administrator = all; staff = read + generate). Idempotent: only appends keys
-- that are not already present.
UPDATE "Role"
SET "permissions" = "permissions" || ARRAY['agreements:read', 'agreements:generate']::TEXT[]
WHERE "key" IN ('administrator', 'staff')
  AND NOT ("permissions" @> ARRAY['agreements:read']::TEXT[]);
