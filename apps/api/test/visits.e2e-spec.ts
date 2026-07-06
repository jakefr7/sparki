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
      data: { organizationId: DEV_ORGANIZATION_ID, firstName: 'Visit', lastName: 'Primary Owner' },
    });
    primaryClientId = primaryClient.id;

    const secondaryClient = await prisma.client.create({
      data: {
        organizationId: DEV_ORGANIZATION_ID,
        firstName: 'Visit',
        lastName: 'Secondary Owner',
      },
    });
    secondaryClientId = secondaryClient.id;

    const otherOrgClient = await prisma.client.create({
      data: { organizationId: otherOrganizationId, firstName: 'Other', lastName: 'Org Owner' },
    });
    otherOrgClientId = otherOrgClient.id;

    const otherOrgPatient = await prisma.patient.create({
      data: { organizationId: otherOrganizationId, name: 'Other Org Patient', species: 'Feline' },
    });
    otherOrgPatientId = otherOrgPatient.id;
  });

  afterAll(async () => {
    await prisma.visit.deleteMany({
      where: { organizationId: { in: [DEV_ORGANIZATION_ID, otherOrganizationId] } },
    });
    await prisma.appointment.deleteMany({
      where: { organizationId: { in: [DEV_ORGANIZATION_ID, otherOrganizationId] } },
    });
    await prisma.patientClient.deleteMany({
      where: { client: { organizationId: { in: [DEV_ORGANIZATION_ID, otherOrganizationId] } } },
    });
    await prisma.patient.deleteMany({
      where: { organizationId: { in: [DEV_ORGANIZATION_ID, otherOrganizationId] } },
    });
    await prisma.client.deleteMany({
      where: { organizationId: { in: [DEV_ORGANIZATION_ID, otherOrganizationId] } },
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
      const created = await request(app.getHttpServer()).post('/appointments').send({
        patientId,
        appointmentType: 'SickVisit',
        visitReason: 'Ear infection',
        startTime: '2027-02-01T15:00:00.000Z',
      });
      expect(created.body.state).toBe('Scheduled');

      // Not arrived yet — Visit creation must still be rejected.
      const tooEarly = await request(app.getHttpServer())
        .post('/visits')
        .send({ appointmentId: created.body.id });
      expect(tooEarly.status).toBe(409);

      const confirmed = await request(app.getHttpServer()).post(
        `/appointments/${created.body.id}/confirm`,
      );
      expect(confirmed.status).toBe(201);
      expect(confirmed.body.state).toBe('Confirmed');

      const arrived = await request(app.getHttpServer()).post(
        `/appointments/${created.body.id}/arrive`,
      );
      expect(arrived.status).toBe(201);
      expect(arrived.body.state).toBe('Arrived');

      const visit = await request(app.getHttpServer())
        .post('/visits')
        .send({ appointmentId: created.body.id });

      expect(visit.status).toBe(201);
      expect(visit.body).toMatchObject({
        patientId,
        appointmentId: created.body.id,
        state: 'Arrived',
      });
      expect(visit.body.appointment.state).toBe('VisitCreated');

      // Once linked, the appointment can no longer start a second Visit.
      const secondAttempt = await request(app.getHttpServer())
        .post('/visits')
        .send({ appointmentId: created.body.id });
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
        data: { organizationId: DEV_ORGANIZATION_ID, name: 'No Client Patient', species: 'Feline' },
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

    it('allows a new Visit once the prior one is in a terminal state', async () => {
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
        const patientId = await createPatient(`Start Visit Patient ${state}`);
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
      const patientId = await createPatient('Restart Visit Patient');
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

    it('saves intake data and returns it on the Visit payload', async () => {
      const visit = await createVisit('Save Intake Patient');

      const response = await request(app.getHttpServer()).put(`/visits/${visit.id}/intake`).send({
        chiefComplaint: 'Limping on left rear leg',
        historyNotes: 'Started yesterday after daycare.',
        weight: 42.5,
        temperature: 101.2,
        heartRate: 88,
        respiratoryRate: 24,
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
          temperature: 101.2,
          heartRate: 88,
          respiratoryRate: 24,
          appetite: 'Normal',
          vomiting: false,
          diarrhea: true,
          medicationsAllergies: 'Carprofen allergy',
          completedAt: null,
        },
      });

      const saved = await prisma.visitIntake.findUniqueOrThrow({ where: { visitId: visit.id } });
      expect(saved.chiefComplaint).toBe('Limping on left rear leg');
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
        temperature: 102,
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
});
