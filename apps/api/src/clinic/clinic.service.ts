import { Injectable } from '@nestjs/common';
import { prisma } from '@sparki/db';
import { isClinicActive } from '../auth/subscription.guard';
import type { AuthenticatedUser } from '../auth/types';
import { logOrganizationEvent } from '../common/organization-event';
import type { UpdateClinicInput } from './dto/update-clinic.schema';

export interface ClinicProfile {
  id: string;
  name: string;
  legalName: string | null;
  phone: string | null;
  email: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  country: string | null;
  timezone: string | null;
  createdAt: string;
}

export interface OnboardingState {
  organizationId: string;
  clinicName: string;
  onboardingCompletedAt: string | null;
  step: 'CLINIC_DETAILS' | 'INVITE_TEAM' | 'COMPLETE';
  pendingInvitationCount: number;
  teamMemberCount: number;
}

export interface BillingStatusView {
  subscriptionStatus: string;
  isRestricted: boolean;
  currentPeriodEnd: string | null;
  planId: string | null;
}

const CLINIC_SELECT = {
  id: true,
  name: true,
  legalName: true,
  phone: true,
  email: true,
  addressLine1: true,
  addressLine2: true,
  city: true,
  state: true,
  postalCode: true,
  country: true,
  timezone: true,
  createdAt: true,
} as const;

@Injectable()
export class ClinicService {
  async getClinic(organizationId: string): Promise<ClinicProfile> {
    const organization = await prisma.organization.findUniqueOrThrow({
      where: { id: organizationId },
      select: CLINIC_SELECT,
    });
    return { ...organization, createdAt: organization.createdAt.toISOString() };
  }

  async updateClinic(actor: AuthenticatedUser, input: UpdateClinicInput): Promise<ClinicProfile> {
    const data = Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined));
    const changedFields = Object.keys(data);
    const organization = await prisma.organization.update({
      where: { id: actor.organizationId },
      data,
      select: CLINIC_SELECT,
    });

    if (changedFields.length > 0) {
      // Field names only — never the values (address/phone are the clinic's
      // own business contact info, not itself high-sensitivity, but there's
      // no reason for an audit-log row to duplicate it).
      await logOrganizationEvent(prisma, {
        organizationId: actor.organizationId,
        actorUserId: actor.id,
        type: 'CLINIC_PROFILE_UPDATED',
        targetType: 'Organization',
        targetId: actor.organizationId,
        metadata: { fields: changedFields },
      });
    }

    return { ...organization, createdAt: organization.createdAt.toISOString() };
  }

  async getOnboardingState(organizationId: string): Promise<OnboardingState> {
    const organization = await prisma.organization.findUniqueOrThrow({
      where: { id: organizationId },
      select: { name: true, phone: true, timezone: true, onboardingCompletedAt: true },
    });

    const [pendingInvitationCount, teamMemberCount] = await Promise.all([
      prisma.clinicInvitation.count({ where: { organizationId, status: 'PENDING' } }),
      prisma.organizationMembership.count({ where: { organizationId, isActive: true } }),
    ]);

    // phone/timezone are only ever non-null once the owner submits the
    // /setup Step 1 form — ClinicProvisioningService leaves them null. Not a
    // magic-string check against the provisioning placeholder name.
    const hasProfileDetails = Boolean(organization.phone && organization.timezone);

    const step: OnboardingState['step'] = organization.onboardingCompletedAt
      ? 'COMPLETE'
      : hasProfileDetails
        ? 'INVITE_TEAM'
        : 'CLINIC_DETAILS';

    return {
      organizationId,
      clinicName: organization.name,
      onboardingCompletedAt: organization.onboardingCompletedAt?.toISOString() ?? null,
      step,
      pendingInvitationCount,
      teamMemberCount,
    };
  }

  async completeOnboarding(actor: AuthenticatedUser): Promise<OnboardingState> {
    const organization = await prisma.organization.findUniqueOrThrow({
      where: { id: actor.organizationId },
      select: { onboardingCompletedAt: true },
    });

    if (!organization.onboardingCompletedAt) {
      await prisma.organization.update({
        where: { id: actor.organizationId },
        data: { onboardingCompletedAt: new Date() },
      });
      await logOrganizationEvent(prisma, {
        organizationId: actor.organizationId,
        actorUserId: actor.id,
        type: 'ONBOARDING_COMPLETED',
      });
    }

    return this.getOnboardingState(actor.organizationId);
  }

  async getBillingStatus(organizationId: string): Promise<BillingStatusView> {
    const organization = await prisma.organization.findUniqueOrThrow({
      where: { id: organizationId },
      select: { subscriptionStatus: true, subscriptionCurrentPeriodEnd: true, subscriptionPriceId: true },
    });

    return {
      subscriptionStatus: organization.subscriptionStatus,
      isRestricted: !isClinicActive(organization.subscriptionStatus),
      currentPeriodEnd: organization.subscriptionCurrentPeriodEnd?.toISOString() ?? null,
      planId: organization.subscriptionPriceId,
    };
  }
}
