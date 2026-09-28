import { createHash, randomBytes } from 'node:crypto';
import {
  ConflictException,
  GoneException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, prisma, type ClinicInvitation, type UserRole } from '@sparki/db';
import { AppConfigService } from '../config/app-config.service';
import { logOrganizationEvent } from '../common/organization-event';
import { EmailService } from '../email/email.service';
import { AuthService, type LoginResult } from '../auth/auth.service';
import type { AcceptInvitationInput } from './dto/accept-invitation.schema';

const INVITATION_TTL_DAYS = 7;

export interface InvitationSummary {
  id: string;
  email: string;
  role: UserRole;
  status: 'PENDING' | 'ACCEPTED' | 'REVOKED' | 'EXPIRED';
  expiresAt: string;
  createdAt: string;
  invitedByUserId: string | null;
}

export interface PublicInvitationView {
  email: string;
  role: UserRole;
  clinicName: string;
  isOwnerFounding: boolean;
  status: 'PENDING' | 'ACCEPTED' | 'REVOKED' | 'EXPIRED';
  expiresAt: string;
}

function toSummary(invitation: ClinicInvitation): InvitationSummary {
  const expired = invitation.status === 'PENDING' && invitation.expiresAt.getTime() <= Date.now();
  return {
    id: invitation.id,
    email: invitation.email,
    role: invitation.role,
    status: expired ? 'EXPIRED' : invitation.status,
    expiresAt: invitation.expiresAt.toISOString(),
    createdAt: invitation.createdAt.toISOString(),
    invitedByUserId: invitation.invitedByUserId,
  };
}

/** Every non-CLIENT User is expected to carry a StaffProfile (see schema
 *  comment on StaffProfile). Sensible per-role starting defaults; adjustable
 *  afterward in Settings > Team, same as any other staff member's. */
function staffProfileDefaults(role: UserRole): { canReceiveAppointments: boolean; canOwnVisits: boolean } {
  const canScheduleDirectly: UserRole[] = ['VETERINARIAN', 'TECHNICIAN'];
  const canOwnVisits: UserRole[] = ['OWNER', 'PRACTICE_MANAGER', 'VETERINARIAN', 'TECHNICIAN', 'RECEPTIONIST'];
  return {
    canReceiveAppointments: canScheduleDirectly.includes(role),
    canOwnVisits: canOwnVisits.includes(role),
  };
}

/**
 * Owns the full lifecycle of a ClinicInvitation — issuing, resending,
 * revoking, and accepting — for both the system-generated owner-founding
 * invitation (ClinicProvisioningService, via createOwnerInvitation) and
 * staff invitations a clinic admin sends (TeamService, via invite). See
 * docs/adr/ADR-007.
 */
@Injectable()
export class InvitationsService {
  constructor(
    private readonly config: AppConfigService,
    private readonly email: EmailService,
    private readonly authService: AuthService,
  ) {}

  private issueToken(): { raw: string; hash: string } {
    const raw = randomBytes(32).toString('base64url');
    return { raw, hash: this.hashToken(raw) };
  }

  private hashToken(raw: string): string {
    return createHash('sha256').update(raw).digest('hex');
  }

  private expiryDate(): Date {
    return new Date(Date.now() + INVITATION_TTL_DAYS * 24 * 60 * 60 * 1000);
  }

  /**
   * System-generated owner-founding invitation, created from a verified
   * Stripe webhook (see BillingWebhookService). invitedByUserId is null —
   * there is no Sparki actor yet, the clinic doesn't have a user.
   */
  async createOwnerInvitation(
    tx: Prisma.TransactionClient,
    organizationId: string,
    email: string,
  ): Promise<{ invitation: ClinicInvitation; rawToken: string }> {
    const { raw, hash } = this.issueToken();
    const invitation = await tx.clinicInvitation.create({
      data: {
        organizationId,
        email: email.trim().toLowerCase(),
        role: 'OWNER',
        tokenHash: hash,
        expiresAt: this.expiryDate(),
        invitedByUserId: null,
      },
    });
    return { invitation, rawToken: raw };
  }

  /** Fire-and-forget from the caller's perspective, but not literally —
   *  callers await this so a send failure surfaces as a real error rather
   *  than a silently-lost invitation. Deliberately outside any DB
   *  transaction: an external HTTP call has no business holding a Postgres
   *  transaction open. */
  async sendInvitationEmail(params: {
    invitation: Pick<ClinicInvitation, 'email' | 'role' | 'invitedByUserId'>;
    rawToken: string;
    clinicName: string;
    invitedByName?: string;
  }): Promise<void> {
    const link = `${this.config.webOrigin}/invite/${params.rawToken}`;
    const isOwnerFounding = params.invitation.invitedByUserId === null;

    const subject = isOwnerFounding
      ? `Activate your Sparki clinic — ${params.clinicName}`
      : `You're invited to join ${params.clinicName} on Sparki`;

    const introLine = isOwnerFounding
      ? `Your Sparki subscription is confirmed. Follow the link below to create your account and finish setting up ${params.clinicName}.`
      : `${params.invitedByName ?? 'A teammate'} invited you to join ${params.clinicName} on Sparki as a ${formatRole(params.invitation.role)}.`;

    const text = `${introLine}\n\n${link}\n\nThis link expires in ${INVITATION_TTL_DAYS} days.`;
    const html = `<p>${escapeHtml(introLine)}</p><p><a href="${link}">${link}</a></p><p>This link expires in ${INVITATION_TTL_DAYS} days.</p>`;

    await this.email.send({ to: params.invitation.email, subject, text, html });
  }

