-- Visit lifecycle foundation: durable phases, transition history, owned work,
-- exceptions, handoffs, and explicit delegated record signoff.

CREATE TYPE "VisitPhase" AS ENUM ('Arrived', 'Intake', 'Exam', 'PlanAndApproval', 'CareInProgress', 'Discharge', 'RecordClosure', 'Closed');
CREATE TYPE "VisitTransitionSource" AS ENUM ('User', 'System', 'Integration', 'Migration');
CREATE TYPE "VisitWorkItemType" AS ENUM ('IntakeCompletion', 'Diagnostic', 'Estimate', 'ClientApproval', 'Treatment', 'Medication', 'ClientCommunication', 'FollowUp', 'Payment', 'RecordSignoff');
CREATE TYPE "VisitWorkItemStatus" AS ENUM ('Pending', 'InProgress', 'Completed', 'Declined', 'Deferred', 'Cancelled');
CREATE TYPE "VisitExceptionSeverity" AS ENUM ('Info', 'Warning', 'Critical');

ALTER TABLE "Location" ADD COLUMN "allowCheckoutWithOutstandingBalance" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN "canFinalizeRecordsForOthers" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "Visit"
  ADD COLUMN "phase" "VisitPhase" NOT NULL DEFAULT 'Arrived',
  ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "arrivedAt" TIMESTAMP(3),
  ADD COLUMN "intakeStartedAt" TIMESTAMP(3),
  ADD COLUMN "examStartedAt" TIMESTAMP(3),
  ADD COLUMN "dischargeReadyAt" TIMESTAMP(3),
  ADD COLUMN "departedAt" TIMESTAMP(3),
  ADD COLUMN "closedAt" TIMESTAMP(3);

UPDATE "Visit" SET
  "phase" = CASE
    WHEN "state" IN ('Arrived', 'CheckInInProgress', 'ArrivedWithExceptions', 'Triaged', 'Waiting', 'ReadyForIntake') THEN 'Arrived'::"VisitPhase"
    WHEN "state" = 'IntakeInProgress' THEN 'Intake'::"VisitPhase"
    WHEN "state" IN ('VeterinarianExamReady', 'VeterinarianExamInProgress') THEN 'Exam'::"VisitPhase"
    WHEN "state" IN ('PlanDrafted', 'EstimateNeeded', 'EstimatePrepared', 'ClientApprovalPending', 'Approved', 'PartiallyApproved', 'Declined') THEN 'PlanAndApproval'::"VisitPhase"
    WHEN "state" IN ('DiagnosticsPending', 'DiagnosticsInProgress', 'ResultsPending', 'ResultsReady', 'VeterinarianReviewPending', 'TreatmentPending', 'TreatmentInProgress', 'TreatmentComplete', 'MedicationPending', 'ClientCommunicationPending', 'FollowUpPending') THEN 'CareInProgress'::"VisitPhase"
    WHEN "state" IN ('CheckoutReady', 'CheckoutInProgress', 'PaymentPending', 'PaymentComplete') THEN 'Discharge'::"VisitPhase"
    WHEN "state" IN ('RecordCompletionPending', 'RecordComplete', 'VisitClosing', 'VisitClosingWithExceptions') THEN 'RecordClosure'::"VisitPhase"
    WHEN "state" IN ('Archived', 'ArchivedWithExceptions', 'Cancelled', 'CancelledAfterArrival', 'NoShow', 'Rescheduled', 'Referred', 'Deferred') THEN 'Closed'::"VisitPhase"
    ELSE 'Arrived'::"VisitPhase"
  END,
  "arrivedAt" = CASE WHEN "state" NOT IN ('IntentCreated', 'Scheduled', 'PreVisitPending', 'Confirmed') THEN "createdAt" ELSE NULL END,
  "closedAt" = CASE WHEN "state" IN ('Archived', 'ArchivedWithExceptions', 'Cancelled', 'CancelledAfterArrival', 'NoShow', 'Rescheduled', 'Referred', 'Deferred') THEN COALESCE("archivedAt", "updatedAt") ELSE NULL END;

CREATE TABLE "VisitTransition" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "locationId" TEXT NOT NULL,
  "visitId" TEXT NOT NULL,
  "actorId" TEXT,
  "source" "VisitTransitionSource" NOT NULL DEFAULT 'User',
  "fromPhase" "VisitPhase" NOT NULL,
  "toPhase" "VisitPhase" NOT NULL,
  "fromState" "VisitState" NOT NULL,
  "toState" "VisitState" NOT NULL,
  "reason" TEXT,
  "requestId" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "VisitTransition_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "VisitWorkItem" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "locationId" TEXT NOT NULL,
  "visitId" TEXT NOT NULL,
  "type" "VisitWorkItemType" NOT NULL,
  "status" "VisitWorkItemStatus" NOT NULL DEFAULT 'Pending',
  "title" TEXT NOT NULL,
  "assigneeId" TEXT,
  "assigneeRole" "UserRole",
  "dueAt" TIMESTAMP(3),
  "result" JSONB,
  "completedById" TEXT,
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "VisitWorkItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "VisitException" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "locationId" TEXT NOT NULL,
  "visitId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "severity" "VisitExceptionSeverity" NOT NULL DEFAULT 'Warning',
  "reason" TEXT NOT NULL,
  "nextAction" TEXT NOT NULL,
  "ownerId" TEXT,
  "dueAt" TIMESTAMP(3),
  "createdById" TEXT NOT NULL,
  "resolvedById" TEXT,
  "resolvedAt" TIMESTAMP(3),
  "resolution" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "VisitException_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "VisitHandoff" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "locationId" TEXT NOT NULL,
  "visitId" TEXT NOT NULL,
  "fromUserId" TEXT,
  "toUserId" TEXT,
  "toRole" "UserRole",
  "summary" TEXT NOT NULL,
  "createdById" TEXT NOT NULL,
  "acknowledgedById" TEXT,
  "acknowledgedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "VisitHandoff_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "VisitRecordSignoffDelegate" (
  "visitId" TEXT NOT NULL,
  "delegateId" TEXT NOT NULL,
  "assignedById" TEXT NOT NULL,
  "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "VisitRecordSignoffDelegate_pkey" PRIMARY KEY ("visitId", "delegateId")
);

