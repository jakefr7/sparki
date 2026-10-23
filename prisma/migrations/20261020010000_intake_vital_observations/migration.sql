-- Add observations without changing historical numeric measurements.
ALTER TABLE "VisitIntake" ADD COLUMN "respiratoryPattern" TEXT, ADD COLUMN "crtAssessment" TEXT;
ALTER TABLE "VisitIntake" ADD CONSTRAINT "VisitIntake_respiratory_observation_check" CHECK (("respiratoryPattern" IS NULL OR "respiratoryPattern" = 'Pant') AND ("respiratoryPattern" IS NULL OR "respiratoryRate" IS NULL));
ALTER TABLE "VisitIntake" ADD CONSTRAINT "VisitIntake_crt_observation_check" CHECK (("crtAssessment" IS NULL OR "crtAssessment" IN ('LessThanOneSecond', 'OneToTwoSeconds', 'MoreThanTwoSeconds', 'UnableToAssess', 'NotAssessed')) AND ("crtAssessment" IS NULL OR "crtSeconds" IS NULL));
