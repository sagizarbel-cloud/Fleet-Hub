-- AlterTable
ALTER TABLE "FluidAddition" ADD COLUMN     "custom" JSONB,
ADD COLUMN     "updatedById" TEXT;

-- AlterTable
ALTER TABLE "FuelEntry" ADD COLUMN     "custom" JSONB,
ADD COLUMN     "updatedById" TEXT;

-- AlterTable
ALTER TABLE "Inspection" ADD COLUMN     "custom" JSONB,
ADD COLUMN     "updatedById" TEXT;

-- AlterTable
ALTER TABLE "Malfunction" ADD COLUMN     "custom" JSONB,
ADD COLUMN     "updatedById" TEXT;

-- AlterTable
ALTER TABLE "Movement" ADD COLUMN     "updatedById" TEXT;

-- AlterTable
ALTER TABLE "Note" ADD COLUMN     "custom" JSONB,
ADD COLUMN     "updatedById" TEXT;

-- AlterTable
ALTER TABLE "ServiceRecord" ADD COLUMN     "custom" JSONB,
ADD COLUMN     "updatedById" TEXT;

-- AlterTable
ALTER TABLE "WiggleTest" ADD COLUMN     "custom" JSONB,
ADD COLUMN     "updatedById" TEXT;

-- AlterTable
ALTER TABLE "WorkCard" ADD COLUMN     "custom" JSONB,
ADD COLUMN     "updatedById" TEXT;

