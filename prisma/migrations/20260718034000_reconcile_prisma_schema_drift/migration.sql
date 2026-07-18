-- Reconcile historical database object names with the current Prisma schema.
-- This is metadata-only: no application rows are changed or deleted.

DROP TYPE IF EXISTS "DashboardStatus";

ALTER INDEX "ClientCommunicationMessage_organizationId_threadId_createdAt_id"
  RENAME TO "ClientCommunicationMessage_organizationId_threadId_createdA_idx";
ALTER INDEX "ClientCommunicationThread_organizationId_locationId_lastMessage"
  RENAME TO "ClientCommunicationThread_organizationId_locationId_lastMes_idx";
ALTER INDEX "MessagingConversationMember_organizationId_userId_isArchived_id"
  RENAME TO "MessagingConversationMember_organizationId_userId_isArchive_idx";
ALTER INDEX "VisitHandoff_organizationId_locationId_toUserId_acknowledgedAt_"
  RENAME TO "VisitHandoff_organizationId_locationId_toUserId_acknowledge_idx";
