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
      where: {
        organizationId: { in: [DEV_ORGANIZATION_ID, otherOrganizationId] },
        ...NOT_PROTECTED,
      },
    });
    await prisma.patientClient.deleteMany({ where: { patientId } });
    await prisma.patient.deleteMany({ where: { id: patientId } });
    await prisma.client.deleteMany({
      where: { id: { in: [primaryClientId, secondaryClientId, otherOrgClientId] } },
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
        colorKey: 'teal',
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

    it('persists a valid appointment calendar color override', async () => {
      const response = await request(app.getHttpServer()).post('/appointments').send({
        patientId,
        appointmentType: 'EmergencyUrgent',
        visitReason: 'Same-day urgent visit',
        startTime: '2027-01-17T18:00:00.000Z',
        colorKey: 'rose',
      });

      expect(response.status).toBe(201);
      expect(response.body.colorKey).toBe('rose');
    });

    it('rejects an invalid appointment calendar color with 400', async () => {
      const response = await request(app.getHttpServer()).post('/appointments').send({
        patientId,
        appointmentType: 'WellnessPreventiveCare',
        visitReason: 'Annual checkup',
        startTime: '2027-01-17T19:00:00.000Z',
        colorKey: '#ff00ff',
      });

      expect(response.status).toBe(400);
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
          firstName: 'Other Org',
          lastName: 'Vet',
          role: 'VETERINARIAN',
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

  describe('POST /appointments/new-patient', () => {
    const createdClientIds: string[] = [];
    const createdPatientIds: string[] = [];

    afterAll(async () => {
      await prisma.appointment.deleteMany({ where: { clientId: { in: createdClientIds } } });
      await prisma.patientClient.deleteMany({ where: { patientId: { in: createdPatientIds } } });
      await prisma.patient.deleteMany({ where: { id: { in: createdPatientIds } } });
      await prisma.client.deleteMany({ where: { id: { in: createdClientIds } } });
    });

    it('creates Client + Patient + PatientClient + Appointment together, including optional records-request fields', async () => {
      const response = await request(app.getHttpServer())
        .post('/appointments/new-patient')
        .send({
          client: {
            firstName: 'Nora',
            lastName: 'Whitfield',
            phone: '555-0142',
            addressLine1: '18 Birch Lane',
            city: 'Springfield',
            state: 'IL',
            postalCode: '62704',
          },
          patient: {
            name: 'Pepper',
            species: 'Canine',
            breed: 'Corgi',
          },
          appointment: {
            appointmentType: 'WellnessPreventiveCare',
            visitReason: 'New patient wellness visit',
            startTime: '2027-04-01T15:00:00.000Z',
            expectedDurationMinutes: 30,
            primaryCareVetName: 'Dr. Adams',
            previousClinicName: 'Maple Street Animal Hospital',
            previousRecordsSource: 'Will fax records',
            lastSeenAt: '2027-01-10T12:00:00.000Z',
          },
        });

      expect(response.status).toBe(201);
      expect(response.body).toMatchObject({
        organizationId: DEV_ORGANIZATION_ID,
        locationId: DEV_LOCATION_ID,
        type: 'WellnessPreventiveCare',
        reason: 'New patient wellness visit',
        state: 'Scheduled',
        primaryCareVetName: 'Dr. Adams',
        previousClinicName: 'Maple Street Animal Hospital',
        previousRecordsSource: 'Will fax records',
        patient: { name: 'Pepper', species: 'Canine' },
        client: { firstName: 'Nora', lastName: 'Whitfield' },
      });
      expect(new Date(response.body.lastSeenAt).toISOString()).toBe('2027-01-10T12:00:00.000Z');

      createdClientIds.push(response.body.clientId);
      createdPatientIds.push(response.body.patientId);

      const client = await prisma.client.findUniqueOrThrow({ where: { id: response.body.clientId } });
      expect(client).toMatchObject({
        organizationId: DEV_ORGANIZATION_ID,
        firstName: 'Nora',
        lastName: 'Whitfield',
        addressLine1: '18 Birch Lane',
        city: 'Springfield',
      });

      const patient = await prisma.patient.findUniqueOrThrow({ where: { id: response.body.patientId } });
      expect(patient).toMatchObject({
        organizationId: DEV_ORGANIZATION_ID,
        name: 'Pepper',
        // Inherited from the owner, same as PatientsService.create.
        lastName: 'Whitfield',
      });

      const link = await prisma.patientClient.findUniqueOrThrow({
        where: {
          patientId_clientId: { patientId: response.body.patientId, clientId: response.body.clientId },
        },
      });
      expect(link.isPrimary).toBe(true);
    });

    it('leaves optional records-request fields null when blank, without blocking creation', async () => {
      const response = await request(app.getHttpServer())
        .post('/appointments/new-patient')
        .send({
          client: { firstName: 'Owen', lastName: 'Castillo' },
          patient: { name: 'Biscuit', species: 'Canine' },
          appointment: {
            appointmentType: 'SickVisit',
            visitReason: 'Not eating',
            startTime: '2027-04-02T15:00:00.000Z',
          },
        });

      expect(response.status).toBe(201);
      expect(response.body.primaryCareVetName).toBeNull();
      expect(response.body.previousClinicName).toBeNull();
      expect(response.body.previousRecordsSource).toBeNull();
      expect(response.body.lastSeenAt).toBeNull();

      createdClientIds.push(response.body.clientId);
      createdPatientIds.push(response.body.patientId);
    });

    it('rolls back the whole transaction — no orphaned Client/Patient — when appointment creation fails', async () => {
      // A provider id from a different organization fails the in-transaction
      // org-membership check on the Appointment step, after Client + Patient
      // have already been created in the same transaction — this is what
      // proves the rollback (same pattern as the plain POST /appointments
      // "rejects an assignedProviderId from a different organization" test).
      const otherOrgUser = await prisma.user.create({
        data: {
          organizationId: otherOrganizationId,
          email: `new-patient-rollback-${Date.now()}@example.com`,
          firstName: 'Other Org',
          lastName: 'Vet',
          role: 'VETERINARIAN',
        },
      });

      const response = await request(app.getHttpServer())
        .post('/appointments/new-patient')
        .send({
          client: { firstName: 'Rollback', lastName: 'Test Owner' },
          patient: { name: 'Rollback Patient', species: 'Canine' },
          appointment: {
            appointmentType: 'WellnessPreventiveCare',
            visitReason: 'Should roll back',
            startTime: '2027-04-03T15:00:00.000Z',
            assignedProviderId: otherOrgUser.id,
          },
        });

      expect(response.status).toBe(400);

      const afterClient = await prisma.client.findFirst({
        where: { organizationId: DEV_ORGANIZATION_ID, firstName: 'Rollback', lastName: 'Test Owner' },
      });
      expect(afterClient).toBeNull();

      const afterPatient = await prisma.patient.findFirst({
        where: { organizationId: DEV_ORGANIZATION_ID, name: 'Rollback Patient' },
      });
      expect(afterPatient).toBeNull();

      await prisma.user.delete({ where: { id: otherOrgUser.id } });
    });

    it('does not hard-reject a duplicate client (advisory-only, no backend uniqueness constraint)', async () => {
      const first = await request(app.getHttpServer())
        .post('/appointments/new-patient')
        .send({
          client: { firstName: 'Dupe', lastName: 'Owner', phone: '555-0199' },
          patient: { name: 'First Pet', species: 'Canine' },
          appointment: {
            appointmentType: 'WellnessPreventiveCare',
            visitReason: 'First visit',
            startTime: '2027-04-04T15:00:00.000Z',
          },
        });
      expect(first.status).toBe(201);
      createdClientIds.push(first.body.clientId);
      createdPatientIds.push(first.body.patientId);

      const second = await request(app.getHttpServer())
        .post('/appointments/new-patient')
        .send({
          client: { firstName: 'Dupe', lastName: 'Owner', phone: '555-0199' },
          patient: { name: 'Second Pet', species: 'Canine' },
          appointment: {
            appointmentType: 'WellnessPreventiveCare',
            visitReason: 'Second visit, same contact info',
            startTime: '2027-04-05T15:00:00.000Z',
          },
        });
      expect(second.status).toBe(201);
      expect(second.body.clientId).not.toBe(first.body.clientId);
      createdClientIds.push(second.body.clientId);
      createdPatientIds.push(second.body.patientId);
    });
  });

  describe('records-prep and confirmation status', () => {
    it('a newly created appointment defaults to NotStarted records prep and NotSent confirmation', async () => {
      const response = await request(app.getHttpServer()).post('/appointments').send({
        patientId,
        appointmentType: 'WellnessPreventiveCare',
        visitReason: 'Records prep default check',
        startTime: '2027-05-01T15:00:00.000Z',
      });

      expect(response.status).toBe(201);
      expect(response.body).toMatchObject({
        recordsPrepStatus: 'NotStarted',
        confirmationStatus: 'NotSent',
      });
    });

    it('a New Patient transactional appointment also defaults to NotStarted / NotSent', async () => {
      const response = await request(app.getHttpServer())
        .post('/appointments/new-patient')
        .send({
          client: { firstName: 'Prep', lastName: 'Default Owner' },
          patient: { name: 'Prep Default Pet', species: 'Canine' },
          appointment: {
            appointmentType: 'WellnessPreventiveCare',
            visitReason: 'New patient records prep default check',
            startTime: '2027-05-01T16:00:00.000Z',
          },
        });

      expect(response.status).toBe(201);
      expect(response.body).toMatchObject({
        recordsPrepStatus: 'NotStarted',
        confirmationStatus: 'NotSent',
      });
    });

    describe('PATCH /appointments/:id/records-prep-status', () => {
      it('saves and returns the updated records-prep status', async () => {
        const created = await request(app.getHttpServer()).post('/appointments').send({
          patientId,
          appointmentType: 'WellnessPreventiveCare',
          visitReason: 'Records prep update check',
          startTime: '2027-05-02T15:00:00.000Z',
        });

        const response = await request(app.getHttpServer())
          .patch(`/appointments/${created.body.id}/records-prep-status`)
          .send({ recordsPrepStatus: 'Reviewed' });

        expect(response.status).toBe(200);
        expect(response.body.recordsPrepStatus).toBe('Reviewed');

        const reread = await request(app.getHttpServer()).get(`/appointments/${created.body.id}`);
        expect(reread.body.recordsPrepStatus).toBe('Reviewed');
      });

      it('rejects an invalid records-prep status with 400', async () => {
        const created = await request(app.getHttpServer()).post('/appointments').send({
          patientId,
          appointmentType: 'WellnessPreventiveCare',
          visitReason: 'Invalid records prep check',
          startTime: '2027-05-02T16:00:00.000Z',
        });

        const response = await request(app.getHttpServer())
          .patch(`/appointments/${created.body.id}/records-prep-status`)
          .send({ recordsPrepStatus: 'NotARealStatus' });

        expect(response.status).toBe(400);
      });
    });

    describe('PATCH /appointments/:id/confirmation-status', () => {
      it('saves and returns the updated confirmation status', async () => {
        const created = await request(app.getHttpServer()).post('/appointments').send({
          patientId,
          appointmentType: 'WellnessPreventiveCare',
          visitReason: 'Confirmation status update check',
          startTime: '2027-05-03T15:00:00.000Z',
        });

        const response = await request(app.getHttpServer())
          .patch(`/appointments/${created.body.id}/confirmation-status`)
          .send({ confirmationStatus: 'SentManually' });

        expect(response.status).toBe(200);
        expect(response.body.confirmationStatus).toBe('SentManually');

        const reread = await request(app.getHttpServer()).get(`/appointments/${created.body.id}`);
        expect(reread.body.confirmationStatus).toBe('SentManually');
      });

      it('rejects an invalid confirmation status with 400', async () => {
        const created = await request(app.getHttpServer()).post('/appointments').send({
          patientId,
          appointmentType: 'WellnessPreventiveCare',
          visitReason: 'Invalid confirmation status check',
          startTime: '2027-05-03T16:00:00.000Z',
        });

        const response = await request(app.getHttpServer())
          .patch(`/appointments/${created.body.id}/confirmation-status`)
          .send({ confirmationStatus: 'NotARealStatus' });

        expect(response.status).toBe(400);
      });

      it('returns 404 for an appointment in a different organization', async () => {
        const location = await prisma.location.create({
          data: { organizationId: otherOrganizationId, name: 'Confirmation Status Cross Org Location' },
        });
        const appointment = await prisma.appointment.create({
          data: {
            organizationId: otherOrganizationId,
            locationId: location.id,
            type: 'SickVisit',
            reason: 'Cross org appointment',
            source: 'Phone',
            state: 'Scheduled',
            scheduledAt: new Date('2027-05-03T17:00:00.000Z'),
          },
        });

        const response = await request(app.getHttpServer())
          .patch(`/appointments/${appointment.id}/confirmation-status`)
          .send({ confirmationStatus: 'Confirmed' });

        expect(response.status).toBe(404);
      });
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

  describe('POST /appointments/:id/link-patient', () => {
    it('links an open appointment to a patient in the same organization', async () => {
      const appointment = await prisma.appointment.create({
        data: {
          organizationId: DEV_ORGANIZATION_ID,
          locationId: DEV_LOCATION_ID,
          clientId: primaryClientId,
          type: 'Vaccination',
          reason: 'New patient appointment',
          source: 'Phone',
          state: 'Scheduled',
          scheduledAt: new Date('2027-02-01T15:00:00.000Z'),
        },
      });

      const response = await request(app.getHttpServer())
        .post(`/appointments/${appointment.id}/link-patient`)
        .send({ patientId, clientId: primaryClientId });

      expect(response.status).toBe(201);
      expect(response.body).toMatchObject({
        id: appointment.id,
        patientId,
        clientId: primaryClientId,
      });
    });

    it('rejects linking an appointment that already has another patient', async () => {
      const appointment = await seedAppointment('Scheduled');
      const otherPatient = await prisma.patient.create({
        data: {
          organizationId: DEV_ORGANIZATION_ID,
          name: 'Other Link Patient',
          species: 'Canine',
          clients: { create: [{ clientId: primaryClientId, isPrimary: true }] },
        },
      });

      const response = await request(app.getHttpServer())
        .post(`/appointments/${appointment.id}/link-patient`)
        .send({ patientId: otherPatient.id, clientId: primaryClientId });

      expect(response.status).toBe(409);

      await prisma.patientClient.deleteMany({ where: { patientId: otherPatient.id } });
      await prisma.patient.delete({ where: { id: otherPatient.id } });
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
