-- Client communication core: real texting model (docs/engineering/client-communication-backend.md).
--
-- Every existing ClientCommunicationThread/Message row is simulation data:
-- before this migration no code path could send or receive a real message
-- (docs/specs/phase-5-honest-external-financial-workflows.md). They are
-- removed rather than converted because the new model keys a conversation by
-- a normalized phone number the old rows do not have. Founder-approved
-- 2026-10-02; the demo seed recreates example conversations.
DELETE FROM "ClientCommunicationMessage";
DELETE FROM "ClientCommunicationThread";

-- CreateEnum
CREATE TYPE "ClientCommunicationMessageSource" AS ENUM ('STAFF', 'AUTOMATED', 'CLIENT');

-- CreateEnum
CREATE TYPE "ClientCommunicationMessageStatus" AS ENUM ('QUEUED', 'SENDING', 'SENT', 'DELIVERED', 'DELIVERY_UNCONFIRMED', 'FAILED', 'OUTCOME_UNKNOWN', 'RECEIVED', 'SIMULATED');

-- CreateEnum
CREATE TYPE "ClientCommunicationProvider" AS ENUM ('SIMULATED', 'TELNYX');

-- CreateEnum
CREATE TYPE "ClientCommunicationAttachmentStatus" AS ENUM ('PENDING', 'STORED', 'FAILED');

-- CreateEnum
CREATE TYPE "ClientCommunicationThreadEventType" AS ENUM ('ASSIGNMENT_CHANGED', 'STATUS_CHANGED', 'CLIENT_LINK_CHANGED');

-- CreateEnum
CREATE TYPE "ClientMessagingChannelStatus" AS ENUM ('PENDING', 'ACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "ClientTextingConsentStatus" AS ENUM ('GRANTED', 'OPTED_OUT');

-- CreateEnum
CREATE TYPE "ClientTextingConsentBasis" AS ENUM ('STAFF_RECORDED', 'CLIENT_INITIATED', 'KEYWORD', 'PROVIDER_BLOCK');

-- DropForeignKey
ALTER TABLE "ClientCommunicationThread" DROP CONSTRAINT "ClientCommunicationThread_clientId_fkey";

-- DropForeignKey
ALTER TABLE "ClientCommunicationThread" DROP CONSTRAINT "ClientCommunicationThread_patientId_fkey";

-- DropIndex
DROP INDEX "ClientCommunicationMessage_threadId_providerId_key";

-- AlterTable
ALTER TABLE "Client" ADD COLUMN     "alternatePhoneE164" TEXT,
ADD COLUMN     "phoneE164" TEXT;

-- AlterTable
ALTER TABLE "ClientCommunicationThread" DROP COLUMN "isUnread",
DROP COLUMN "patientId",
DROP COLUMN "phone",
ADD COLUMN     "contactPhoneE164" TEXT NOT NULL,
ADD COLUMN     "deliveryProblemSince" TIMESTAMP(3),
ADD COLUMN     "lastInboundAt" TIMESTAMP(3),
ADD COLUMN     "lastMessageId" TEXT,
ADD COLUMN     "lastReadAt" TIMESTAMP(3),
ADD COLUMN     "lastReadById" TEXT,
ADD COLUMN     "markedUnread" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "unreadCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 1,
ALTER COLUMN "clientId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "ClientCommunicationMessage" DROP COLUMN "providerId",
DROP COLUMN "readAt",
ADD COLUMN     "appointmentId" TEXT,
ADD COLUMN     "attemptCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "claimedAt" TIMESTAMP(3),
ADD COLUMN     "clientId" TEXT,
ADD COLUMN     "failureCode" TEXT,
ADD COLUMN     "failureDetail" TEXT,
ADD COLUMN     "fromE164" TEXT,
ADD COLUMN     "idempotencyKey" TEXT,
ADD COLUMN     "locationId" TEXT NOT NULL,
ADD COLUMN     "nextAttemptAt" TIMESTAMP(3),
ADD COLUMN     "patientId" TEXT,
ADD COLUMN     "provider" "ClientCommunicationProvider" NOT NULL,
ADD COLUMN     "providerMessageId" TEXT,
ADD COLUMN     "segments" INTEGER,
ADD COLUMN     "sentAt" TIMESTAMP(3),
ADD COLUMN     "source" "ClientCommunicationMessageSource" NOT NULL,
ADD COLUMN     "status" "ClientCommunicationMessageStatus" NOT NULL,
ADD COLUMN     "toE164" TEXT,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL;

-- CreateTable
CREATE TABLE "ClientMessagingChannel" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "provider" "ClientCommunicationProvider" NOT NULL,
    "senderPhoneE164" TEXT NOT NULL,
    "providerProfileId" TEXT,
    "providerAccountRef" TEXT,
    "status" "ClientMessagingChannelStatus" NOT NULL DEFAULT 'PENDING',
    "statusReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClientMessagingChannel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClientTextingConsent" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "phoneE164" TEXT NOT NULL,
    "status" "ClientTextingConsentStatus" NOT NULL,
    "basis" "ClientTextingConsentBasis" NOT NULL,
    "method" TEXT,
    "note" TEXT,
    "clientId" TEXT,
    "recordedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClientTextingConsent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClientTextingConsentEvent" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "phoneE164" TEXT NOT NULL,
    "status" "ClientTextingConsentStatus" NOT NULL,
    "basis" "ClientTextingConsentBasis" NOT NULL,
    "method" TEXT,
    "note" TEXT,
    "clientId" TEXT,
    "actorUserId" TEXT,
    "messageId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClientTextingConsentEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClientCommunicationAttachment" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "status" "ClientCommunicationAttachmentStatus" NOT NULL DEFAULT 'PENDING',
    "providerUrl" TEXT,
    "mimeType" TEXT,
    "sizeBytes" INTEGER,
    "storageKey" TEXT,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "failureDetail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClientCommunicationAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClientCommunicationThreadEvent" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "type" "ClientCommunicationThreadEventType" NOT NULL,
    "actorUserId" TEXT,
    "before" JSONB NOT NULL,
    "after" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClientCommunicationThreadEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClientCommunicationWebhookEvent" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "organizationId" TEXT,
    "providerMessageId" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),
    "note" TEXT,

    CONSTRAINT "ClientCommunicationWebhookEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ClientMessagingChannel_locationId_key" ON "ClientMessagingChannel"("locationId");

