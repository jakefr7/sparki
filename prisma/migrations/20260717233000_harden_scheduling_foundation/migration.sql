ALTER TABLE "Location"
ADD COLUMN "timeZone" TEXT NOT NULL DEFAULT 'America/Chicago';

ALTER TABLE "Appointment"
ADD COLUMN "schedulerSlotTemplateId" TEXT,
ADD COLUMN "room" TEXT;

DROP INDEX IF EXISTS "AppointmentTypeSetting_locationId_appointmentType_key";
CREATE INDEX "AppointmentTypeSetting_locationId_appointmentType_idx"
ON "AppointmentTypeSetting"("locationId", "appointmentType");

CREATE TABLE "AppointmentChange" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "locationId" TEXT NOT NULL,
  "appointmentId" TEXT NOT NULL,
  "actorId" TEXT,
  "action" TEXT NOT NULL,
  "reason" TEXT,
  "before" JSONB NOT NULL,
  "after" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AppointmentChange_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Appointment_schedulerSlotTemplateId_idx"
ON "Appointment"("schedulerSlotTemplateId");
CREATE INDEX "AppointmentChange_organizationId_createdAt_idx"
ON "AppointmentChange"("organizationId", "createdAt");
CREATE INDEX "AppointmentChange_locationId_createdAt_idx"
ON "AppointmentChange"("locationId", "createdAt");
CREATE INDEX "AppointmentChange_appointmentId_createdAt_idx"
ON "AppointmentChange"("appointmentId", "createdAt");

ALTER TABLE "Appointment"
ADD CONSTRAINT "Appointment_schedulerSlotTemplateId_fkey"
FOREIGN KEY ("schedulerSlotTemplateId") REFERENCES "SchedulerSlotTemplate"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "AppointmentChange"
ADD CONSTRAINT "AppointmentChange_organizationId_fkey"
FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AppointmentChange"
ADD CONSTRAINT "AppointmentChange_locationId_fkey"
FOREIGN KEY ("locationId") REFERENCES "Location"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AppointmentChange"
ADD CONSTRAINT "AppointmentChange_appointmentId_fkey"
FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AppointmentChange"
ADD CONSTRAINT "AppointmentChange_actorId_fkey"
FOREIGN KEY ("actorId") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

-- Preserve the concrete block/resource for existing appointments whenever
-- their current time and provider satisfy today's block policy. Records that
-- do not satisfy policy remain unassigned so the application can surface an
-- explicit scheduling exception instead of inventing history.
WITH matching_blocks AS (
  SELECT
    appointment."id" AS "appointmentId",
    block."id" AS "blockId",
    block."room",
    ROW_NUMBER() OVER (
      PARTITION BY appointment."id"
      ORDER BY block."startTime", block."id"
    ) AS rank
  FROM "Appointment" appointment
  JOIN "Location" location ON location."id" = appointment."locationId"
  JOIN "SchedulerSlotTemplate" block
    ON block."locationId" = appointment."locationId"
   AND block."organizationId" = appointment."organizationId"
   AND block."isActive" = TRUE
   AND block."deletedAt" IS NULL
   AND block."dayOfWeek" = EXTRACT(DOW FROM appointment."scheduledAt" AT TIME ZONE location."timeZone")
   AND (block."staffId" IS NULL OR block."staffId" = appointment."providerId")
  WHERE appointment."appointmentTypeSettingId" IS NOT NULL
    AND TO_CHAR(appointment."scheduledAt" AT TIME ZONE location."timeZone", 'HH24:MI') >= block."startTime"
    AND TO_CHAR(
      appointment."scheduledAt" AT TIME ZONE location."timeZone"
      + COALESCE(appointment."expectedDurationMinutes", 0) * INTERVAL '1 minute',
      'HH24:MI'
    ) <= block."endTime"
    AND (
      (
        EXISTS (
          SELECT 1 FROM "AppointmentTypeSlotTemplate" style_link
          WHERE style_link."appointmentTypeId" = appointment."appointmentTypeSettingId"
        )
        AND EXISTS (
          SELECT 1 FROM "AppointmentTypeSlotTemplate" matching_link
          WHERE matching_link."appointmentTypeId" = appointment."appointmentTypeSettingId"
            AND matching_link."slotTemplateId" = block."id"
        )
      )
      OR
      (
        NOT EXISTS (
          SELECT 1 FROM "AppointmentTypeSlotTemplate" style_link
          WHERE style_link."appointmentTypeId" = appointment."appointmentTypeSettingId"
        )
        AND NOT EXISTS (
          SELECT 1 FROM "AppointmentTypeSlotTemplate" block_link
          WHERE block_link."slotTemplateId" = block."id"
        )
      )
    )
)
UPDATE "Appointment" appointment
SET
  "schedulerSlotTemplateId" = matching."blockId",
  "room" = matching."room"
FROM matching_blocks matching
WHERE matching.rank = 1
  AND matching."appointmentId" = appointment."id"
  AND appointment."schedulerSlotTemplateId" IS NULL;
