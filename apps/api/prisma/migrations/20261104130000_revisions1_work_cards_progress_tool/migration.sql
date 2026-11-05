-- CreateEnum
CREATE TYPE "WorkType" AS ENUM ('ROUTINE', 'MECHANICAL');

-- CreateEnum
CREATE TYPE "WorkPerformer" AS ENUM ('IN_HOUSE', 'CONTRACTED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "EventType" ADD VALUE 'WORK_CARD';
ALTER TYPE "EventType" ADD VALUE 'MALFUNCTION_PROGRESS';
ALTER TYPE "EventType" ADD VALUE 'TOOL_CHANGED';

-- AlterTable
ALTER TABLE "Vehicle" ADD COLUMN     "tool" TEXT;

-- CreateTable
CREATE TABLE "MalfunctionProgress" (
    "id" TEXT NOT NULL,
    "malfunctionId" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL,
    "body" TEXT NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "MalfunctionProgress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkCard" (
    "id" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "workType" "WorkType" NOT NULL,
    "performedBy" "WorkPerformer" NOT NULL,
    "description" TEXT NOT NULL,
    "doneBy" TEXT,
    "place" TEXT,
    "laborHours" DECIMAL(8,2),
    "odometerKm" INTEGER,
    "engineHours" INTEGER,
    "cost" DECIMAL(12,2),
    "notes" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "WorkCard_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MalfunctionProgress_malfunctionId_at_idx" ON "MalfunctionProgress"("malfunctionId", "at");

-- CreateIndex
CREATE INDEX "WorkCard_vehicleId_date_idx" ON "WorkCard"("vehicleId", "date");

-- CreateIndex
CREATE INDEX "WorkCard_performedBy_idx" ON "WorkCard"("performedBy");

-- AddForeignKey
ALTER TABLE "MalfunctionProgress" ADD CONSTRAINT "MalfunctionProgress_malfunctionId_fkey" FOREIGN KEY ("malfunctionId") REFERENCES "Malfunction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkCard" ADD CONSTRAINT "WorkCard_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

