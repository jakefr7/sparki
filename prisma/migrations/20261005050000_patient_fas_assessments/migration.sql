CREATE TABLE "PatientFasAssessment" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "locationId" TEXT NOT NULL,
  "patientId" TEXT NOT NULL,
  "visitId" TEXT NOT NULL,
  "requestId" TEXT NOT NULL,
  "score" INTEGER NOT NULL CHECK ("score" BETWEEN 0 AND 5),
  "handlingNotes" TEXT,
  "authorId" TEXT NOT NULL,
  "authorName" TEXT NOT NULL,
  "authorRole" "UserRole" NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PatientFasAssessment_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PatientFasAssessment_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "PatientFasAssessment_visitId_fkey" FOREIGN KEY ("visitId") REFERENCES "Visit"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "PatientFasAssessment_visitId_requestId_key" ON "PatientFasAssessment"("visitId", "requestId");
CREATE INDEX "PatientFasAssessment_org_location_patient_created_id_idx" ON "PatientFasAssessment"("organizationId", "locationId", "patientId", "createdAt", "id");
