import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { prisma } from '@sparki/db';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import {
  DEV_LOCATION_ID,
  DEV_ORGANIZATION_ID,
  DEV_USER_ID,
} from '../src/auth/development-user.service';

describe('Appointments (e2e)', () => {
  let app: INestApplication;
  let otherOrganizationId: string;
  let primaryClientId: string;
  let secondaryClientId: string;
  let otherOrgClientId: string;
  let patientId: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();

    // Any authenticated request lazily seeds the dev identity under
    // DEV_ORGANIZATION_ID; do it here so fixtures below can reference it.
    await request(app.getHttpServer()).get(`/patients/${DEV_ORGANIZATION_ID}`);

    const otherOrganization = await prisma.organization.create({
      data: { name: 'Appointments E2E Org (other)' },
    });
    otherOrganizationId = otherOrganization.id;

    const primaryClient = await prisma.client.create({
      data: { organizationId: DEV_ORGANIZATION_ID, firstName: 'Appt', lastName: 'Primary Owner' },
    });
    primaryClientId = primaryClient.id;

    const secondaryClient = await prisma.client.create({
      data: {
        organizationId: DEV_ORGANIZATION_ID,
        firstName: 'Appt',
        lastName: 'Secondary Owner',
      },
    });
    secondaryClientId = secondaryClient.id;

    const otherOrgClient = await prisma.client.create({
      data: { organizationId: otherOrganizationId, firstName: 'Other', lastName: 'Org Owner' },
    });
    otherOrgClientId = otherOrgClient.id;

    const patient = await prisma.patient.create({
      data: {
        organizationId: DEV_ORGANIZATION_ID,
        name: 'Appt Patient',
        species: 'Canine',
        clients: {
          create: [
            { clientId: primaryClientId, isPrimary: true },
            { clientId: secondaryClientId, isPrimary: false },
          ],
        },
      },
    });
    patientId = patient.id;
  });

  afterAll(async () => {
    await prisma.appointment.deleteMany({
      where: { organizationId: { in: [DEV_ORGANIZATION_ID, otherOrganizationId] } },
    });
    await prisma.patientClient.deleteMany({ where: { patientId } });
    await prisma.patient.deleteMany({ where: { id: patientId } });
    await prisma.client.deleteMany({
      where: { organizationId: { in: [DEV_ORGANIZATION_ID, otherOrganizationId] } },
    });
    await prisma.location.deleteMany({ where: { organizationId: otherOrganizationId } });
    await prisma.organization.deleteMany({ where: { id: otherOrganizationId } });
    await app.close();
  });

  /** Seeds an appointment directly in a given state — several MVP states
   *  (Draft, PreVisitPending, VisitCreated, ...) have no creation endpoint
   *  reaching them, so tests exercising transitions *from* those states
   *  seed them directly. */
  async function seedAppointment(
    state:
      | 'Draft'
      | 'Scheduled'
      | 'PreVisitPending'
      | 'Confirmed'
      | 'Arrived'
      | 'VisitCreated'
      | 'Cancelled'
      | 'Completed'
      | 'NoShow',
  ) {
    return prisma.appointment.create({
      data: {
        organizationId: DEV_ORGANIZATION_ID,
        locationId: DEV_LOCATION_ID,
        patientId,
        clientId: primaryClientId,
        type: 'WellnessPreventiveCare',
        reason: 'Transition test fixture',
        source: 'Phone',
        state,
        scheduledAt: new Date('2027-03-01T15:00:00.000Z'),
      },
    });
  }

  describe('POST /appointments', () => {
    it('creates an appointment scoped to the authenticated org/location, defaulting to the primary client', async () => {
      const response = await request(app.getHttpServer()).post('/appointments').send({
        patientId,
        appointmentType: 'WellnessPreventiveCare',
        visitReason: 'Annual checkup',
        startTime: '2027-01-15T15:00:00.000Z',
        expectedDurationMinutes: 30,
      });

      expect(response.status).toBe(201);
      expect(response.body).toMatchObject({
        organizationId: DEV_ORGANIZATION_ID,
        locationId: DEV_LOCATION_ID,
        patientId,
        clientId: primaryClientId,
        type: 'WellnessPreventiveCare',
        reason: 'Annual checkup',
        source: 'Phone',
        state: 'Scheduled',
        expectedDurationMinutes: 30,
        createdById: DEV_USER_ID,
      });
      expect(new Date(response.body.scheduledAt).toISOString()).toBe('2027-01-15T15:00:00.000Z');
    });

    it('honors an explicit clientId over the default primary client', async () => {
      const response = await request(app.getHttpServer()).post('/appointments').send({
        patientId,
        clientId: secondaryClientId,
        appointmentType: 'SickVisit',
        visitReason: 'Limping',
        startTime: '2027-01-16T15:00:00.000Z',
      });

      expect(response.status).toBe(201);
      expect(response.body.clientId).toBe(secondaryClientId);
    });

    it('accepts a valid assignedProviderId in the same organization', async () => {
      const response = await request(app.getHttpServer()).post('/appointments').send({
        patientId,
        appointmentType: 'Recheck',
        visitReason: 'Follow-up',
        startTime: '2027-01-17T15:00:00.000Z',
        assignedProviderId: DEV_USER_ID,
      });

      expect(response.status).toBe(201);
      expect(response.body.providerId).toBe(DEV_USER_ID);
    });

    it('rejects an invalid appointmentType with 400', async () => {
      const response = await request(app.getHttpServer()).post('/appointments').send({
        patientId,
        appointmentType: 'NotARealType',
        visitReason: 'Annual checkup',
        startTime: '2027-01-15T15:00:00.000Z',
      });

      expect(response.status).toBe(400);
    });

    it('rejects a missing visitReason with 400', async () => {
      const response = await request(app.getHttpServer()).post('/appointments').send({
        patientId,
        appointmentType: 'WellnessPreventiveCare',
        startTime: '2027-01-15T15:00:00.000Z',
      });

      expect(response.status).toBe(400);
    });

    it('rejects an unknown patientId with 404', async () => {
      const response = await request(app.getHttpServer()).post('/appointments').send({
        patientId: 'patient_does_not_exist',
        appointmentType: 'WellnessPreventiveCare',
        visitReason: 'Annual checkup',
        startTime: '2027-01-15T15:00:00.000Z',
      });

      expect(response.status).toBe(404);
    });

    it('rejects a clientId from a different organization with 400', async () => {
      const response = await request(app.getHttpServer()).post('/appointments').send({
        patientId,
        clientId: otherOrgClientId,
        appointmentType: 'WellnessPreventiveCare',
        visitReason: 'Annual checkup',
        startTime: '2027-01-15T15:00:00.000Z',
      });

      expect(response.status).toBe(400);
    });

    it('rejects an assignedProviderId from a different organization with 400', async () => {
      const otherOrgUser = await prisma.user.create({
        data: {
          organizationId: otherOrganizationId,
          email: `other-org-user-${Date.now()}@example.com`,
          name: 'Other Org Vet',
        },
      });

      const response = await request(app.getHttpServer()).post('/appointments').send({
        patientId,
        appointmentType: 'WellnessPreventiveCare',
        visitReason: 'Annual checkup',
        startTime: '2027-01-15T15:00:00.000Z',
        assignedProviderId: otherOrgUser.id,
      });

      expect(response.status).toBe(400);

      await prisma.user.delete({ where: { id: otherOrgUser.id } });
    });

    it('ignores client-supplied organizationId/locationId and uses the authenticated context', async () => {
      const response = await request(app.getHttpServer()).post('/appointments').send({
        organizationId: 'org_someone_else',
        locationId: 'location_someone_else',
        patientId,
        appointmentType: 'WellnessPreventiveCare',
        visitReason: 'Annual checkup',
        startTime: '2027-01-18T15:00:00.000Z',
      });

      expect(response.status).toBe(201);
      expect(response.body.organizationId).toBe(DEV_ORGANIZATION_ID);
      expect(response.body.locationId).toBe(DEV_LOCATION_ID);
    });
  });

  describe('GET /appointments/:id', () => {
    it('fetches an appointment within the authenticated organization', async () => {
      const created = await request(app.getHttpServer()).post('/appointments').send({
        patientId,
        appointmentType: 'Vaccination',
        visitReason: 'Rabies booster',
        startTime: '2027-01-19T15:00:00.000Z',
      });

      const response = await request(app.getHttpServer()).get(`/appointments/${created.body.id}`);

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({ id: created.body.id, reason: 'Rabies booster' });
    });

    it('returns 404 when the appointment belongs to a different organization', async () => {
      const location = await prisma.location.create({
        data: { organizationId: otherOrganizationId, name: 'Other Org Location' },
      });
      const created = await prisma.appointment.create({
        data: {
          organizationId: otherOrganizationId,
          locationId: location.id,
          type: 'SickVisit',
          reason: 'Cross org appointment',
          source: 'Phone',
          state: 'Scheduled',
          scheduledAt: new Date('2027-01-20T15:00:00.000Z'),
        },
      });

      const response = await request(app.getHttpServer()).get(`/appointments/${created.id}`);

      expect(response.status).toBe(404);
    });
  });

  describe('POST /appointments/:id/confirm', () => {
    it.each(['Scheduled', 'PreVisitPending'] as const)('confirms from %s', async (state) => {
      const appointment = await seedAppointment(state);

      const response = await request(app.getHttpServer()).post(
        `/appointments/${appointment.id}/confirm`,
      );

      expect(response.status).toBe(201);
      expect(response.body.state).toBe('Confirmed');
    });

    it.each(['Draft', 'Confirmed', 'Arrived', 'VisitCreated', 'Cancelled', 'NoShow'] as const)(
      'rejects confirming from %s with 409',
      async (state) => {
        const appointment = await seedAppointment(state);

        const response = await request(app.getHttpServer()).post(
          `/appointments/${appointment.id}/confirm`,
        );

        expect(response.status).toBe(409);
      },
    );

    it('returns 404 for an appointment in a different organization', async () => {
      const location = await prisma.location.create({
        data: { organizationId: otherOrganizationId, name: 'Confirm Cross Org Location' },
      });
      const appointment = await prisma.appointment.create({
        data: {
          organizationId: otherOrganizationId,
          locationId: location.id,
          type: 'SickVisit',
          reason: 'Cross org appointment',
          source: 'Phone',
          state: 'Scheduled',
          scheduledAt: new Date('2027-03-02T15:00:00.000Z'),
        },
      });

      const response = await request(app.getHttpServer()).post(
        `/appointments/${appointment.id}/confirm`,
      );

      expect(response.status).toBe(404);
    });
  });

  describe('POST /appointments/:id/arrive', () => {
    it.each(['Scheduled', 'PreVisitPending', 'Confirmed'] as const)(
      'marks arrived from %s',
      async (state) => {
        const appointment = await seedAppointment(state);

        const response = await request(app.getHttpServer()).post(
          `/appointments/${appointment.id}/arrive`,
        );

        expect(response.status).toBe(201);
        expect(response.body.state).toBe('Arrived');
      },
    );

    it.each(['Draft', 'Arrived', 'VisitCreated', 'Cancelled', 'Completed', 'NoShow'] as const)(
      'rejects marking arrived from %s with 409',
      async (state) => {
        const appointment = await seedAppointment(state);

        const response = await request(app.getHttpServer()).post(
          `/appointments/${appointment.id}/arrive`,
        );

        expect(response.status).toBe(409);
      },
    );
  });

  describe('POST /appointments/:id/cancel', () => {
    it.each([
      'Draft',
      'Scheduled',
      'PreVisitPending',
      'Confirmed',
      'Arrived',
      'VisitCreated',
    ] as const)('cancels from %s', async (state) => {
      const appointment = await seedAppointment(state);

      const response = await request(app.getHttpServer()).post(
        `/appointments/${appointment.id}/cancel`,
      );

      expect(response.status).toBe(201);
      expect(response.body.state).toBe('Cancelled');
    });

    it.each(['Cancelled', 'Completed', 'NoShow'] as const)(
      'rejects cancelling an already-terminal %s appointment with 409',
      async (state) => {
        const appointment = await seedAppointment(state);

        const response = await request(app.getHttpServer()).post(
          `/appointments/${appointment.id}/cancel`,
        );

        expect(response.status).toBe(409);
      },
    );
  });

  describe('POST /appointments/:id/no-show', () => {
    it.each(['Scheduled', 'Confirmed', 'Arrived'] as const)(
      'marks no-show from %s',
      async (state) => {
        const appointment = await seedAppointment(state);

        const response = await request(app.getHttpServer()).post(
          `/appointments/${appointment.id}/no-show`,
        );

        expect(response.status).toBe(201);
        expect(response.body.state).toBe('NoShow');
      },
    );

    it.each([
      'Draft',
      'PreVisitPending',
      'VisitCreated',
      'Cancelled',
      'Completed',
      'NoShow',
    ] as const)('rejects marking no-show from %s with 409', async (state) => {
      const appointment = await seedAppointment(state);

      const response = await request(app.getHttpServer()).post(
        `/appointments/${appointment.id}/no-show`,
      );

      expect(response.status).toBe(409);
    });

    it('returns 404 for an unknown appointment id', async () => {
      const response = await request(app.getHttpServer()).post(
        '/appointments/appointment_does_not_exist/no-show',
      );

      expect(response.status).toBe(404);
    });
  });
});
