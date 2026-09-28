import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { prisma } from '@sparki/db';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { SESSION_COOKIE_NAME } from '../src/auth/session-cookie';
import { DEV_ORGANIZATION_ID } from '../src/auth/development-user.service';

function sessionCookieFor(userId: string): string {
  return `${SESSION_COOKIE_NAME}=${encodeURIComponent(`dev:${userId}`)}`;
}

describe('Clinic profile, onboarding, and billing status (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();

    await request(app.getHttpServer()).get('/staff');
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET /clinic', () => {
    it('returns the current organization profile', async () => {
      const response = await request(app.getHttpServer()).get('/clinic');
      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({ id: DEV_ORGANIZATION_ID });
    });
  });

  describe('PATCH /clinic', () => {
    it('updates clinic profile fields and records an audit event', async () => {
      const response = await request(app.getHttpServer())
        .patch('/clinic')
        .send({ phone: '555-0100', timezone: 'America/Chicago', city: 'Austin' });

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({ phone: '555-0100', timezone: 'America/Chicago', city: 'Austin' });

      const event = await prisma.organizationEvent.findFirstOrThrow({
        where: { organizationId: DEV_ORGANIZATION_ID, type: 'CLINIC_PROFILE_UPDATED' },
        orderBy: { createdAt: 'desc' },
      });
      expect(event.metadata).toMatchObject({ fields: expect.arrayContaining(['phone', 'timezone', 'city']) });
    });
  });

  describe('GET /clinic/onboarding-state', () => {
    it('reports INVITE_TEAM once phone and timezone are set, and COMPLETE after finishing', async () => {
      const state = await request(app.getHttpServer()).get('/clinic/onboarding-state');
      expect(state.status).toBe(200);
      expect(state.body.step).toBe('INVITE_TEAM');
      expect(state.body.onboardingCompletedAt).toBeNull();

      const complete = await request(app.getHttpServer()).post('/clinic/onboarding/complete');
      expect(complete.status).toBe(201);
      expect(complete.body.step).toBe('COMPLETE');
      expect(complete.body.onboardingCompletedAt).not.toBeNull();

      // idempotent: completing twice doesn't error or move the timestamp.
      const again = await request(app.getHttpServer()).post('/clinic/onboarding/complete');
      expect(again.status).toBe(201);
      expect(again.body.onboardingCompletedAt).toBe(complete.body.onboardingCompletedAt);
    });
  });

  describe('GET /clinic/billing', () => {
    it('reports ACTIVE and unrestricted for the dev clinic', async () => {
      const response = await request(app.getHttpServer()).get('/clinic/billing');
      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({ subscriptionStatus: 'ACTIVE', isRestricted: false });
    });
  });
});

describe('Subscription gating (e2e)', () => {
  let app: INestApplication;
  let organizationId: string;
  let ownerUserId: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();

    const organization = await prisma.organization.create({
      data: { name: 'Subscription Gating Org', subscriptionStatus: 'ACTIVE' },
    });
    organizationId = organization.id;
    const location = await prisma.location.create({ data: { organizationId, name: 'Main Location' } });

    const owner = await prisma.user.create({
      data: {
        organizationId,
        email: `gating-owner-${Date.now()}@example.test`,
        firstName: 'Gated',
        lastName: 'Owner',
        role: 'OWNER',
        staffProfile: { create: { canOwnVisits: true } },
      },
    });
    ownerUserId = owner.id;
    await prisma.organizationMembership.create({
      data: { organizationId, userId: owner.id, role: 'OWNER', isActive: true, status: 'ACTIVE' },
    });
    await prisma.clinicLocationAccess.create({
      data: { organizationId, clinicLocationId: location.id, userId: owner.id, role: 'OWNER', isActive: true },
    });
  });

  afterAll(async () => {
    await prisma.clinicLocationAccess.deleteMany({ where: { organizationId } });
    await prisma.organizationMembership.deleteMany({ where: { organizationId } });
    await prisma.staffProfile.deleteMany({ where: { userId: ownerUserId } });
    await prisma.user.deleteMany({ where: { id: ownerUserId } });
    await prisma.location.deleteMany({ where: { organizationId } });
    await prisma.organizationEvent.deleteMany({ where: { organizationId } });
    await prisma.organization.deleteMany({ where: { id: organizationId } });
    await app.close();
  });

  it('allows normal application access while ACTIVE', async () => {
    const response = await request(app.getHttpServer())
      .get('/patients')
      .set('Cookie', sessionCookieFor(ownerUserId));
    expect(response.status).toBe(200);
  });

  it('blocks application access once the clinic is CANCELED, but leaves clinic/billing self-service reachable', async () => {
    await prisma.organization.update({ where: { id: organizationId }, data: { subscriptionStatus: 'CANCELED' } });

    const blocked = await request(app.getHttpServer())
      .get('/patients')
      .set('Cookie', sessionCookieFor(ownerUserId));
    expect(blocked.status).toBe(402);
    expect(blocked.body).toMatchObject({ code: 'SUBSCRIPTION_INACTIVE', subscriptionStatus: 'CANCELED' });

    const me = await request(app.getHttpServer()).get('/auth/me').set('Cookie', sessionCookieFor(ownerUserId));
    expect(me.status).toBe(200);

    const clinic = await request(app.getHttpServer()).get('/clinic').set('Cookie', sessionCookieFor(ownerUserId));
    expect(clinic.status).toBe(200);

    const billing = await request(app.getHttpServer()).get('/clinic/billing').set('Cookie', sessionCookieFor(ownerUserId));
    expect(billing.status).toBe(200);
    expect(billing.body).toMatchObject({ subscriptionStatus: 'CANCELED', isRestricted: true });

    // Writes stay blocked even on the clinic's own self-service surface.
    const patch = await request(app.getHttpServer())
      .patch('/clinic')
      .set('Cookie', sessionCookieFor(ownerUserId))
      .send({ phone: '555-0199' });
    expect(patch.status).toBe(402);

    await prisma.organization.update({ where: { id: organizationId }, data: { subscriptionStatus: 'ACTIVE' } });
  });

  it('blocks application access while SUSPENDED', async () => {
    await prisma.organization.update({ where: { id: organizationId }, data: { subscriptionStatus: 'SUSPENDED' } });

    const response = await request(app.getHttpServer())
      .get('/patients')
      .set('Cookie', sessionCookieFor(ownerUserId));
    expect(response.status).toBe(402);

    await prisma.organization.update({ where: { id: organizationId }, data: { subscriptionStatus: 'ACTIVE' } });
  });

  it('allows full access while PAST_DUE, surfaced only as a billing warning', async () => {
    await prisma.organization.update({ where: { id: organizationId }, data: { subscriptionStatus: 'PAST_DUE' } });

    const response = await request(app.getHttpServer())
      .get('/patients')
      .set('Cookie', sessionCookieFor(ownerUserId));
    expect(response.status).toBe(200);

    const billing = await request(app.getHttpServer()).get('/clinic/billing').set('Cookie', sessionCookieFor(ownerUserId));
    expect(billing.body).toMatchObject({ subscriptionStatus: 'PAST_DUE', isRestricted: false });

    await prisma.organization.update({ where: { id: organizationId }, data: { subscriptionStatus: 'ACTIVE' } });
  });
});
