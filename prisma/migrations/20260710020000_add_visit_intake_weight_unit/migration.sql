-- CreateEnum
CREATE TYPE "WeightUnit" AS ENUM ('LB', 'KG');

-- AlterTable
-- NOT NULL DEFAULT 'LB' backfills every existing row (including protected
-- demo data) to LB, matching the intake UI's pre-existing "Weight (lb)"
-- label — never silently reinterpreted as KG.
ALTER TABLE "VisitIntake" ADD COLUMN "weightUnit" "WeightUnit" NOT NULL DEFAULT 'LB';
