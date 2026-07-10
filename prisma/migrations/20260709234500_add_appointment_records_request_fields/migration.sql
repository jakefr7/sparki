-- AlterTable
ALTER TABLE "Appointment" ADD COLUMN "primaryCareVetName" TEXT,
ADD COLUMN "previousClinicName" TEXT,
ADD COLUMN "previousRecordsSource" TEXT,
ADD COLUMN "lastSeenAt" TIMESTAMP(3);
