-- Clinic-defined display steps remain customizable, but every step belongs
-- to one protected lifecycle phase. Visits retain their exact configured step.

ALTER TABLE "DashboardStatusColorSetting"
  ADD COLUMN "lifecyclePhase" "VisitPhase" NOT NULL DEFAULT 'Arrived';

UPDATE "DashboardStatusColorSetting" SET "lifecyclePhase" = CASE
  WHEN "status" = 'BeginIntake' THEN 'Intake'::"VisitPhase"
  WHEN "status" IN ('ReadyForVeterinarian', 'Exam') THEN 'Exam'::"VisitPhase"
  WHEN "status" = 'Treatment' THEN 'CareInProgress'::"VisitPhase"
  WHEN "status" = 'Discharge' THEN 'Discharge'::"VisitPhase"
  WHEN "status" IN ('Checkout', 'Completed') THEN 'RecordClosure'::"VisitPhase"
  ELSE 'Arrived'::"VisitPhase"
END;

ALTER TABLE "Visit" ADD COLUMN "workflowStepId" TEXT;

UPDATE "Visit" visit SET "workflowStepId" = step."id"
FROM "DashboardStatusColorSetting" step
WHERE step."organizationId" = visit."organizationId"
  AND step."locationId" = visit."locationId"
  AND step."status" = CASE
    WHEN visit."state" IN ('Arrived', 'CheckInInProgress', 'ArrivedWithExceptions', 'Triaged', 'Waiting', 'ReadyForIntake') THEN 'CheckIn'
    WHEN visit."state" = 'IntakeInProgress' THEN 'BeginIntake'
    WHEN visit."state" = 'VeterinarianExamReady' THEN 'ReadyForVeterinarian'
    WHEN visit."state" = 'VeterinarianExamInProgress' THEN 'Exam'
    WHEN visit."state" IN ('CheckoutReady', 'CheckoutInProgress') THEN 'Discharge'
    WHEN visit."state" IN ('PaymentPending', 'PaymentComplete', 'RecordCompletionPending', 'RecordComplete', 'VisitClosing', 'VisitClosingWithExceptions') THEN 'Checkout'
    ELSE 'Treatment'
  END;

CREATE INDEX "Visit_workflowStepId_idx" ON "Visit"("workflowStepId");
ALTER TABLE "Visit" ADD CONSTRAINT "Visit_workflowStepId_fkey"
  FOREIGN KEY ("workflowStepId") REFERENCES "DashboardStatusColorSetting"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
