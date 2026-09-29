-- Carry the owner and practice details collected before Stripe Checkout into
-- the verified provisioning and owner activation flow.
ALTER TABLE "Organization" ADD COLUMN "teamSize" TEXT;
ALTER TABLE "ClinicInvitation" ADD COLUMN "suggestedFirstName" TEXT;
ALTER TABLE "ClinicInvitation" ADD COLUMN "suggestedLastName" TEXT;
