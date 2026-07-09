-- AlterTable
ALTER TABLE "SchedulerSlotTemplate" ADD COLUMN     "deletedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "SchedulerSlotTemplate_locationId_deletedAt_idx" ON "SchedulerSlotTemplate"("locationId", "deletedAt");
