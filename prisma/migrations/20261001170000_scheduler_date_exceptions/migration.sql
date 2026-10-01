CREATE TABLE "SchedulerDateException" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "locationId" TEXT NOT NULL,
  "date" TEXT NOT NULL,
  "startTime" TEXT,
  "endTime" TEXT,
  "providerId" TEXT,
  "reason" TEXT NOT NULL,
  "deletedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SchedulerDateException_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SchedulerDateException_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "SchedulerDateException_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "SchedulerDateException_organizationId_locationId_date_idx" ON "SchedulerDateException"("organizationId", "locationId", "date");
