-- Clinic provisioning, subscription/billing state, clinic invitations, and
-- the membership/subscription audit trail. See docs/adr/ADR-007.
--
-- subscriptionStatus defaults to ACTIVE deliberately: every pre-existing
-- Organization-creating code path (dev seeds, other modules' test fixtures)
-- predates billing and must not become blocked by the new subscription
-- gate. Only ClinicProvisioningService (driven by a verified Stripe
-- webhook) creates an Organization with a non-ACTIVE status, and it always
-- sets one explicitly on insert. No backfill is required for existing rows.

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('PENDING', 'ACTIVE', 'PAST_DUE', 'CANCELED', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "MembershipStatus" AS ENUM ('ACTIVE', 'DISABLED');

-- CreateEnum
CREATE TYPE "InvitationStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REVOKED');

-- CreateEnum
CREATE TYPE "OrganizationEventType" AS ENUM ('CLINIC_PROVISIONED', 'OWNER_ACTIVATED', 'INVITATION_CREATED', 'INVITATION_RESENT', 'INVITATION_REVOKED', 'INVITATION_ACCEPTED', 'MEMBERSHIP_ROLE_CHANGED', 'MEMBERSHIP_DISABLED', 'MEMBERSHIP_REENABLED', 'SUBSCRIPTION_STATUS_CHANGED', 'CLINIC_PROFILE_UPDATED', 'ONBOARDING_COMPLETED');

-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "addressLine1" TEXT,
ADD COLUMN     "addressLine2" TEXT,
ADD COLUMN     "city" TEXT,
ADD COLUMN     "country" TEXT,
ADD COLUMN     "email" TEXT,
ADD COLUMN     "legalName" TEXT,
ADD COLUMN     "onboardingCompletedAt" TIMESTAMP(3),
ADD COLUMN     "phone" TEXT,
ADD COLUMN     "postalCode" TEXT,
ADD COLUMN     "state" TEXT,
ADD COLUMN     "stripeCustomerId" TEXT,
ADD COLUMN     "stripeSubscriptionId" TEXT,
ADD COLUMN     "subscriptionCurrentPeriodEnd" TIMESTAMP(3),
ADD COLUMN     "subscriptionPriceId" TEXT,
ADD COLUMN     "subscriptionStatus" "SubscriptionStatus" NOT NULL DEFAULT 'ACTIVE',
ADD COLUMN     "subscriptionStatusUpdatedAt" TIMESTAMP(3),
ADD COLUMN     "timezone" TEXT;

-- AlterTable
ALTER TABLE "OrganizationMembership" ADD COLUMN     "status" "MembershipStatus" NOT NULL DEFAULT 'ACTIVE';

-- CreateTable
CREATE TABLE "ClinicInvitation" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "status" "InvitationStatus" NOT NULL DEFAULT 'PENDING',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "invitedByUserId" TEXT,
    "createdMembershipId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClinicInvitation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrganizationEvent" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "actorUserId" TEXT,
    "type" "OrganizationEventType" NOT NULL,
    "targetType" TEXT,
    "targetId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrganizationEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BillingWebhookEvent" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "organizationId" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),
    "error" TEXT,

    CONSTRAINT "BillingWebhookEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ClinicInvitation_tokenHash_key" ON "ClinicInvitation"("tokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "ClinicInvitation_createdMembershipId_key" ON "ClinicInvitation"("createdMembershipId");

-- CreateIndex
CREATE INDEX "ClinicInvitation_organizationId_status_idx" ON "ClinicInvitation"("organizationId", "status");

-- CreateIndex
CREATE INDEX "ClinicInvitation_organizationId_email_idx" ON "ClinicInvitation"("organizationId", "email");

-- CreateIndex: race-condition guard (defense in depth alongside the
-- application-level "reuse the existing pending invite" check in
-- InvitationsService.invite) — Postgres rejects a second concurrent PENDING
-- invitation for the same organization/email outright. Partial index
-- because email may legitimately repeat across REVOKED/ACCEPTED history.
CREATE UNIQUE INDEX "ClinicInvitation_org_email_pending_key" ON "ClinicInvitation"("organizationId", "email") WHERE "status" = 'PENDING';

-- CreateIndex
CREATE INDEX "OrganizationEvent_organizationId_createdAt_idx" ON "OrganizationEvent"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "OrganizationEvent_organizationId_type_createdAt_idx" ON "OrganizationEvent"("organizationId", "type", "createdAt");

-- CreateIndex
CREATE INDEX "BillingWebhookEvent_organizationId_idx" ON "BillingWebhookEvent"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "Organization_stripeCustomerId_key" ON "Organization"("stripeCustomerId");

-- CreateIndex
CREATE UNIQUE INDEX "Organization_stripeSubscriptionId_key" ON "Organization"("stripeSubscriptionId");

-- AddForeignKey
ALTER TABLE "ClinicInvitation" ADD CONSTRAINT "ClinicInvitation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicInvitation" ADD CONSTRAINT "ClinicInvitation_invitedByUserId_fkey" FOREIGN KEY ("invitedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicInvitation" ADD CONSTRAINT "ClinicInvitation_createdMembershipId_fkey" FOREIGN KEY ("createdMembershipId") REFERENCES "OrganizationMembership"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizationEvent" ADD CONSTRAINT "OrganizationEvent_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizationEvent" ADD CONSTRAINT "OrganizationEvent_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
