CREATE TABLE "AppointmentTypeSlotTemplate" (
    "appointmentTypeId" TEXT NOT NULL,
    "slotTemplateId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AppointmentTypeSlotTemplate_pkey" PRIMARY KEY ("appointmentTypeId", "slotTemplateId")
);

CREATE INDEX "AppointmentTypeSlotTemplate_slotTemplateId_idx"
ON "AppointmentTypeSlotTemplate"("slotTemplateId");

ALTER TABLE "AppointmentTypeSlotTemplate"
ADD CONSTRAINT "AppointmentTypeSlotTemplate_appointmentTypeId_fkey"
FOREIGN KEY ("appointmentTypeId") REFERENCES "AppointmentTypeSetting"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AppointmentTypeSlotTemplate"
ADD CONSTRAINT "AppointmentTypeSlotTemplate_slotTemplateId_fkey"
FOREIGN KEY ("slotTemplateId") REFERENCES "SchedulerSlotTemplate"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
