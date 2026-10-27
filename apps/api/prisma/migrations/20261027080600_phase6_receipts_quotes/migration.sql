/*
  Warnings:

  - Made the column `createdById` on table `Quote` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterEnum
ALTER TYPE "EventType" ADD VALUE 'QUOTE_UNLINKED';

-- AlterTable
ALTER TABLE "Document" ADD COLUMN     "approvedAt" TIMESTAMP(3),
ADD COLUMN     "approvedById" TEXT;

-- Receipts that already exist count as approved; only new ones from viewers wait.
UPDATE "Document" SET "approvedAt" = "createdAt";
-- Authors that no longer exist can't be linked.
UPDATE "Document" SET "createdById" = NULL
  WHERE "createdById" IS NOT NULL AND "createdById" NOT IN (SELECT "id" FROM "User");

-- AlterTable
ALTER TABLE "Item" ADD COLUMN     "retiredAt" TIMESTAMP(3);

-- Every quote needs a creator now. Quotes from before Phase 6 without one (or whose author
-- is gone) go to the first admin, who could already see them.
UPDATE "Quote" SET "createdById" = (
  SELECT "id" FROM "User" WHERE "role" = 'ADMIN' ORDER BY "createdAt" LIMIT 1
) WHERE "createdById" IS NULL OR "createdById" NOT IN (SELECT "id" FROM "User");

-- AlterTable
ALTER TABLE "Quote" ALTER COLUMN "createdById" SET NOT NULL;

-- CreateIndex
CREATE INDEX "Document_approvedAt_idx" ON "Document"("approvedAt");

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
