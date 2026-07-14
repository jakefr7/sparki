ALTER TABLE "DashboardStatusColorSetting"
  ADD COLUMN "isEnabled" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "isInClinic" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "allowedTransitionKeys" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

UPDATE "DashboardStatusColorSetting" SET
  "isInClinic" = "status" IN ('CheckIn', 'BeginIntake', 'ReadyForVeterinarian', 'Exam', 'Treatment', 'Discharge'),
  "allowedTransitionKeys" = CASE "status"
    WHEN 'Appointment' THEN ARRAY['CheckIn']
    WHEN 'CheckIn' THEN ARRAY['Appointment', 'BeginIntake']
    WHEN 'BeginIntake' THEN ARRAY['CheckIn', 'ReadyForVeterinarian']
    WHEN 'ReadyForVeterinarian' THEN ARRAY['BeginIntake', 'Exam']
    WHEN 'Exam' THEN ARRAY['ReadyForVeterinarian', 'Treatment']
    WHEN 'Treatment' THEN ARRAY['Exam', 'Discharge']
    WHEN 'Discharge' THEN ARRAY['Treatment', 'Checkout']
    WHEN 'Checkout' THEN ARRAY['Discharge']
    ELSE ARRAY[]::TEXT[]
  END;
