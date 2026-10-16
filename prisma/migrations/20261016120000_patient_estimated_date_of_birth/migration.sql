-- SPA-40: preserve explicit uncertainty for newly entered dates.
ALTER TABLE "Patient" ADD COLUMN "dateOfBirthEstimated" BOOLEAN NOT NULL DEFAULT false;

-- Historical timestamps do not establish whether a date was estimated.
-- Leave historical records untouched; staff can mark estimates explicitly.
