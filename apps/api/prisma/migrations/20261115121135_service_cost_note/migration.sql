-- AlterTable
ALTER TABLE "ServiceRecord" ADD COLUMN     "costNote" TEXT,
ADD COLUMN     "costQuoteId" TEXT,
ADD COLUMN     "costReceiptId" TEXT;

-- CreateIndex
CREATE INDEX "ServiceRecord_costReceiptId_idx" ON "ServiceRecord"("costReceiptId");

-- CreateIndex
CREATE INDEX "ServiceRecord_costQuoteId_idx" ON "ServiceRecord"("costQuoteId");

-- AddForeignKey
ALTER TABLE "ServiceRecord" ADD CONSTRAINT "ServiceRecord_costReceiptId_fkey" FOREIGN KEY ("costReceiptId") REFERENCES "Document"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceRecord" ADD CONSTRAINT "ServiceRecord_costQuoteId_fkey" FOREIGN KEY ("costQuoteId") REFERENCES "Quote"("id") ON DELETE SET NULL ON UPDATE CASCADE;
