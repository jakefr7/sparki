-- CreateEnum
CREATE TYPE "RecordsPrepStatus" AS ENUM ('NotStarted', 'Requested', 'Received', 'Reviewed', 'NotAvailable');

-- CreateEnum
CREATE TYPE "ConfirmationStatus" AS ENUM ('NotSent', 'Queued', 'SentManually', 'Confirmed');

-- AlterTable
ALTER TABLE "Appointment" ADD COLUMN "recordsPrepStatus" "RecordsPrepStatus" NOT NULL DEFAULT 'NotStarted',
ADD COLUMN "confirmationStatus" "ConfirmationStatus" NOT NULL DEFAULT 'NotSent';
