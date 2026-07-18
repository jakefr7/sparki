ALTER TABLE "SchedulerSlotTemplate"
ADD COLUMN "isGeneralAvailability" BOOLEAN NOT NULL DEFAULT TRUE;

UPDATE "SchedulerSlotTemplate" block
SET "isGeneralAvailability" = FALSE
WHERE EXISTS (
  SELECT 1 FROM "AppointmentTypeSlotTemplate" link
  WHERE link."slotTemplateId" = block."id"
);
