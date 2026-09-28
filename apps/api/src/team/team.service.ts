import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { prisma, type UserRole } from '@sparki/db';
import type { AuthenticatedUser } from '../auth/types';
import { logOrganizationEvent } from '../common/organization-event';
import { InvitationsService, type InvitationSummary } from '../invitations/invitations.service';

export interface MembershipSummary {
  membershipId: string;
  userId: string;
  firstName: string;
  lastName: string;
  displayName: string;
  email: string;
  role: UserRole;
  status: 'ACTIVE' | 'DISABLED';
  createdAt: string;
}

export interface InviteBatchResult {
  email: string;
  success: boolean;
  invitation?: InvitationSummary;
  error?: string;
}

/** Only an existing OWNER may grant OWNER or change another OWNER's role —
 *  ADMIN (PRACTICE_MANAGER) manages everyone else but "should not own
 *  ownership transfer unless explicitly supported" (task requirement). */
function assertCanManageRole(actor: AuthenticatedUser, targetCurrentRole: UserRole, targetNewRole: UserRole): void {
  const touchesOwnership = targetCurrentRole === 'OWNER' || targetNewRole === 'OWNER';
  if (touchesOwnership && actor.role !== 'OWNER') {
    throw new ForbiddenException('Only an existing owner can grant ownership or change another owner\'s role.');
  }
}

@Injectable()
export class TeamService {
  constructor(private readonly invitations: InvitationsService) {}

  async listMembers(organizationId: string): Promise<MembershipSummary[]> {
    const memberships = await prisma.organizationMembership.findMany({
      where: { organizationId },
      include: { user: true },
      orderBy: [{ status: 'asc' }, { createdAt: 'asc' }],
    });

    return memberships.map((membership) => ({
      membershipId: membership.id,
      userId: membership.userId,
      firstName: membership.user.firstName,
      lastName: membership.user.lastName,
      displayName: membership.user.displayName ?? `${membership.user.firstName} ${membership.user.lastName}`,
      email: membership.user.email,
      role: membership.role,
      status: membership.status,
      createdAt: membership.createdAt.toISOString(),
    }));
  }

  async listInvitations(organizationId: string): Promise<InvitationSummary[]> {
    return this.invitations.list(organizationId);
  }

  async invite(actor: AuthenticatedUser, email: string, role: UserRole): Promise<InvitationSummary> {
    if (role === 'OWNER' && actor.role !== 'OWNER') {
      throw new ForbiddenException('Only an existing owner can invite another owner.');
    }
    return this.invitations.invite({
      organizationId: actor.organizationId,
      clinicName: await this.getClinicName(actor.organizationId),
      email,
      role,
      invitedByUserId: actor.id,
      invitedByName: actor.name,
    });
  }

  /** Step 3 of /setup — invites several people in one call. Each row
   *  succeeds or fails independently so one bad email doesn't discard the
   *  rest of the batch. */
  async inviteBatch(actor: AuthenticatedUser, rows: { email: string; role: UserRole }[]): Promise<InviteBatchResult[]> {
    const results: InviteBatchResult[] = [];
    for (const row of rows) {
      try {
        const invitation = await this.invite(actor, row.email, row.role);
        results.push({ email: row.email, success: true, invitation });
      } catch (error) {
        results.push({
          email: row.email,
          success: false,
          error: error instanceof Error ? error.message : 'Failed to send invitation.',
        });
      }
    }
    return results;
  }

  async resendInvitation(actor: AuthenticatedUser, invitationId: string): Promise<InvitationSummary> {
    return this.invitations.resend({
      organizationId: actor.organizationId,
      clinicName: await this.getClinicName(actor.organizationId),
      invitationId,
      actorUserId: actor.id,
      actorName: actor.name,
    });
  }

  private async getClinicName(organizationId: string): Promise<string> {
    const organization = await prisma.organization.findUniqueOrThrow({
      where: { id: organizationId },
      select: { name: true },
    });
    return organization.name;
  }

  async revokeInvitation(actor: AuthenticatedUser, invitationId: string): Promise<InvitationSummary> {
    return this.invitations.revoke({
      organizationId: actor.organizationId,
      invitationId,
      actorUserId: actor.id,
    });
  }