  /** Used by TeamService.invite — see that method for the actor/role
   *  authorization it performs before calling this. Reuses an existing
   *  PENDING invitation for the same email instead of creating a second row
   *  ("duplicate invitations should be handled safely"); the partial unique
   *  index on (organizationId, email) WHERE status = 'PENDING' is the
   *  race-condition backstop if two requests race past the check below. */
  async invite(params: {
    organizationId: string;
    clinicName: string;
    email: string;
    role: UserRole;
    invitedByUserId: string;
    invitedByName: string;
  }): Promise<InvitationSummary> {
    const email = params.email.trim().toLowerCase();

    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      throw new ConflictException({
        code: 'EMAIL_ALREADY_REGISTERED',
        message: 'This email already has a Sparki account.',
      });
    }

    const existingPending = await prisma.clinicInvitation.findFirst({
      where: { organizationId: params.organizationId, email, status: 'PENDING' },
    });

    const { raw, hash } = this.issueToken();
    const expiresAt = this.expiryDate();

    let invitation: ClinicInvitation;
    try {
      invitation = existingPending
        ? await prisma.clinicInvitation.update({
            where: { id: existingPending.id },
            data: { role: params.role, tokenHash: hash, expiresAt, invitedByUserId: params.invitedByUserId },
          })
        : await prisma.clinicInvitation.create({
            data: {
              organizationId: params.organizationId,
              email,
              role: params.role,
              tokenHash: hash,
              expiresAt,
              invitedByUserId: params.invitedByUserId,
            },
          });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('This email already has a pending invitation.');
      }
      throw error;
    }

    await logOrganizationEvent(prisma, {
      organizationId: params.organizationId,
      actorUserId: params.invitedByUserId,
      type: existingPending ? 'INVITATION_RESENT' : 'INVITATION_CREATED',
      targetType: 'ClinicInvitation',
      targetId: invitation.id,
      metadata: { email, role: params.role },
    });

    await this.sendInvitationEmail({
      invitation,
      rawToken: raw,
      clinicName: params.clinicName,
      invitedByName: params.invitedByName,
    });

    return toSummary(invitation);
  }

  async resend(params: {
    organizationId: string;
    clinicName: string;
    invitationId: string;
    actorUserId: string;
    actorName: string;
  }): Promise<InvitationSummary> {
    const invitation = await prisma.clinicInvitation.findFirst({
      where: { id: params.invitationId, organizationId: params.organizationId },
    });
    if (!invitation) {
      throw new NotFoundException('Invitation not found.');
    }
    if (invitation.status !== 'PENDING') {
      throw new ConflictException('Only a pending invitation can be resent.');
    }

    const { raw, hash } = this.issueToken();
    const updated = await prisma.clinicInvitation.update({
      where: { id: invitation.id },
      data: { tokenHash: hash, expiresAt: this.expiryDate() },
    });

    await logOrganizationEvent(prisma, {
      organizationId: params.organizationId,
      actorUserId: params.actorUserId,
      type: 'INVITATION_RESENT',
      targetType: 'ClinicInvitation',
      targetId: invitation.id,
      metadata: { email: invitation.email, role: invitation.role },
    });

    await this.sendInvitationEmail({
      invitation: updated,
      rawToken: raw,
      clinicName: params.clinicName,
      invitedByName: params.actorName,
    });

    return toSummary(updated);
  }

  async revoke(params: { organizationId: string; invitationId: string; actorUserId: string }): Promise<InvitationSummary> {
    const invitation = await prisma.clinicInvitation.findFirst({
      where: { id: params.invitationId, organizationId: params.organizationId },
    });
    if (!invitation) {
      throw new NotFoundException('Invitation not found.');
    }
    if (invitation.status === 'ACCEPTED') {
      throw new ConflictException('This invitation was already accepted and cannot be revoked.');
    }
    if (invitation.status === 'REVOKED') {
      return toSummary(invitation);
    }

    const updated = await prisma.clinicInvitation.update({
      where: { id: invitation.id },
      data: { status: 'REVOKED', revokedAt: new Date() },
    });

    await logOrganizationEvent(prisma, {
      organizationId: params.organizationId,
      actorUserId: params.actorUserId,
      type: 'INVITATION_REVOKED',
      targetType: 'ClinicInvitation',
      targetId: invitation.id,
      metadata: { email: invitation.email },
    });

    return toSummary(updated);
  }

  async list(organizationId: string): Promise<InvitationSummary[]> {
    const invitations = await prisma.clinicInvitation.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
    });
    return invitations.map(toSummary);
  }

  /** Public: GET /invitations/:token. Deliberately returns nothing about
   *  the clinic beyond its display name — no financial, staff, or patient
   *  data is reachable from an invitation token. */
  async inspect(rawToken: string): Promise<PublicInvitationView> {
    const invitation = await prisma.clinicInvitation.findUnique({
      where: { tokenHash: this.hashToken(rawToken) },
      include: { organization: { select: { name: true } } },
    });
    if (!invitation) {
      throw new NotFoundException('This invitation link is invalid.');
    }

    const summary = toSummary(invitation);
    return {
      email: invitation.email,
      role: invitation.role,
      clinicName: invitation.organization.name,
      isOwnerFounding: invitation.invitedByUserId === null,
      status: summary.status,
      expiresAt: summary.expiresAt,
    };
  }

  /**
   * Public: POST /invitations/:token/accept. Creates the WorkOS credential,
   * the Sparki User, StaffProfile, OrganizationMembership, and
   * ClinicLocationAccess, then signs the new user in — the invitation
   * acceptance *is* account creation, not a separate step. See
   * docs/adr/ADR-007 "Owner/Staff Account Creation".
   *
   * Race-condition guard: `updateMany` with `status: PENDING` in the where
   * clause claims the invitation atomically before anything else happens.
   * Two concurrent accept requests for the same token race on that single
   * UPDATE; only one can affect a row, so only one proceeds to create a
   * membership — see the "idempotent acceptance" test in
   * invitations.e2e-spec.ts.
   */
  async accept(rawToken: string, input: AcceptInvitationInput): Promise<LoginResult> {
    const tokenHash = this.hashToken(rawToken);
    const invitation = await prisma.clinicInvitation.findUnique({ where: { tokenHash } });
    if (!invitation) {
      throw new NotFoundException('This invitation link is invalid.');
    }
    if (invitation.status === 'REVOKED') {
      throw new GoneException('This invitation was revoked.');
    }
    if (invitation.status === 'ACCEPTED') {
      throw new ConflictException('This invitation was already accepted.');
    }
    if (invitation.expiresAt.getTime() <= Date.now()) {
      throw new GoneException('This invitation has expired.');
    }

    const existingUser = await prisma.user.findUnique({ where: { email: invitation.email } });
    if (existingUser) {
      // v1 boundary (see ADR-006): Sparki supports exactly one active
      // organization membership per user, and User.email is globally
      // unique. An email that already has a Sparki account — active
      // membership or not — cannot also become a brand-new account here.
      throw new ConflictException({
        code: 'EMAIL_ALREADY_REGISTERED',
        message: 'This email already has a Sparki account. Sign in instead, or contact your clinic owner.',
      });
    }

    const claim = await prisma.clinicInvitation.updateMany({
      where: { id: invitation.id, status: 'PENDING' },
      data: { status: 'ACCEPTED', acceptedAt: new Date() },
    });
    if (claim.count === 0) {
      throw new ConflictException('This invitation was already accepted.');
    }

    const workosUserId = await this.authService.ensureWorkosCredential({
      email: invitation.email,
      password: input.password,
      firstName: input.firstName,
      lastName: input.lastName,
    });

    const defaultLocation = await prisma.location.findFirstOrThrow({
      where: { organizationId: invitation.organizationId },
      orderBy: { createdAt: 'asc' },
    });

    const { user } = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          organizationId: invitation.organizationId,
          email: invitation.email,
          firstName: input.firstName,
          lastName: input.lastName,
          role: invitation.role,
          isActive: true,
          workosUserId,
          staffProfile: { create: staffProfileDefaults(invitation.role) },
        },
      });

      const membership = await tx.organizationMembership.create({
        data: {
          organizationId: invitation.organizationId,
          userId: user.id,
          role: invitation.role,
          isActive: true,
          status: 'ACTIVE',
        },
      });

      await tx.clinicLocationAccess.create({
        data: {
          organizationId: invitation.organizationId,
          clinicLocationId: defaultLocation.id,
          userId: user.id,
          role: invitation.role,
          isActive: true,
        },
      });

      await tx.clinicInvitation.update({
        where: { id: invitation.id },
        data: { createdMembershipId: membership.id },
      });

      await logOrganizationEvent(tx, {
        organizationId: invitation.organizationId,
        actorUserId: user.id,
        type: invitation.invitedByUserId === null ? 'OWNER_ACTIVATED' : 'INVITATION_ACCEPTED',
        targetType: 'ClinicInvitation',
        targetId: invitation.id,
        metadata: { role: invitation.role },
      });

      return { user, membership };
    });

    return this.authService.issueSessionForNewUser(user, input.password);
  }
}

function formatRole(role: UserRole): string {
  return role
    .toLowerCase()
    .split('_')
    .map((word) => word[0]!.toUpperCase() + word.slice(1))
    .join(' ');
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => {
    switch (char) {
      case '&':
        return '&amp;';
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '"':
        return '&quot;';
      default:
        return '&#39;';
    }
  });
}
