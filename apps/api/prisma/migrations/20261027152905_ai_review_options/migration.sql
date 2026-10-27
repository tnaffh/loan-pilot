-- AlterTable
ALTER TABLE "AiReview" ADD COLUMN     "documentIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "notes" TEXT;