  async changeRole(actor: AuthenticatedUser, membershipId: string, newRole: UserRole): Promise<MembershipSummary> {
    const membership = await prisma.organizationMembership.findFirst({
      where: { id: membershipId, organizationId: actor.organizationId },
      include: { user: true },
    });
    if (!membership) {
      throw new NotFoundException('Team member not found.');
    }

    assertCanManageRole(actor, membership.role, newRole);

    if (membership.role === 'OWNER' && newRole !== 'OWNER') {
      await this.assertNotLastOwner(actor.organizationId, membership.id);
    }

    const [updated] = await prisma.$transaction([
      prisma.organizationMembership.update({
        where: { id: membership.id },
        data: { role: newRole },
        include: { user: true },
      }),
      prisma.clinicLocationAccess.updateMany({
        where: { organizationId: actor.organizationId, userId: membership.userId },
        data: { role: newRole },
      }),
    ]);

    await logOrganizationEvent(prisma, {
      organizationId: actor.organizationId,
      actorUserId: actor.id,
      type: 'MEMBERSHIP_ROLE_CHANGED',
      targetType: 'OrganizationMembership',
      targetId: membership.id,
      metadata: { userId: membership.userId, from: membership.role, to: newRole },
    });

    return {
      membershipId: updated.id,
      userId: updated.userId,
      firstName: updated.user.firstName,
      lastName: updated.user.lastName,
      displayName: updated.user.displayName ?? `${updated.user.firstName} ${updated.user.lastName}`,
      email: updated.user.email,
      role: updated.role,
      status: updated.status,
      createdAt: updated.createdAt.toISOString(),
    };
  }

  async disable(actor: AuthenticatedUser, membershipId: string): Promise<MembershipSummary> {
    const membership = await prisma.organizationMembership.findFirst({
      where: { id: membershipId, organizationId: actor.organizationId },
      include: { user: true },
    });
    if (!membership) {
      throw new NotFoundException('Team member not found.');
    }
    if (membership.userId === actor.id) {
      throw new ConflictException('You cannot disable your own membership.');
    }
    if (membership.role === 'OWNER') {
      await this.assertNotLastOwner(actor.organizationId, membership.id);
    }
    if (membership.role === 'OWNER' && actor.role !== 'OWNER') {
      throw new ForbiddenException('Only an existing owner can disable another owner.');
    }

    const [updated] = await prisma.$transaction([
      prisma.organizationMembership.update({
        where: { id: membership.id },
        data: { isActive: false, status: 'DISABLED' },
        include: { user: true },
      }),
      prisma.clinicLocationAccess.updateMany({
        where: { organizationId: actor.organizationId, userId: membership.userId },
        data: { isActive: false },
      }),
    ]);

    await logOrganizationEvent(prisma, {
      organizationId: actor.organizationId,
      actorUserId: actor.id,
      type: 'MEMBERSHIP_DISABLED',
      targetType: 'OrganizationMembership',
      targetId: membership.id,
      metadata: { userId: membership.userId },
    });

    return {
      membershipId: updated.id,
      userId: updated.userId,
      firstName: updated.user.firstName,
      lastName: updated.user.lastName,
      displayName: updated.user.displayName ?? `${updated.user.firstName} ${updated.user.lastName}`,
      email: updated.user.email,
      role: updated.role,
      status: updated.status,
      createdAt: updated.createdAt.toISOString(),
    };
  }

  async enable(actor: AuthenticatedUser, membershipId: string): Promise<MembershipSummary> {
    const membership = await prisma.organizationMembership.findFirst({
      where: { id: membershipId, organizationId: actor.organizationId },
      include: { user: true },
    });
    if (!membership) {
      throw new NotFoundException('Team member not found.');
    }

    const [updated] = await prisma.$transaction([
      prisma.organizationMembership.update({
        where: { id: membership.id },
        data: { isActive: true, status: 'ACTIVE' },
        include: { user: true },
      }),
      prisma.clinicLocationAccess.updateMany({
        where: { organizationId: actor.organizationId, userId: membership.userId },
        data: { isActive: true },
      }),
    ]);

    await logOrganizationEvent(prisma, {
      organizationId: actor.organizationId,
      actorUserId: actor.id,
      type: 'MEMBERSHIP_REENABLED',
      targetType: 'OrganizationMembership',
      targetId: membership.id,
      metadata: { userId: membership.userId },
    });

    return {
      membershipId: updated.id,
      userId: updated.userId,
      firstName: updated.user.firstName,
      lastName: updated.user.lastName,
      displayName: updated.user.displayName ?? `${updated.user.firstName} ${updated.user.lastName}`,
      email: updated.user.email,
      role: updated.role,
      status: updated.status,
      createdAt: updated.createdAt.toISOString(),
    };
  }

  private async assertNotLastOwner(organizationId: string, excludingMembershipId: string): Promise<void> {
    const remainingActiveOwners = await prisma.organizationMembership.count({
      where: {
        organizationId,
        role: 'OWNER',
        isActive: true,
        id: { not: excludingMembershipId },
      },
    });
    if (remainingActiveOwners === 0) {
      throw new ConflictException('A clinic must always have at least one active owner.');
    }
  }
}
