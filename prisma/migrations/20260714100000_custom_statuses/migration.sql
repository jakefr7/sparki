ALTER TABLE "DashboardStatusColorSetting" ALTER COLUMN "status" TYPE TEXT USING "status"::TEXT;
ALTER TABLE "DashboardStatusColorSetting" ADD COLUMN "name" TEXT;
ALTER TABLE "DashboardStatusColorSetting" ADD COLUMN "description" TEXT;
ALTER TABLE "DashboardStatusColorSetting" ADD COLUMN "sortOrder" INTEGER NOT NULL DEFAULT 0;

UPDATE "DashboardStatusColorSetting" SET
  "status" = CASE "status"
    WHEN 'Upcoming' THEN 'Appointment' WHEN 'CheckedIn' THEN 'CheckIn'
    WHEN 'InRoom' THEN 'BeginIntake' WHEN 'ReadyForCheckout' THEN 'Discharge'
    WHEN 'Completed' THEN 'Checkout' ELSE "status" END,
  "name" = CASE "status"
    WHEN 'Upcoming' THEN 'Appointment' WHEN 'CheckedIn' THEN 'Check In'
    WHEN 'InRoom' THEN 'Begin Intake' WHEN 'ReadyForCheckout' THEN 'Discharge'
    WHEN 'Completed' THEN 'Checkout' ELSE "status" END;

ALTER TABLE "DashboardStatusColorSetting" ALTER COLUMN "name" SET NOT NULL;

INSERT INTO "DashboardStatusColorSetting" ("id", "organizationId", "locationId", "status", "name", "description", "color", "sortOrder", "createdAt", "updatedAt")
SELECT 'status_' || md5(l."id" || s.key), l."organizationId", l."id", s.key, s.name, s.description, s.color, s.position, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Location" l CROSS JOIN (VALUES
  ('Appointment', 'Appointment', 'Appointment scheduled.', '#64717D', 10),
  ('CheckIn', 'Check In', 'Patient has arrived.', '#13766F', 20),
  ('BeginIntake', 'Begin Intake', 'Intake is in progress.', '#326FA8', 30),
  ('ReadyForVeterinarian', 'Ready for Veterinarian', 'Patient is ready for the veterinarian.', '#7C3AED', 40),
  ('Exam', 'Exam', 'Veterinarian exam is in progress.', '#2563EB', 50),
  ('Treatment', 'Treatment', 'Treatment is in progress.', '#D97706', 60),
  ('Discharge', 'Discharge', 'Patient is ready for discharge.', '#A76118', 70),
  ('Checkout', 'Checkout', 'Visit is complete or checking out.', '#1F7A4D', 80)
) AS s(key, name, description, color, position)
ON CONFLICT ("locationId", "status") DO UPDATE SET "name" = EXCLUDED."name", "description" = EXCLUDED."description", "sortOrder" = EXCLUDED."sortOrder";
