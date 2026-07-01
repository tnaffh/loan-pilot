-- CreateEnum
CREATE TYPE "CollexiaStatus" AS ENUM ('pending', 'loaded', 'manual');

-- AlterTable
ALTER TABLE "Loan" ADD COLUMN     "collexiaMarkedAt" TIMESTAMP(3),
ADD COLUMN     "collexiaStatus" "CollexiaStatus" NOT NULL DEFAULT 'pending',
ADD COLUMN     "fundsReleased" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "fundsReleasedAt" TIMESTAMP(3);

-- Backfill: existing loans on the book were already disbursed, so mark their
-- funds released (dated to disbursement). Collexia stays 'pending' (the DB
-- default) so every existing open loan surfaces in the loading reminder to be
-- reviewed. Cancelled loans never paid out, so leave them unreleased.
UPDATE "Loan"
SET "fundsReleased" = true, "fundsReleasedAt" = "disbursedAt"
WHERE "status" <> 'cancelled';