-- CreateIndex
CREATE UNIQUE INDEX "ClientMessagingChannel_senderPhoneE164_key" ON "ClientMessagingChannel"("senderPhoneE164");

-- CreateIndex
CREATE INDEX "ClientMessagingChannel_organizationId_idx" ON "ClientMessagingChannel"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "ClientTextingConsent_organizationId_phoneE164_key" ON "ClientTextingConsent"("organizationId", "phoneE164");

-- CreateIndex
CREATE INDEX "ClientTextingConsentEvent_organizationId_phoneE164_createdA_idx" ON "ClientTextingConsentEvent"("organizationId", "phoneE164", "createdAt");

-- CreateIndex
CREATE INDEX "ClientCommunicationAttachment_organizationId_messageId_idx" ON "ClientCommunicationAttachment"("organizationId", "messageId");

-- CreateIndex
CREATE INDEX "ClientCommunicationAttachment_status_createdAt_idx" ON "ClientCommunicationAttachment"("status", "createdAt");

-- CreateIndex
CREATE INDEX "ClientCommunicationThreadEvent_organizationId_threadId_crea_idx" ON "ClientCommunicationThreadEvent"("organizationId", "threadId", "createdAt");

-- CreateIndex
CREATE INDEX "Client_organizationId_phoneE164_idx" ON "Client"("organizationId", "phoneE164");

-- CreateIndex
CREATE INDEX "Client_organizationId_alternatePhoneE164_idx" ON "Client"("organizationId", "alternatePhoneE164");

-- CreateIndex
CREATE UNIQUE INDEX "ClientCommunicationThread_lastMessageId_key" ON "ClientCommunicationThread"("lastMessageId");

