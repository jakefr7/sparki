ALTER TABLE "User"
ADD COLUMN "canManageMedications" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "PatientMedication"
ADD COLUMN "catalogItemId" UUID,
ADD COLUMN "discontinueReason" TEXT,
ADD COLUMN "form" TEXT,
ADD COLUMN "reactionNotes" TEXT,
ADD COLUMN "lastRefilledAt" TIMESTAMP(3),
ADD COLUMN "refillCount" INTEGER NOT NULL DEFAULT 0;

CREATE TYPE "PatientMedicationEventType" AS ENUM ('CREATED', 'EDITED', 'REFILLED', 'DISCONTINUED', 'REACTION_FLAGGED');

CREATE TABLE "PatientMedicationEvent" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "medicationId" TEXT NOT NULL,
  "actorId" TEXT,
  "type" "PatientMedicationEventType" NOT NULL,
  "reason" TEXT,
  "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PatientMedicationEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PatientMedication_catalogItemId_idx" ON "PatientMedication"("catalogItemId");
CREATE INDEX "PatientMedicationEvent_organizationId_medicationId_occurredAt_idx" ON "PatientMedicationEvent"("organizationId", "medicationId", "occurredAt");

ALTER TABLE "PatientMedication" ADD CONSTRAINT "PatientMedication_catalogItemId_fkey" FOREIGN KEY ("catalogItemId") REFERENCES "CatalogItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PatientMedicationEvent" ADD CONSTRAINT "PatientMedicationEvent_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PatientMedicationEvent" ADD CONSTRAINT "PatientMedicationEvent_medicationId_fkey" FOREIGN KEY ("medicationId") REFERENCES "PatientMedication"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PatientMedicationEvent" ADD CONSTRAINT "PatientMedicationEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
