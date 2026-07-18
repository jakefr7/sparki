-- Correct phase/step mismatches introduced when legacy checkout rows were
-- linked, then enforce one active visit per patient and location.

UPDATE "Visit" visit
SET "phase" = step."lifecyclePhase"
FROM "DashboardStatusColorSetting" step
WHERE visit."workflowStepId" = step."id"
  AND visit."state" IN ('PaymentPending', 'PaymentComplete', 'RecordCompletionPending', 'RecordComplete', 'VisitClosing', 'VisitClosingWithExceptions')
  AND visit."phase" <> step."lifecyclePhase";

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "Visit"
    WHERE "state" NOT IN ('Archived', 'ArchivedWithExceptions', 'Cancelled', 'CancelledAfterArrival', 'NoShow', 'Rescheduled', 'Referred', 'Deferred')
    GROUP BY "organizationId", "locationId", "patientId"
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Cannot enforce one active visit per patient/location until duplicate active visits are resolved';
  END IF;
END $$;

CREATE UNIQUE INDEX "Visit_one_active_per_patient_location_key"
ON "Visit"("organizationId", "locationId", "patientId")
WHERE "state" NOT IN ('Archived', 'ArchivedWithExceptions', 'Cancelled', 'CancelledAfterArrival', 'NoShow', 'Rescheduled', 'Referred', 'Deferred');
