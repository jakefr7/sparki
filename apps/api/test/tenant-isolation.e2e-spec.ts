import { AsyncResource } from 'node:async_hooks';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { enterTenantContext, getTenantContext, prisma, prismaUnscoped } from '@sparki/db';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { DEV_ORGANIZATION_ID } from '../src/auth/development-user.service';
import { SESSION_COOKIE_NAME } from '../src/auth/session-cookie';

const SURNAME = 'Isolationprobe';

/**
 * One clinic cannot read or change another clinic's data: two real clinics,
 * each with a signed-in owner, against the real database.
 *
 * The first block guards the harness every other suite relies on. Server
 * and test share a process; if a signed-in request's clinic stayed bound to
 * the test code that follows it, the scoped client would quietly move
 * "other clinic" fixtures into the signed-in clinic, and cross-clinic tests
 * would stop testing anything (see packages/db/src/tenant-context.ts).
 */
describe('Tenant isolation (e2e)', () => {
  let app: INestApplication;
  let otherOrganizationId: string;
  let otherOwnerId: string;
  let ownClientId: string;
  let otherClientId: string;

  const asDevelopmentClinic = () => request(app.getHttpServer());
  const otherOwnerCookie = () => `${SESSION_COOKIE_NAME}=${encodeURIComponent(`dev:${otherOwnerId}`)}`;

  /** Runs `work` with a clinic bound, as a signed-in request would, without
   *  binding the test that calls it. */
  const boundTo = <T>(organizationId: string, work: () => Promise<T>): Promise<T> =>
    new AsyncResource('tenant-isolation-e2e').runInAsyncScope(() => {
      enterTenantContext({ organizationId });
      return work();
    });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    // Listening for the whole file: supertest otherwise opens the server for
    // one request and closes it afterwards, which resets overlapping ones.
    await app.listen(0, '127.0.0.1');

    // Signs in as the development clinic (and lazily seeds it) before any
    // fixture is written — the order that used to move the fixtures below.
    await asDevelopmentClinic().get('/staff').expect(200);

    const otherOrganization = await prisma.organization.create({ data: { name: 'Tenant Isolation E2E Clinic (other)' } });
    otherOrganizationId = otherOrganization.id;
    const location = await prisma.location.create({ data: { organizationId: otherOrganizationId, name: 'Main Location' } });
    const owner = await prisma.user.create({
      data: {
        organizationId: otherOrganizationId,
        email: `tenant-isolation-owner-${Date.now()}@example.test`,
        firstName: 'Other',
        lastName: 'Owner',
        role: 'OWNER',
        staffProfile: { create: { canOwnVisits: true } },
      },
    });
    otherOwnerId = owner.id;
    await prisma.organizationMembership.create({
      data: { organizationId: otherOrganizationId, userId: owner.id, role: 'OWNER', isActive: true, status: 'ACTIVE' },
    });
    await prisma.clinicLocationAccess.create({
      data: { organizationId: otherOrganizationId, clinicLocationId: location.id, userId: owner.id, role: 'OWNER', isActive: true },
    });

    const ownClient = await prisma.client.create({
      data: { organizationId: DEV_ORGANIZATION_ID, firstName: 'Own', lastName: SURNAME },
    });
    ownClientId = ownClient.id;
    const otherClient = await prisma.client.create({
      data: { organizationId: otherOrganizationId, firstName: 'Other', lastName: SURNAME },
    });
    otherClientId = otherClient.id;
  });

  afterAll(async () => {
    await prismaUnscoped.client.deleteMany({ where: { lastName: SURNAME } });
    await prismaUnscoped.clinicLocationAccess.deleteMany({ where: { organizationId: otherOrganizationId } });
    await prismaUnscoped.organizationMembership.deleteMany({ where: { organizationId: otherOrganizationId } });
    await prismaUnscoped.staffProfile.deleteMany({ where: { userId: otherOwnerId } });
    await prismaUnscoped.user.deleteMany({ where: { id: otherOwnerId } });
    await prismaUnscoped.location.deleteMany({ where: { organizationId: otherOrganizationId } });
    await prismaUnscoped.organization.deleteMany({ where: { id: otherOrganizationId } });
    await app.close();
  });

  describe('the test harness', () => {
    it('leaves no clinic bound to the code that follows a signed-in request', async () => {
      await asDevelopmentClinic().get('/staff').expect(200);
      expect(getTenantContext()).toBeUndefined();

      await asDevelopmentClinic().get('/staff').set('Cookie', otherOwnerCookie()).expect(200);
      expect(getTenantContext()).toBeUndefined();
    });

    it("keeps another clinic's fixtures in that clinic", async () => {
      const [client, owner, location] = await Promise.all([
        prismaUnscoped.client.findUniqueOrThrow({ where: { id: otherClientId } }),
        prismaUnscoped.user.findUniqueOrThrow({ where: { id: otherOwnerId } }),
        prismaUnscoped.location.findFirstOrThrow({ where: { organizationId: otherOrganizationId } }),
      ]);

      expect(client.organizationId).toBe(otherOrganizationId);
      expect(owner.organizationId).toBe(otherOrganizationId);
      expect(location.organizationId).toBe(otherOrganizationId);
      expect(otherOrganizationId).not.toBe(DEV_ORGANIZATION_ID);
    });
  });

  describe('through the API', () => {
    it('rejects foreign scheduling references in bulk writes without saving a partial batch', async () => {
      const ownConfig = await asDevelopmentClinic().get('/scheduler-config/appointment-types/eligible-providers').expect(200);
      const ownProviderId = ownConfig.body[0].id;
      const template = { dayOfWeek: 1, startTime: '06:10', endTime: '08:20', label: 'SPA42 tenant boundary', color: '#1FA9A0', isActive: true };
      const blocks = await asDevelopmentClinic().post('/scheduler-config/slot-templates/batch').set('Cookie', otherOwnerCookie()).send({ templates: [template, { ...template, dayOfWeek: 2, staffId: ownProviderId }] });
      expect(blocks.status).toBe(400);
      const closures = await asDevelopmentClinic().post('/scheduler-config/date-exceptions/batch').set('Cookie', otherOwnerCookie()).send({ exceptions: [{ date: '2027-06-01', reason: 'SPA42 tenant boundary' }, { date: '2027-06-02', reason: 'SPA42 tenant boundary', providerId: ownProviderId }] });
      expect(closures.status).toBe(400);
      expect(await prismaUnscoped.schedulerSlotTemplate.count({ where: { label: 'SPA42 tenant boundary' } })).toBe(0);
      expect(await prismaUnscoped.schedulerDateException.count({ where: { reason: 'SPA42 tenant boundary' } })).toBe(0);
    });

    it('keeps bulk scheduling writes unavailable to clinical roles without settings permission', async () => {
      await prismaUnscoped.user.update({ where: { id: otherOwnerId }, data: { role: 'VETERINARIAN' } });
      await prismaUnscoped.organizationMembership.update({ where: { organizationId_userId: { organizationId: otherOrganizationId, userId: otherOwnerId } }, data: { role: 'VETERINARIAN' } });
      await prismaUnscoped.clinicLocationAccess.updateMany({ where: { userId: otherOwnerId }, data: { role: 'VETERINARIAN' } });
      try {
        await asDevelopmentClinic().post('/scheduler-config/slot-templates/batch').set('Cookie', otherOwnerCookie()).send({ templates: [{ dayOfWeek: 1, startTime: '06:00', endTime: '08:00', label: 'SPA42 role boundary', color: '#1FA9A0', isActive: true }] }).expect(403);
        await asDevelopmentClinic().post('/scheduler-config/date-exceptions/batch').set('Cookie', otherOwnerCookie()).send({ exceptions: [{ date: '2027-06-01', reason: 'SPA42 role boundary' }] }).expect(403);
      } finally {
        await prismaUnscoped.user.update({ where: { id: otherOwnerId }, data: { role: 'OWNER' } });
        await prismaUnscoped.organizationMembership.update({ where: { organizationId_userId: { organizationId: otherOrganizationId, userId: otherOwnerId } }, data: { role: 'OWNER' } });
        await prismaUnscoped.clinicLocationAccess.updateMany({ where: { userId: otherOwnerId }, data: { role: 'OWNER' } });
      }
    });

    it('lets each clinic read its own client and not the other one', async () => {
      await asDevelopmentClinic().get(`/clients/${ownClientId}`).expect(200);
      await asDevelopmentClinic().get(`/clients/${otherClientId}`).expect(404);

      await asDevelopmentClinic().get(`/clients/${otherClientId}`).set('Cookie', otherOwnerCookie()).expect(200);
      await asDevelopmentClinic().get(`/clients/${ownClientId}`).set('Cookie', otherOwnerCookie()).expect(404);
    });

    it("refuses a change to the other clinic's client and leaves it untouched", async () => {
      await asDevelopmentClinic().patch(`/clients/${otherClientId}`).send({ firstName: 'Changed' }).expect(404);
      await asDevelopmentClinic()
        .patch(`/clients/${ownClientId}`)
        .set('Cookie', otherOwnerCookie())
        .send({ firstName: 'Changed' })
        .expect(404);

      const clients = await prismaUnscoped.client.findMany({ where: { lastName: SURNAME }, orderBy: { firstName: 'asc' } });
      expect(clients.map(({ id, firstName, organizationId }) => ({ id, firstName, organizationId }))).toEqual([
        { id: otherClientId, firstName: 'Other', organizationId: otherOrganizationId },
        { id: ownClientId, firstName: 'Own', organizationId: DEV_ORGANIZATION_ID },
      ]);
    });

    it('keeps the two clinics apart while their requests overlap', async () => {
      const search = (cookie?: string) => {
        const pending = asDevelopmentClinic().get('/clients/search').query({ query: SURNAME });
        return cookie ? pending.set('Cookie', cookie) : pending;
      };

      const responses = await Promise.all(
        Array.from({ length: 12 }, (_, index) => (index % 2 === 0 ? search() : search(otherOwnerCookie()))),
      );

      responses.forEach((response, index) => {
        expect(response.status).toBe(200);
        expect(response.body.map((client: { id: string }) => client.id)).toEqual([
          index % 2 === 0 ? ownClientId : otherClientId,
        ]);
      });
    });
  });

  // The backstop under every service's own filtering (tenant-scoping.ts),
  // exercised against the real database rather than as a pure transform.
  describe('the database backstop', () => {
    it("cannot read, change or delete another clinic's row while a clinic is bound", async () => {
      await boundTo(DEV_ORGANIZATION_ID, async () => {
        expect(await prisma.client.findUnique({ where: { id: otherClientId } })).toBeNull();
        expect(await prisma.client.findFirst({ where: { id: otherClientId } })).toBeNull();
        const visible = await prisma.client.findMany({ where: { lastName: SURNAME } });
        expect(visible.map(({ id }) => id)).toEqual([ownClientId]);

        await expect(
          prisma.client.update({ where: { id: otherClientId }, data: { firstName: 'Changed' } }),
        ).rejects.toMatchObject({ code: 'P2025' });
        expect(
          await prisma.client.updateMany({ where: { id: otherClientId }, data: { firstName: 'Changed' } }),
        ).toEqual({ count: 0 });
        await expect(prisma.client.delete({ where: { id: otherClientId } })).rejects.toMatchObject({ code: 'P2025' });
        expect(await prisma.client.deleteMany({ where: { id: otherClientId } })).toEqual({ count: 0 });
      });

      expect(getTenantContext()).toBeUndefined();
      const untouched = await prismaUnscoped.client.findUniqueOrThrow({ where: { id: otherClientId } });
      expect(untouched).toMatchObject({ firstName: 'Other', organizationId: otherOrganizationId });
    });

    it("writes a new row into the bound clinic even when another clinic's id is supplied", async () => {
      // Awaited inside: Prisma runs a query when it is awaited, and that is
      // the moment the bound clinic is read.
      const created = await boundTo(DEV_ORGANIZATION_ID, async () => {
        return await prisma.client.create({
          data: { organizationId: otherOrganizationId, firstName: 'Spoofed', lastName: SURNAME },
        });
      });

      const stored = await prismaUnscoped.client.findUniqueOrThrow({ where: { id: created.id } });
      expect(stored.organizationId).toBe(DEV_ORGANIZATION_ID);
    });
  });
});
