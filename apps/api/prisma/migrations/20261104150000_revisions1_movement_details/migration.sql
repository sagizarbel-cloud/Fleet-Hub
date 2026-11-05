-- AlterTable
ALTER TABLE "Movement" ADD COLUMN     "contractor" TEXT,
ADD COLUMN     "cost" DECIMAL(12,2),
ADD COLUMN     "custom" JSONB,
ADD COLUMN     "distanceKm" INTEGER,
ADD COLUMN     "durationHours" DECIMAL(6,1);

