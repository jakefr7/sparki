CREATE TYPE "PatientAlertCategory" AS ENUM ('Behavior', 'Allergy', 'Handling', 'Medical', 'BillingAdmin', 'Other');

CREATE TYPE "PatientAlertSeverity" AS ENUM ('Info', 'Caution', 'Critical');

CREATE TYPE "PatientMedicationStatus" AS ENUM ('Active', 'Discontinued', 'Completed');

CREATE TABLE "PatientAlert" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "patientId" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "category" "PatientAlertCategory" NOT NULL DEFAULT 'Other',
  "severity" "PatientAlertSeverity" NOT NULL DEFAULT 'Caution',
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "archivedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "PatientAlert_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PatientMedication" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "patientId" TEXT NOT NULL,
  "medicationName" TEXT NOT NULL,
  "genericName" TEXT,
  "strength" TEXT,
  "dose" TEXT,
  "route" TEXT,
  "frequency" TEXT,
  "instructions" TEXT,
  "startDate" TIMESTAMP(3),
  "endDate" TIMESTAMP(3),
  "status" "PatientMedicationStatus" NOT NULL DEFAULT 'Active',
  "prescribedBy" TEXT,
  "source" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "PatientMedication_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PatientAlert_organizationId_patientId_isActive_idx" ON "PatientAlert"("organizationId", "patientId", "isActive");

CREATE INDEX "PatientMedication_organizationId_patientId_status_idx" ON "PatientMedication"("organizationId", "patientId", "status");

ALTER TABLE "PatientAlert" ADD CONSTRAINT "PatientAlert_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "PatientAlert" ADD CONSTRAINT "PatientAlert_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "PatientMedication" ADD CONSTRAINT "PatientMedication_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "PatientMedication" ADD CONSTRAINT "PatientMedication_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
