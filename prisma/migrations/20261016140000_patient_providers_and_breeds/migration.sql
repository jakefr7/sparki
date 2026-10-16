CREATE TABLE "BreedChoice" (
 "id" TEXT NOT NULL PRIMARY KEY, "organizationId" TEXT NOT NULL REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "species" TEXT NOT NULL, "key" TEXT NOT NULL, "name" TEXT NOT NULL, "isActive" BOOLEAN NOT NULL DEFAULT true
);
CREATE UNIQUE INDEX "BreedChoice_organizationId_species_key_key" ON "BreedChoice"("organizationId", "species", "key");
CREATE TABLE "ReferralContact" (
 "id" TEXT NOT NULL PRIMARY KEY, "organizationId" TEXT NOT NULL REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "hospitalName" TEXT NOT NULL, "veterinarian" TEXT, "email" TEXT, "phone" TEXT, "address" TEXT,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE INDEX "ReferralContact_organizationId_hospitalName_idx" ON "ReferralContact"("organizationId", "hospitalName");
CREATE TABLE "PatientProvider" (
 "id" TEXT NOT NULL PRIMARY KEY, "organizationId" TEXT NOT NULL REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "patientId" TEXT NOT NULL REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE, "contactId" TEXT NOT NULL REFERENCES "ReferralContact"("id") ON DELETE RESTRICT ON UPDATE CASCADE, "kind" TEXT NOT NULL
);
CREATE UNIQUE INDEX "PatientProvider_patientId_contactId_kind_key" ON "PatientProvider"("patientId", "contactId", "kind");
CREATE INDEX "PatientProvider_organizationId_patientId_idx" ON "PatientProvider"("organizationId", "patientId");
ALTER TABLE "Task" ADD COLUMN "patientId" TEXT REFERENCES "Patient"("id") ON DELETE SET NULL ON UPDATE CASCADE,
 ADD COLUMN "requestKey" TEXT, ADD COLUMN "emailTo" TEXT, ADD COLUMN "emailSubject" TEXT, ADD COLUMN "emailBody" TEXT;
CREATE UNIQUE INDEX "Task_requestKey_key" ON "Task"("requestKey");
