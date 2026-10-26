-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "EventType" ADD VALUE 'RECORD_EDITED';
ALTER TYPE "EventType" ADD VALUE 'RECORD_DELETED';
ALTER TYPE "EventType" ADD VALUE 'RECORD_RESTORED';

-- AlterTable
ALTER TABLE "Attachment" ADD COLUMN     "deletedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "hiddenAt" TIMESTAMP(3);
