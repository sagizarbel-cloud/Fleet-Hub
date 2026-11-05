-- AlterTable
ALTER TABLE "ServiceRecord" ADD COLUMN     "workCardId" TEXT;

-- CreateIndex
CREATE INDEX "ServiceRecord_workCardId_idx" ON "ServiceRecord"("workCardId");

-- AddForeignKey
ALTER TABLE "ServiceRecord" ADD CONSTRAINT "ServiceRecord_workCardId_fkey" FOREIGN KEY ("workCardId") REFERENCES "WorkCard"("id") ON DELETE SET NULL ON UPDATE CASCADE;

