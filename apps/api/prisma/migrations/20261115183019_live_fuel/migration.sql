-- CreateEnum
CREATE TYPE "FuelLevelSource" AS ENUM ('MANUAL', 'LIVE');

-- AlterEnum
ALTER TYPE "EventType" ADD VALUE 'FUEL_LEVEL';

-- CreateTable
CREATE TABLE "FuelLevel" (
    "vehicleId" TEXT NOT NULL,
    "pct" DOUBLE PRECISION,
    "liters" DOUBLE PRECISION,
    "at" TIMESTAMP(3) NOT NULL,
    "source" "FuelLevelSource" NOT NULL,
    "deviceId" TEXT,
    "userId" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FuelLevel_pkey" PRIMARY KEY ("vehicleId")
);

-- CreateTable
CREATE TABLE "FuelLevelReading" (
    "id" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL,
    "pct" DOUBLE PRECISION,
    "liters" DOUBLE PRECISION,
    "source" "FuelLevelSource" NOT NULL,
    "deviceId" TEXT,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FuelLevelReading_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TelematicsDevice" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "tokenHint" TEXT NOT NULL,
    "vehicleId" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "lastSeenAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "TelematicsDevice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FuelLevelReading_vehicleId_at_idx" ON "FuelLevelReading"("vehicleId", "at");

-- CreateIndex
CREATE INDEX "FuelLevelReading_source_at_idx" ON "FuelLevelReading"("source", "at");

-- CreateIndex
CREATE UNIQUE INDEX "TelematicsDevice_tokenHash_key" ON "TelematicsDevice"("tokenHash");

-- CreateIndex
CREATE INDEX "TelematicsDevice_vehicleId_idx" ON "TelematicsDevice"("vehicleId");

-- AddForeignKey
ALTER TABLE "FuelLevel" ADD CONSTRAINT "FuelLevel_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FuelLevel" ADD CONSTRAINT "FuelLevel_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "TelematicsDevice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FuelLevelReading" ADD CONSTRAINT "FuelLevelReading_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FuelLevelReading" ADD CONSTRAINT "FuelLevelReading_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "TelematicsDevice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TelematicsDevice" ADD CONSTRAINT "TelematicsDevice_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE SET NULL ON UPDATE CASCADE;
