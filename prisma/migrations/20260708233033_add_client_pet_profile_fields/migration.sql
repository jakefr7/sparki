-- AlterTable
ALTER TABLE "Client" ADD COLUMN     "address" TEXT,
ADD COLUMN     "alternatePhone" TEXT;

-- AlterTable
ALTER TABLE "Patient" ADD COLUMN     "estimatedAge" TEXT,
ADD COLUMN     "imageUrl" TEXT;
