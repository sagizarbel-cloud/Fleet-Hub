-- CreateEnum
CREATE TYPE "QuoteVisibility" AS ENUM ('STANDARD', 'PUBLIC', 'ADMINS');

-- AlterTable
ALTER TABLE "Quote" ADD COLUMN     "visibility" "QuoteVisibility" NOT NULL DEFAULT 'STANDARD';

-- CreateIndex
CREATE INDEX "Quote_visibility_createdById_idx" ON "Quote"("visibility", "createdById");
