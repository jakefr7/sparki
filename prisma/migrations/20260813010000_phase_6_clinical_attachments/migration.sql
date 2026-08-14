CREATE TABLE "ClinicalAttachment" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "locationId" TEXT NOT NULL,
  "patientId" TEXT,
  "visitId" TEXT,
  "clientId" TEXT,
  "fileName" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "sizeBytes" INTEGER NOT NULL,
  "storageKey" TEXT NOT NULL,
  "label" TEXT,
  "uploadedById" TEXT NOT NULL,
  "removedAt" TIMESTAMP(3),
  "supersededById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ClinicalAttachment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ClinicalAttachmentEvent" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "attachmentId" TEXT NOT NULL,
  "actorId" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "reason" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ClinicalAttachmentEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ClinicalAttachment_storageKey_key" ON "ClinicalAttachment"("storageKey");
CREATE INDEX "ClinicalAttachment_organizationId_locationId_patientId_createdAt_idx" ON "ClinicalAttachment"("organizationId", "locationId", "patientId", "createdAt");
CREATE INDEX "ClinicalAttachment_organizationId_locationId_visitId_createdAt_idx" ON "ClinicalAttachment"("organizationId", "locationId", "visitId", "createdAt");
CREATE INDEX "ClinicalAttachmentEvent_organizationId_attachmentId_createdAt_idx" ON "ClinicalAttachmentEvent"("organizationId", "attachmentId", "createdAt");
ALTER TABLE "ClinicalAttachment" ADD CONSTRAINT "ClinicalAttachment_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ClinicalAttachment" ADD CONSTRAINT "ClinicalAttachment_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ClinicalAttachment" ADD CONSTRAINT "ClinicalAttachment_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ClinicalAttachment" ADD CONSTRAINT "ClinicalAttachment_visitId_fkey" FOREIGN KEY ("visitId") REFERENCES "Visit"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ClinicalAttachment" ADD CONSTRAINT "ClinicalAttachment_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ClinicalAttachment" ADD CONSTRAINT "ClinicalAttachment_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ClinicalAttachmentEvent" ADD CONSTRAINT "ClinicalAttachmentEvent_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ClinicalAttachmentEvent" ADD CONSTRAINT "ClinicalAttachmentEvent_attachmentId_fkey" FOREIGN KEY ("attachmentId") REFERENCES "ClinicalAttachment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ClinicalAttachmentEvent" ADD CONSTRAINT "ClinicalAttachmentEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ClinicalAttachment" ADD CONSTRAINT "ClinicalAttachment_association_check" CHECK ("patientId" IS NOT NULL OR "visitId" IS NOT NULL);
