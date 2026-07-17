CREATE TYPE "ClientCommunicationDirection" AS ENUM ('INBOUND', 'OUTBOUND');
CREATE TYPE "ClientCommunicationStatus" AS ENUM ('OPEN', 'WAITING', 'CLOSED');
CREATE TABLE "ClientCommunicationThread" (
  "id" TEXT NOT NULL, "organizationId" TEXT NOT NULL, "locationId" TEXT NOT NULL,
  "clientId" TEXT NOT NULL, "patientId" TEXT, "assignedToId" TEXT, "phone" TEXT NOT NULL,
  "status" "ClientCommunicationStatus" NOT NULL DEFAULT 'OPEN', "isUnread" BOOLEAN NOT NULL DEFAULT false,
  "lastMessageAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "ClientCommunicationThread_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "ClientCommunicationMessage" (
  "id" TEXT NOT NULL, "organizationId" TEXT NOT NULL, "threadId" TEXT NOT NULL, "senderUserId" TEXT,
  "direction" "ClientCommunicationDirection" NOT NULL, "body" TEXT NOT NULL, "providerId" TEXT,
  "deliveredAt" TIMESTAMP(3), "readAt" TIMESTAMP(3), "failedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ClientCommunicationMessage_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ClientCommunicationMessage_threadId_providerId_key" ON "ClientCommunicationMessage"("threadId", "providerId");
CREATE INDEX "ClientCommunicationThread_organizationId_locationId_lastMessageAt_idx" ON "ClientCommunicationThread"("organizationId", "locationId", "lastMessageAt");
CREATE INDEX "ClientCommunicationThread_organizationId_clientId_idx" ON "ClientCommunicationThread"("organizationId", "clientId");
CREATE INDEX "ClientCommunicationMessage_organizationId_threadId_createdAt_idx" ON "ClientCommunicationMessage"("organizationId", "threadId", "createdAt");
ALTER TABLE "ClientCommunicationThread" ADD CONSTRAINT "ClientCommunicationThread_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ClientCommunicationThread" ADD CONSTRAINT "ClientCommunicationThread_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ClientCommunicationThread" ADD CONSTRAINT "ClientCommunicationThread_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ClientCommunicationThread" ADD CONSTRAINT "ClientCommunicationThread_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ClientCommunicationThread" ADD CONSTRAINT "ClientCommunicationThread_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ClientCommunicationMessage" ADD CONSTRAINT "ClientCommunicationMessage_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ClientCommunicationMessage" ADD CONSTRAINT "ClientCommunicationMessage_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "ClientCommunicationThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ClientCommunicationMessage" ADD CONSTRAINT "ClientCommunicationMessage_senderUserId_fkey" FOREIGN KEY ("senderUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
