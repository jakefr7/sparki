-- Attach legacy appointments to their clinic-defined appointment style so
-- drag/drop restrictions and block tinting work consistently for existing
-- scheduler data. Custom styles are already linked at creation time.
UPDATE "Appointment" AS appointment
SET
  "appointmentTypeSettingId" = setting."id",
  "expectedDurationMinutes" = COALESCE(
    appointment."expectedDurationMinutes",
    setting."defaultDurationMinutes"
  )
FROM "AppointmentTypeSetting" AS setting
WHERE appointment."appointmentTypeSettingId" IS NULL
  AND setting."organizationId" = appointment."organizationId"
  AND setting."locationId" = appointment."locationId"
  AND setting."appointmentType" = appointment."type"
  AND setting."isActive" = TRUE;
