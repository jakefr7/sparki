import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { prisma } from '@sparki/db';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../src/app.module';
import { EmailService } from '../src/email/email.service';
import { InvitationsService } from '../src/invitations/invitations.service';
import { DEV_ORGANIZATION_ID, DEV_LOCATION_ID } from '../src/auth/development-user.service';

/**
 * Covers the full ClinicInvitation lifecycle — creation (via
 * InvitationsService directly, standing in for what TeamService/
 * ClinicProvisioningService call), public inspection, and acceptance —
 * including the race-condition/idempotency guards described in
 * docs/adr/ADR-007.
 */
describe('Invitations (e2e)', () => {
  let app: INestApplication;
  let invitations: InvitationsService;
  let sentEmails: { to: string; subject: string; text: string }[] = [];
  let otherOrganizationId: string;
  const createdUserEmails: string[] = [];
  const createdOrganizationIds: string[] = [];

  beforeAll(async () => {
    const fakeEmail = {
      isConfigured: false,
      send: vi.fn(async (message: { to: string; subject: string; text: string }) => {
        sentEmails.push(message);
      }),
    };

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(EmailService)
      .useValue(fakeEmail)
      .compile();
    app = moduleRef.createNestApplication();
    await app.init();
    invitations = app.get(InvitationsService);

    // Lazily seeds DEV_ORGANIZATION_ID/DEV_LOCATION_ID (see staff.e2e-spec.ts).
    await request(app.getHttpServer()).get('/staff');

    const other = await prisma.organization.create({ data: { name: 'Invitations E2E Org (other)' } });
    otherOrganizationId = other.id;
    await prisma.location.create({ data: { organizationId: otherOrganizationId, name: 'Other Main Location' } });
  });

  afterEach(() => {
    sentEmails = [];
  });

  afterAll(async () => {
    await prisma.organizationEvent.deleteMany({
      where: { organizationId: { in: [DEV_ORGANIZATION_ID, otherOrganizationId, ...createdOrganizationIds] } },
    });
    await prisma.clinicInvitation.deleteMany({
      where: { organizationId: { in: [DEV_ORGANIZATION_ID, otherOrganizationId, ...createdOrganizationIds] } },
    });
    await prisma.clinicLocationAccess.deleteMany({ where: { user: { email: { in: createdUserEmails } } } });
    await prisma.organizationMembership.deleteMany({ where: { user: { email: { in: createdUserEmails } } } });
    await prisma.staffProfile.deleteMany({ where: { user: { email: { in: createdUserEmails } } } });
    await prisma.user.deleteMany({ where: { email: { in: createdUserEmails } } });
    await prisma.location.deleteMany({ where: { organizationId: { in: [otherOrganizationId, ...createdOrganizationIds] } } });
    await prisma.organization.deleteMany({ where: { id: { in: [otherOrganizationId, ...createdOrganizationIds] } } });
    await app.close();
  });

  async function createInvitation(email: string, role: 'RECEPTIONIST' | 'VETERINARIAN' | 'OWNER' = 'RECEPTIONIST') {
    return invitations.invite({
      organizationId: DEV_ORGANIZATION_ID,
      clinicName: 'Sparki Development Clinic',
      email,
      role,
      invitedByUserId: 'dev-user',
      invitedByName: 'Development User',
    });
  }

  function captureLastToken(): string {
    const lastEmail = sentEmails.at(-1);
    expect(lastEmail).toBeDefined();
    const match = lastEmail!.text.match(/\/invite\/([^\s]+)/);
    expect(match).toBeTruthy();
    return match![1]!;
  }

  describe('GET /invitations/:token', () => {
    it('returns the clinic name and role for a pending invitation', async () => {
      const email = `invite-inspect-${Date.now()}@example.test`;
      await createInvitation(email, 'RECEPTIONIST');
      const token = captureLastToken();

      const response = await request(app.getHttpServer()).get(`/invitations/${token}`);

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        email,
        role: 'RECEPTIONIST',
        clinicName: 'Sparki Development Clinic',
        status: 'PENDING',
      });
    });

    it('returns 404 for an unknown token', async () => {
      const response = await request(app.getHttpServer()).get('/invitations/not-a-real-token');
      expect(response.status).toBe(404);
    });
  });

  describe('POST /invitations/:token/accept', () => {
    it('creates a new user, membership, and location access, then signs the user in', async () => {
      const email = `invite-accept-${Date.now()}@example.test`;
      createdUserEmails.push(email);
      await createInvitation(email, 'RECEPTIONIST');
      const token = captureLastToken();

      const response = await request(app.getHttpServer())
        .post(`/invitations/${token}/accept`)
        .send({ firstName: 'Nina', lastName: 'Alvarez', password: 'CorrectHorseBattery1' });

      expect(response.status).toBe(201);
      expect(response.body.user).toMatchObject({ email, role: 'RECEPTIONIST' });
      expect(response.headers['set-cookie']).toBeDefined();

      const membership = await prisma.organizationMembership.findFirstOrThrow({
        where: { organizationId: DEV_ORGANIZATION_ID, user: { email } },
      });
      expect(membership.role).toBe('RECEPTIONIST');
      expect(membership.isActive).toBe(true);
      expect(membership.status).toBe('ACTIVE');

      const locationAccess = await prisma.clinicLocationAccess.findFirstOrThrow({
        where: { organizationId: DEV_ORGANIZATION_ID, user: { email } },
      });
      expect(locationAccess.clinicLocationId).toBe(DEV_LOCATION_ID);

      const invitation = await prisma.clinicInvitation.findFirstOrThrow({ where: { email } });
      expect(invitation.status).toBe('ACCEPTED');
      expect(invitation.createdMembershipId).toBe(membership.id);

      const event = await prisma.organizationEvent.findFirstOrThrow({
        where: { organizationId: DEV_ORGANIZATION_ID, type: 'INVITATION_ACCEPTED', targetId: invitation.id },
      });
      expect(event.actorUserId).toBe(membership.userId);
    });

    it('rejects accepting the same invitation twice', async () => {
      const email = `invite-double-${Date.now()}@example.test`;
      createdUserEmails.push(email);
      await createInvitation(email, 'RECEPTIONIST');
      const token = captureLastToken();

      const first = await request(app.getHttpServer())
        .post(`/invitations/${token}/accept`)
        .send({ firstName: 'Ana', lastName: 'Cruz', password: 'CorrectHorseBattery1' });
      expect(first.status).toBe(201);

      const second = await request(app.getHttpServer())
        .post(`/invitations/${token}/accept`)
        .send({ firstName: 'Ana', lastName: 'Cruz', password: 'CorrectHorseBattery1' });
      expect(second.status).toBe(409);

      const memberships = await prisma.organizationMembership.findMany({
        where: { organizationId: DEV_ORGANIZATION_ID, user: { email } },
      });
      expect(memberships).toHaveLength(1);
    });

    it('handles two concurrent accept requests for the same invitation without creating two memberships', async () => {
      const email = `invite-race-${Date.now()}@example.test`;
      createdUserEmails.push(email);
      await createInvitation(email, 'RECEPTIONIST');
      const token = captureLastToken();
      const body = { firstName: 'Race', lastName: 'Condition', password: 'CorrectHorseBattery1' };

      const [first, second] = await Promise.all([
        request(app.getHttpServer()).post(`/invitations/${token}/accept`).send(body),
        request(app.getHttpServer()).post(`/invitations/${token}/accept`).send(body),
      ]);

      const statuses = [first.status, second.status].sort();
      expect(statuses).toEqual([201, 409]);

      const memberships = await prisma.organizationMembership.findMany({
        where: { organizationId: DEV_ORGANIZATION_ID, user: { email } },
      });
      expect(memberships).toHaveLength(1);
    });

    it('rejects an expired invitation', async () => {
      const email = `invite-expired-${Date.now()}@example.test`;
      await createInvitation(email, 'RECEPTIONIST');
      const token = captureLastToken();
      await prisma.clinicInvitation.updateMany({
        where: { email },
        data: { expiresAt: new Date(Date.now() - 60_000) },
      });

      const response = await request(app.getHttpServer())
        .post(`/invitations/${token}/accept`)
        .send({ firstName: 'Late', lastName: 'Comer', password: 'CorrectHorseBattery1' });

      expect(response.status).toBe(410);
    });

    it('activates a system-generated owner-founding invitation into an OWNER membership', async () => {
      const freshOrg = await prisma.organization.create({ data: { name: 'New Clinic' } });
      await prisma.location.create({ data: { organizationId: freshOrg.id, name: 'Main Location' } });
      const email = `owner-activate-${Date.now()}@example.test`;
      createdUserEmails.push(email);

      const { rawToken } = await prisma.$transaction((tx) => invitations.createOwnerInvitation(tx, freshOrg.id, email));

      const response = await request(app.getHttpServer())
        .post(`/invitations/${rawToken}/accept`)
        .send({ firstName: 'Fresh', lastName: 'Owner', password: 'CorrectHorseBattery1' });

      expect(response.status).toBe(201);
      expect(response.body.user).toMatchObject({ email, role: 'OWNER' });

      const membership = await prisma.organizationMembership.findFirstOrThrow({
        where: { organizationId: freshOrg.id, user: { email } },
      });
      expect(membership.role).toBe('OWNER');

      const event = await prisma.organizationEvent.findFirstOrThrow({
        where: { organizationId: freshOrg.id, type: 'OWNER_ACTIVATED' },
      });
      expect(event.actorUserId).toBe(membership.userId);

      // Full cleanup (including the User this created) happens in afterAll,
      // which deletes by createdUserEmails/createdOrganizationIds in an
      // FK-safe order — deleting the Organization here first would violate
      // User.organizationId's foreign key while that row still exists.
      createdOrganizationIds.push(freshOrg.id);
    });

    it('rejects a revoked invitation', async () => {
      const email = `invite-revoked-${Date.now()}@example.test`;
      const summary = await createInvitation(email, 'RECEPTIONIST');
      const token = captureLastToken();
      await invitations.revoke({ organizationId: DEV_ORGANIZATION_ID, invitationId: summary.id, actorUserId: 'dev-user' });

      const response = await request(app.getHttpServer())
        .post(`/invitations/${token}/accept`)
        .send({ firstName: 'No', lastName: 'Access', password: 'CorrectHorseBattery1' });

      expect(response.status).toBe(410);
    });

    it('rejects a fabricated token', async () => {
      const response = await request(app.getHttpServer())
        .post('/invitations/not-a-real-token/accept')
        .send({ firstName: 'Nobody', lastName: 'Here', password: 'CorrectHorseBattery1' });
      expect(response.status).toBe(404);
    });

    it('refuses to accept a second invitation once the email already has an account', async () => {
      const email = `invite-dup-email-${Date.now()}@example.test`;
      createdUserEmails.push(email);

      // Both invitations are issued while the email is still unregistered —
      // InvitationsService.invite itself would refuse a second invite once
      // the email is registered, so this ordering is what actually exercises
      // the *acceptance*-time guard rather than the invite-time one.
      await createInvitation(email, 'RECEPTIONIST');
      const firstToken = captureLastToken();
      await invitations.invite({
        organizationId: otherOrganizationId,
        clinicName: 'Invitations E2E Org (other)',
        email,
        role: 'RECEPTIONIST',
        invitedByUserId: 'dev-user',
        invitedByName: 'Development User',
      });
      const secondToken = captureLastToken();

      const accepted = await request(app.getHttpServer())
        .post(`/invitations/${firstToken}/accept`)
        .send({ firstName: 'Already', lastName: 'Registered', password: 'CorrectHorseBattery1' });
      expect(accepted.status).toBe(201);

      const response = await request(app.getHttpServer())
        .post(`/invitations/${secondToken}/accept`)
        .send({ firstName: 'Already', lastName: 'Registered', password: 'CorrectHorseBattery1' });

      expect(response.status).toBe(409);
      expect(response.body).toMatchObject({ code: 'EMAIL_ALREADY_REGISTERED' });
    });
  });
});
