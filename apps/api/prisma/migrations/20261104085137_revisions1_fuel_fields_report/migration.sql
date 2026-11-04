-- AlterTable
ALTER TABLE "FuelEntry" ADD COLUMN     "fuelTypeId" TEXT,
ADD COLUMN     "fueledBy" TEXT,
ADD COLUMN     "place" TEXT,
ADD COLUMN     "provider" TEXT;

-- CreateTable
CREATE TABLE "FuelType" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "nameHe" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "FuelType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppSetting" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedById" TEXT,

    CONSTRAINT "AppSetting_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "FuelType_code_key" ON "FuelType"("code");

-- AddForeignKey
ALTER TABLE "FuelEntry" ADD CONSTRAINT "FuelEntry_fuelTypeId_fkey" FOREIGN KEY ("fuelTypeId") REFERENCES "FuelType"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Base fuel types for installs that already exist (new installs get them from addBaseLists).
INSERT INTO "FuelType" ("id", "code", "nameEn", "nameHe", "sortOrder") VALUES
  ('base_fuel_diesel', 'diesel', 'Diesel', 'סולר', 0),
  ('base_fuel_petrol_95', 'petrol_95', 'Petrol 95', 'בנזין 95', 1)
ON CONFLICT ("code") DO NOTHING;
