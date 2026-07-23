-- CreateEnum
CREATE TYPE "InventoryUsageSourceType" AS ENUM ('MEDICATION', 'VACCINE', 'LAB_TEST', 'PROCEDURE', 'SURGERY', 'TREATMENT', 'RETAIL_SALE', 'SERVICE', 'BUNDLE', 'OTHER');

-- CreateEnum
CREATE TYPE "InventoryQuantityRule" AS ENUM ('FIXED', 'PER_DOSE', 'PER_UNIT', 'PER_PATIENT_WEIGHT', 'USER_CONFIRMED', 'FORMULA');

-- CreateEnum
CREATE TYPE "InventoryReservationBehavior" AS ENUM ('OFF', 'WHEN_ORDERED', 'WHEN_APPROVED', 'WHEN_PREPARED', 'MANUAL');

-- CreateEnum
CREATE TYPE "InventoryLotSelectionPolicy" AS ENUM ('FEFO', 'FIFO', 'MANUAL', 'LOCATION_PRIORITY');

-- CreateEnum
CREATE TYPE "InventoryFallbackBehavior" AS ENUM ('NONE', 'LOCATION_PRIORITY', 'REQUIRE_CONFIRMATION');

-- CreateEnum
CREATE TYPE "InventoryReservationStatus" AS ENUM ('ACTIVE', 'PARTIALLY_CONSUMED', 'CONSUMED', 'RELEASED', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "InventoryUsageEventStatus" AS ENUM ('PENDING', 'RESERVED', 'POSTED', 'PARTIALLY_POSTED', 'REVERSED', 'CANCELLED', 'NEEDS_REVIEW', 'FAILED');

-- CreateEnum
CREATE TYPE "InventoryUsageEventType" AS ENUM ('MEDICATION_ADMINISTERED', 'MEDICATION_WASTE', 'PRESCRIPTION_DISPENSED', 'VACCINE_ADMINISTERED', 'LAB_TEST_STARTED', 'LAB_TEST_COMPLETED', 'PROCEDURE_COMPLETED', 'SURGERY_COMPLETED', 'TREATMENT_COMPLETED', 'RETAIL_SALE_FINALIZED', 'RETAIL_RETURN', 'CLINICAL_REVERSAL', 'FINANCIAL_REVERSAL', 'MANUAL_USAGE');

-- CreateEnum
CREATE TYPE "InventoryReturnDisposition" AS ENUM ('RETURNED_NOT_RESTOCKABLE', 'RETURNED_QUARANTINED', 'RETURNED_TO_STOCK', 'SENT_FOR_DISPOSAL', 'FINANCIAL_ONLY');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "InventoryTransactionType" ADD VALUE 'CLINICAL_USAGE';
ALTER TYPE "InventoryTransactionType" ADD VALUE 'RETAIL_SALE';
ALTER TYPE "InventoryTransactionType" ADD VALUE 'USAGE_REVERSAL';

-- CreateTable
CREATE TABLE "InventoryUsageMapping" (
    "id" UUID NOT NULL,
    "organizationId" TEXT NOT NULL,
    "clinicLocationId" TEXT,
    "sourceType" "InventoryUsageSourceType" NOT NULL,
    "sourceReference" TEXT NOT NULL,
    "sourceCatalogItemId" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archivedAt" TIMESTAMP(3),
    "reservationBehavior" "InventoryReservationBehavior" NOT NULL DEFAULT 'OFF',
    "deductionEvent" "InventoryUsageEventType" NOT NULL,
    "lotSelectionPolicy" "InventoryLotSelectionPolicy" NOT NULL DEFAULT 'FEFO',
    "createdById" TEXT NOT NULL,
    "updatedById" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InventoryUsageMapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryUsageComponent" (
    "id" UUID NOT NULL,
    "mappingId" UUID NOT NULL,
    "itemId" UUID NOT NULL,
    "quantityRule" "InventoryQuantityRule" NOT NULL,
    "fixedQuantity" DECIMAL(20,8),
    "quantityUnit" TEXT NOT NULL,
    "doseMultiplier" DECIMAL(20,8),
    "weightMultiplier" DECIMAL(20,8),
    "weightUnit" TEXT,
    "formulaConfiguration" JSONB,
    "optional" BOOLEAN NOT NULL DEFAULT false,
    "staffConfirmationRequired" BOOLEAN NOT NULL DEFAULT false,
    "lotSelectionRequired" BOOLEAN NOT NULL DEFAULT false,
    "preferredStockLocationId" UUID,
    "fallbackBehavior" "InventoryFallbackBehavior" NOT NULL DEFAULT 'NONE',
    "wasteAllowance" DECIMAL(20,8) NOT NULL DEFAULT 0,
    "substitutionGroup" TEXT,
    "physicalKit" BOOLEAN NOT NULL DEFAULT false,
    "deductComponents" BOOLEAN NOT NULL DEFAULT true,
    "sequence" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,

    CONSTRAINT "InventoryUsageComponent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryReservation" (
    "id" UUID NOT NULL,
    "organizationId" TEXT NOT NULL,
    "clinicLocationId" TEXT NOT NULL,
    "itemId" UUID NOT NULL,
    "lotId" UUID,
    "controlledContainerId" UUID,
    "stockLocationId" UUID NOT NULL,
    "sourceEventType" "InventoryUsageEventType" NOT NULL,
    "sourceEventId" TEXT NOT NULL,
    "patientId" TEXT,
    "visitId" TEXT,
    "appointmentId" TEXT,
    "invoiceId" TEXT,
    "quantity" DECIMAL(20,6) NOT NULL,
    "consumedQuantity" DECIMAL(20,6) NOT NULL DEFAULT 0,
    "baseUnitSnapshot" TEXT NOT NULL,
    "status" "InventoryReservationStatus" NOT NULL DEFAULT 'ACTIVE',
    "reservedById" TEXT NOT NULL,
    "reservedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "releasedAt" TIMESTAMP(3),
    "consumedAt" TIMESTAMP(3),
    "cancellationReason" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InventoryReservation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryUsageEvent" (
    "id" UUID NOT NULL,
    "organizationId" TEXT NOT NULL,
    "clinicLocationId" TEXT NOT NULL,
    "eventType" "InventoryUsageEventType" NOT NULL,
    "sourceRecordType" TEXT NOT NULL,
    "sourceRecordId" TEXT NOT NULL,
    "sourceEventVersion" INTEGER NOT NULL DEFAULT 1,
    "patientId" TEXT,
    "clientId" TEXT,
    "visitId" TEXT,
    "appointmentId" TEXT,
    "invoiceId" TEXT,
    "invoiceLineId" TEXT,
    "medicationOrderId" TEXT,
    "administrationId" TEXT,
    "prescriptionId" TEXT,
    "dispensingRecordId" TEXT,
    "vaccineRecordId" TEXT,
    "laboratoryRecordId" TEXT,
    "procedureRecordId" TEXT,
    "mappingId" UUID,
    "mappingVersion" INTEGER,
    "mappingSnapshot" JSONB,
    "status" "InventoryUsageEventStatus" NOT NULL DEFAULT 'PENDING',
    "failureCode" TEXT,
    "failureMessage" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "postedAt" TIMESTAMP(3),
    "postedById" TEXT,
    "reversedEventId" UUID,
    "notes" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InventoryUsageEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryUsageEventLine" (
    "id" UUID NOT NULL,
    "usageEventId" UUID NOT NULL,
    "componentSnapshot" JSONB NOT NULL,
    "itemId" UUID NOT NULL,
    "lotId" UUID,
    "controlledContainerId" UUID,
    "stockLocationId" UUID NOT NULL,
    "calculatedQuantity" DECIMAL(20,6) NOT NULL,
    "confirmedQuantity" DECIMAL(20,6) NOT NULL,
    "wastedQuantity" DECIMAL(20,6) NOT NULL DEFAULT 0,
    "unitSnapshot" TEXT NOT NULL,
    "precisionSnapshot" INTEGER NOT NULL,
    "sourceBalance" DECIMAL(20,6),
    "resultingBalance" DECIMAL(20,6),
    "inventoryTransactionId" UUID,
    "controlledLedgerEntryId" UUID,
    "reservationId" UUID,
    "reservationConsumed" DECIMAL(20,6) NOT NULL DEFAULT 0,
    "substitutionItemId" UUID,
    "reason" TEXT,
    "notes" TEXT,

    CONSTRAINT "InventoryUsageEventLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PatientInventoryTrace" (
    "id" UUID NOT NULL,
    "organizationId" TEXT NOT NULL,
    "clinicLocationId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "visitId" TEXT,
    "usageEventId" UUID NOT NULL,
    "itemId" UUID NOT NULL,
    "itemNameSnapshot" TEXT NOT NULL,
    "manufacturerSnapshot" TEXT,
    "lotNumberSnapshot" TEXT,
    "expirationSnapshot" DATE,
    "controlledContainerReference" TEXT,
    "quantity" DECIMAL(20,6) NOT NULL,
    "unitSnapshot" TEXT NOT NULL,
    "route" TEXT,
    "performedById" TEXT NOT NULL,
    "authorizingVeterinarianId" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "reversedAt" TIMESTAMP(3),
    "replacementTraceId" UUID,

    CONSTRAINT "PatientInventoryTrace_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryUsageExportAudit" (
    "id" UUID NOT NULL,
    "organizationId" TEXT NOT NULL,
    "clinicLocationId" TEXT NOT NULL,
    "lotId" UUID NOT NULL,
    "generatedById" TEXT NOT NULL,
    "rowCount" INTEGER NOT NULL,
    "format" TEXT NOT NULL,
    "filters" JSONB,
    "checksum" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InventoryUsageExportAudit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "InventoryUsageMapping_organizationId_clinicLocationId_sourc_idx" ON "InventoryUsageMapping"("organizationId", "clinicLocationId", "sourceType", "sourceReference", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryUsageMapping_organizationId_clinicLocationId_sourc_key" ON "InventoryUsageMapping"("organizationId", "clinicLocationId", "sourceType", "sourceReference", "version");

-- CreateIndex
CREATE INDEX "InventoryUsageComponent_mappingId_sequence_idx" ON "InventoryUsageComponent"("mappingId", "sequence");

-- CreateIndex
CREATE INDEX "InventoryUsageComponent_itemId_idx" ON "InventoryUsageComponent"("itemId");

-- CreateIndex
CREATE INDEX "InventoryReservation_organizationId_clinicLocationId_status_idx" ON "InventoryReservation"("organizationId", "clinicLocationId", "status", "expiresAt");

-- CreateIndex
CREATE INDEX "InventoryReservation_sourceEventType_sourceEventId_idx" ON "InventoryReservation"("sourceEventType", "sourceEventId");

-- CreateIndex
CREATE INDEX "InventoryReservation_itemId_stockLocationId_lotId_idx" ON "InventoryReservation"("itemId", "stockLocationId", "lotId");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryReservation_organizationId_idempotencyKey_key" ON "InventoryReservation"("organizationId", "idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryUsageEvent_reversedEventId_key" ON "InventoryUsageEvent"("reversedEventId");

-- CreateIndex
CREATE INDEX "InventoryUsageEvent_organizationId_clinicLocationId_status__idx" ON "InventoryUsageEvent"("organizationId", "clinicLocationId", "status", "occurredAt");

-- CreateIndex
CREATE INDEX "InventoryUsageEvent_patientId_occurredAt_idx" ON "InventoryUsageEvent"("patientId", "occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryUsageEvent_organizationId_idempotencyKey_key" ON "InventoryUsageEvent"("organizationId", "idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryUsageEvent_clinicLocationId_sourceRecordType_sourc_key" ON "InventoryUsageEvent"("clinicLocationId", "sourceRecordType", "sourceRecordId", "eventType", "sourceEventVersion");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryUsageEventLine_inventoryTransactionId_key" ON "InventoryUsageEventLine"("inventoryTransactionId");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryUsageEventLine_controlledLedgerEntryId_key" ON "InventoryUsageEventLine"("controlledLedgerEntryId");

-- CreateIndex
CREATE INDEX "InventoryUsageEventLine_usageEventId_idx" ON "InventoryUsageEventLine"("usageEventId");

-- CreateIndex
CREATE INDEX "InventoryUsageEventLine_itemId_lotId_idx" ON "InventoryUsageEventLine"("itemId", "lotId");

-- CreateIndex
CREATE INDEX "PatientInventoryTrace_organizationId_patientId_occurredAt_idx" ON "PatientInventoryTrace"("organizationId", "patientId", "occurredAt");

-- CreateIndex
CREATE INDEX "PatientInventoryTrace_organizationId_itemId_lotNumberSnapsh_idx" ON "PatientInventoryTrace"("organizationId", "itemId", "lotNumberSnapshot");

-- CreateIndex
CREATE INDEX "PatientInventoryTrace_usageEventId_idx" ON "PatientInventoryTrace"("usageEventId");

-- CreateIndex
CREATE INDEX "InventoryUsageExportAudit_organizationId_clinicLocationId_l_idx" ON "InventoryUsageExportAudit"("organizationId", "clinicLocationId", "lotId", "createdAt");

-- AddForeignKey
ALTER TABLE "InventoryUsageComponent" ADD CONSTRAINT "InventoryUsageComponent_mappingId_fkey" FOREIGN KEY ("mappingId") REFERENCES "InventoryUsageMapping"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryUsageEvent" ADD CONSTRAINT "InventoryUsageEvent_mappingId_fkey" FOREIGN KEY ("mappingId") REFERENCES "InventoryUsageMapping"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryUsageEvent" ADD CONSTRAINT "InventoryUsageEvent_reversedEventId_fkey" FOREIGN KEY ("reversedEventId") REFERENCES "InventoryUsageEvent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryUsageEventLine" ADD CONSTRAINT "InventoryUsageEventLine_usageEventId_fkey" FOREIGN KEY ("usageEventId") REFERENCES "InventoryUsageEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryUsageEventLine" ADD CONSTRAINT "InventoryUsageEventLine_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "InventoryReservation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientInventoryTrace" ADD CONSTRAINT "PatientInventoryTrace_usageEventId_fkey" FOREIGN KEY ("usageEventId") REFERENCES "InventoryUsageEvent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
