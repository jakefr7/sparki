-- AlterTable
ALTER TABLE "Appointment" ADD COLUMN     "importedAt" TIMESTAMP(3),
ADD COLUMN     "sourceConfidence" DOUBLE PRECISION,
ADD COLUMN     "sourceId" TEXT,
ADD COLUMN     "sourceSystem" TEXT;

-- AlterTable
ALTER TABLE "Client" ADD COLUMN     "importedAt" TIMESTAMP(3),
ADD COLUMN     "sourceConfidence" DOUBLE PRECISION,
ADD COLUMN     "sourceId" TEXT,
ADD COLUMN     "sourceSystem" TEXT;

-- AlterTable
ALTER TABLE "MedicalRecord" ADD COLUMN     "importedAt" TIMESTAMP(3),
ADD COLUMN     "sourceConfidence" DOUBLE PRECISION,
ADD COLUMN     "sourceId" TEXT,
ADD COLUMN     "sourceSystem" TEXT;

-- AlterTable
ALTER TABLE "Patient" ADD COLUMN     "importedAt" TIMESTAMP(3),
ADD COLUMN     "sourceConfidence" DOUBLE PRECISION,
ADD COLUMN     "sourceId" TEXT,
ADD COLUMN     "sourceSystem" TEXT;

-- AlterTable
ALTER TABLE "SoapNote" ADD COLUMN     "importedAt" TIMESTAMP(3),
ADD COLUMN     "sourceConfidence" DOUBLE PRECISION,
ADD COLUMN     "sourceId" TEXT,
ADD COLUMN     "sourceSystem" TEXT;

-- CreateIndex
CREATE INDEX "Patient_organizationId_name_idx" ON "Patient"("organizationId", "name");
