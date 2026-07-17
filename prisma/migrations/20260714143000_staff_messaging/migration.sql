CREATE TYPE "MessagingConversationType" AS ENUM ('DIRECT', 'GROUP', 'CLINIC_CHANNEL', 'DEPARTMENT_CHANNEL', 'LOCATION_CHANNEL', 'PRIVATE_CHANNEL');
CREATE TYPE "MessagingNotificationLevel" AS ENUM ('ALL', 'MENTIONS', 'MUTED');
CREATE TYPE "MessagingRecordType" AS ENUM ('PATIENT', 'CLIENT', 'APPOINTMENT', 'VISIT', 'TASK', 'MEDICAL_RECORD', 'DOCUMENT');

CREATE TABLE "MessagingConversation" (
  "id" TEXT NOT NULL, "organizationId" TEXT NOT NULL, "locationId" TEXT,
  "type" "MessagingConversationType" NOT NULL, "name" TEXT, "description" TEXT,
  "isPrivate" BOOLEAN NOT NULL DEFAULT false, "createdById" TEXT NOT NULL,
  "lastMessageAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MessagingConversation_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "MessagingConversationMember" (
  "id" TEXT NOT NULL, "organizationId" TEXT NOT NULL, "conversationId" TEXT NOT NULL, "userId" TEXT NOT NULL,
  "notificationLevel" "MessagingNotificationLevel" NOT NULL DEFAULT 'ALL', "isPinned" BOOLEAN NOT NULL DEFAULT false,
  "isArchived" BOOLEAN NOT NULL DEFAULT false, "markedUnread" BOOLEAN NOT NULL DEFAULT false, "lastReadAt" TIMESTAMP(3),
  "draft" TEXT NOT NULL DEFAULT '', "drawerOpen" BOOLEAN NOT NULL DEFAULT false, "drawerMinimized" BOOLEAN NOT NULL DEFAULT false,
  "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MessagingConversationMember_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "MessagingMessage" (
  "id" TEXT NOT NULL, "organizationId" TEXT NOT NULL, "conversationId" TEXT NOT NULL, "senderId" TEXT NOT NULL,
  "clientNonce" TEXT, "body" TEXT NOT NULL, "replyToId" TEXT, "editedAt" TIMESTAMP(3), "deletedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MessagingMessage_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "MessagingReaction" ("id" TEXT NOT NULL, "organizationId" TEXT NOT NULL, "messageId" TEXT NOT NULL, "userId" TEXT NOT NULL, "emoji" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "MessagingReaction_pkey" PRIMARY KEY ("id"));
CREATE TABLE "MessagingMention" ("id" TEXT NOT NULL, "organizationId" TEXT NOT NULL, "messageId" TEXT NOT NULL, "userId" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "MessagingMention_pkey" PRIMARY KEY ("id"));
CREATE TABLE "MessagingAttachment" ("id" TEXT NOT NULL, "organizationId" TEXT NOT NULL, "messageId" TEXT NOT NULL, "fileName" TEXT, "mimeType" TEXT, "sizeBytes" INTEGER, "storageKey" TEXT, "recordType" "MessagingRecordType", "recordId" TEXT, "previewLabel" TEXT, "previewDetail" TEXT, "href" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "MessagingAttachment_pkey" PRIMARY KEY ("id"));
CREATE TABLE "MessagingMessageEdit" ("id" TEXT NOT NULL, "organizationId" TEXT NOT NULL, "messageId" TEXT NOT NULL, "editorId" TEXT NOT NULL, "previousBody" TEXT NOT NULL, "action" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "MessagingMessageEdit_pkey" PRIMARY KEY ("id"));

CREATE UNIQUE INDEX "MessagingConversationMember_conversationId_userId_key" ON "MessagingConversationMember"("conversationId", "userId");
CREATE UNIQUE INDEX "MessagingMessage_conversationId_clientNonce_key" ON "MessagingMessage"("conversationId", "clientNonce");
CREATE UNIQUE INDEX "MessagingReaction_messageId_userId_emoji_key" ON "MessagingReaction"("messageId", "userId", "emoji");
CREATE UNIQUE INDEX "MessagingMention_messageId_userId_key" ON "MessagingMention"("messageId", "userId");
CREATE INDEX "MessagingConversation_organizationId_lastMessageAt_idx" ON "MessagingConversation"("organizationId", "lastMessageAt");
CREATE INDEX "MessagingConversation_organizationId_locationId_idx" ON "MessagingConversation"("organizationId", "locationId");
CREATE INDEX "MessagingConversationMember_organizationId_userId_isArchived_idx" ON "MessagingConversationMember"("organizationId", "userId", "isArchived");
CREATE INDEX "MessagingMessage_organizationId_conversationId_createdAt_idx" ON "MessagingMessage"("organizationId", "conversationId", "createdAt");
CREATE INDEX "MessagingReaction_organizationId_messageId_idx" ON "MessagingReaction"("organizationId", "messageId");
CREATE INDEX "MessagingMention_organizationId_userId_idx" ON "MessagingMention"("organizationId", "userId");
CREATE INDEX "MessagingAttachment_organizationId_messageId_idx" ON "MessagingAttachment"("organizationId", "messageId");
CREATE INDEX "MessagingAttachment_organizationId_recordType_recordId_idx" ON "MessagingAttachment"("organizationId", "recordType", "recordId");
CREATE INDEX "MessagingMessageEdit_organizationId_messageId_createdAt_idx" ON "MessagingMessageEdit"("organizationId", "messageId", "createdAt");

ALTER TABLE "MessagingConversation" ADD CONSTRAINT "MessagingConversation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MessagingConversation" ADD CONSTRAINT "MessagingConversation_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MessagingConversation" ADD CONSTRAINT "MessagingConversation_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MessagingConversationMember" ADD CONSTRAINT "MessagingConversationMember_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "MessagingConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MessagingConversationMember" ADD CONSTRAINT "MessagingConversationMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MessagingMessage" ADD CONSTRAINT "MessagingMessage_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MessagingMessage" ADD CONSTRAINT "MessagingMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "MessagingConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MessagingMessage" ADD CONSTRAINT "MessagingMessage_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MessagingMessage" ADD CONSTRAINT "MessagingMessage_replyToId_fkey" FOREIGN KEY ("replyToId") REFERENCES "MessagingMessage"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MessagingReaction" ADD CONSTRAINT "MessagingReaction_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "MessagingMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MessagingReaction" ADD CONSTRAINT "MessagingReaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MessagingMention" ADD CONSTRAINT "MessagingMention_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "MessagingMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MessagingMention" ADD CONSTRAINT "MessagingMention_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MessagingAttachment" ADD CONSTRAINT "MessagingAttachment_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MessagingAttachment" ADD CONSTRAINT "MessagingAttachment_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "MessagingMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MessagingMessageEdit" ADD CONSTRAINT "MessagingMessageEdit_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "MessagingMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MessagingMessageEdit" ADD CONSTRAINT "MessagingMessageEdit_editorId_fkey" FOREIGN KEY ("editorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
