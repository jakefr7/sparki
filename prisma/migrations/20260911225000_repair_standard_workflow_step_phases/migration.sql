-- Older/local status rows created after the original phase migration may
-- still carry the schema default of Arrived. Standard steps have fixed state
-- semantics, so repair only those stale mappings without touching custom
-- steps or explicitly configured non-default phases.
UPDATE "DashboardStatusColorSetting"
SET "lifecyclePhase" = CASE "status"
  WHEN 'BeginIntake' THEN 'Intake'::"VisitPhase"
  WHEN 'ReadyForVeterinarian' THEN 'Exam'::"VisitPhase"
  WHEN 'Exam' THEN 'PlanAndApproval'::"VisitPhase"
  WHEN 'Treatment' THEN 'CareInProgress'::"VisitPhase"
  WHEN 'Discharge' THEN 'Discharge'::"VisitPhase"
  WHEN 'Checkout' THEN 'RecordClosure'::"VisitPhase"
  ELSE "lifecyclePhase"
END
WHERE "lifecyclePhase" = 'Arrived'::"VisitPhase"
  AND "status" IN ('BeginIntake', 'ReadyForVeterinarian', 'Exam', 'Treatment', 'Discharge', 'Checkout');
