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

describe('Patients (e2e)', () => {
  let app: INestApplication;
  let otherOrganizationId: string;
  let primaryClientId: string;
  let secondaryClientId: string;
  let otherOrgClientId: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();

    // Any authenticated request lazily seeds the dev identity under
    // DEV_ORGANIZATION_ID; do it here so fixtures below can reference it.
    await request(app.getHttpServer()).get(`/patients/${DEV_ORGANIZATION_ID}`);

    const otherOrganization = await prisma.organization.create({
      data: { name: 'Patients E2E Org (other)' },
    });
    otherOrganizationId = otherOrganization.id;

    const primaryClient = await prisma.client.create({
      data: { organizationId: DEV_ORGANIZATION_ID, firstName: 'Primary', lastName: 'Owner' },
    });
    primaryClientId = primaryClient.id;

    const secondaryClient = await prisma.client.create({
      data: { organizationId: DEV_ORGANIZATION_ID, firstName: 'Secondary', lastName: 'Owner' },
    });
    secondaryClientId = secondaryClient.id;

    const otherOrgClient = await prisma.client.create({
      data: { organizationId: otherOrganizationId, firstName: 'Other', lastName: 'Org Owner' },
    });
    otherOrgClientId = otherOrgClient.id;
  });

  afterAll(async () => {
    await prisma.visit.deleteMany({
      where: {
        organizationId: { in: [DEV_ORGANIZATION_ID, otherOrganizationId] },
        patient: NOT_PROTECTED,
      },
    });
    await prisma.appointment.deleteMany({
      where: {
        organizationId: { in: [DEV_ORGANIZATION_ID, otherOrganizationId] },
        ...NOT_PROTECTED,
      },
    });
    await prisma.location.deleteMany({
      where: { organizationId: DEV_ORGANIZATION_ID, name: 'Workspace Test Location' },
    });
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

  describe('POST /patients', () => {
    it('creates a patient linked to a primary and secondary client', async () => {
      const response = await request(app.getHttpServer())
        .post('/patients')
        .send({
          name: 'Biscuit',
          species: 'Canine',
          breed: 'Labrador',
          clients: [
            { clientId: primaryClientId, isPrimary: true },
            { clientId: secondaryClientId, isPrimary: false },
          ],
        });

      expect(response.status).toBe(201);
      expect(response.body).toMatchObject({
        organizationId: DEV_ORGANIZATION_ID,
        name: 'Biscuit',
        // Pet last name is never entered by the user — it's inherited from
        // the primary client (fixture: 'Primary Owner') automatically.
        lastName: 'Owner',
        species: 'Canine',
        status: 'Active',
      });
      expect(response.body.clients).toHaveLength(2);
      expect(response.body.clients).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ clientId: primaryClientId, isPrimary: true }),
          expect.objectContaining({ clientId: secondaryClientId, isPrimary: false }),
        ]),
      );
    });

    it('rejects zero primary clients with 400', async () => {
      const response = await request(app.getHttpServer())
        .post('/patients')
        .send({
          name: 'No Primary',
          species: 'Feline',
          clients: [{ clientId: primaryClientId, isPrimary: false }],
        });

      expect(response.status).toBe(400);
    });

    it('rejects more than one primary client with 400', async () => {
      const response = await request(app.getHttpServer())
        .post('/patients')
        .send({
          name: 'Two Primaries',
          species: 'Feline',
          clients: [
            { clientId: primaryClientId, isPrimary: true },
            { clientId: secondaryClientId, isPrimary: true },
          ],
        });

      expect(response.status).toBe(400);
    });

    it('rejects a client from a different organization with 400', async () => {
      const response = await request(app.getHttpServer())
        .post('/patients')
        .send({
          name: 'Cross Org Patient',
          species: 'Feline',
          clients: [{ clientId: otherOrgClientId, isPrimary: true }],
        });

      expect(response.status).toBe(400);
    });

    it('ignores a client-supplied organizationId and uses the authenticated organization', async () => {
      const response = await request(app.getHttpServer())
        .post('/patients')
        .send({
          organizationId: 'org_someone_else',
          name: 'Attempted Spoof',
          species: 'Feline',
          clients: [{ clientId: primaryClientId, isPrimary: true }],
        });

      expect(response.status).toBe(201);
      expect(response.body.organizationId).toBe(DEV_ORGANIZATION_ID);
    });
  });

  describe('GET /patients/:id', () => {
    it('fetches a patient within the authenticated organization', async () => {
      const created = await request(app.getHttpServer())
        .post('/patients')
        .send({
          name: 'Whiskers',
          species: 'Feline',
          clients: [{ clientId: primaryClientId, isPrimary: true }],
        });

      const response = await request(app.getHttpServer()).get(`/patients/${created.body.id}`);

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({ id: created.body.id, name: 'Whiskers' });
    });

    it('returns 404 when the patient belongs to a different organization', async () => {
      const created = await prisma.patient.create({
        data: { organizationId: otherOrganizationId, name: 'Cross Org Lookup', species: 'Feline' },
      });

      const response = await request(app.getHttpServer()).get(`/patients/${created.id}`);

      expect(response.status).toBe(404);
    });
  });

  describe('GET /patients', () => {
    it('lists patients alphabetically for the authenticated organization', async () => {
      await request(app.getHttpServer())
        .post('/patients')
        .send({
          name: 'Zelda',
          species: 'Canine',
          clients: [{ clientId: primaryClientId, isPrimary: true }],
        });
      await request(app.getHttpServer())
        .post('/patients')
        .send({
          name: 'Aria',
          species: 'Feline',
          clients: [{ clientId: primaryClientId, isPrimary: true }],
        });
      await prisma.patient.create({
        data: {
          organizationId: otherOrganizationId,
          name: 'Other Org Pet',
          species: 'Canine',
        },
      });

      const response = await request(app.getHttpServer()).get('/patients').query({ limit: 100 });

      expect(response.status).toBe(200);
      const names = response.body.map((patient: { name: string }) => patient.name);
      expect(names).toContain('Aria');
      expect(names).toContain('Zelda');
      expect(names.indexOf('Aria')).toBeLessThan(names.indexOf('Zelda'));
      expect(names).not.toContain('Other Org Pet');
    });

    it('rejects a limit above the max with 400', async () => {
      const response = await request(app.getHttpServer()).get('/patients').query({ limit: 500 });
      expect(response.status).toBe(400);
    });
  });

  describe('GET /patients/search', () => {
    it('matches by patient name', async () => {
      await request(app.getHttpServer())
        .post('/patients')
        .send({
          name: 'Sir Reginald Barkington',
          species: 'Canine',
          clients: [{ clientId: primaryClientId, isPrimary: true }],
        });

      const response = await request(app.getHttpServer())
        .get('/patients/search')
        .query({ query: 'reginald' });

      expect(response.status).toBe(200);
      expect(response.body).toEqual(
        expect.arrayContaining([expect.objectContaining({ name: 'Sir Reginald Barkington' })]),
      );
    });

    it('matches by linked client name', async () => {
      await request(app.getHttpServer())
        .post('/patients')
        .send({
          name: 'Client Search Patient',
          species: 'Canine',
          clients: [{ clientId: secondaryClientId, isPrimary: true }],
        });

      const response = await request(app.getHttpServer())
        .get('/patients/search')
        .query({ query: 'Secondary Owner' });

      expect(response.status).toBe(200);
      expect(response.body).toEqual(
        expect.arrayContaining([expect.objectContaining({ name: 'Client Search Patient' })]),
      );
    });

    it('matches by stored pet lastName even when it diverges from the linked client', async () => {
      const patient = await prisma.patient.create({
        data: {
          organizationId: DEV_ORGANIZATION_ID,
          name: 'Whiskers',
          lastName: 'Blackwood',
          species: 'Feline',
          clients: { create: { clientId: primaryClientId, isPrimary: true } },
        },
      });

      const response = await request(app.getHttpServer())
        .get('/patients/search')
        .query({ query: 'Blackwood' });

      expect(response.status).toBe(200);
      expect(response.body).toEqual(
        expect.arrayContaining([expect.objectContaining({ id: patient.id, name: 'Whiskers' })]),
      );
    });

    it('tolerates a typo via trigram fuzzy matching', async () => {
      await request(app.getHttpServer())
        .post('/patients')
        .send({
          name: 'Biscuit',
          species: 'Canine',
          clients: [{ clientId: primaryClientId, isPrimary: true }],
        });

      const response = await request(app.getHttpServer())
        .get('/patients/search')
        .query({ query: 'Biskit' });

      expect(response.status).toBe(200);
      expect(response.body).toEqual(
        expect.arrayContaining([expect.objectContaining({ name: 'Biscuit' })]),
      );
    });

    it('returns an empty array when nothing matches', async () => {
      // Deliberately shares no substring with any fixture name in this file
      // (fuzzy/trigram matching means e.g. "no-such-patient-exists" would
      // legitimately match "Client Search Patient" via the shared "patient").
      const response = await request(app.getHttpServer())
        .get('/patients/search')
        .query({ query: 'qzxjvkqzxjvk' });

      expect(response.status).toBe(200);
      expect(response.body).toEqual([]);
    });

    it('does not return patients from a different organization', async () => {
      await prisma.patient.create({
        data: {
          organizationId: otherOrganizationId,
          name: 'Only In Other Org',
          species: 'Feline',
        },
      });

      const response = await request(app.getHttpServer())
        .get('/patients/search')
        .query({ query: 'Only In Other Org' });

      expect(response.status).toBe(200);
      expect(response.body).toEqual([]);
    });
  });

  describe('GET /patients/:id/workspace', () => {
    it('returns patient identity, client context, and unavailable sections', async () => {
      const created = await request(app.getHttpServer())
        .post('/patients')
        .send({
          name: 'Workspace Patient',
          species: 'Canine',
          clients: [
            { clientId: primaryClientId, isPrimary: true },
            { clientId: secondaryClientId, isPrimary: false },
          ],
        });

      const response = await request(app.getHttpServer()).get(
        `/patients/${created.body.id}/workspace`,
      );

      expect(response.status).toBe(200);
      expect(response.body.patient).toMatchObject({
        id: created.body.id,
        name: 'Workspace Patient',
        status: 'Active',
      });
      expect(response.body.clients).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: primaryClientId, isPrimary: true }),
          expect.objectContaining({ id: secondaryClientId, isPrimary: false }),
        ]),
      );
      expect(response.body.upcomingAppointments).toEqual([]);
      expect(response.body.recentVisits).toEqual([]);
      expect(response.body.sections.currentVisit).toMatchObject({ status: 'unavailable' });
      expect(response.body.sections.medications).toMatchObject({ status: 'unavailable' });
      expect(response.body.sections.workItems).toMatchObject({ status: 'unavailable' });
      expect(response.body.sections.communication).toMatchObject({ status: 'unavailable' });
      expect(response.body.sections.financial).toMatchObject({ status: 'unavailable' });
      expect(response.body.sections.attachments).toMatchObject({ status: 'unavailable' });
    });

    it("surfaces the primary client's structured address", async () => {
      const addressedClient = await prisma.client.create({
        data: {
          organizationId: DEV_ORGANIZATION_ID,
          firstName: 'Address',
          lastName: 'Owner',
          addressLine1: '123 Main St',
          city: 'Springfield',
          state: 'IL',
          postalCode: '62704',
          country: 'US',
          formattedAddress: '123 Main St, Springfield, IL 62704',
        },
      });
      const created = await request(app.getHttpServer())
        .post('/patients')
        .send({
          name: 'Addressed Patient',
          species: 'Canine',
          clients: [{ clientId: addressedClient.id, isPrimary: true }],
        });

      const response = await request(app.getHttpServer()).get(
        `/patients/${created.body.id}/workspace`,
      );

      expect(response.status).toBe(200);
      expect(response.body.clients).toEqual([
        expect.objectContaining({
          id: addressedClient.id,
          addressLine1: '123 Main St',
          city: 'Springfield',
          state: 'IL',
          postalCode: '62704',
          country: 'US',
          formattedAddress: '123 Main St, Springfield, IL 62704',
        }),
      ]);
    });

    it('includes upcoming appointments and excludes cancelled/past ones', async () => {
      const created = await request(app.getHttpServer())
        .post('/patients')
        .send({
          name: 'Appointment Workspace Patient',
          species: 'Canine',
          clients: [{ clientId: primaryClientId, isPrimary: true }],
        });
      const patientId = created.body.id;
      const location = await prisma.location.create({
        data: { organizationId: DEV_ORGANIZATION_ID, name: 'Workspace Test Location' },
      });

      const upcoming = await prisma.appointment.create({
        data: {
          organizationId: DEV_ORGANIZATION_ID,
          locationId: location.id,
          patientId,
          type: 'WellnessPreventiveCare',
          reason: 'Checkup',
          source: 'Phone',
          state: 'Scheduled',
          scheduledAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        },
      });
      await prisma.appointment.create({
        data: {
          organizationId: DEV_ORGANIZATION_ID,
          locationId: location.id,
          patientId,
          type: 'SickVisit',
          reason: 'Cancelled visit',
          source: 'Phone',
          state: 'Cancelled',
          scheduledAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        },
      });
      await prisma.appointment.create({
        data: {
          organizationId: DEV_ORGANIZATION_ID,
          locationId: location.id,
          patientId,
          type: 'SickVisit',
          reason: 'Past visit',
          source: 'Phone',
          state: 'Scheduled',
          scheduledAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
        },
      });

      const response = await request(app.getHttpServer()).get(`/patients/${patientId}/workspace`);

      expect(response.status).toBe(200);
      expect(response.body.upcomingAppointments).toEqual([
        expect.objectContaining({ id: upcoming.id, reason: 'Checkup', state: 'Scheduled' }),
      ]);
    });

    it('surfaces recent visits and medications from the latest visit intake', async () => {
      const created = await request(app.getHttpServer())
        .post('/patients')
        .send({
          name: 'Medication Workspace Patient',
          species: 'Canine',
          clients: [{ clientId: primaryClientId, isPrimary: true }],
        });
      const patientId = created.body.id;
      const location = await prisma.location.create({
        data: { organizationId: DEV_ORGANIZATION_ID, name: 'Workspace Test Location' },
      });

      const olderVisit = await prisma.visit.create({
        data: {
          organizationId: DEV_ORGANIZATION_ID,
          locationId: location.id,
          patientId,
          visitType: 'Scheduled',
          reason: 'Old checkup',
          state: 'Archived',
        },
      });
      await prisma.visitIntake.create({
        data: { visitId: olderVisit.id, medicationsAllergies: 'Old med — no longer current' },
      });

      const latestVisit = await prisma.visit.create({
        data: {
          organizationId: DEV_ORGANIZATION_ID,
          locationId: location.id,
          patientId,
          visitType: 'WalkIn',
          reason: 'Recheck',
          state: 'Archived',
        },
      });
      await prisma.visitIntake.create({
        data: { visitId: latestVisit.id, medicationsAllergies: 'Amoxicillin 250mg twice daily' },
      });

      const response = await request(app.getHttpServer()).get(`/patients/${patientId}/workspace`);

      expect(response.status).toBe(200);
      expect(response.body.recentVisits).toEqual([
        expect.objectContaining({ id: latestVisit.id, reason: 'Recheck' }),
        expect.objectContaining({ id: olderVisit.id, reason: 'Old checkup' }),
      ]);
      expect(response.body.sections.medications).toMatchObject({
        status: 'available',
        notes: 'Amoxicillin 250mg twice daily',
        visitId: latestVisit.id,
      });
    });

    it('returns 404 when the patient belongs to a different organization', async () => {
      const created = await prisma.patient.create({
        data: {
          organizationId: otherOrganizationId,
          name: 'Cross Org Workspace',
          species: 'Feline',
        },
      });

      const response = await request(app.getHttpServer()).get(`/patients/${created.id}/workspace`);

      expect(response.status).toBe(404);
    });
  });

  describe('PATCH /patients/:id', () => {
    it('updates identity fields and leaves omitted fields unchanged', async () => {
      const created = await request(app.getHttpServer())
        .post('/patients')
        .send({
          name: 'Edit Me',
          species: 'Canine',
          breed: 'Labrador',
          clients: [{ clientId: primaryClientId, isPrimary: true }],
        });

      const response = await request(app.getHttpServer())
        .patch(`/patients/${created.body.id}`)
        .send({ name: 'Edited Name', sex: 'Female' });

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        id: created.body.id,
        name: 'Edited Name',
        breed: 'Labrador',
        sex: 'Female',
      });
    });

    it('clears a nullable field when explicitly set to null', async () => {
      const created = await request(app.getHttpServer())
        .post('/patients')
        .send({
          name: 'Clear Me',
          species: 'Canine',
          breed: 'Poodle',
          clients: [{ clientId: primaryClientId, isPrimary: true }],
        });

      const response = await request(app.getHttpServer())
        .patch(`/patients/${created.body.id}`)
        .send({ breed: null });

      expect(response.status).toBe(200);
      expect(response.body.breed).toBeNull();
    });

    it('rejects an empty body with 400', async () => {
      const created = await request(app.getHttpServer())
        .post('/patients')
        .send({
          name: 'Empty Body Patient',
          species: 'Canine',
          clients: [{ clientId: primaryClientId, isPrimary: true }],
        });

      const response = await request(app.getHttpServer()).patch(`/patients/${created.body.id}`).send({});

      expect(response.status).toBe(400);
    });

    it('returns 404 when the patient belongs to a different organization', async () => {
      const created = await prisma.patient.create({
        data: { organizationId: otherOrganizationId, name: 'Cross Org Edit', species: 'Feline' },
      });

      const response = await request(app.getHttpServer())
        .patch(`/patients/${created.id}`)
        .send({ name: 'Should Not Apply' });

      expect(response.status).toBe(404);
    });
  });
});
