import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { prisma } from '@sparki/db';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../src/app.module';
import { EmailService } from '../src/email/email.service';
import { SESSION_COOKIE_NAME } from '../src/auth/session-cookie';
import { DEV_ORGANIZATION_ID, DEV_LOCATION_ID } from '../src/auth/development-user.service';

/** Cookie for a non-fixed-owner dev identity — see development-auth.guard.ts
 *  and development-auth.guard.spec.ts, which use this exact
 *  `dev:<userId>`-prefixed session format to act as a specific seeded User. */
function sessionCookieFor(userId: string): string {
  return `${SESSION_COOKIE_NAME}=${encodeURIComponent(`dev:${userId}`)}`;
}

describe('Team management (e2e)', () => {
  let app: INestApplication;
  let sentEmails: { to: string; subject: string; text: string }[] = [];
  let receptionistUserId: string;
  let secondOwnerUserId: string;
  const createdUserIds: string[] = [];
  const createdUserEmails: string[] = [];

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

    // Lazily seeds DEV_ORGANIZATION_ID/DEV_LOCATION_ID/dev-user (OWNER).
    await request(app.getHttpServer()).get('/staff');

    const receptionist = await prisma.user.create({
      data: {
        organizationId: DEV_ORGANIZATION_ID,
        email: `team-e2e-receptionist-${Date.now()}@example.test`,
        firstName: 'Robin',
        lastName: 'Reception',
        role: 'RECEPTIONIST',
        staffProfile: { create: { canOwnVisits: true } },
      },
    });
    receptionistUserId = receptionist.id;
    createdUserIds.push(receptionist.id);
    await prisma.organizationMembership.create({
      data: { organizationId: DEV_ORGANIZATION_ID, userId: receptionist.id, role: 'RECEPTIONIST', isActive: true, status: 'ACTIVE' },
    });
    await prisma.clinicLocationAccess.create({
      data: { organizationId: DEV_ORGANIZATION_ID, clinicLocationId: DEV_LOCATION_ID, userId: receptionist.id, role: 'RECEPTIONIST', isActive: true },
    });

    const secondOwner = await prisma.user.create({
      data: {
        organizationId: DEV_ORGANIZATION_ID,
        email: `team-e2e-second-owner-${Date.now()}@example.test`,
        firstName: 'Sam',
        lastName: 'Owner',
        role: 'OWNER',
        staffProfile: { create: { canOwnVisits: true } },
      },
    });
    secondOwnerUserId = secondOwner.id;
    createdUserIds.push(secondOwner.id);
    await prisma.organizationMembership.create({
      data: { organizationId: DEV_ORGANIZATION_ID, userId: secondOwner.id, role: 'OWNER', isActive: true, status: 'ACTIVE' },
    });
    await prisma.clinicLocationAccess.create({
      data: { organizationId: DEV_ORGANIZATION_ID, clinicLocationId: DEV_LOCATION_ID, userId: secondOwner.id, role: 'OWNER', isActive: true },
    });
  });

  afterEach(() => {
    sentEmails = [];
  });

  afterAll(async () => {
    await prisma.clinicInvitation.deleteMany({ where: { organizationId: DEV_ORGANIZATION_ID, email: { in: createdUserEmails } } });
    await prisma.organizationEvent.deleteMany({ where: { organizationId: DEV_ORGANIZATION_ID, targetId: { in: [...createdUserIds] } } });
    await prisma.clinicLocationAccess.deleteMany({ where: { userId: { in: createdUserIds } } });
    await prisma.organizationMembership.deleteMany({ where: { userId: { in: createdUserIds } } });
    await prisma.staffProfile.deleteMany({ where: { userId: { in: createdUserIds } } });
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    await prisma.clinicLocationAccess.deleteMany({ where: { user: { email: { in: createdUserEmails } } } });
    await prisma.organizationMembership.deleteMany({ where: { user: { email: { in: createdUserEmails } } } });
    await prisma.staffProfile.deleteMany({ where: { user: { email: { in: createdUserEmails } } } });
    await prisma.user.deleteMany({ where: { email: { in: createdUserEmails } } });
    await app.close();
  });

  function captureLastToken(): string {
    const lastEmail = sentEmails.at(-1);
    expect(lastEmail).toBeDefined();
    const match = lastEmail!.text.match(/\/invite\/([^\s]+)/);
    expect(match).toBeTruthy();
    return match![1]!;
  }

  describe('authorization', () => {
    it('lets the owner list team members', async () => {
      const response = await request(app.getHttpServer()).get('/team/members');
      expect(response.status).toBe(200);
      expect(response.body).toEqual(
        expect.arrayContaining([expect.objectContaining({ userId: receptionistUserId, role: 'RECEPTIONIST' })]),
      );
    });

    it('forbids a non-manager role from listing team members', async () => {
      const response = await request(app.getHttpServer())
        .get('/team/members')
        .set('Cookie', sessionCookieFor(receptionistUserId));
      expect(response.status).toBe(403);
    });

    it('forbids a non-manager role from inviting a team member', async () => {
      const response = await request(app.getHttpServer())
        .post('/team/invitations')
        .set('Cookie', sessionCookieFor(receptionistUserId))
        .send({ email: `blocked-${Date.now()}@example.test`, role: 'TECHNICIAN' });
      expect(response.status).toBe(403);
    });
  });

  describe('POST /team/invitations', () => {
    it('creates a pending invitation and emails it', async () => {
      const email = `team-invite-${Date.now()}@example.test`;
      createdUserEmails.push(email);

      const response = await request(app.getHttpServer())
        .post('/team/invitations')
        .send({ email, role: 'TECHNICIAN' });

      expect(response.status).toBe(201);
      expect(response.body).toMatchObject({ email, role: 'TECHNICIAN', status: 'PENDING' });
      expect(sentEmails).toHaveLength(1);
      expect(sentEmails[0]?.to).toBe(email);
    });

    it('reuses the existing pending invitation instead of creating a duplicate', async () => {
      const email = `team-invite-dup-${Date.now()}@example.test`;
      createdUserEmails.push(email);

      const first = await request(app.getHttpServer()).post('/team/invitations').send({ email, role: 'TECHNICIAN' });
      expect(first.status).toBe(201);
      const second = await request(app.getHttpServer()).post('/team/invitations').send({ email, role: 'VETERINARIAN' });
      expect(second.status).toBe(201);

      expect(second.body.id).toBe(first.body.id);
      expect(second.body.role).toBe('VETERINARIAN');

      const invitations = await prisma.clinicInvitation.findMany({ where: { organizationId: DEV_ORGANIZATION_ID, email } });
      expect(invitations).toHaveLength(1);
    });

    it('lets an existing owner invite another owner', async () => {
      const email = `team-invite-owner-${Date.now()}@example.test`;
      createdUserEmails.push(email);
      const response = await request(app.getHttpServer())
        .post('/team/invitations')
        .set('Cookie', sessionCookieFor(secondOwnerUserId))
        .send({ email, role: 'OWNER' });
      expect(response.status).toBe(201);
    });

    it('refuses to let a PRACTICE_MANAGER (non-owner manager) grant the OWNER role', async () => {
      // A PRACTICE_MANAGER passes the controller's blanket team-manager
      // role check, so this specifically exercises TeamService's
      // ownership-transfer rule rather than the coarser role gate the
      // receptionist fixture already covers above.
      const practiceManager = await prisma.user.create({
        data: {
          organizationId: DEV_ORGANIZATION_ID,
          email: `team-e2e-pm-${Date.now()}@example.test`,
          firstName: 'Pat',
          lastName: 'Manager',
          role: 'PRACTICE_MANAGER',
          staffProfile: { create: { canOwnVisits: true } },
        },
      });
      createdUserIds.push(practiceManager.id);
      await prisma.organizationMembership.create({
        data: { organizationId: DEV_ORGANIZATION_ID, userId: practiceManager.id, role: 'PRACTICE_MANAGER', isActive: true, status: 'ACTIVE' },
      });
      await prisma.clinicLocationAccess.create({
        data: { organizationId: DEV_ORGANIZATION_ID, clinicLocationId: DEV_LOCATION_ID, userId: practiceManager.id, role: 'PRACTICE_MANAGER', isActive: true },
      });

      const response = await request(app.getHttpServer())
        .post('/team/invitations')
        .set('Cookie', sessionCookieFor(practiceManager.id))
        .send({ email: `team-invite-blocked-owner-${Date.now()}@example.test`, role: 'OWNER' });
      expect(response.status).toBe(403);
    });
  });

  describe('invitation resend/revoke', () => {
    it('resends an invitation with a fresh token', async () => {
      const email = `team-resend-${Date.now()}@example.test`;
      createdUserEmails.push(email);
      const created = await request(app.getHttpServer()).post('/team/invitations').send({ email, role: 'TECHNICIAN' });
      const firstToken = captureLastToken();

      const resent = await request(app.getHttpServer()).post(`/team/invitations/${created.body.id}/resend`);
      expect(resent.status).toBe(201);
      const secondToken = captureLastToken();

      expect(secondToken).not.toBe(firstToken);
      const inspectOld = await request(app.getHttpServer()).get(`/invitations/${firstToken}`);
      expect(inspectOld.status).toBe(404);
      const inspectNew = await request(app.getHttpServer()).get(`/invitations/${secondToken}`);
      expect(inspectNew.status).toBe(200);
    });

    it('revokes a pending invitation so it can no longer be accepted', async () => {
      const email = `team-revoke-${Date.now()}@example.test`;
      const created = await request(app.getHttpServer()).post('/team/invitations').send({ email, role: 'TECHNICIAN' });
      const token = captureLastToken();

      const revoked = await request(app.getHttpServer()).delete(`/team/invitations/${created.body.id}`);
      expect(revoked.status).toBe(200);
      expect(revoked.body.status).toBe('REVOKED');

      const acceptAttempt = await request(app.getHttpServer())
        .post(`/invitations/${token}/accept`)
        .send({ firstName: 'No', lastName: 'Access', password: 'CorrectHorseBattery1' });
      expect(acceptAttempt.status).toBe(410);
    });

    it('lists both active members and pending invitations for Settings > Team', async () => {
      const response = await request(app.getHttpServer()).get('/team/invitations');
      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
    });
  });

  describe('role changes and membership status', () => {
    it('changes a member role', async () => {
      const response = await request(app.getHttpServer())
        .patch(`/team/members/${await membershipIdFor(receptionistUserId)}/role`)
        .send({ role: 'PRACTICE_MANAGER' });

      expect(response.status).toBe(200);
      expect(response.body.role).toBe('PRACTICE_MANAGER');

      // restore for subsequent tests
      await request(app.getHttpServer())
        .patch(`/team/members/${await membershipIdFor(receptionistUserId)}/role`)
        .send({ role: 'RECEPTIONIST' });
    });

    it('disables and re-enables a membership', async () => {
      const membershipId = await membershipIdFor(receptionistUserId);

      const disabled = await request(app.getHttpServer()).post(`/team/members/${membershipId}/disable`);
      expect(disabled.status).toBe(201);
      expect(disabled.body.status).toBe('DISABLED');

      const membership = await prisma.organizationMembership.findUniqueOrThrow({ where: { id: membershipId } });
      expect(membership.isActive).toBe(false);

      const enabled = await request(app.getHttpServer()).post(`/team/members/${membershipId}/enable`);
      expect(enabled.status).toBe(201);
      expect(enabled.body.status).toBe('ACTIVE');
    });

    it('refuses to disable your own membership', async () => {
      const ownMembership = await prisma.organizationMembership.findFirstOrThrow({
        where: { organizationId: DEV_ORGANIZATION_ID, userId: 'dev-user' },
      });
      const response = await request(app.getHttpServer()).post(`/team/members/${ownMembership.id}/disable`);
      expect(response.status).toBe(409);
    });

    it('refuses to remove the final active owner', async () => {
      // Demote the extra owner fixture to PRACTICE_MANAGER so dev-user
      // (OWNER) becomes the clinic's only remaining active owner...
      const secondOwnerMembershipId = await membershipIdFor(secondOwnerUserId);
      const demote = await request(app.getHttpServer())
        .patch(`/team/members/${secondOwnerMembershipId}/role`)
        .send({ role: 'PRACTICE_MANAGER' });
      expect(demote.status).toBe(200);

      // ...then dev-user demoting *itself* away from OWNER must be rejected:
      // it would leave the clinic with zero active owners.
      const ownMembership = await prisma.organizationMembership.findFirstOrThrow({
        where: { organizationId: DEV_ORGANIZATION_ID, userId: 'dev-user' },
      });
      const roleChange = await request(app.getHttpServer())
        .patch(`/team/members/${ownMembership.id}/role`)
        .send({ role: 'PRACTICE_MANAGER' });
      expect(roleChange.status).toBe(409);

      // restore
      await request(app.getHttpServer())
        .patch(`/team/members/${secondOwnerMembershipId}/role`)
        .send({ role: 'OWNER' });
    });
  });

  async function membershipIdFor(userId: string): Promise<string> {
    const membership = await prisma.organizationMembership.findFirstOrThrow({
      where: { organizationId: DEV_ORGANIZATION_ID, userId },
    });
    return membership.id;
  }
});
