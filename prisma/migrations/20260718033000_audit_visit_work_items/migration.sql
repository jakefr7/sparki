CREATE TABLE "VisitWorkItemChange" (
  "id" TEXT NOT NULL,
  "workItemId" TEXT NOT NULL,
  "visitId" TEXT NOT NULL,
  "actorId" TEXT NOT NULL,
  "fromStatus" "VisitWorkItemStatus",
  "toStatus" "VisitWorkItemStatus" NOT NULL,
  "reason" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "VisitWorkItemChange_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "VisitWorkItemChange_workItemId_createdAt_idx" ON "VisitWorkItemChange"("workItemId", "createdAt");
CREATE INDEX "VisitWorkItemChange_visitId_createdAt_idx" ON "VisitWorkItemChange"("visitId", "createdAt");
ALTER TABLE "VisitWorkItemChange" ADD CONSTRAINT "VisitWorkItemChange_workItemId_fkey" FOREIGN KEY ("workItemId") REFERENCES "VisitWorkItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VisitWorkItemChange" ADD CONSTRAINT "VisitWorkItemChange_visitId_fkey" FOREIGN KEY ("visitId") REFERENCES "Visit"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VisitWorkItemChange" ADD CONSTRAINT "VisitWorkItemChange_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
