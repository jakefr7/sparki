-- CreateTable
CREATE TABLE "PatientPrescription" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "catalogItemId" UUID,
    "medicationName" TEXT NOT NULL,
    "strength" TEXT NOT NULL,
    "form" TEXT,
    "directions" TEXT NOT NULL,
    "quantity" DECIMAL(18,8) NOT NULL,
    "quantityUnit" TEXT NOT NULL,
    "allowedRefills" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "version" INTEGER NOT NULL DEFAULT 1,
    "preparedById" TEXT NOT NULL,
    "authorizedById" TEXT,
    "authorizedByName" TEXT,
    "licenseNumber" TEXT,
    "authorizedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "cancellationReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PatientPrescription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PatientPrescriptionEvent" (
    "id" TEXT NOT NULL,
    "prescriptionId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PatientPrescriptionEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PatientPrescription_organizationId_locationId_patientId_cre_idx" ON "PatientPrescription"("organizationId", "locationId", "patientId", "createdAt");

-- CreateIndex
CREATE INDEX "PatientPrescriptionEvent_organizationId_prescriptionId_crea_idx" ON "PatientPrescriptionEvent"("organizationId", "prescriptionId", "createdAt");

-- AddForeignKey
ALTER TABLE "PatientPrescription" ADD CONSTRAINT "PatientPrescription_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientPrescription" ADD CONSTRAINT "PatientPrescription_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientPrescription" ADD CONSTRAINT "PatientPrescription_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientPrescription" ADD CONSTRAINT "PatientPrescription_catalogItemId_fkey" FOREIGN KEY ("catalogItemId") REFERENCES "CatalogItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientPrescription" ADD CONSTRAINT "PatientPrescription_preparedById_fkey" FOREIGN KEY ("preparedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientPrescription" ADD CONSTRAINT "PatientPrescription_authorizedById_fkey" FOREIGN KEY ("authorizedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientPrescriptionEvent" ADD CONSTRAINT "PatientPrescriptionEvent_prescriptionId_fkey" FOREIGN KEY ("prescriptionId") REFERENCES "PatientPrescription"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientPrescriptionEvent" ADD CONSTRAINT "PatientPrescriptionEvent_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientPrescriptionEvent" ADD CONSTRAINT "PatientPrescriptionEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

