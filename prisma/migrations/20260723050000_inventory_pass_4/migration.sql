-- CreateEnum
CREATE TYPE "ControlledRegistrationType" AS ENUM ('DEA', 'STATE_CONTROLLED', 'STATE_DISPENSING', 'OTHER');

-- CreateEnum
CREATE TYPE "ControlledAuthorizationStatus" AS ENUM ('ACTIVE', 'REVOKED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "ControlledContainerStatus" AS ENUM ('SEALED', 'OPEN', 'DEPLETED', 'QUARANTINED', 'EXPIRED', 'RECALLED', 'PENDING_DISPOSAL', 'DISPOSED');

-- CreateEnum
CREATE TYPE "ControlledEventType" AS ENUM ('INITIAL_BALANCE', 'RECEIVED', 'ADMINISTERED', 'DISPENSED', 'WASTED_DURING_ADMINISTRATION', 'ACCIDENTAL_LOSS', 'DAMAGED', 'EXPIRED', 'RETURNED_TO_VENDOR', 'RETURNED_TO_STOCK', 'QUARANTINED', 'RELEASED_FROM_QUARANTINE', 'TRANSFER_OUT', 'TRANSFER_IN', 'COUNT_ADJUSTMENT', 'CORRECTION', 'REVERSAL', 'DISPOSAL_PENDING', 'DISPOSED', 'THEFT_OR_SIGNIFICANT_LOSS_REVIEW');

-- CreateEnum
CREATE TYPE "ControlledDiscrepancyStatus" AS ENUM ('OPEN', 'INVESTIGATING', 'RECOUNT_REQUIRED', 'CORRECTION_PENDING', 'EXTERNAL_REPORT_REVIEW', 'RESOLVED', 'CLOSED_NO_ADJUSTMENT');

-- CreateEnum
CREATE TYPE "ControlledDiscrepancyClassification" AS ENUM ('DATA_ENTRY_ERROR', 'TIMING_DIFFERENCE', 'UNRECORDED_ADMINISTRATION', 'UNRECORDED_WASTE', 'RECEIVING_ERROR', 'LOCATION_ERROR', 'BREAKAGE_OR_SPILL', 'THEFT_OR_SIGNIFICANT_LOSS_CONCERN', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "ControlledDisposalStatus" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'SCHEDULED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ControlledReportType" AS ENUM ('STATE_DISPENSING', 'ZERO_REPORT', 'THEFT_OR_LOSS', 'DESTRUCTION', 'REGISTRATION_INVENTORY', 'OTHER');

-- CreateEnum
CREATE TYPE "ControlledReportStatus" AS ENUM ('NOT_APPLICABLE', 'READY_FOR_REVIEW', 'ACTION_REQUIRED', 'EXPORTED', 'FILED_EXTERNALLY', 'ACCEPTED_EXTERNALLY', 'REJECTED_EXTERNALLY', 'CORRECTION_REQUIRED');

-- CreateEnum
CREATE TYPE "ControlledApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "InventoryTransactionType" ADD VALUE 'CONTROLLED_ADMINISTERED';
ALTER TYPE "InventoryTransactionType" ADD VALUE 'CONTROLLED_DISPENSED';
ALTER TYPE "InventoryTransactionType" ADD VALUE 'CONTROLLED_WASTE';
ALTER TYPE "InventoryTransactionType" ADD VALUE 'CONTROLLED_DISPOSAL';
ALTER TYPE "InventoryTransactionType" ADD VALUE 'CONTROLLED_CORRECTION';

-- DropForeignKey
ALTER TABLE "InventoryCountAssignment" DROP CONSTRAINT "InventoryCountAssignment_sessionId_fkey";

-- DropForeignKey
ALTER TABLE "InventoryCountEntry" DROP CONSTRAINT "InventoryCountEntry_countLineId_fkey";

-- DropForeignKey
ALTER TABLE "InventoryCountEvent" DROP CONSTRAINT "InventoryCountEvent_sessionId_fkey";

-- DropForeignKey
ALTER TABLE "InventoryCountLine" DROP CONSTRAINT "InventoryCountLine_itemId_fkey";

-- DropForeignKey
ALTER TABLE "InventoryCountLine" DROP CONSTRAINT "InventoryCountLine_sessionId_fkey";

-- DropForeignKey
ALTER TABLE "InventoryReceipt" DROP CONSTRAINT "InventoryReceipt_purchaseOrderId_fkey";

-- DropForeignKey
ALTER TABLE "InventoryReceipt" DROP CONSTRAINT "InventoryReceipt_vendorId_fkey";

-- DropForeignKey
ALTER TABLE "InventoryReceiptLine" DROP CONSTRAINT "InventoryReceiptLine_itemId_fkey";

-- DropForeignKey
ALTER TABLE "InventoryReceiptLine" DROP CONSTRAINT "InventoryReceiptLine_purchaseOrderLineId_fkey";

-- DropForeignKey
ALTER TABLE "InventoryReceiptLine" DROP CONSTRAINT "InventoryReceiptLine_receiptId_fkey";

-- DropForeignKey
ALTER TABLE "InventoryTransferLine" DROP CONSTRAINT "InventoryTransferLine_itemId_fkey";

-- DropForeignKey
ALTER TABLE "InventoryTransferLine" DROP CONSTRAINT "InventoryTransferLine_transferId_fkey";

-- DropForeignKey
ALTER TABLE "PurchaseOrder" DROP CONSTRAINT "PurchaseOrder_vendorId_fkey";

-- DropForeignKey
ALTER TABLE "PurchaseOrderLine" DROP CONSTRAINT "PurchaseOrderLine_itemId_fkey";

-- DropForeignKey
ALTER TABLE "PurchaseOrderLine" DROP CONSTRAINT "PurchaseOrderLine_purchaseOrderId_fkey";

-- DropForeignKey
ALTER TABLE "VendorItem" DROP CONSTRAINT "VendorItem_itemId_fkey";

-- DropForeignKey
ALTER TABLE "VendorItem" DROP CONSTRAINT "VendorItem_vendorId_fkey";

-- CreateTable
CREATE TABLE "ControlledRegistration" (
    "id" UUID NOT NULL,
    "organizationId" TEXT NOT NULL,
    "clinicLocationId" TEXT NOT NULL,
    "type" "ControlledRegistrationType" NOT NULL,
    "authority" TEXT NOT NULL,
    "registrationNumber" TEXT NOT NULL,
    "registrantUserId" TEXT,
    "registrantName" TEXT NOT NULL,
    "legalName" TEXT NOT NULL,
    "registeredAddress" TEXT NOT NULL,
    "effectiveDate" DATE NOT NULL,
    "expirationDate" DATE,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "schedules" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "jurisdiction" TEXT,
    "policy" JSONB,
    "notes" TEXT,
    "createdById" TEXT NOT NULL,
    "archivedAt" TIMESTAMP(3),
    "archivedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ControlledRegistration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ControlledAuthorization" (
    "id" UUID NOT NULL,
    "organizationId" TEXT NOT NULL,
    "clinicLocationId" TEXT NOT NULL,
    "registrationId" UUID NOT NULL,
    "userId" TEXT NOT NULL,
    "authorizationTypes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "effectiveDate" TIMESTAMP(3) NOT NULL,
    "expirationDate" TIMESTAMP(3),
    "status" "ControlledAuthorizationStatus" NOT NULL DEFAULT 'ACTIVE',
    "grantedById" TEXT NOT NULL,
    "revokedById" TEXT,
    "revokedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ControlledAuthorization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ControlledItemProfile" (
    "id" UUID NOT NULL,
    "organizationId" TEXT NOT NULL,
    "clinicLocationId" TEXT NOT NULL,
    "registrationId" UUID NOT NULL,
    "itemId" UUID NOT NULL,
    "federalSchedule" TEXT NOT NULL,
    "stateSchedule" TEXT,
    "ndc" TEXT,
    "deaCode" TEXT,
    "dosageForm" TEXT NOT NULL,
    "strength" TEXT NOT NULL,
    "concentration" TEXT,
    "baseUnit" TEXT NOT NULL,
    "packageConfiguration" JSONB,
    "containerTracking" BOOLEAN NOT NULL DEFAULT false,
    "exactCountRequired" BOOLEAN NOT NULL DEFAULT true,
    "estimatedCountPermitted" BOOLEAN NOT NULL DEFAULT false,
    "openContainerTracking" BOOLEAN NOT NULL DEFAULT false,
    "secureStockLocationIds" UUID[] DEFAULT ARRAY[]::UUID[],
    "administrationPrecision" INTEGER NOT NULL DEFAULT 3,
    "dispensingPrecision" INTEGER NOT NULL DEFAULT 3,
    "discrepancyThreshold" DECIMAL(20,6) NOT NULL DEFAULT 0,
    "witnessRules" JSONB,
    "countFrequencyDays" INTEGER,
    "reportingConfiguration" JSONB,
    "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "effectiveTo" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ControlledItemProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ControlledContainer" (
    "id" UUID NOT NULL,
    "organizationId" TEXT NOT NULL,
    "clinicLocationId" TEXT NOT NULL,
    "registrationId" UUID NOT NULL,
    "profileId" UUID NOT NULL,
    "lotId" UUID,
    "stockLocationId" UUID NOT NULL,
    "containerNumber" TEXT NOT NULL,
    "manufacturerIdentifier" TEXT,
    "barcode" TEXT,
    "packageQuantity" DECIMAL(20,6) NOT NULL,
    "initialQuantity" DECIMAL(20,6) NOT NULL,
    "currentQuantity" DECIMAL(20,6) NOT NULL,
    "status" "ControlledContainerStatus" NOT NULL DEFAULT 'SEALED',
    "openedById" TEXT,
    "openedAt" TIMESTAMP(3),
    "beyondUseDate" DATE,
    "depletedAt" TIMESTAMP(3),
    "quarantinedAt" TIMESTAMP(3),
    "disposedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ControlledContainer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ControlledLedgerSequence" (
    "registrationId" UUID NOT NULL,
    "year" INTEGER NOT NULL,
    "nextValue" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "ControlledLedgerSequence_pkey" PRIMARY KEY ("registrationId","year")
);

-- CreateTable
CREATE TABLE "ControlledLedgerEntry" (
    "id" UUID NOT NULL,
    "organizationId" TEXT NOT NULL,
    "clinicLocationId" TEXT NOT NULL,
    "registrationId" UUID NOT NULL,
    "profileId" UUID NOT NULL,
    "itemId" UUID NOT NULL,
    "lotId" UUID,
    "containerId" UUID,
    "inventoryTransactionId" UUID NOT NULL,
    "transactionGroupId" UUID NOT NULL,
    "entryNumber" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "eventType" "ControlledEventType" NOT NULL,
    "eventAt" TIMESTAMP(3) NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "quantityBefore" DECIMAL(20,6) NOT NULL,
    "quantityChanged" DECIMAL(20,6) NOT NULL,
    "quantityAfter" DECIMAL(20,6) NOT NULL,
    "baseUnitSnapshot" TEXT NOT NULL,
    "dosageFormSnapshot" TEXT NOT NULL,
    "strengthSnapshot" TEXT NOT NULL,
    "scheduleSnapshot" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "patientId" TEXT,
    "clientId" TEXT,
    "visitId" TEXT,
    "appointmentId" TEXT,
    "prescriptionReference" TEXT,
    "invoiceId" TEXT,
    "purchaseOrderId" TEXT,
    "receiptId" UUID,
    "sourceStockLocationId" UUID,
    "destinationStockLocationId" UUID,
    "performedById" TEXT NOT NULL,
    "authorizingVeterinarianId" TEXT,
    "witnessId" TEXT,
    "approverId" TEXT,
    "externalReference" TEXT,
    "correctsEntryId" UUID,
    "reversesEntryId" UUID,
    "notes" TEXT,
    "attestation" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ControlledLedgerEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ControlledDiscrepancyCase" (
    "id" UUID NOT NULL,
    "organizationId" TEXT NOT NULL,
    "clinicLocationId" TEXT NOT NULL,
    "registrationId" UUID NOT NULL,
    "profileId" UUID,
    "itemId" UUID,
    "lotId" UUID,
    "containerId" UUID,
    "caseNumber" TEXT NOT NULL,
    "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "detectedById" TEXT NOT NULL,
    "sourceEventId" UUID,
    "expectedQuantity" DECIMAL(20,6),
    "actualQuantity" DECIMAL(20,6),
    "discrepancyQuantity" DECIMAL(20,6),
    "severity" TEXT NOT NULL,
    "classification" "ControlledDiscrepancyClassification" NOT NULL DEFAULT 'UNKNOWN',
    "status" "ControlledDiscrepancyStatus" NOT NULL DEFAULT 'OPEN',
    "assignedInvestigatorId" TEXT,
    "investigationNotes" TEXT,
    "resolution" TEXT,
    "externalReportingAssessment" TEXT,
    "approvedById" TEXT,
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ControlledDiscrepancyCase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ControlledDisposal" (
    "id" UUID NOT NULL,
    "organizationId" TEXT NOT NULL,
    "clinicLocationId" TEXT NOT NULL,
    "registrationId" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "status" "ControlledDisposalStatus" NOT NULL DEFAULT 'DRAFT',
    "reason" TEXT NOT NULL,
    "proposedMethod" TEXT NOT NULL,
    "disposalLocation" TEXT,
    "authorizedParty" TEXT,
    "externalReference" TEXT,
    "scheduledAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "approvedById" TEXT,
    "completedById" TEXT,
    "witnessIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "notes" TEXT,
    "idempotencyKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ControlledDisposal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ControlledDisposalLine" (
    "id" UUID NOT NULL,
    "disposalId" UUID NOT NULL,
    "profileId" UUID NOT NULL,
    "itemId" UUID NOT NULL,
    "lotId" UUID,
    "containerId" UUID,
    "stockLocationId" UUID NOT NULL,
    "quantity" DECIMAL(20,6) NOT NULL,
    "unitSnapshot" TEXT NOT NULL,
    "pendingLedgerEntryId" UUID,
    "disposedLedgerEntryId" UUID,

    CONSTRAINT "ControlledDisposalLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ControlledExternalReport" (
    "id" UUID NOT NULL,
    "organizationId" TEXT NOT NULL,
    "clinicLocationId" TEXT NOT NULL,
    "registrationId" UUID NOT NULL,
    "type" "ControlledReportType" NOT NULL,
    "status" "ControlledReportStatus" NOT NULL DEFAULT 'READY_FOR_REVIEW',
    "jurisdiction" TEXT NOT NULL,
    "authority" TEXT NOT NULL,
    "reportingPeriodStart" DATE,
    "reportingPeriodEnd" DATE,
    "sourceRecords" JSONB NOT NULL,
    "dueAt" TIMESTAMP(3),
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedById" TEXT,
    "exportedAt" TIMESTAMP(3),
    "externallyFiledAt" TIMESTAMP(3),
    "externalConfirmationNumber" TEXT,
    "notes" TEXT,

    CONSTRAINT "ControlledExternalReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ControlledExternalReportEvent" (
    "id" UUID NOT NULL,
    "reportId" UUID NOT NULL,
    "fromStatus" "ControlledReportStatus",
    "toStatus" "ControlledReportStatus" NOT NULL,
    "actorId" TEXT NOT NULL,
    "notes" TEXT,
    "attestation" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ControlledExternalReportEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ControlledApproval" (
    "id" UUID NOT NULL,
    "organizationId" TEXT NOT NULL,
    "clinicLocationId" TEXT NOT NULL,
    "registrationId" UUID NOT NULL,
    "actionType" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "initiatedById" TEXT NOT NULL,
    "requiredAuthorization" TEXT NOT NULL,
    "status" "ControlledApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "actedById" TEXT,
    "actedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "attestation" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ControlledApproval_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ControlledRegistration_organizationId_clinicLocationId_isAc_idx" ON "ControlledRegistration"("organizationId", "clinicLocationId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "ControlledRegistration_organizationId_clinicLocationId_type_key" ON "ControlledRegistration"("organizationId", "clinicLocationId", "type", "registrationNumber");

-- CreateIndex
CREATE INDEX "ControlledAuthorization_organizationId_clinicLocationId_use_idx" ON "ControlledAuthorization"("organizationId", "clinicLocationId", "userId", "status");

-- CreateIndex
CREATE INDEX "ControlledItemProfile_organizationId_clinicLocationId_itemI_idx" ON "ControlledItemProfile"("organizationId", "clinicLocationId", "itemId", "isActive");

-- CreateIndex
CREATE INDEX "ControlledContainer_organizationId_clinicLocationId_profile_idx" ON "ControlledContainer"("organizationId", "clinicLocationId", "profileId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ControlledContainer_registrationId_containerNumber_key" ON "ControlledContainer"("registrationId", "containerNumber");

-- CreateIndex
CREATE UNIQUE INDEX "ControlledLedgerEntry_inventoryTransactionId_key" ON "ControlledLedgerEntry"("inventoryTransactionId");

-- CreateIndex
CREATE UNIQUE INDEX "ControlledLedgerEntry_reversesEntryId_key" ON "ControlledLedgerEntry"("reversesEntryId");

-- CreateIndex
CREATE INDEX "ControlledLedgerEntry_organizationId_clinicLocationId_event_idx" ON "ControlledLedgerEntry"("organizationId", "clinicLocationId", "eventAt");

-- CreateIndex
CREATE INDEX "ControlledLedgerEntry_profileId_eventAt_idx" ON "ControlledLedgerEntry"("profileId", "eventAt");

-- CreateIndex
CREATE UNIQUE INDEX "ControlledLedgerEntry_registrationId_entryNumber_key" ON "ControlledLedgerEntry"("registrationId", "entryNumber");

-- CreateIndex
CREATE UNIQUE INDEX "ControlledLedgerEntry_organizationId_idempotencyKey_key" ON "ControlledLedgerEntry"("organizationId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "ControlledDiscrepancyCase_organizationId_clinicLocationId_s_idx" ON "ControlledDiscrepancyCase"("organizationId", "clinicLocationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ControlledDiscrepancyCase_organizationId_caseNumber_key" ON "ControlledDiscrepancyCase"("organizationId", "caseNumber");

-- CreateIndex
CREATE UNIQUE INDEX "ControlledDisposal_organizationId_number_key" ON "ControlledDisposal"("organizationId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "ControlledDisposal_organizationId_idempotencyKey_key" ON "ControlledDisposal"("organizationId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "ControlledExternalReport_organizationId_clinicLocationId_st_idx" ON "ControlledExternalReport"("organizationId", "clinicLocationId", "status");

-- CreateIndex
CREATE INDEX "ControlledExternalReportEvent_reportId_createdAt_idx" ON "ControlledExternalReportEvent"("reportId", "createdAt");

-- CreateIndex
CREATE INDEX "ControlledApproval_organizationId_clinicLocationId_status_idx" ON "ControlledApproval"("organizationId", "clinicLocationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ControlledApproval_entityType_entityId_version_key" ON "ControlledApproval"("entityType", "entityId", "version");

-- AddForeignKey
ALTER TABLE "InventoryCountLine" ADD CONSTRAINT "InventoryCountLine_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "InventoryCountSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryCountLine" ADD CONSTRAINT "InventoryCountLine_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "CatalogItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryCountEntry" ADD CONSTRAINT "InventoryCountEntry_countLineId_fkey" FOREIGN KEY ("countLineId") REFERENCES "InventoryCountLine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryCountAssignment" ADD CONSTRAINT "InventoryCountAssignment_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "InventoryCountSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryCountEvent" ADD CONSTRAINT "InventoryCountEvent_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "InventoryCountSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ControlledAuthorization" ADD CONSTRAINT "ControlledAuthorization_registrationId_fkey" FOREIGN KEY ("registrationId") REFERENCES "ControlledRegistration"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ControlledItemProfile" ADD CONSTRAINT "ControlledItemProfile_registrationId_fkey" FOREIGN KEY ("registrationId") REFERENCES "ControlledRegistration"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ControlledItemProfile" ADD CONSTRAINT "ControlledItemProfile_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "CatalogItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ControlledContainer" ADD CONSTRAINT "ControlledContainer_registrationId_fkey" FOREIGN KEY ("registrationId") REFERENCES "ControlledRegistration"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ControlledContainer" ADD CONSTRAINT "ControlledContainer_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "ControlledItemProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ControlledLedgerEntry" ADD CONSTRAINT "ControlledLedgerEntry_registrationId_fkey" FOREIGN KEY ("registrationId") REFERENCES "ControlledRegistration"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ControlledLedgerEntry" ADD CONSTRAINT "ControlledLedgerEntry_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "ControlledItemProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ControlledLedgerEntry" ADD CONSTRAINT "ControlledLedgerEntry_containerId_fkey" FOREIGN KEY ("containerId") REFERENCES "ControlledContainer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ControlledDiscrepancyCase" ADD CONSTRAINT "ControlledDiscrepancyCase_registrationId_fkey" FOREIGN KEY ("registrationId") REFERENCES "ControlledRegistration"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ControlledDiscrepancyCase" ADD CONSTRAINT "ControlledDiscrepancyCase_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "ControlledItemProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ControlledDiscrepancyCase" ADD CONSTRAINT "ControlledDiscrepancyCase_containerId_fkey" FOREIGN KEY ("containerId") REFERENCES "ControlledContainer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ControlledDisposal" ADD CONSTRAINT "ControlledDisposal_registrationId_fkey" FOREIGN KEY ("registrationId") REFERENCES "ControlledRegistration"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ControlledDisposalLine" ADD CONSTRAINT "ControlledDisposalLine_disposalId_fkey" FOREIGN KEY ("disposalId") REFERENCES "ControlledDisposal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ControlledExternalReport" ADD CONSTRAINT "ControlledExternalReport_registrationId_fkey" FOREIGN KEY ("registrationId") REFERENCES "ControlledRegistration"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ControlledExternalReportEvent" ADD CONSTRAINT "ControlledExternalReportEvent_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "ControlledExternalReport"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorItem" ADD CONSTRAINT "VendorItem_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "InventoryVendor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorItem" ADD CONSTRAINT "VendorItem_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "CatalogItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "InventoryVendor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrderLine" ADD CONSTRAINT "PurchaseOrderLine_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrderLine" ADD CONSTRAINT "PurchaseOrderLine_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "CatalogItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryReceipt" ADD CONSTRAINT "InventoryReceipt_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "InventoryVendor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryReceipt" ADD CONSTRAINT "InventoryReceipt_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryReceiptLine" ADD CONSTRAINT "InventoryReceiptLine_receiptId_fkey" FOREIGN KEY ("receiptId") REFERENCES "InventoryReceipt"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryReceiptLine" ADD CONSTRAINT "InventoryReceiptLine_purchaseOrderLineId_fkey" FOREIGN KEY ("purchaseOrderLineId") REFERENCES "PurchaseOrderLine"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryReceiptLine" ADD CONSTRAINT "InventoryReceiptLine_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "CatalogItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryTransferLine" ADD CONSTRAINT "InventoryTransferLine_transferId_fkey" FOREIGN KEY ("transferId") REFERENCES "InventoryTransfer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryTransferLine" ADD CONSTRAINT "InventoryTransferLine_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "CatalogItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
