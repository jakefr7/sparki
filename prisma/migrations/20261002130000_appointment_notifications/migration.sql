-- Automated appointment texts and Communication tab visibility
-- (docs/engineering/client-communication-backend.md).
-- CreateEnum
CREATE TYPE "AppointmentNotificationKind" AS ENUM ('CONFIRMATION', 'REMINDER', 'RESCHEDULED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AppointmentNotificationStatus" AS ENUM ('SCHEDULED', 'DISPATCHED', 'SKIPPED', 'CANCELLED');

-- AlterTable
ALTER TABLE "AppointmentChange" ADD COLUMN     "clientNotificationsPlannedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "ClientMessagingChannel" ALTER COLUMN "senderPhoneE164" DROP NOT NULL;

-- CreateTable
CREATE TABLE "AppointmentNotificationSettings" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "sendWindowStartMinute" INTEGER NOT NULL DEFAULT 480,
    "sendWindowEndMinute" INTEGER NOT NULL DEFAULT 1200,
    "appointmentTypeChoices" JSONB NOT NULL DEFAULT '{}',
    "reminderResyncRequestedAt" TIMESTAMP(3),
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppointmentNotificationSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppointmentNotificationRule" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "settingsId" TEXT NOT NULL,
    "kind" "AppointmentNotificationKind" NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "offsetMinutes" INTEGER,
    "template" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppointmentNotificationRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppointmentNotification" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "appointmentId" TEXT NOT NULL,
    "ruleId" TEXT,
    "kind" "AppointmentNotificationKind" NOT NULL,
    "status" "AppointmentNotificationStatus" NOT NULL DEFAULT 'SCHEDULED',
    "dueAt" TIMESTAMP(3) NOT NULL,
    "plannedForStart" TIMESTAMP(3) NOT NULL,
    "previousStart" TIMESTAMP(3),
    "sourceChangeId" TEXT,
    "skipReason" TEXT,
    "messageId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppointmentNotification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AppointmentNotificationSettings_locationId_key" ON "AppointmentNotificationSettings"("locationId");

-- CreateIndex
CREATE INDEX "AppointmentNotificationSettings_organizationId_idx" ON "AppointmentNotificationSettings"("organizationId");

-- CreateIndex
CREATE INDEX "AppointmentNotificationRule_organizationId_locationId_kind_idx" ON "AppointmentNotificationRule"("organizationId", "locationId", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "AppointmentNotification_sourceChangeId_key" ON "AppointmentNotification"("sourceChangeId");

-- CreateIndex
CREATE UNIQUE INDEX "AppointmentNotification_messageId_key" ON "AppointmentNotification"("messageId");

-- CreateIndex
CREATE INDEX "AppointmentNotification_status_dueAt_idx" ON "AppointmentNotification"("status", "dueAt");

-- CreateIndex
CREATE INDEX "AppointmentNotification_organizationId_appointmentId_idx" ON "AppointmentNotification"("organizationId", "appointmentId");

-- CreateIndex
CREATE INDEX "AppointmentChange_clientNotificationsPlannedAt_idx" ON "AppointmentChange"("clientNotificationsPlannedAt");

-- AddForeignKey
ALTER TABLE "AppointmentNotificationSettings" ADD CONSTRAINT "AppointmentNotificationSettings_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppointmentNotificationRule" ADD CONSTRAINT "AppointmentNotificationRule_settingsId_fkey" FOREIGN KEY ("settingsId") REFERENCES "AppointmentNotificationSettings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppointmentNotification" ADD CONSTRAINT "AppointmentNotification_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppointmentNotification" ADD CONSTRAINT "AppointmentNotification_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "AppointmentNotificationRule"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppointmentNotification" ADD CONSTRAINT "AppointmentNotification_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "ClientCommunicationMessage"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Every appointment change that already exists predates automated texts.
-- Mark them as handled so enabling a confirmation or reminder later can
-- never send a text about something that happened before the clinic chose to.
UPDATE "AppointmentChange" SET "clientNotificationsPlannedAt" = CURRENT_TIMESTAMP;

-- Founder decision 2026-10-02: a clinic with no approved texting number does
-- not see the Communication tab at all. Simulation remains, but only for
-- clinics explicitly marked as demo/test with a SIMULATED channel. Every
-- location that exists when this runs is a demo or test clinic (Sparki has no
-- live customers yet), so each keeps simulation; a clinic created afterwards
-- starts with nothing and stays hidden until its number is registered.
INSERT INTO "ClientMessagingChannel" ("id", "organizationId", "locationId", "provider", "status", "createdAt", "updatedAt")
SELECT 'simulated-' || l."id", l."organizationId", l."id", 'SIMULATED', 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Location" l
WHERE NOT EXISTS (SELECT 1 FROM "ClientMessagingChannel" c WHERE c."locationId" = l."id");
