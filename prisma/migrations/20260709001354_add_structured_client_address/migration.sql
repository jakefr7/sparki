/*
  Warnings:

  - You are about to drop the column `address` on the `Client` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Client" DROP COLUMN "address",
ADD COLUMN     "addressLatitude" DOUBLE PRECISION,
ADD COLUMN     "addressLine1" TEXT,
ADD COLUMN     "addressLine2" TEXT,
ADD COLUMN     "addressLongitude" DOUBLE PRECISION,
ADD COLUMN     "addressPlaceId" TEXT,
ADD COLUMN     "city" TEXT,
ADD COLUMN     "country" TEXT,
ADD COLUMN     "formattedAddress" TEXT,
ADD COLUMN     "postalCode" TEXT,
ADD COLUMN     "state" TEXT;