-- CreateIndex
CREATE INDEX "ClientCommunicationThread_organizationId_locationId_status__idx" ON "ClientCommunicationThread"("organizationId", "locationId", "status", "lastMessageAt");

-- CreateIndex
CREATE UNIQUE INDEX "ClientCommunicationThread_locationId_contactPhoneE164_key" ON "ClientCommunicationThread"("locationId", "contactPhoneE164");

-- CreateIndex
CREATE INDEX "ClientCommunicationMessage_organizationId_threadId_updatedA_idx" ON "ClientCommunicationMessage"("organizationId", "threadId", "updatedAt");

-- CreateIndex
CREATE INDEX "ClientCommunicationMessage_organizationId_patientId_created_idx" ON "ClientCommunicationMessage"("organizationId", "patientId", "createdAt");

-- CreateIndex
CREATE INDEX "ClientCommunicationMessage_appointmentId_idx" ON "ClientCommunicationMessage"("appointmentId");

-- CreateIndex
CREATE INDEX "ClientCommunicationMessage_status_nextAttemptAt_idx" ON "ClientCommunicationMessage"("status", "nextAttemptAt");

-- CreateIndex
CREATE UNIQUE INDEX "ClientCommunicationMessage_threadId_idempotencyKey_key" ON "ClientCommunicationMessage"("threadId", "idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "ClientCommunicationMessage_provider_providerMessageId_key" ON "ClientCommunicationMessage"("provider", "providerMessageId");

-- AddForeignKey
ALTER TABLE "ClientMessagingChannel" ADD CONSTRAINT "ClientMessagingChannel_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientMessagingChannel" ADD CONSTRAINT "ClientMessagingChannel_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientTextingConsent" ADD CONSTRAINT "ClientTextingConsent_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientCommunicationThread" ADD CONSTRAINT "ClientCommunicationThread_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientCommunicationThread" ADD CONSTRAINT "ClientCommunicationThread_lastMessageId_fkey" FOREIGN KEY ("lastMessageId") REFERENCES "ClientCommunicationMessage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientCommunicationMessage" ADD CONSTRAINT "ClientCommunicationMessage_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientCommunicationMessage" ADD CONSTRAINT "ClientCommunicationMessage_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientCommunicationMessage" ADD CONSTRAINT "ClientCommunicationMessage_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientCommunicationAttachment" ADD CONSTRAINT "ClientCommunicationAttachment_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "ClientCommunicationMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientCommunicationThreadEvent" ADD CONSTRAINT "ClientCommunicationThreadEvent_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "ClientCommunicationThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Backfill the normalized copies for existing clients. Mirrors
-- normalizeUsPhone in apps/api/src/common/phone.ts exactly: digits only, an
-- optional leading 1, and a valid North American area code and exchange.
-- Anything else (extensions, short or foreign numbers) stays NULL.
UPDATE "Client" SET "phoneE164" = CASE
  WHEN regexp_replace("phone", '[^0-9]', '', 'g') ~ '^1[2-9][0-9]{2}[2-9][0-9]{6}$' THEN '+' || regexp_replace("phone", '[^0-9]', '', 'g')
  WHEN regexp_replace("phone", '[^0-9]', '', 'g') ~ '^[2-9][0-9]{2}[2-9][0-9]{6}$' THEN '+1' || regexp_replace("phone", '[^0-9]', '', 'g')
  ELSE NULL
END
WHERE "phone" IS NOT NULL;

UPDATE "Client" SET "alternatePhoneE164" = CASE
  WHEN regexp_replace("alternatePhone", '[^0-9]', '', 'g') ~ '^1[2-9][0-9]{2}[2-9][0-9]{6}$' THEN '+' || regexp_replace("alternatePhone", '[^0-9]', '', 'g')
  WHEN regexp_replace("alternatePhone", '[^0-9]', '', 'g') ~ '^[2-9][0-9]{2}[2-9][0-9]{6}$' THEN '+1' || regexp_replace("alternatePhone", '[^0-9]', '', 'g')
  ELSE NULL
END
WHERE "alternatePhone" IS NOT NULL;
