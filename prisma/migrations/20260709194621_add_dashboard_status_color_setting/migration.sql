-- CreateEnum
CREATE TYPE "DashboardStatus" AS ENUM ('Upcoming', 'CheckedIn', 'InRoom', 'ReadyForCheckout', 'Completed');

-- CreateTable
CREATE TABLE "DashboardStatusColorSetting" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "status" "DashboardStatus" NOT NULL,
    "color" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DashboardStatusColorSetting_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DashboardStatusColorSetting_organizationId_idx" ON "DashboardStatusColorSetting"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "DashboardStatusColorSetting_locationId_status_key" ON "DashboardStatusColorSetting"("locationId", "status");

-- AddForeignKey
ALTER TABLE "DashboardStatusColorSetting" ADD CONSTRAINT "DashboardStatusColorSetting_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DashboardStatusColorSetting" ADD CONSTRAINT "DashboardStatusColorSetting_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
