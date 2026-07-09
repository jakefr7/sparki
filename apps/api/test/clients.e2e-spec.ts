import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { prisma } from '@sparki/db';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { DEV_ORGANIZATION_ID } from '../src/auth/development-user.service';

// Rows from scripts/seed-local-clinic-demo-data.mjs are tagged with this
// sourceSystem and must survive this file's shared-org cleanup — see that
// script's header comment for why the data is protected and persistent.
const PROTECTED_SOURCE_SYSTEM = 'sparki-local-demo';
// `{ sourceSystem: { not: X } }` alone would exclude NULL rows too
// (SQL three-valued logic), and this file's own fixtures have
// sourceSystem = null — so the null branch below is required or this
// filter silently matches nothing.
const NOT_PROTECTED = {
  OR: [{ sourceSystem: null }, { sourceSystem: { not: PROTECTED_SOURCE_SYSTEM } }],
};

describe('Clients (e2e)', () => {
  let app: INestApplication;
  let otherOrganizationId: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();

    // Any authenticated request lazily seeds the dev identity
    // (Organization/Location/Role/User under DEV_ORGANIZATION_ID); do it here
    // so DEV_ORGANIZATION_ID is guaranteed to exist before fixtures below
    // reference it directly via prisma.
    await request(app.getHttpServer()).get(`/clients/${DEV_ORGANIZATION_ID}`);

    const otherOrganization = await prisma.organization.create({
      data: { name: 'Clients E2E Org (other)' },
    });
    otherOrganizationId = otherOrganization.id;
  });

  afterAll(async () => {
    await prisma.patientClient.deleteMany({
      where: {
        client: { organizationId: { in: [DEV_ORGANIZATION_ID, otherOrganizationId] } },
        patient: NOT_PROTECTED,
      },
    });
    await prisma.patient.deleteMany({
      where: {
        organizationId: { in: [DEV_ORGANIZATION_ID, otherOrganizationId] },
        ...NOT_PROTECTED,
      },
    });
    await prisma.client.deleteMany({
      where: {
        organizationId: { in: [DEV_ORGANIZATION_ID, otherOrganizationId] },
        ...NOT_PROTECTED,
      },
    });
    await prisma.organization.deleteMany({ where: { id: otherOrganizationId } });
    await app.close();
  });

  describe('POST /clients', () => {
    it('creates a client scoped to the authenticated organization', async () => {
      const response = await request(app.getHttpServer()).post('/clients').send({
        firstName: 'Jordan',
        lastName: 'Rivera',
        email: 'jordan@example.com',
        phone: '555-0100',
        preferredContactMethod: 'email',
      });

      expect(response.status).toBe(201);
      expect(response.body).toMatchObject({
        organizationId: DEV_ORGANIZATION_ID,
        firstName: 'Jordan',
        lastName: 'Rivera',
        email: 'jordan@example.com',
      });
      expect(response.body.id).toEqual(expect.any(String));
    });

    it('creates a client with a full structured address', async () => {
      const response = await request(app.getHttpServer()).post('/clients').send({
        firstName: 'Priya',
        lastName: 'Nair',
        addressLine1: '123 Main St',
        addressLine2: 'Apt 4',
        city: 'Springfield',
        state: 'IL',
        postalCode: '62704',
        country: 'US',
        formattedAddress: '123 Main St, Apt 4, Springfield, IL 62704',
        addressPlaceId: 'place.123',
        addressLatitude: 39.78,
        addressLongitude: -89.65,
      });

      expect(response.status).toBe(201);
      expect(response.body).toMatchObject({
        addressLine1: '123 Main St',
        addressLine2: 'Apt 4',
        city: 'Springfield',
        state: 'IL',
        postalCode: '62704',
        country: 'US',
        formattedAddress: '123 Main St, Apt 4, Springfield, IL 62704',
        addressPlaceId: 'place.123',
        addressLatitude: 39.78,
        addressLongitude: -89.65,
      });
    });

    it('ignores a client-supplied organizationId and uses the authenticated organization', async () => {
      const response = await request(app.getHttpServer())
        .post('/clients')
        .send({ organizationId: 'org_someone_else', firstName: 'Attempted', lastName: 'Spoof' });

      expect(response.status).toBe(201);
      expect(response.body.organizationId).toBe(DEV_ORGANIZATION_ID);
    });

    it('rejects a missing name with 400', async () => {
      const response = await request(app.getHttpServer()).post('/clients').send({});
      expect(response.status).toBe(400);
    });
  });

  describe('GET /clients/:id', () => {
    it('fetches a client within the authenticated organization', async () => {
      const created = await prisma.client.create({
        data: { organizationId: DEV_ORGANIZATION_ID, firstName: 'Sasha', lastName: 'Lee' },
      });

      const response = await request(app.getHttpServer()).get(`/clients/${created.id}`);

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({ id: created.id, firstName: 'Sasha', lastName: 'Lee' });
    });

    it('returns 404 when the client belongs to a different organization', async () => {
      const created = await prisma.client.create({
        data: { organizationId: otherOrganizationId, firstName: 'Cross', lastName: 'Org Client' },
      });

      const response = await request(app.getHttpServer()).get(`/clients/${created.id}`);

      expect(response.status).toBe(404);
    });
  });

  describe('GET /clients/search', () => {
    it('matches by client name', async () => {
      await prisma.client.create({
        data: { organizationId: DEV_ORGANIZATION_ID, firstName: 'Reginald', lastName: 'Barkington' },
      });

      const response = await request(app.getHttpServer())
        .get('/clients/search')
        .query({ query: 'Barkington' });

      expect(response.status).toBe(200);
      expect(response.body).toEqual(
        expect.arrayContaining([expect.objectContaining({ firstName: 'Reginald' })]),
      );
    });

    it('matches by phone or email', async () => {
      await prisma.client.create({
        data: {
          organizationId: DEV_ORGANIZATION_ID,
          firstName: 'Contact',
          lastName: 'Match',
          phone: '555-0199',
          email: 'contact-match@example.com',
        },
      });

      const response = await request(app.getHttpServer())
        .get('/clients/search')
        .query({ query: 'contact-match@example.com' });

      expect(response.status).toBe(200);
      expect(response.body).toEqual(
        expect.arrayContaining([expect.objectContaining({ lastName: 'Match' })]),
      );
    });

    it('tolerates a typo via trigram fuzzy matching', async () => {
      await prisma.client.create({
        data: { organizationId: DEV_ORGANIZATION_ID, firstName: 'Biscuit', lastName: 'Hoskins' },
      });

      const response = await request(app.getHttpServer())
        .get('/clients/search')
        .query({ query: 'Biskit Hoskins' });

      expect(response.status).toBe(200);
      expect(response.body).toEqual(
        expect.arrayContaining([expect.objectContaining({ firstName: 'Biscuit' })]),
      );
    });

    it('returns an empty array when nothing matches', async () => {
      const response = await request(app.getHttpServer())
        .get('/clients/search')
        .query({ query: 'qzxjvkqzxjvk' });

      expect(response.status).toBe(200);
      expect(response.body).toEqual([]);
    });

    it('does not return clients from a different organization', async () => {
      await prisma.client.create({
        data: { organizationId: otherOrganizationId, firstName: 'Only', lastName: 'InOtherOrg' },
      });

      const response = await request(app.getHttpServer())
        .get('/clients/search')
        .query({ query: 'Only InOtherOrg' });

      expect(response.status).toBe(200);
      expect(response.body).toEqual([]);
    });
  });

  describe('PATCH /clients/:id', () => {
    it('updates identity/contact fields and leaves omitted fields unchanged', async () => {
      const created = await prisma.client.create({
        data: {
          organizationId: DEV_ORGANIZATION_ID,
          firstName: 'Original',
          lastName: 'Owner',
          phone: '555-0111',
        },
      });

      const response = await request(app.getHttpServer())
        .patch(`/clients/${created.id}`)
        .send({ lastName: 'Updated Owner', email: 'updated@example.com' });

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        id: created.id,
        firstName: 'Original',
        lastName: 'Updated Owner',
        phone: '555-0111',
        email: 'updated@example.com',
      });
    });

    it('updates the structured address fields', async () => {
      const created = await prisma.client.create({
        data: { organizationId: DEV_ORGANIZATION_ID, firstName: 'Address', lastName: 'Update' },
      });

      const response = await request(app.getHttpServer()).patch(`/clients/${created.id}`).send({
        addressLine1: '456 Oak Ave',
        city: 'Metropolis',
        state: 'NY',
        postalCode: '10001',
        country: 'US',
        formattedAddress: '456 Oak Ave, Metropolis, NY 10001',
      });

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        addressLine1: '456 Oak Ave',
        city: 'Metropolis',
        state: 'NY',
        postalCode: '10001',
        country: 'US',
        formattedAddress: '456 Oak Ave, Metropolis, NY 10001',
      });
    });

    it('clears address fields when explicitly set to null', async () => {
      const created = await prisma.client.create({
        data: {
          organizationId: DEV_ORGANIZATION_ID,
          firstName: 'Clear',
          lastName: 'Address',
          addressLine1: '789 Elm St',
          city: 'Gotham',
        },
      });

      const response = await request(app.getHttpServer())
        .patch(`/clients/${created.id}`)
        .send({ addressLine1: null, city: null });

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({ addressLine1: null, city: null });
    });

    it('rejects an invalid email with 400', async () => {
      const created = await prisma.client.create({
        data: { organizationId: DEV_ORGANIZATION_ID, firstName: 'Bad', lastName: 'Email' },
      });

      const response = await request(app.getHttpServer())
        .patch(`/clients/${created.id}`)
        .send({ email: 'not-an-email' });

      expect(response.status).toBe(400);
    });

    it('rejects an empty body with 400', async () => {
      const created = await prisma.client.create({
        data: { organizationId: DEV_ORGANIZATION_ID, firstName: 'Empty', lastName: 'Body' },
      });

      const response = await request(app.getHttpServer()).patch(`/clients/${created.id}`).send({});

      expect(response.status).toBe(400);
    });

    it('returns 404 when the client belongs to a different organization', async () => {
      const created = await prisma.client.create({
        data: { organizationId: otherOrganizationId, firstName: 'Cross', lastName: 'Org Edit' },
      });

      const response = await request(app.getHttpServer())
        .patch(`/clients/${created.id}`)
        .send({ firstName: 'Should Not Apply' });

      expect(response.status).toBe(404);
    });

    it("syncs the linked pet's inherited lastName when it still matches the old owner name", async () => {
      const owner = await prisma.client.create({
        data: { organizationId: DEV_ORGANIZATION_ID, firstName: 'Dana', lastName: 'Original' },
      });
      const patient = await prisma.patient.create({
        data: {
          organizationId: DEV_ORGANIZATION_ID,
          name: 'Biscuit',
          lastName: 'Original',
          species: 'Canine',
          clients: { create: { clientId: owner.id, isPrimary: true } },
        },
      });

      const response = await request(app.getHttpServer())
        .patch(`/clients/${owner.id}`)
        .send({ lastName: 'Updated' });

      expect(response.status).toBe(200);
      const refreshed = await prisma.patient.findUniqueOrThrow({ where: { id: patient.id } });
      expect(refreshed.lastName).toBe('Updated');
    });

    it("syncs an empty pet lastName when the owner's lastName is set", async () => {
      const owner = await prisma.client.create({
        data: { organizationId: DEV_ORGANIZATION_ID, firstName: 'Ravi', lastName: 'Original' },
      });
      const patient = await prisma.patient.create({
        data: {
          organizationId: DEV_ORGANIZATION_ID,
          name: 'Waffles',
          species: 'Canine',
          clients: { create: { clientId: owner.id, isPrimary: true } },
        },
      });

      await request(app.getHttpServer()).patch(`/clients/${owner.id}`).send({ lastName: 'Updated' });

      const refreshed = await prisma.patient.findUniqueOrThrow({ where: { id: patient.id } });
      expect(refreshed.lastName).toBe('Updated');
    });

    it('does not overwrite a pet lastName that was manually changed away from the owner name', async () => {
      const owner = await prisma.client.create({
        data: { organizationId: DEV_ORGANIZATION_ID, firstName: 'Pat', lastName: 'Original' },
      });
      const patient = await prisma.patient.create({
        data: {
          organizationId: DEV_ORGANIZATION_ID,
          name: 'Shadow',
          lastName: 'ManuallySet',
          species: 'Canine',
          clients: { create: { clientId: owner.id, isPrimary: true } },
        },
      });

      await request(app.getHttpServer()).patch(`/clients/${owner.id}`).send({ lastName: 'Updated' });

      const refreshed = await prisma.patient.findUniqueOrThrow({ where: { id: patient.id } });
      expect(refreshed.lastName).toBe('ManuallySet');
    });
  });
});
