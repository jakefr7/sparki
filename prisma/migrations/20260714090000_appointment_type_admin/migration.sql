ALTER TABLE "AppointmentTypeSetting"
  ADD COLUMN "description" TEXT,
  ADD COLUMN "defaultDurationMinutes" INTEGER NOT NULL DEFAULT 30;

ALTER TABLE "Appointment"
  ADD COLUMN "appointmentTypeSettingId" TEXT;

CREATE TABLE "AppointmentTypeProvider" (
  "appointmentTypeId" TEXT NOT NULL,
  "providerId" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AppointmentTypeProvider_pkey" PRIMARY KEY ("appointmentTypeId", "providerId")
);

CREATE INDEX "Appointment_appointmentTypeSettingId_idx" ON "Appointment"("appointmentTypeSettingId");
CREATE INDEX "AppointmentTypeProvider_organizationId_idx" ON "AppointmentTypeProvider"("organizationId");
CREATE INDEX "AppointmentTypeProvider_providerId_idx" ON "AppointmentTypeProvider"("providerId");

ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_appointmentTypeSettingId_fkey"
  FOREIGN KEY ("appointmentTypeSettingId") REFERENCES "AppointmentTypeSetting"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AppointmentTypeProvider" ADD CONSTRAINT "AppointmentTypeProvider_appointmentTypeId_fkey"
  FOREIGN KEY ("appointmentTypeId") REFERENCES "AppointmentTypeSetting"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AppointmentTypeProvider" ADD CONSTRAINT "AppointmentTypeProvider_providerId_fkey"
  FOREIGN KEY ("providerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AppointmentTypeProvider" ADD CONSTRAINT "AppointmentTypeProvider_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Materialize the fixed legacy enum for every location that does not already
-- have settings. The enum remains only as a compatibility value on historical
-- Appointment rows while new scheduling resolves through the setting ID.
INSERT INTO "AppointmentTypeSetting" (
  "id", "organizationId", "locationId", "appointmentType", "name", "color",
  "isActive", "sortOrder", "defaultDurationMinutes", "createdAt", "updatedAt"
)
SELECT
  'apt_' || md5(l."id" || e.value), l."organizationId", l."id", e.value::"AppointmentType",
  CASE e.value
    WHEN 'WellnessPreventiveCare' THEN 'Wellness / Preventive Care'
    WHEN 'SickVisit' THEN 'Sick Visit' WHEN 'Recheck' THEN 'Follow-Up'
    WHEN 'TechnicianAppointment' THEN 'Technician Appointment'
    WHEN 'Vaccination' THEN 'Vaccination' WHEN 'SurgeryProcedure' THEN 'Surgery Consultation'
    WHEN 'DropOff' THEN 'Drop-Off' WHEN 'EmergencyUrgent' THEN 'Urgent Visit'
    WHEN 'Telemedicine' THEN 'Telemedicine' WHEN 'Euthanasia' THEN 'Euthanasia'
    ELSE 'Boarding / Non-medical' END,
  CASE e.value WHEN 'SurgeryProcedure' THEN '#16A34A' WHEN 'EmergencyUrgent' THEN '#DC2626' ELSE '#2563EB' END,
  true, e.ordinality * 10,
  CASE e.value WHEN 'SurgeryProcedure' THEN 60 WHEN 'Euthanasia' THEN 60 ELSE 30 END,
  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Location" l
CROSS JOIN unnest(enum_range(NULL::"AppointmentType")) WITH ORDINALITY AS e(value, ordinality)
ON CONFLICT ("locationId", "appointmentType") DO NOTHING;

UPDATE "Appointment" a SET "appointmentTypeSettingId" = s."id"
FROM "AppointmentTypeSetting" s
WHERE s."locationId" = a."locationId" AND s."appointmentType" = a."type";

-- Preserve existing behavior by initially granting every active appointment-
-- receiving provider with active organization and location access.
INSERT INTO "AppointmentTypeProvider" ("appointmentTypeId", "providerId", "organizationId")
SELECT s."id", u."id", s."organizationId"
FROM "AppointmentTypeSetting" s
JOIN "User" u ON u."organizationId" = s."organizationId" AND u."isActive" = true
JOIN "StaffProfile" sp ON sp."userId" = u."id" AND sp."canReceiveAppointments" = true
JOIN "OrganizationMembership" om ON om."userId" = u."id" AND om."organizationId" = s."organizationId" AND om."isActive" = true
JOIN "ClinicLocationAccess" cla ON cla."userId" = u."id" AND cla."clinicLocationId" = s."locationId" AND cla."organizationId" = s."organizationId" AND cla."isActive" = true
ON CONFLICT DO NOTHING;
