CREATE TABLE "SchedulerConfigChange" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "locationId" TEXT NOT NULL,
  "actorId" TEXT,
  "entityType" TEXT NOT NULL,
  "entityId" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "before" JSONB NOT NULL,
  "after" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SchedulerConfigChange_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SchedulerConfigChange_organizationId_createdAt_idx" ON "SchedulerConfigChange"("organizationId", "createdAt");
CREATE INDEX "SchedulerConfigChange_locationId_createdAt_idx" ON "SchedulerConfigChange"("locationId", "createdAt");
CREATE INDEX "SchedulerConfigChange_entityType_entityId_createdAt_idx" ON "SchedulerConfigChange"("entityType", "entityId", "createdAt");

ALTER TABLE "SchedulerConfigChange" ADD CONSTRAINT "SchedulerConfigChange_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SchedulerConfigChange" ADD CONSTRAINT "SchedulerConfigChange_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SchedulerConfigChange" ADD CONSTRAINT "SchedulerConfigChange_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
