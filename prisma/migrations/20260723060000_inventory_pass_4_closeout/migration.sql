-- CreateEnum
CREATE TYPE "ControlledCountType" AS ENUM ('INITIAL_INVENTORY', 'PERIODIC_COUNT', 'BIENNIAL_INVENTORY', 'SPOT_CHECK', 'SHIFT_COUNT', 'DISCREPANCY_RECOUNT', 'REGISTRATION_CLOSURE_COUNT');

-- CreateEnum
CREATE TYPE "ControlledCountTiming" AS ENUM ('OPEN_OF_BUSINESS', 'CLOSE_OF_BUSINESS', 'DURING_BUSINESS', 'NOT_APPLICABLE');

-- CreateEnum
CREATE TYPE "ControlledCountStatus" AS ENUM ('DRAFT', 'IN_PROGRESS', 'SUBMITTED', 'RECOUNT_REQUIRED', 'FIRST_REVIEW_COMPLETE', 'SECOND_REVIEW_REQUIRED', 'APPROVED', 'POSTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ControlledCorrectionStatus" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'POSTED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ControlledCorrectionReason" AS ENUM ('WRONG_PATIENT', 'WRONG_CLIENT', 'WRONG_ITEM', 'WRONG_LOT', 'WRONG_CONTAINER', 'WRONG_QUANTITY', 'WRONG_UNIT', 'WRONG_EVENT_TIME', 'WRONG_PERFORMING_USER', 'WRONG_PRESCRIBER', 'WRONG_WITNESS', 'DUPLICATE_ENTRY', 'MISSING_WASTE', 'OTHER');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ControlledDisposalStatus" ADD VALUE 'READY_FOR_COMPLETION';
ALTER TYPE "ControlledDisposalStatus" ADD VALUE 'REJECTED';

-- CreateTable
CREATE TABLE "ControlledCountSession" (
    "id" UUID NOT NULL,
    "organizationId" TEXT NOT NULL,
    "clinicLocationId" TEXT NOT NULL,
    "registrationId" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "type" "ControlledCountType" NOT NULL,
    "timing" "ControlledCountTiming" NOT NULL DEFAULT 'NOT_APPLICABLE',
    "status" "ControlledCountStatus" NOT NULL DEFAULT 'DRAFT',
    "startedById" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3),
    "expectedSnapshotAt" TIMESTAMP(3),
    "submittedById" TEXT,
    "submittedAt" TIMESTAMP(3),
    "firstReviewerId" TEXT,
    "firstReviewedAt" TIMESTAMP(3),
    "secondReviewerId" TEXT,
    "secondReviewedAt" TIMESTAMP(3),
    "postedById" TEXT,
    "postedAt" TIMESTAMP(3),
    "cancelledById" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "cancellationReason" TEXT,
    "blindCount" BOOLEAN NOT NULL DEFAULT true,
    "exactCountRequired" BOOLEAN NOT NULL DEFAULT true,
    "estimatedCountPermitted" BOOLEAN NOT NULL DEFAULT false,
    "dualReviewRequired" BOOLEAN NOT NULL DEFAULT true,
    "postingIdempotencyKey" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ControlledCountSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ControlledCountLine" (
    "id" UUID NOT NULL,
    "sessionId" UUID NOT NULL,
    "profileId" UUID NOT NULL,
    "itemId" UUID NOT NULL,
    "lotId" UUID,
    "containerId" UUID,
    "stockLocationId" UUID NOT NULL,
    "profileSnapshot" JSONB NOT NULL,
    "containerSnapshot" JSONB,
    "expectedQuantity" DECIMAL(20,6) NOT NULL,
    "finalQuantity" DECIMAL(20,6),
    "adjustedExpected" DECIMAL(20,6),
    "variance" DECIMAL(20,6),
    "discrepancyId" UUID,
    "postedLedgerEntryId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ControlledCountLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ControlledCountEntry" (
    "id" UUID NOT NULL,
    "lineId" UUID NOT NULL,
    "attemptNumber" INTEGER NOT NULL,
    "quantity" DECIMAL(20,6) NOT NULL,
    "exact" BOOLEAN NOT NULL,
    "sealedPackageCount" DECIMAL(20,6),
    "openedPackageCount" DECIMAL(20,6),
    "measuredQuantity" DECIMAL(20,6),
    "enteredById" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "notes" TEXT,
    "attestation" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ControlledCountEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ControlledCountReview" (
    "id" UUID NOT NULL,
    "sessionId" UUID NOT NULL,
    "stage" INTEGER NOT NULL,
    "reviewerId" TEXT NOT NULL,
    "decision" TEXT NOT NULL,
    "reason" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "attestation" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "organizationKey" TEXT NOT NULL,

    CONSTRAINT "ControlledCountReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ControlledCountEvent" (
    "id" UUID NOT NULL,
    "sessionId" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "details" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ControlledCountEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ControlledCorrectionRequest" (
    "id" UUID NOT NULL,
    "organizationId" TEXT NOT NULL,
    "clinicLocationId" TEXT NOT NULL,
    "registrationId" UUID NOT NULL,
    "originalEntryId" UUID NOT NULL,
    "status" "ControlledCorrectionStatus" NOT NULL DEFAULT 'DRAFT',
    "reason" "ControlledCorrectionReason" NOT NULL,
    "explanation" TEXT NOT NULL,
    "proposedReplacement" JSONB,
    "quantityImpact" DECIMAL(20,6) NOT NULL,
    "patientImpact" BOOLEAN NOT NULL DEFAULT false,
    "reportingImpact" BOOLEAN NOT NULL DEFAULT false,
    "requestedById" TEXT NOT NULL,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "postedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "postingIdempotencyKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ControlledCorrectionRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ControlledCorrectionEvent" (
    "id" UUID NOT NULL,
    "requestId" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "details" JSONB,
    "attestation" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ControlledCorrectionEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ControlledExportAudit" (
    "id" UUID NOT NULL,
    "organizationId" TEXT NOT NULL,
    "clinicLocationId" TEXT NOT NULL,
    "registrationId" UUID NOT NULL,
    "reportType" TEXT NOT NULL,
    "format" TEXT NOT NULL,
    "filters" JSONB NOT NULL,
    "generatedById" TEXT NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rowCount" INTEGER NOT NULL,
    "checksum" TEXT,

    CONSTRAINT "ControlledExportAudit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ControlledCountSession_organizationId_clinicLocationId_stat_idx" ON "ControlledCountSession"("organizationId", "clinicLocationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ControlledCountSession_registrationId_number_key" ON "ControlledCountSession"("registrationId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "ControlledCountSession_organizationId_postingIdempotencyKey_key" ON "ControlledCountSession"("organizationId", "postingIdempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "ControlledCountLine_sessionId_profileId_containerId_lotId_s_key" ON "ControlledCountLine"("sessionId", "profileId", "containerId", "lotId", "stockLocationId");

-- CreateIndex
CREATE UNIQUE INDEX "ControlledCountEntry_lineId_attemptNumber_key" ON "ControlledCountEntry"("lineId", "attemptNumber");

-- CreateIndex
CREATE UNIQUE INDEX "ControlledCountReview_sessionId_stage_key" ON "ControlledCountReview"("sessionId", "stage");

-- CreateIndex
CREATE UNIQUE INDEX "ControlledCountReview_organizationKey_idempotencyKey_key" ON "ControlledCountReview"("organizationKey", "idempotencyKey");

-- CreateIndex
CREATE INDEX "ControlledCountEvent_sessionId_createdAt_idx" ON "ControlledCountEvent"("sessionId", "createdAt");

-- CreateIndex
CREATE INDEX "ControlledCorrectionRequest_organizationId_clinicLocationId_idx" ON "ControlledCorrectionRequest"("organizationId", "clinicLocationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ControlledCorrectionRequest_organizationId_postingIdempoten_key" ON "ControlledCorrectionRequest"("organizationId", "postingIdempotencyKey");

-- CreateIndex
CREATE INDEX "ControlledCorrectionEvent_requestId_createdAt_idx" ON "ControlledCorrectionEvent"("requestId", "createdAt");

-- CreateIndex
CREATE INDEX "ControlledExportAudit_organizationId_clinicLocationId_gener_idx" ON "ControlledExportAudit"("organizationId", "clinicLocationId", "generatedAt");

-- AddForeignKey
ALTER TABLE "ControlledCountLine" ADD CONSTRAINT "ControlledCountLine_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ControlledCountSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ControlledCountEntry" ADD CONSTRAINT "ControlledCountEntry_lineId_fkey" FOREIGN KEY ("lineId") REFERENCES "ControlledCountLine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ControlledCountReview" ADD CONSTRAINT "ControlledCountReview_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ControlledCountSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ControlledCountEvent" ADD CONSTRAINT "ControlledCountEvent_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ControlledCountSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ControlledCorrectionEvent" ADD CONSTRAINT "ControlledCorrectionEvent_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "ControlledCorrectionRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
