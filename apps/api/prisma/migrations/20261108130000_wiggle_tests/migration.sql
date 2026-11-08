
-- AlterEnum
ALTER TYPE "EventType" ADD VALUE 'WIGGLE_TEST';

-- CreateTable
CREATE TABLE "WiggleTest" (
    "id" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "profile" TEXT NOT NULL,
    "results" JSONB NOT NULL,
    "failCount" INTEGER NOT NULL,
    "notes" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "WiggleTest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WiggleTest_vehicleId_date_idx" ON "WiggleTest"("vehicleId", "date");

-- AddForeignKey
ALTER TABLE "WiggleTest" ADD CONSTRAINT "WiggleTest_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE CASCADE ON UPDATE CASCADE;