CREATE INDEX "Visit_organizationId_locationId_phase_idx" ON "Visit"("organizationId", "locationId", "phase");
CREATE INDEX "VisitTransition_visitId_createdAt_idx" ON "VisitTransition"("visitId", "createdAt");
CREATE INDEX "VisitTransition_organizationId_locationId_createdAt_idx" ON "VisitTransition"("organizationId", "locationId", "createdAt");
CREATE INDEX "VisitWorkItem_visitId_status_idx" ON "VisitWorkItem"("visitId", "status");
CREATE INDEX "VisitWorkItem_organizationId_locationId_assigneeId_status_idx" ON "VisitWorkItem"("organizationId", "locationId", "assigneeId", "status");
CREATE INDEX "VisitWorkItem_organizationId_locationId_assigneeRole_status_idx" ON "VisitWorkItem"("organizationId", "locationId", "assigneeRole", "status");
CREATE INDEX "VisitException_visitId_resolvedAt_idx" ON "VisitException"("visitId", "resolvedAt");
CREATE INDEX "VisitException_organizationId_locationId_ownerId_resolvedAt_idx" ON "VisitException"("organizationId", "locationId", "ownerId", "resolvedAt");
CREATE INDEX "VisitHandoff_visitId_createdAt_idx" ON "VisitHandoff"("visitId", "createdAt");
CREATE INDEX "VisitHandoff_organizationId_locationId_toUserId_acknowledgedAt_idx" ON "VisitHandoff"("organizationId", "locationId", "toUserId", "acknowledgedAt");
CREATE INDEX "VisitRecordSignoffDelegate_delegateId_idx" ON "VisitRecordSignoffDelegate"("delegateId");

ALTER TABLE "VisitTransition" ADD CONSTRAINT "VisitTransition_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "VisitTransition" ADD CONSTRAINT "VisitTransition_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "VisitTransition" ADD CONSTRAINT "VisitTransition_visitId_fkey" FOREIGN KEY ("visitId") REFERENCES "Visit"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VisitTransition" ADD CONSTRAINT "VisitTransition_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "VisitWorkItem" ADD CONSTRAINT "VisitWorkItem_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "VisitWorkItem" ADD CONSTRAINT "VisitWorkItem_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "VisitWorkItem" ADD CONSTRAINT "VisitWorkItem_visitId_fkey" FOREIGN KEY ("visitId") REFERENCES "Visit"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VisitWorkItem" ADD CONSTRAINT "VisitWorkItem_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "VisitWorkItem" ADD CONSTRAINT "VisitWorkItem_completedById_fkey" FOREIGN KEY ("completedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "VisitException" ADD CONSTRAINT "VisitException_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "VisitException" ADD CONSTRAINT "VisitException_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "VisitException" ADD CONSTRAINT "VisitException_visitId_fkey" FOREIGN KEY ("visitId") REFERENCES "Visit"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VisitException" ADD CONSTRAINT "VisitException_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "VisitException" ADD CONSTRAINT "VisitException_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "VisitException" ADD CONSTRAINT "VisitException_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "VisitHandoff" ADD CONSTRAINT "VisitHandoff_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "VisitHandoff" ADD CONSTRAINT "VisitHandoff_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "VisitHandoff" ADD CONSTRAINT "VisitHandoff_visitId_fkey" FOREIGN KEY ("visitId") REFERENCES "Visit"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VisitHandoff" ADD CONSTRAINT "VisitHandoff_fromUserId_fkey" FOREIGN KEY ("fromUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "VisitHandoff" ADD CONSTRAINT "VisitHandoff_toUserId_fkey" FOREIGN KEY ("toUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "VisitHandoff" ADD CONSTRAINT "VisitHandoff_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "VisitHandoff" ADD CONSTRAINT "VisitHandoff_acknowledgedById_fkey" FOREIGN KEY ("acknowledgedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "VisitRecordSignoffDelegate" ADD CONSTRAINT "VisitRecordSignoffDelegate_visitId_fkey" FOREIGN KEY ("visitId") REFERENCES "Visit"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VisitRecordSignoffDelegate" ADD CONSTRAINT "VisitRecordSignoffDelegate_delegateId_fkey" FOREIGN KEY ("delegateId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VisitRecordSignoffDelegate" ADD CONSTRAINT "VisitRecordSignoffDelegate_assignedById_fkey" FOREIGN KEY ("assignedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
