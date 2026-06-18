-- Normalize borrower bank/address into one-to-many tables (one active each),
-- expand bank detail + application snapshot columns, and extend Document.
-- Existing flat data is migrated into the new tables before the old columns drop.

-- 1. New borrower-owned tables ------------------------------------------------
CREATE TABLE "BorrowerAddress" (
    "id" TEXT NOT NULL,
    "borrowerId" TEXT NOT NULL,
    "label" TEXT,
    "street" TEXT NOT NULL,
    "suburb" TEXT,
    "city" TEXT NOT NULL,
    "region" TEXT,
    "country" TEXT NOT NULL DEFAULT 'Namibia',
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BorrowerAddress_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "BorrowerBankAccount" (
    "id" TEXT NOT NULL,
    "borrowerId" TEXT NOT NULL,
    "bankName" TEXT NOT NULL,
    "accountNumber" TEXT NOT NULL,
    "branchName" TEXT,
    "branchCode" TEXT,
    "accountHolderName" TEXT NOT NULL,
    "accountType" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BorrowerBankAccount_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "BorrowerAddress_borrowerId_idx" ON "BorrowerAddress"("borrowerId");
CREATE INDEX "BorrowerBankAccount_borrowerId_idx" ON "BorrowerBankAccount"("borrowerId");

ALTER TABLE "BorrowerAddress" ADD CONSTRAINT "BorrowerAddress_borrowerId_fkey" FOREIGN KEY ("borrowerId") REFERENCES "Borrower"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BorrowerBankAccount" ADD CONSTRAINT "BorrowerBankAccount_borrowerId_fkey" FOREIGN KEY ("borrowerId") REFERENCES "Borrower"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 2. Backfill from the existing flat Borrower columns (skip empty values) ------
INSERT INTO "BorrowerAddress" ("id", "borrowerId", "street", "city", "country", "isActive", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, b."id", b."address", '', 'Namibia', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Borrower" b
WHERE b."address" IS NOT NULL AND b."address" <> '';

INSERT INTO "BorrowerBankAccount" ("id", "borrowerId", "bankName", "accountNumber", "accountHolderName", "accountType", "isActive", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, b."id", b."bank", '', (b."firstName" || ' ' || b."lastName"), COALESCE(NULLIF(b."accountType", ''), 'Savings'), true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Borrower" b
WHERE b."bank" IS NOT NULL AND b."bank" <> '';

-- One active row per borrower (partial unique indexes; not expressible in Prisma schema).
CREATE UNIQUE INDEX "BorrowerAddress_active_per_borrower" ON "BorrowerAddress"("borrowerId") WHERE "isActive";
CREATE UNIQUE INDEX "BorrowerBankAccount_active_per_borrower" ON "BorrowerBankAccount"("borrowerId") WHERE "isActive";

-- 3. Drop the flat Borrower columns -------------------------------------------
ALTER TABLE "Borrower" DROP COLUMN "accountType",
DROP COLUMN "address",
DROP COLUMN "bank";

-- 4. Document: add file metadata (table is empty; default kept only to satisfy any rows) --
ALTER TABLE "Document" ADD COLUMN "fileName" TEXT NOT NULL DEFAULT '',
ADD COLUMN "mimeType" TEXT,
ADD COLUMN "sizeBytes" INTEGER;
ALTER TABLE "Document" ALTER COLUMN "fileName" DROP DEFAULT;

-- 5. LoanApplication: structured address + full bank snapshot -----------------
ALTER TABLE "LoanApplication" ADD COLUMN "addrStreet" TEXT,
ADD COLUMN "addrSuburb" TEXT,
ADD COLUMN "addrCity" TEXT,
ADD COLUMN "addrRegion" TEXT,
ADD COLUMN "addrCountry" TEXT NOT NULL DEFAULT 'Namibia',
ADD COLUMN "bankName" TEXT,
ADD COLUMN "bankAccountNumber" TEXT,
ADD COLUMN "bankBranchName" TEXT,
ADD COLUMN "bankBranchCode" TEXT,
ADD COLUMN "bankAccountHolder" TEXT;

UPDATE "LoanApplication" SET
  "addrStreet" = COALESCE("address", ''),
  "addrCity" = '',
  "bankName" = COALESCE("bank", ''),
  "bankAccountNumber" = '',
  "bankAccountHolder" = ("firstName" || ' ' || "lastName");

ALTER TABLE "LoanApplication" ALTER COLUMN "addrStreet" SET NOT NULL,
ALTER COLUMN "addrCity" SET NOT NULL,
ALTER COLUMN "bankName" SET NOT NULL,
ALTER COLUMN "bankAccountNumber" SET NOT NULL,
ALTER COLUMN "bankAccountHolder" SET NOT NULL;

ALTER TABLE "LoanApplication" DROP COLUMN "address",
DROP COLUMN "bank";
