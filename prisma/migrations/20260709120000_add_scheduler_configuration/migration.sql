-- CreateTable
CREATE TABLE "AppointmentTypeSetting" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "appointmentType" "AppointmentType",
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppointmentTypeSetting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SchedulerSettings" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "slotIntervalMinutes" INTEGER NOT NULL DEFAULT 30,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SchedulerSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SchedulerSlotTemplate" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "staffId" TEXT,
    "room" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SchedulerSlotTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AppointmentTypeSetting_locationId_appointmentType_key" ON "AppointmentTypeSetting"("locationId", "appointmentType");

-- CreateIndex
CREATE INDEX "AppointmentTypeSetting_organizationId_idx" ON "AppointmentTypeSetting"("organizationId");

-- CreateIndex
CREATE INDEX "AppointmentTypeSetting_locationId_isActive_sortOrder_idx" ON "AppointmentTypeSetting"("locationId", "isActive", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "SchedulerSettings_locationId_key" ON "SchedulerSettings"("locationId");

-- CreateIndex
CREATE INDEX "SchedulerSettings_organizationId_idx" ON "SchedulerSettings"("organizationId");

-- CreateIndex
CREATE INDEX "SchedulerSlotTemplate_organizationId_idx" ON "SchedulerSlotTemplate"("organizationId");

-- CreateIndex
CREATE INDEX "SchedulerSlotTemplate_locationId_dayOfWeek_isActive_idx" ON "SchedulerSlotTemplate"("locationId", "dayOfWeek", "isActive");

-- AddForeignKey
ALTER TABLE "AppointmentTypeSetting" ADD CONSTRAINT "AppointmentTypeSetting_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppointmentTypeSetting" ADD CONSTRAINT "AppointmentTypeSetting_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchedulerSettings" ADD CONSTRAINT "SchedulerSettings_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchedulerSettings" ADD CONSTRAINT "SchedulerSettings_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchedulerSlotTemplate" ADD CONSTRAINT "SchedulerSlotTemplate_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchedulerSlotTemplate" ADD CONSTRAINT "SchedulerSlotTemplate_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

