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

const TEST_SOURCE_SYSTEM = 'sparki-visits-e2e';

describe('Visits (e2e)', () => {
  let app: INestApplication;
  let otherOrganizationId: string;
  let primaryClientId: string;
  let secondaryClientId: string;
  let otherOrgClientId: string;
  let otherOrgPatientId: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();

    // Any authenticated request lazily seeds the dev identity under
    // DEV_ORGANIZATION_ID; do it here so fixtures below can reference it.
    await request(app.getHttpServer()).get(`/patients/${DEV_ORGANIZATION_ID}`);

    const otherOrganization = await prisma.organization.create({
      data: { name: 'Visits E2E Org (other)' },
    });
    otherOrganizationId = otherOrganization.id;

    const primaryClient = await prisma.client.create({
      data: { organizationId: DEV_ORGANIZATION_ID, firstName: 'Visit', lastName: 'Primary Owner', sourceSystem: TEST_SOURCE_SYSTEM },
    });
    primaryClientId = primaryClient.id;

    const secondaryClient = await prisma.client.create({
      data: {
        organizationId: DEV_ORGANIZATION_ID,
        firstName: 'Visit',
        lastName: 'Secondary Owner',
        sourceSystem: TEST_SOURCE_SYSTEM,
      },
    });
    secondaryClientId = secondaryClient.id;

    const otherOrgClient = await prisma.client.create({
      data: { organizationId: otherOrganizationId, firstName: 'Other', lastName: 'Org Owner', sourceSystem: TEST_SOURCE_SYSTEM },
    });
    otherOrgClientId = otherOrgClient.id;

    const otherOrgPatient = await prisma.patient.create({
      data: { organizationId: otherOrganizationId, name: 'Other Org Patient', species: 'Feline', sourceSystem: TEST_SOURCE_SYSTEM },
    });
    otherOrgPatientId = otherOrgPatient.id;
  });

  afterAll(async () => {
    const testVisitIds = (await prisma.visit.findMany({
      where: {
        organizationId: { in: [DEV_ORGANIZATION_ID, otherOrganizationId] },
        patient: { sourceSystem: TEST_SOURCE_SYSTEM },
      },
      select: { id: true },
    })).map((visit) => visit.id);
    await prisma.soapNote.deleteMany({ where: { visitId: { in: testVisitIds } } });
    await prisma.visit.deleteMany({
      where: {
        organizationId: { in: [DEV_ORGANIZATION_ID, otherOrganizationId] },
        patient: { sourceSystem: TEST_SOURCE_SYSTEM },
      },
    });
    await prisma.medicalRecord.deleteMany({
      where: {
        patient: {
          organizationId: { in: [DEV_ORGANIZATION_ID, otherOrganizationId] },
          sourceSystem: TEST_SOURCE_SYSTEM,
        },
      },
    });
    await prisma.appointment.deleteMany({
      where: {
        OR: [
          { sourceSystem: TEST_SOURCE_SYSTEM },
          { patient: { sourceSystem: TEST_SOURCE_SYSTEM } },
        ],
      },
    });
    await prisma.patientClient.deleteMany({
      where: {
        client: { organizationId: { in: [DEV_ORGANIZATION_ID, otherOrganizationId] } },
        patient: { sourceSystem: TEST_SOURCE_SYSTEM },
      },
    });
    await prisma.patient.deleteMany({
      where: {
        organizationId: { in: [DEV_ORGANIZATION_ID, otherOrganizationId] },
        sourceSystem: TEST_SOURCE_SYSTEM,
      },
    });
    await prisma.client.deleteMany({
      where: {
        organizationId: { in: [DEV_ORGANIZATION_ID, otherOrganizationId] },
        sourceSystem: TEST_SOURCE_SYSTEM,
      },
    });
    await prisma.location.deleteMany({ where: { organizationId: otherOrganizationId } });
    await prisma.organization.deleteMany({ where: { id: otherOrganizationId } });
    await app.close();
  });

  async function createPatient(name: string, clientIds: string[] = [primaryClientId]) {
    const patient = await prisma.patient.create({
      data: {
        organizationId: DEV_ORGANIZATION_ID,
        name,
        species: 'Canine',
        sourceSystem: TEST_SOURCE_SYSTEM,
        clients: {
          create: clientIds.map((clientId, index) => ({ clientId, isPrimary: index === 0 })),
        },
      },
    });
    return patient.id;
  }

  async function createAppointment(
    patientId: string,
    overrides: Partial<{
      clientId: string | null;
      state:
        | 'Scheduled'
        | 'PreVisitPending'
        | 'Confirmed'
        | 'Arrived'
        | 'VisitCreated'
        | 'Cancelled'
        | 'Completed'
        | 'NoShow';
      reason: string;
      type:
        | 'WellnessPreventiveCare'
        | 'EmergencyUrgent'
        | 'DropOff'
        | 'SurgeryProcedure'
        | 'Telemedicine';
    }> = {},
  ) {
    // Defaults to Arrived: that's now the only Appointment state Visit
    // creation accepts (see VisitsService), so it's the useful default for
    // the "creates a Visit" happy-path tests below. Tests exercising other
    // states override explicitly.
    const appointment = await prisma.appointment.create({
      data: {
        organizationId: DEV_ORGANIZATION_ID,
        locationId: DEV_LOCATION_ID,
        patientId,
        clientId: overrides.clientId === undefined ? primaryClientId : overrides.clientId,
        type: overrides.type ?? 'WellnessPreventiveCare',
        reason: overrides.reason ?? 'Annual checkup',
        source: 'Phone',
        state: overrides.state ?? 'Arrived',
        scheduledAt: new Date('2027-01-15T15:00:00.000Z'),
        sourceSystem: TEST_SOURCE_SYSTEM,
      },
    });
    return appointment;
  }

  describe('POST /visits — from Appointment', () => {
    it('creates a Visit from an Arrived appointment, defaults visitType, and flips the appointment to VisitCreated', async () => {
      const patientId = await createPatient('Appt Visit Patient');
      const appointment = await createAppointment(patientId);

      const response = await request(app.getHttpServer())
        .post('/visits')
        .send({ appointmentId: appointment.id });

      expect(response.status).toBe(201);
      expect(response.body).toMatchObject({
        organizationId: DEV_ORGANIZATION_ID,
        locationId: DEV_LOCATION_ID,
        patientId,
        clientId: primaryClientId,
        appointmentId: appointment.id,
        visitType: 'Scheduled',
        reason: 'Annual checkup',
        state: 'Arrived',
      });
      expect(response.body.patient).toMatchObject({ id: patientId });
      expect(response.body.client).toMatchObject({ id: primaryClientId });
      expect(response.body.appointment).toMatchObject({
        id: appointment.id,
        state: 'VisitCreated',
      });

      const updatedAppointment = await prisma.appointment.findUniqueOrThrow({
        where: { id: appointment.id },
      });
      expect(updatedAppointment.state).toBe('VisitCreated');
    });

    it('maps EmergencyUrgent appointments to an Emergency visit type', async () => {
      const patientId = await createPatient('Emergency Appt Patient');
      const appointment = await createAppointment(patientId, {
        type: 'EmergencyUrgent',
        reason: 'Hit by car',
      });

      const response = await request(app.getHttpServer())
        .post('/visits')
        .send({ appointmentId: appointment.id });

      expect(response.status).toBe(201);
      expect(response.body.visitType).toBe('Emergency');
    });

    it('honors explicit overrides for reason, visitType, and clientId', async () => {
      const patientId = await createPatient('Override Appt Patient', [
        primaryClientId,
        secondaryClientId,
      ]);
      const appointment = await createAppointment(patientId);

      const response = await request(app.getHttpServer()).post('/visits').send({
        appointmentId: appointment.id,
        reason: 'Actually a limp, not the scheduled reason',
        visitType: 'DropOff',
        clientId: secondaryClientId,
      });

      expect(response.status).toBe(201);
      expect(response.body).toMatchObject({
        reason: 'Actually a limp, not the scheduled reason',
        visitType: 'DropOff',
        clientId: secondaryClientId,
      });
    });

    it('falls back to the patient primary client when the appointment has no client', async () => {
      const patientId = await createPatient('No Client Appt Patient');
      const appointment = await createAppointment(patientId, { clientId: null });

      const response = await request(app.getHttpServer())
        .post('/visits')
        .send({ appointmentId: appointment.id });

      expect(response.status).toBe(201);
      expect(response.body.clientId).toBe(primaryClientId);
    });

    it('rejects an Arrived appointment with no linked patient with 400', async () => {
      const appointment = await prisma.appointment.create({
        data: {
          organizationId: DEV_ORGANIZATION_ID,
          locationId: DEV_LOCATION_ID,
          provisionalPatientName: 'Whoever calls back',
          type: 'WellnessPreventiveCare',
          reason: 'Phone booking, no patient yet',
          source: 'Phone',
          state: 'Arrived',
          scheduledAt: new Date('2027-01-15T15:00:00.000Z'),
          sourceSystem: TEST_SOURCE_SYSTEM,
        },
      });

      const response = await request(app.getHttpServer())
        .post('/visits')
        .send({ appointmentId: appointment.id });

      expect(response.status).toBe(400);
    });

    it.each(['Scheduled', 'PreVisitPending', 'Confirmed'] as const)(
      'rejects a %s appointment (not yet Arrived) with 409',
      async (state) => {
        const patientId = await createPatient(`Not Yet Arrived ${state} Patient`);
        const appointment = await createAppointment(patientId, { state });

        const response = await request(app.getHttpServer())
          .post('/visits')
          .send({ appointmentId: appointment.id });

        expect(response.status).toBe(409);
      },
    );

    it('rejects an appointment already linked to a Visit with 409', async () => {
      const patientId = await createPatient('Already Linked Appt Patient');
      const appointment = await createAppointment(patientId, { state: 'VisitCreated' });

      const response = await request(app.getHttpServer())
        .post('/visits')
        .send({ appointmentId: appointment.id });

      expect(response.status).toBe(409);
    });

    it.each(['Cancelled', 'Completed', 'NoShow'] as const)(
      'rejects a terminal %s appointment with 409',
      async (state) => {
        const patientId = await createPatient(`Terminal ${state} Appt Patient`);
        const appointment = await createAppointment(patientId, { state });

        const response = await request(app.getHttpServer())
          .post('/visits')
          .send({ appointmentId: appointment.id });

        expect(response.status).toBe(409);
      },
    );

    it('returns 404 for an appointment in a different organization', async () => {
      const location = await prisma.location.create({
        data: { organizationId: otherOrganizationId, name: 'Other Org Location' },
      });
      const appointment = await prisma.appointment.create({
        data: {
          organizationId: otherOrganizationId,
          locationId: location.id,
          patientId: otherOrgPatientId,
          type: 'WellnessPreventiveCare',
          reason: 'Cross org appointment',
          source: 'Phone',
          state: 'Scheduled',
          scheduledAt: new Date('2027-01-15T15:00:00.000Z'),
          sourceSystem: TEST_SOURCE_SYSTEM,
        },
      });

      const response = await request(app.getHttpServer())
        .post('/visits')
        .send({ appointmentId: appointment.id });

      expect(response.status).toBe(404);
    });
  });

  describe('POST /visits — full Appointment transition integration', () => {
    it('creates a Visit only after the appointment is actually confirmed and marked arrived through the real endpoints', async () => {
      const patientId = await createPatient('Full Transition Flow Patient');
      // Appointment booking/availability has its own integration suite. This
      // fixture starts Scheduled so this case can isolate the real
      // confirm -> arrive -> Visit creation transition chain.
      const created = await createAppointment(patientId, { state: 'Scheduled', reason: 'Ear infection' });
      expect(created.state).toBe('Scheduled');

      // Not arrived yet — Visit creation must still be rejected.
      const tooEarly = await request(app.getHttpServer())
        .post('/visits')
        .send({ appointmentId: created.id });
      expect(tooEarly.status).toBe(409);

      const confirmed = await request(app.getHttpServer()).post(
        `/appointments/${created.id}/confirm`,
      );
      expect(confirmed.status).toBe(201);
      expect(confirmed.body.state).toBe('Confirmed');

      const arrived = await request(app.getHttpServer()).post(
        `/appointments/${created.id}/arrive`,
      );
      expect(arrived.status).toBe(201);
      expect(arrived.body.state).toBe('Arrived');

      const visit = await request(app.getHttpServer())
        .post('/visits')
        .send({ appointmentId: created.id });

      expect(visit.status).toBe(201);
      expect(visit.body).toMatchObject({
        patientId,
        appointmentId: created.id,
        state: 'Arrived',
      });
      expect(visit.body.appointment.state).toBe('VisitCreated');

      // Once linked, the appointment can no longer start a second Visit.
      const secondAttempt = await request(app.getHttpServer())
        .post('/visits')
        .send({ appointmentId: created.id });
      expect(secondAttempt.status).toBe(409);
    });
  });

  describe('POST /visits — walk-in/manual', () => {
    it('creates a walk-in Visit from just a patientId and reason, defaulting visitType and client', async () => {
      const patientId = await createPatient('Walk-in Patient');

      const response = await request(app.getHttpServer())
        .post('/visits')
        .send({ patientId, reason: 'Limping on front leg' });

      expect(response.status).toBe(201);
      expect(response.body).toMatchObject({
        organizationId: DEV_ORGANIZATION_ID,
        locationId: DEV_LOCATION_ID,
        patientId,
        clientId: primaryClientId,
        appointmentId: null,
        visitType: 'WalkIn',
        reason: 'Limping on front leg',
        state: 'Arrived',
      });
    });

    it('honors an explicit visitType override for non-scheduled entry sources (e.g. Emergency)', async () => {
      const patientId = await createPatient('Emergency Walk-in Patient');

      const response = await request(app.getHttpServer()).post('/visits').send({
        patientId,
        reason: 'Seizure in lobby',
        visitType: 'Emergency',
      });

      expect(response.status).toBe(201);
      expect(response.body.visitType).toBe('Emergency');
    });

    it('honors an explicit clientId override', async () => {
      const patientId = await createPatient('Manual Client Override Patient', [
        primaryClientId,
        secondaryClientId,
      ]);

      const response = await request(app.getHttpServer()).post('/visits').send({
        patientId,
        reason: 'Vomiting',
        clientId: secondaryClientId,
      });

      expect(response.status).toBe(201);
      expect(response.body.clientId).toBe(secondaryClientId);
    });

    it('creates a Visit with no client when the patient has none on file', async () => {
      const patient = await prisma.patient.create({
        data: { organizationId: DEV_ORGANIZATION_ID, name: 'No Client Patient', species: 'Feline', sourceSystem: TEST_SOURCE_SYSTEM },
      });

      const response = await request(app.getHttpServer())
        .post('/visits')
        .send({ patientId: patient.id, reason: 'Stray brought in' });

      expect(response.status).toBe(201);
      expect(response.body.clientId).toBeNull();
    });

    it('returns 404 for an unknown patientId', async () => {
      const response = await request(app.getHttpServer())
        .post('/visits')
        .send({ patientId: 'patient_does_not_exist', reason: 'Walk-in' });

      expect(response.status).toBe(404);
    });

    it('returns 404 for a patient in a different organization', async () => {
      const response = await request(app.getHttpServer())
        .post('/visits')
        .send({ patientId: otherOrgPatientId, reason: 'Cross org walk-in' });

      expect(response.status).toBe(404);
    });

    it('rejects a clientId from a different organization with 400', async () => {
      const patientId = await createPatient('Cross Org Client Patient');

      const response = await request(app.getHttpServer())
        .post('/visits')
        .send({ patientId, reason: 'Walk-in', clientId: otherOrgClientId });

      expect(response.status).toBe(400);
    });
  });

  describe('POST /visits — required field validation', () => {
    it('rejects a request with neither appointmentId nor patientId with 400', async () => {
      const response = await request(app.getHttpServer())
        .post('/visits')
        .send({ reason: 'No identity given' });

      expect(response.status).toBe(400);
    });

    it('rejects a walk-in request missing reason with 400', async () => {
      const patientId = await createPatient('Missing Reason Patient');

      const response = await request(app.getHttpServer()).post('/visits').send({ patientId });

      expect(response.status).toBe(400);
    });

    it('rejects an invalid visitType with 400', async () => {
      const patientId = await createPatient('Invalid Visit Type Patient');

      const response = await request(app.getHttpServer())
        .post('/visits')
        .send({ patientId, reason: 'Walk-in', visitType: 'NotARealType' });

      expect(response.status).toBe(400);
    });
  });

  describe('POST /visits — duplicate active Visit prevention', () => {
    it('rejects a second walk-in Visit while the first is still active with 409', async () => {
      const patientId = await createPatient('Duplicate Active Visit Patient');

      const first = await request(app.getHttpServer())
        .post('/visits')
        .send({ patientId, reason: 'First complaint' });
      expect(first.status).toBe(201);

      const second = await request(app.getHttpServer())
        .post('/visits')
        .send({ patientId, reason: 'Second complaint, same visit' });

      expect(second.status).toBe(409);
    });

    it('rejects starting a Visit from an Appointment when the patient already has an active Visit', async () => {
      const patientId = await createPatient('Duplicate Via Appointment Patient');
      await request(app.getHttpServer())
        .post('/visits')
        .send({ patientId, reason: 'Walk-in first' });

      const appointment = await createAppointment(patientId);

      const response = await request(app.getHttpServer())
        .post('/visits')
        .send({ appointmentId: appointment.id });

      expect(response.status).toBe(409);
    });

    it('allows another Visit once the prior one is in a terminal state', async () => {
      const patientId = await createPatient('Resolved Prior Visit Patient');

      const first = await request(app.getHttpServer())
        .post('/visits')
        .send({ patientId, reason: 'Resolved already' });
      expect(first.status).toBe(201);

      await prisma.visit.update({
        where: { id: first.body.id },
        data: { state: 'Archived', archivedAt: new Date('2027-01-01T00:00:00.000Z') },
      });

      const second = await request(app.getHttpServer())
        .post('/visits')
        .send({ patientId, reason: 'New episode of care' });

      expect(second.status).toBe(201);
    });
  });

  describe('GET /visits/:id', () => {
    it('fetches a Visit with patient, client, and appointment relationships within the authenticated organization', async () => {
      const patientId = await createPatient('Fetch Visit Patient');
      const appointment = await createAppointment(patientId);

      const created = await request(app.getHttpServer())
        .post('/visits')
        .send({ appointmentId: appointment.id });

      const response = await request(app.getHttpServer()).get(`/visits/${created.body.id}`);

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        id: created.body.id,
        patientId,
        clientId: primaryClientId,
        appointmentId: appointment.id,
      });
      expect(response.body.patient.id).toBe(patientId);
      expect(response.body.client.id).toBe(primaryClientId);
      expect(response.body.appointment.id).toBe(appointment.id);
    });

    it('returns 404 when the Visit belongs to a different organization', async () => {
      const otherVisit = await prisma.visit.create({
        data: {
          organizationId: otherOrganizationId,
          locationId: (
            await prisma.location.create({
              data: { organizationId: otherOrganizationId, name: 'Other Org Visit Location' },
            })
          ).id,
          patientId: otherOrgPatientId,
          visitType: 'WalkIn',
          reason: 'Cross org visit',
          state: 'Arrived',
        },
      });

      const response = await request(app.getHttpServer()).get(`/visits/${otherVisit.id}`);

      expect(response.status).toBe(404);
    });
  });

  describe('POST /visits/:id/start', () => {
    async function createVisit(
      patientId: string,
      state: 'Arrived' | 'ReadyForIntake' | 'IntakeInProgress' | 'CheckoutReady' | 'Archived',
    ) {
      return prisma.visit.create({
        data: {
          organizationId: DEV_ORGANIZATION_ID,
          locationId: DEV_LOCATION_ID,
          patientId,
          clientId: primaryClientId,
          visitType: 'WalkIn',
          reason: 'Start transition fixture',
          state,
          primaryVeterinarianId: DEV_USER_ID,
        },
      });
    }

    it.each(['Arrived', 'ReadyForIntake'] as const)(
      'transitions a Visit in %s to IntakeInProgress and sets lastUpdatedById',
      async (state) => {
        const patientId = await createPatient(`Begin Intake Patient ${state}`);
        const visit = await createVisit(patientId, state);

        const response = await request(app.getHttpServer()).post(`/visits/${visit.id}/start`);

        expect(response.status).toBe(201);
        expect(response.body).toMatchObject({
          id: visit.id,
          state: 'IntakeInProgress',
          lastUpdatedById: DEV_USER_ID,
          primaryVeterinarianId: DEV_USER_ID,
        });
      },
    );

    it('is a safe no-op for a Visit already past intake', async () => {
      const patientId = await createPatient('Already Started Visit Patient');
      const visit = await createVisit(patientId, 'CheckoutReady');

      const response = await request(app.getHttpServer()).post(`/visits/${visit.id}/start`);

      expect(response.status).toBe(201);
      expect(response.body).toMatchObject({ id: visit.id, state: 'CheckoutReady' });

      const unchanged = await prisma.visit.findUniqueOrThrow({ where: { id: visit.id } });
      expect(unchanged.state).toBe('CheckoutReady');
      expect(unchanged.updatedAt.getTime()).toBe(visit.updatedAt.getTime());
    });

    it('is idempotent when called again after already starting', async () => {
      const patientId = await createPatient('Resume Intake Patient');
      const visit = await createVisit(patientId, 'Arrived');

      await request(app.getHttpServer()).post(`/visits/${visit.id}/start`);
      const second = await request(app.getHttpServer()).post(`/visits/${visit.id}/start`);

      expect(second.status).toBe(201);
      expect(second.body.state).toBe('IntakeInProgress');
    });

    it('rejects starting a terminal Visit with 409', async () => {
      const patientId = await createPatient('Terminal Visit Patient');
      const visit = await createVisit(patientId, 'Archived');

      const response = await request(app.getHttpServer()).post(`/visits/${visit.id}/start`);

      expect(response.status).toBe(409);
    });

    it('returns 404 when the Visit belongs to a different organization', async () => {
      const otherVisit = await prisma.visit.create({
        data: {
          organizationId: otherOrganizationId,
          locationId: (
            await prisma.location.create({
              data: { organizationId: otherOrganizationId, name: 'Other Org Start Location' },
            })
          ).id,
          patientId: otherOrgPatientId,
          visitType: 'WalkIn',
          reason: 'Cross org start attempt',
          state: 'Arrived',
        },
      });

      const response = await request(app.getHttpServer()).post(`/visits/${otherVisit.id}/start`);

      expect(response.status).toBe(404);
    });
  });

  describe('Visit intake', () => {
    async function createVisit(
      patientName: string,
      state:
        | 'IntakeInProgress'
        | 'VeterinarianExamReady'
        | 'VeterinarianExamInProgress'
        | 'CheckoutReady'
        | 'Archived' = 'IntakeInProgress',
    ) {
      const patientId = await createPatient(patientName);
      return prisma.visit.create({
        data: {
          organizationId: DEV_ORGANIZATION_ID,
          locationId: DEV_LOCATION_ID,
          patientId,
          clientId: primaryClientId,
          visitType: 'WalkIn',
          reason: 'Intake fixture',
          state,
          assignedTechnicianId: DEV_USER_ID,
        },
      });
    }

    it('saves intake data with weight in LB and gum color, and returns it on the Visit payload', async () => {
      const visit = await createVisit('Save Intake Patient LB');

      const response = await request(app.getHttpServer()).put(`/visits/${visit.id}/intake`).send({
        chiefComplaint: 'Limping on left rear leg',
        historyNotes: 'Started yesterday after daycare.',
        weight: 42.5,
        weightUnit: 'LB',
        temperature: 101.2,
        heartRate: 88,
        respiratoryRate: 24,
        crtSeconds: 1.5,
        gumColor: 'Pink',
        appetite: 'Normal',
        vomiting: false,
        diarrhea: true,
        medicationsAllergies: 'Carprofen allergy',
      });

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        id: visit.id,
        lastUpdatedById: DEV_USER_ID,
        intake: {
          chiefComplaint: 'Limping on left rear leg',
          historyNotes: 'Started yesterday after daycare.',
          weight: 42.5,
          weightUnit: 'LB',
          temperature: 101.2,
          heartRate: 88,
          respiratoryRate: 24,
          crtSeconds: 1.5,
          gumColor: 'Pink',
          appetite: 'Normal',
          vomiting: false,
          diarrhea: true,
          medicationsAllergies: 'Carprofen allergy',
          completedAt: null,
        },
      });

      const saved = await prisma.visitIntake.findUniqueOrThrow({ where: { visitId: visit.id } });
      expect(saved.chiefComplaint).toBe('Limping on left rear leg');
      expect(saved.gumColor).toBe('Pink');
      expect(saved.weight).toBe(42.5);
      expect(saved.weightUnit).toBe('LB');
    });

    it('saves intake data with weight in KG', async () => {
      const visit = await createVisit('Save Intake Patient KG');

      const response = await request(app.getHttpServer())
        .put(`/visits/${visit.id}/intake`)
        .send({ weight: 19.3, weightUnit: 'KG' });

      expect(response.status).toBe(200);
      expect(response.body.intake).toMatchObject({ weight: 19.3, weightUnit: 'KG' });

      const saved = await prisma.visitIntake.findUniqueOrThrow({ where: { visitId: visit.id } });
      expect(saved.weight).toBe(19.3);
      expect(saved.weightUnit).toBe('KG');
    });

    it('reloading the visit (GET) after saving intake still shows the persisted gum color and weight unit', async () => {
      const visit = await createVisit('Reload Gum Color Patient');

      await request(app.getHttpServer())
        .put(`/visits/${visit.id}/intake`)
        .send({ gumColor: 'Pale', heartRate: 90, weight: 30, weightUnit: 'KG' });

      const response = await request(app.getHttpServer()).get(`/visits/${visit.id}`);

      expect(response.status).toBe(200);
      expect(response.body.intake).toMatchObject({
        gumColor: 'Pale',
        heartRate: 90,
        weight: 30,
        weightUnit: 'KG',
      });
    });

    it('saves intake without gumColor or an explicit weightUnit — gumColor stays null, weightUnit defaults to LB, nothing is blocked', async () => {
      const visit = await createVisit('No Gum Color Patient');

      const response = await request(app.getHttpServer()).put(`/visits/${visit.id}/intake`).send({
        chiefComplaint: 'Annual wellness check',
        weight: 8.2,
        heartRate: 100,
      });

      expect(response.status).toBe(200);
      expect(response.body.intake).toMatchObject({
        chiefComplaint: 'Annual wellness check',
        weight: 8.2,
        heartRate: 100,
        gumColor: null,
        weightUnit: 'LB',
      });
    });

    it('a pre-existing intake row saved without specifying a unit defaults to LB, never silently KG', async () => {
      const visit = await createVisit('Legacy Weight Unit Patient');
      // Simulates a row from before weightUnit existed: written directly via
      // Prisma without the field, same as any INSERT the old service code
      // would have produced — the column's DB-level DEFAULT 'LB' applies.
      await prisma.visitIntake.create({ data: { visitId: visit.id, weight: 55 } });

      const response = await request(app.getHttpServer()).get(`/visits/${visit.id}`);

      expect(response.status).toBe(200);
      expect(response.body.intake).toMatchObject({ weight: 55, weightUnit: 'LB' });
    });

    it('normalizes omitted intake checkbox flags to false when updating', async () => {
      const visit = await createVisit('Update Intake Patient');

      await request(app.getHttpServer()).put(`/visits/${visit.id}/intake`).send({
        chiefComplaint: 'Coughing',
        vomiting: true,
      });

      const response = await request(app.getHttpServer()).put(`/visits/${visit.id}/intake`).send({
        chiefComplaint: 'Coughing after exercise',
      });

      expect(response.status).toBe(200);
      expect(response.body.intake).toMatchObject({
        chiefComplaint: 'Coughing after exercise',
        vomiting: false,
        diarrhea: false,
      });
    });

    it('completes intake by marking the intake complete and moving the Visit to exam-ready', async () => {
      const visit = await createVisit('Complete Intake Patient');

      await request(app.getHttpServer()).put(`/visits/${visit.id}/intake`).send({
        chiefComplaint: 'Ear shaking',
        historyNotes: 'Intermittent for two days',
        weight: 42,
        temperature: 102,
        heartRate: 90,
        respiratoryRate: 24,
        crtSeconds: 1.5,
        gumColor: 'Pink',
        attitude: 'BAR',
        appearance: 'Normal',
        allergies: 'None known',
        currentMedications: 'None',
      });

      const response = await request(app.getHttpServer()).post(
        `/visits/${visit.id}/intake/complete`,
      );

      expect(response.status).toBe(201);
      expect(response.body).toMatchObject({
        id: visit.id,
        state: 'VeterinarianExamReady',
        lastUpdatedById: DEV_USER_ID,
        intake: {
          chiefComplaint: 'Ear shaking',
          temperature: 102,
        },
      });
      expect(response.body.intake.completedAt).toEqual(expect.any(String));

      const updatedVisit = await prisma.visit.findUniqueOrThrow({ where: { id: visit.id } });
      const updatedIntake = await prisma.visitIntake.findUniqueOrThrow({
        where: { visitId: visit.id },
      });
      expect(updatedVisit.state).toBe('VeterinarianExamReady');
      expect(updatedIntake.completedAt).toBeInstanceOf(Date);
    });

    it('is a safe no-op when completing intake after the Visit has already moved forward', async () => {
      const visit = await createVisit('Past Intake Patient', 'VeterinarianExamReady');

      const response = await request(app.getHttpServer()).post(
        `/visits/${visit.id}/intake/complete`,
      );

      expect(response.status).toBe(201);
      expect(response.body).toMatchObject({ id: visit.id, state: 'VeterinarianExamReady' });
    });

    it('rejects completing intake for a terminal Visit with 409', async () => {
      const visit = await createVisit('Terminal Intake Patient', 'Archived');

      const response = await request(app.getHttpServer()).post(
        `/visits/${visit.id}/intake/complete`,
      );

      expect(response.status).toBe(409);
    });

    it('starts the veterinarian exam from exam-ready', async () => {
      const visit = await createVisit('Start Exam Patient', 'VeterinarianExamReady');

      const response = await request(app.getHttpServer()).post(`/visits/${visit.id}/exam/start`);

      expect(response.status).toBe(201);
      expect(response.body).toMatchObject({
        id: visit.id,
        state: 'VeterinarianExamInProgress',
        lastUpdatedById: DEV_USER_ID,
      });

      const updatedVisit = await prisma.visit.findUniqueOrThrow({ where: { id: visit.id } });
      expect(updatedVisit.state).toBe('VeterinarianExamInProgress');
    });

    it('is a safe no-op when starting exam after the Visit has already moved forward', async () => {
      const visit = await createVisit('Past Exam Start Patient', 'VeterinarianExamInProgress');

      const response = await request(app.getHttpServer()).post(`/visits/${visit.id}/exam/start`);

      expect(response.status).toBe(201);
      expect(response.body).toMatchObject({
        id: visit.id,
        state: 'VeterinarianExamInProgress',
      });
    });

    it('rejects starting exam for a terminal Visit with 409', async () => {
      const visit = await createVisit('Terminal Exam Patient', 'Archived');

      const response = await request(app.getHttpServer()).post(`/visits/${visit.id}/exam/start`);

      expect(response.status).toBe(409);
    });

    it('returns 404 when saving intake for a Visit in a different organization', async () => {
      const otherVisit = await prisma.visit.create({
        data: {
          organizationId: otherOrganizationId,
          locationId: (
            await prisma.location.create({
              data: { organizationId: otherOrganizationId, name: 'Other Org Intake Location' },
            })
          ).id,
          patientId: otherOrgPatientId,
          visitType: 'WalkIn',
          reason: 'Cross org intake attempt',
          state: 'IntakeInProgress',
        },
      });

      const response = await request(app.getHttpServer())
        .put(`/visits/${otherVisit.id}/intake`)
        .send({ chiefComplaint: 'Should not save' });

      expect(response.status).toBe(404);
    });
  });

  describe('Exam findings', () => {
    async function createVisit(
      patientName: string,
      state:
        | 'IntakeInProgress'
        | 'VeterinarianExamReady'
        | 'VeterinarianExamInProgress'
        | 'TreatmentPending'
        | 'Archived' = 'VeterinarianExamInProgress',
    ) {
      const patientId = await createPatient(patientName);
      return prisma.visit.create({
        data: {
          organizationId: DEV_ORGANIZATION_ID,
          locationId: DEV_LOCATION_ID,
          patientId,
          clientId: primaryClientId,
          visitType: 'WalkIn',
          reason: 'Exam findings fixture',
          state,
          primaryVeterinarianId: DEV_USER_ID,
        },
      });
    }

    it('saves exam findings and returns them on the Visit payload', async () => {
      const visit = await createVisit('Save Exam Findings Patient');

      const response = await request(app.getHttpServer())
        .put(`/visits/${visit.id}/exam-findings`)
        .send({
          subjective: 'Owner reports lethargy for 2 days.',
          objective: 'Temp 103.1F, mild dehydration, abdomen tender on palpation.',
          assessment: 'Suspected gastroenteritis.',
          plan: 'Start supportive care, recheck in 48 hours.',
        });

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        id: visit.id,
        lastUpdatedById: DEV_USER_ID,
        examFindings: {
          subjective: 'Owner reports lethargy for 2 days.',
          objective: 'Temp 103.1F, mild dehydration, abdomen tender on palpation.',
          assessment: 'Suspected gastroenteritis.',
          plan: 'Start supportive care, recheck in 48 hours.',
          completedAt: null,
        },
      });

      const saved = await prisma.visitExamFindings.findUniqueOrThrow({
        where: { visitId: visit.id },
      });
      expect(saved.assessment).toBe('Suspected gastroenteritis.');
    });

    it('overwrites previously saved exam findings on update', async () => {
      const visit = await createVisit('Update Exam Findings Patient');

      await request(app.getHttpServer()).put(`/visits/${visit.id}/exam-findings`).send({
        subjective: 'Initial note',
      });

      const response = await request(app.getHttpServer())
        .put(`/visits/${visit.id}/exam-findings`)
        .send({ subjective: 'Revised note' });

      expect(response.status).toBe(200);
      expect(response.body.examFindings).toMatchObject({
        subjective: 'Revised note',
        objective: null,
      });
    });

    it('completes the exam by marking findings complete and moving the Visit to treatment-ready', async () => {
      const visit = await createVisit('Complete Exam Patient');

      await request(app.getHttpServer()).put(`/visits/${visit.id}/exam-findings`).send({
        subjective: 'Coughing, decreased appetite.',
        assessment: 'Suspected kennel cough.',
      });

      const response = await request(app.getHttpServer()).post(
        `/visits/${visit.id}/exam/complete`,
      );

      expect(response.status).toBe(201);
      expect(response.body).toMatchObject({
        id: visit.id,
        state: 'PlanDrafted',
        lastUpdatedById: DEV_USER_ID,
        examFindings: {
          subjective: 'Coughing, decreased appetite.',
          assessment: 'Suspected kennel cough.',
        },
      });
      expect(response.body.examFindings.completedAt).toEqual(expect.any(String));

      const updatedVisit = await prisma.visit.findUniqueOrThrow({ where: { id: visit.id } });
      const updatedFindings = await prisma.visitExamFindings.findUniqueOrThrow({
        where: { visitId: visit.id },
      });
      expect(updatedVisit.state).toBe('PlanDrafted');
      expect(updatedFindings.completedAt).toBeInstanceOf(Date);
    });

    it('is a safe no-op when completing exam after the Visit has already moved forward', async () => {
      const visit = await createVisit('Past Exam Complete Patient', 'TreatmentPending');

      const response = await request(app.getHttpServer()).post(
        `/visits/${visit.id}/exam/complete`,
      );

      expect(response.status).toBe(201);
      expect(response.body).toMatchObject({ id: visit.id, state: 'TreatmentPending' });
    });

    it('rejects completing exam for a terminal Visit with 409', async () => {
      const visit = await createVisit('Terminal Exam Complete Patient', 'Archived');

      const response = await request(app.getHttpServer()).post(
        `/visits/${visit.id}/exam/complete`,
      );

      expect(response.status).toBe(409);
    });

    it('returns 404 when saving exam findings for a Visit in a different organization', async () => {
      const otherVisit = await prisma.visit.create({
        data: {
          organizationId: otherOrganizationId,
          locationId: (
            await prisma.location.create({
              data: { organizationId: otherOrganizationId, name: 'Other Org Exam Location' },
            })
          ).id,
          patientId: otherOrgPatientId,
          visitType: 'WalkIn',
          reason: 'Cross org exam findings attempt',
          state: 'VeterinarianExamInProgress',
        },
      });

      const response = await request(app.getHttpServer())
        .put(`/visits/${otherVisit.id}/exam-findings`)
        .send({ subjective: 'Should not save' });

      expect(response.status).toBe(404);
    });
  });

  describe('Visit lifecycle hardening', () => {
    it('lets an assigned technician complete and finalize a technician appointment without a veterinarian exam', async () => {
      const patientId = await createPatient('Technician Lifecycle Patient');
      const visit = await prisma.visit.create({
        data: {
          organizationId: DEV_ORGANIZATION_ID,
          locationId: DEV_LOCATION_ID,
          patientId,
          clientId: primaryClientId,
          visitType: 'TechnicianAppointment',
          reason: 'Nail trim',
          state: 'IntakeInProgress',
          phase: 'Intake',
          assignedTechnicianId: DEV_USER_ID,
        },
      });
      await request(app.getHttpServer()).put(`/visits/${visit.id}/intake`).send({
        chiefComplaint: 'Nail trim',
        historyNotes: 'No material changes',
        weight: 20,
        temperature: 101,
        heartRate: 88,
        respiratoryRate: 22,
        crtSeconds: 1.5,
        gumColor: 'Pink',
        attitude: 'BAR',
        appearance: 'Normal',
        allergies: 'None known',
        currentMedications: 'None',
      });

      const completed = await request(app.getHttpServer()).post(`/visits/${visit.id}/intake/complete`);
      expect(completed.status).toBe(201);
      expect(completed.body).toMatchObject({ state: 'TreatmentPending', phase: 'CareInProgress', assignedTechnicianId: DEV_USER_ID });
      expect(completed.body.soapNotes[0]).toMatchObject({ status: 'Draft' });

      const draft = completed.body.soapNotes[0] as { version: number };
      const saved = await request(app.getHttpServer()).put(`/visits/${visit.id}/record/draft`).send({
        version: draft.version,
        subjective: 'Patient presented for nail trim.',
        objective: 'Nails overgrown; patient BAR.',
        assessment: 'Routine technician care appropriate.',
        plan: 'Nails trimmed; monitor normally.',
      });
      expect(saved.status).toBe(200);

      const finalized = await request(app.getHttpServer()).post(`/visits/${visit.id}/record/finalize`);
      expect(finalized.status).toBe(201);
      expect(finalized.body).toMatchObject({ status: 'Locked', veterinarianId: DEV_USER_ID });
      const persistedVisit = await prisma.visit.findUniqueOrThrow({ where: { id: visit.id } });
      // Record is signed but the patient still needs checking out, so the visit
      // is handed to the front desk as CheckoutReady rather than parked in RecordComplete.
      expect(persistedVisit).toMatchObject({ state: 'CheckoutReady', phase: 'RecordClosure' });
    });

    it('audits clinical work and requires documented medication stock reconciliation after reversal', async () => {
      const patientId = await createPatient('Medication Reversal Patient');
      const visit = await prisma.visit.create({
        data: {
          organizationId: DEV_ORGANIZATION_ID,
          locationId: DEV_LOCATION_ID,
          patientId,
          clientId: primaryClientId,
          visitType: 'WalkIn',
          reason: 'Medication workflow',
          state: 'PlanDrafted',
          phase: 'PlanAndApproval',
          primaryVeterinarianId: DEV_USER_ID,
        },
      });

      const created = await request(app.getHttpServer()).post(`/visits/${visit.id}/work-items`).send({
        type: 'Medication',
        title: 'Dispense antibiotic',
        plan: { recommendation: 'Dispense the prescribed course.' },
      });
      expect(created.status).toBe(201);
      expect(created.body.result).toMatchObject({ plan: { recommendation: 'Dispense the prescribed course.' } });
      expect(created.body.result.clientDecision).toBeUndefined();

      const completed = await request(app.getHttpServer()).put(`/visits/${visit.id}/work-items/${created.body.id}`).send({ status: 'Completed' });
      expect(completed.status).toBe(200);
      const undocumentedReversal = await request(app.getHttpServer()).put(`/visits/${visit.id}/work-items/${created.body.id}`).send({ status: 'Pending' });
      expect(undocumentedReversal.status).toBe(409);

      const reversed = await request(app.getHttpServer()).put(`/visits/${visit.id}/work-items/${created.body.id}`).send({
        status: 'Pending',
        reason: 'Owner declined medication after it was prepared',
      });
      expect(reversed.status).toBe(200);
      expect(reversed.body.result).toMatchObject({ requiresInventoryReconciliation: true });

      const undocumentedReconciliation = await request(app.getHttpServer()).put(`/visits/${visit.id}/work-items/${created.body.id}`).send({ status: 'Completed' });
      expect(undocumentedReconciliation.status).toBe(409);
      const reconciled = await request(app.getHttpServer()).put(`/visits/${visit.id}/work-items/${created.body.id}`).send({
        status: 'Completed',
        reason: 'Returned sealed medication to available stock',
      });
      expect(reconciled.status).toBe(200);
      expect(reconciled.body.result).toMatchObject({ requiresInventoryReconciliation: false });
      expect(await prisma.visitWorkItemChange.count({ where: { workItemId: created.body.id } })).toBe(4);
    });

    it('enforces care completion through discharge, locks the record, preserves amendments, and keeps follow-up actionable', async () => {
      const patientId = await createPatient('Full Closure Patient');
      const visit = await prisma.visit.create({
        data: {
          organizationId: DEV_ORGANIZATION_ID,
          locationId: DEV_LOCATION_ID,
          patientId,
          clientId: primaryClientId,
          visitType: 'WalkIn',
          reason: 'Full closure workflow',
          state: 'VeterinarianExamInProgress',
          phase: 'Exam',
          primaryVeterinarianId: DEV_USER_ID,
          intake: { create: { chiefComplaint: 'Cough', completedAt: new Date() } },
          examFindings: { create: { subjective: 'Cough', objective: 'Stable', assessment: 'URI', plan: 'Medication' } },
        },
      });
      const examComplete = await request(app.getHttpServer()).post(`/visits/${visit.id}/exam/complete`);
      expect(examComplete.status).toBe(201);
      const draft = examComplete.body.soapNotes[0] as { version: number };

      const care = await request(app.getHttpServer()).post(`/visits/${visit.id}/work-items`).send({ type: 'Treatment', title: 'Administer first dose' });
      expect(care.status).toBe(201);
      expect(care.body.result?.clientDecision).toBeUndefined();
      const blockedDischarge = await request(app.getHttpServer()).put(`/visits/${visit.id}/discharge`).send({ instructions: 'Rest', followUpRequired: false });
      expect(blockedDischarge.status).toBe(409);
      expect((blockedDischarge.body.message as string)).toContain('Administer first dose');
      const deferred = await request(app.getHttpServer()).put(`/visits/${visit.id}/work-items/${care.body.id}`).send({ status: 'Deferred', reason: 'Owner will administer at home tonight' });
      expect(deferred.status).toBe(200);

      const discharge = await request(app.getHttpServer()).put(`/visits/${visit.id}/discharge`).send({
        instructions: 'Rest and monitor breathing.',
        followUpRequired: true,
        followUpPlan: 'Reception to call tomorrow morning.',
      });
      expect(discharge.status).toBe(200);
      const checkout = await request(app.getHttpServer()).post(`/visits/${visit.id}/checkout/complete`).send({ clientContactConfirmed: true, balanceDisposition: 'NoBalanceReported' });
      expect(checkout.status).toBe(201);
      expect(checkout.body).toMatchObject({
        state: 'RecordCompletionPending',
        phase: 'RecordClosure',
        currentOwnerId: DEV_USER_ID,
        nextAction: 'Finalize medical record',
      });

      const visitAfterCheckout = await request(app.getHttpServer()).get(`/visits/${visit.id}`);
      expect(visitAfterCheckout.status).toBe(200);
      expect(visitAfterCheckout.body).toMatchObject({
        state: 'RecordCompletionPending',
        phase: 'RecordClosure',
        currentOwnerId: DEV_USER_ID,
        nextAction: 'Finalize medical record',
      });
      const dashboardAfterCheckout = await request(app.getHttpServer()).get('/operations/dashboard');
      expect(dashboardAfterCheckout.status).toBe(200);
      expect(dashboardAfterCheckout.body.activeVisits).toEqual(expect.arrayContaining([
        expect.objectContaining({
          id: visit.id,
          state: 'RecordCompletionPending',
          phase: 'RecordClosure',
          currentOwner: expect.objectContaining({ id: DEV_USER_ID }),
          nextAction: 'Finalize medical record',
        }),
      ]));
      const patientAfterCheckout = await request(app.getHttpServer()).get(`/patients/${patientId}/workspace`);
      expect(patientAfterCheckout.status).toBe(200);
      expect(patientAfterCheckout.body.sections.currentVisit).toMatchObject({
        status: 'available',
        visit: { id: visit.id, state: 'RecordCompletionPending' },
      });
      expect(patientAfterCheckout.body.recentVisits).toEqual(expect.arrayContaining([
        expect.objectContaining({ id: visit.id, attachments: [] }),
      ]));

      const saved = await request(app.getHttpServer()).put(`/visits/${visit.id}/record/draft`).send({
        version: draft.version,
        subjective: 'Owner reports coughing.',
        objective: 'Patient stable with mild upper airway signs.',
        assessment: 'Suspected uncomplicated URI.',
        plan: 'Supportive care and home monitoring.',
      });
      expect(saved.status).toBe(200);
      const finalized = await request(app.getHttpServer()).post(`/visits/${visit.id}/record/finalize`);
      expect(finalized.status).toBe(201);
      const closedVisit = await prisma.visit.findUniqueOrThrow({ where: { id: visit.id } });
      expect(closedVisit).toMatchObject({ state: 'Archived', phase: 'Closed', workflowStepId: null });

      const visitAfterClosure = await request(app.getHttpServer()).get(`/visits/${visit.id}`);
      expect(visitAfterClosure.status).toBe(200);
      expect(visitAfterClosure.body).toMatchObject({
        state: 'Archived',
        phase: 'Closed',
        workflowStepId: null,
        nextAction: null,
      });
      const dashboardAfterClosure = await request(app.getHttpServer()).get('/operations/dashboard');
      expect(dashboardAfterClosure.status).toBe(200);
      expect(dashboardAfterClosure.body.activeVisits).not.toEqual(expect.arrayContaining([
        expect.objectContaining({ id: visit.id }),
      ]));
      const patientAfterClosure = await request(app.getHttpServer()).get(`/patients/${patientId}/workspace`);
      expect(patientAfterClosure.status).toBe(200);
      expect(patientAfterClosure.body.sections.currentVisit).toMatchObject({ status: 'unavailable' });
      expect(patientAfterClosure.body.recentVisits).toEqual(expect.arrayContaining([
        expect.objectContaining({ id: visit.id, state: 'Archived' }),
      ]));

      const original = await prisma.soapNote.findUniqueOrThrow({ where: { id: finalized.body.id } });
      const amendment = await request(app.getHttpServer()).post(`/visits/${visit.id}/record/amend`).send({
        reason: 'Clarified owner-reported timing after callback',
        subjective: 'Owner reports coughing began two days before the visit.',
        objective: original.objective,
        assessment: original.assessment,
        plan: original.plan,
      });
      expect(amendment.status).toBe(201);
      expect(amendment.body).toMatchObject({ status: 'Amended', amendsSoapNoteId: original.id });
      expect(await prisma.soapNote.findUniqueOrThrow({ where: { id: original.id } })).toMatchObject({
        subjective: original.subjective,
        contentHash: original.contentHash,
        status: 'Locked',
      });

      const followUp = await prisma.visitWorkItem.findFirstOrThrow({ where: { visitId: visit.id, type: 'FollowUp' } });
      const completedFollowUp = await request(app.getHttpServer()).put(`/visits/${visit.id}/work-items/${followUp.id}`).send({ status: 'Completed' });
      expect(completedFollowUp.status).toBe(200);
    });
  });
});
