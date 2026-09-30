-- AlterTable
ALTER TABLE "Borrower" ADD COLUMN     "phoneKey" TEXT;

-- AlterTable
ALTER TABLE "LoanApplication" ADD COLUMN     "phoneKey" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "phone" TEXT,
ALTER COLUMN "email" DROP NOT NULL;

-- CreateTable
CREATE TABLE "PhoneOtp" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PhoneOtp_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PhoneOtp_tenantId_phone_createdAt_idx" ON "PhoneOtp"("tenantId", "phone", "createdAt");

-- CreateIndex
CREATE INDEX "Borrower_tenantId_phoneKey_idx" ON "Borrower"("tenantId", "phoneKey");

-- CreateIndex
CREATE INDEX "LoanApplication_tenantId_phoneKey_idx" ON "LoanApplication"("tenantId", "phoneKey");

-- CreateIndex
CREATE UNIQUE INDEX "User_tenantId_phone_key" ON "User"("tenantId", "phone");

-- AddForeignKey
ALTER TABLE "PhoneOtp" ADD CONSTRAINT "PhoneOtp_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Backfill phoneKey on existing rows. Mirrors the domain `phoneKey()`: strip
-- separators, a leading "+" or "00", then turn a local leading 0 into +264.
CREATE FUNCTION pg_temp.phone_key(raw TEXT) RETURNS TEXT AS $$
  SELECT CASE
    WHEN d !~ '^[0-9]+$' THEN NULL
    WHEN d LIKE '0%' THEN '+264' || substr(d, 2)
    ELSE '+' || d
  END
  FROM (
    SELECT regexp_replace(
      regexp_replace(regexp_replace(raw, '[[:space:].()-]', '', 'g'), '^\+', ''),
      '^00', ''
    ) AS d
  ) AS digits
$$ LANGUAGE sql IMMUTABLE;

UPDATE "Borrower" SET "phoneKey" = pg_temp.phone_key("phone");
UPDATE "LoanApplication" SET "phoneKey" = pg_temp.phone_key("phone");
