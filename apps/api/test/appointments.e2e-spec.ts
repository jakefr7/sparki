import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { prisma, prismaUnscoped } from '@sparki/db';
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
  let wellnessAppointmentTypeId: string;
  const availabilityBlockIds: string[] = [];
  const addedProviderAssignmentIds: string[] = [];
  const createdAppointmentTypeIds: string[] = [];

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();

    // Any authenticated request lazily seeds the dev identity under
    // DEV_ORGANIZATION_ID; do it here so fixtures below can reference it.
    await request(app.getHttpServer()).get(`/patients/${DEV_ORGANIZATION_ID}`);

    // Appointment creation now validates against the clinic's configured
    // providers and schedule blocks. Give this suite deterministic, isolated
    // availability instead of depending on whichever local demo schedule is
    // present in the shared development database.
    const appointmentTypeFixtures = [
      ['WellnessPreventiveCare', 'Wellness / Preventive Care', 30],
      ['SickVisit', 'Sick Visit', 30],
      ['Recheck', 'Follow-Up', 30],
      ['TechnicianAppointment', 'Technician Appointment', 30],
      ['Vaccination', 'Vaccination', 30],
      ['SurgeryProcedure', 'Surgery Consultation', 60],
      ['DropOff', 'Drop-Off', 30],
      ['EmergencyUrgent', 'Urgent Visit', 30],
      ['Telemedicine', 'Telemedicine', 30],
      ['Euthanasia', 'Euthanasia', 60],
      ['BoardingNonMedical', 'Boarding / Non-medical', 30],
    ] as const;
    for (const [appointmentType, name, defaultDurationMinutes] of appointmentTypeFixtures) {
      const existing = await prisma.appointmentTypeSetting.findFirst({
        where: { locationId: DEV_LOCATION_ID, appointmentType },
        select: { id: true },
      });
      if (!existing) {
        const created = await prisma.appointmentTypeSetting.create({
          data: {
            organizationId: DEV_ORGANIZATION_ID,
            locationId: DEV_LOCATION_ID,
            appointmentType,
            name,
            defaultDurationMinutes,
            color: appointmentType === 'EmergencyUrgent' ? '#DC2626' : '#2563EB',
            sortOrder: createdAppointmentTypeIds.length * 10 + 10,
          },
          select: { id: true },
        });
        createdAppointmentTypeIds.push(created.id);
      }
    }
    const appointmentTypes = await prisma.appointmentTypeSetting.findMany({
      where: {
        organizationId: DEV_ORGANIZATION_ID,
        locationId: DEV_LOCATION_ID,
        isActive: true,
      },
      select: {
        id: true,
        appointmentType: true,
        defaultDurationMinutes: true,
        providers: { where: { providerId: DEV_USER_ID }, select: { providerId: true } },
      },
    });
    const wellnessType = appointmentTypes.find(
      (setting) =>
        setting.appointmentType === 'WellnessPreventiveCare' &&
        setting.defaultDurationMinutes === 30,
    ) ?? appointmentTypes.find((setting) => setting.appointmentType === 'WellnessPreventiveCare');
    if (!wellnessType) throw new Error('Appointments E2E requires an active wellness appointment type.');
    wellnessAppointmentTypeId = wellnessType.id;
    for (const appointmentType of appointmentTypes) {
      if (appointmentType.providers.length === 0) {
        await prisma.appointmentTypeProvider.create({
          data: {
            appointmentTypeId: appointmentType.id,
            providerId: DEV_USER_ID,
            organizationId: DEV_ORGANIZATION_ID,
          },
        });
        addedProviderAssignmentIds.push(appointmentType.id);
      }
    }
    for (let dayOfWeek = 0; dayOfWeek < 7; dayOfWeek += 1) {
      const block = await prisma.schedulerSlotTemplate.create({
        data: {
          organizationId: DEV_ORGANIZATION_ID,
          locationId: DEV_LOCATION_ID,
          dayOfWeek,
          startTime: '00:00',
          endTime: '23:59',
          label: 'Appointments E2E availability',
          color: '#0F766E',
          staffId: DEV_USER_ID,
          isGeneralAvailability: false,
          appointmentTypes: {
            create: appointmentTypes.map((appointmentType) => ({
              appointmentTypeId: appointmentType.id,
            })),
          },
        },
      });
      availabilityBlockIds.push(block.id);
    }

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

    const otherOrgClient = await prismaUnscoped.client.create({
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
    await prismaUnscoped.appointment.deleteMany({
      where: {
        OR: [{ patientId }, { organizationId: otherOrganizationId }],
      },
    });
    await prismaUnscoped.schedulerSlotTemplate.deleteMany({ where: { id: { in: availabilityBlockIds } } });
    await prismaUnscoped.appointmentTypeProvider.deleteMany({
      where: {
        providerId: DEV_USER_ID,
        appointmentTypeId: { in: addedProviderAssignmentIds },
      },
    });
    await prismaUnscoped.appointmentTypeSetting.deleteMany({
      where: { id: { in: createdAppointmentTypeIds } },
    });
    await prismaUnscoped.patientClient.deleteMany({ where: { patientId } });
    await prismaUnscoped.patient.deleteMany({ where: { id: patientId } });
    await prismaUnscoped.client.deleteMany({
      where: { id: { in: [primaryClientId, secondaryClientId, otherOrgClientId] } },
    });
    await prismaUnscoped.location.deleteMany({ where: { organizationId: otherOrganizationId } });
    await prismaUnscoped.organization.deleteMany({ where: { id: otherOrganizationId } });
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
        colorKey: null,
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
        colorKey: 'magenta',
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
      const otherOrgUser = await prismaUnscoped.user.create({
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

      await prismaUnscoped.user.delete({ where: { id: otherOrgUser.id } });
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
    const createdContactIds: string[] = [];

    afterAll(async () => {
      await prisma.appointment.deleteMany({ where: { clientId: { in: createdClientIds } } });
      await prisma.patientClient.deleteMany({ where: { patientId: { in: createdPatientIds } } });
      await prisma.patientProvider.deleteMany({ where: { patientId: { in: createdPatientIds } } });
      await prisma.referralContact.deleteMany({ where: { id: { in: createdContactIds } } });
      await prisma.patient.deleteMany({ where: { id: { in: createdPatientIds } } });
      await prisma.client.deleteMany({ where: { id: { in: createdClientIds } } });
    });

    it('creates Client + Patient + PatientClient + Appointment together, including optional records-request fields', async () => {
      const contact = await prisma.referralContact.create({ data: { organizationId: DEV_ORGANIZATION_ID, hospitalName: 'Booking referral fixture' } });
      createdContactIds.push(contact.id);
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
            dateOfBirth: '2021-03-04',
            dateOfBirthEstimated: true,
          },
          appointment: {
            appointmentType: 'WellnessPreventiveCare',
            visitReason: 'New patient wellness visit',
            startTime: '2027-04-01T15:00:00.000Z',
            expectedDurationMinutes: 30,
            referringProviderId: contact.id,
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
      expect(patient.dateOfBirthEstimated).toBe(true);
      expect(patient.dateOfBirth?.toISOString()).toBe('2021-03-04T00:00:00.000Z');
      const providerLink = await prisma.patientProvider.findFirstOrThrow({ where: { patientId: patient.id } });
      expect(providerLink).toMatchObject({ organizationId: DEV_ORGANIZATION_ID, contactId: contact.id, kind: 'REFERRING' });
      expect(await prisma.task.count({ where: { patientId: patient.id } })).toBe(0);
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
      const otherOrgUser = await prismaUnscoped.user.create({
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

      await prismaUnscoped.user.delete({ where: { id: otherOrgUser.id } });
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
    let recordsStatusPatientId: string;

    beforeAll(async () => {
      const patient = await prisma.patient.create({
        data: {
          organizationId: DEV_ORGANIZATION_ID,
          name: 'Records Status Patient',
          species: 'Canine',
          clients: { create: [{ clientId: primaryClientId, isPrimary: true }] },
        },
        select: { id: true },
      });
      recordsStatusPatientId = patient.id;
    });

    afterAll(async () => {
      await prisma.appointment.deleteMany({ where: { patientId: recordsStatusPatientId } });
      await prisma.patientClient.deleteMany({ where: { patientId: recordsStatusPatientId } });
      await prisma.patient.delete({ where: { id: recordsStatusPatientId } });
    });

    it('a newly created appointment defaults to NotStarted records prep and NotSent confirmation', async () => {
      const response = await request(app.getHttpServer()).post('/appointments').send({
        patientId: recordsStatusPatientId,
        appointmentType: 'WellnessPreventiveCare',
        appointmentTypeId: wellnessAppointmentTypeId,
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
            appointmentTypeId: wellnessAppointmentTypeId,
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
          patientId: recordsStatusPatientId,
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
          patientId: recordsStatusPatientId,
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
          patientId: recordsStatusPatientId,
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
          patientId: recordsStatusPatientId,
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
      ).send({ reason: 'Client requested cancellation' });

      expect(response.status).toBe(201);
      expect(response.body.state).toBe('Cancelled');
    });

    it.each(['Cancelled', 'Completed', 'NoShow'] as const)(
      'rejects cancelling an already-terminal %s appointment with 409',
      async (state) => {
        const appointment = await seedAppointment(state);

        const response = await request(app.getHttpServer()).post(
          `/appointments/${appointment.id}/cancel`,
        ).send({ reason: 'Client requested cancellation' });

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
  it('saves multiple weekly blocks atomically and retains edits outside the old grid', async () => {
    const label = 'SPA-42 early consult';
    const template = { label, startTime: '05:10', endTime: '06:40', color: '#1FA9A0', isActive: true, staffId: DEV_USER_ID, appointmentTypeIds: [wellnessAppointmentTypeId] };
    const response = await request(app.getHttpServer()).post('/scheduler-config/slot-templates/batch').send({ templates: [1, 3, 5].map((dayOfWeek) => ({ ...template, dayOfWeek })) });
    expect(response.status).toBe(201);
    expect(response.body).toHaveLength(3);
    const ids = response.body.map((block: { id: string }) => block.id);
    availabilityBlockIds.push(...ids);
    for (const block of response.body) {
      expect(block).toMatchObject({ startTime: '05:10', endTime: '06:40', appointmentTypeIds: [wellnessAppointmentTypeId], organizationId: DEV_ORGANIZATION_ID, locationId: DEV_LOCATION_ID });
      expect(await prisma.schedulerConfigChange.count({ where: { entityId: block.id, actorId: DEV_USER_ID, action: 'Created' } })).toBe(1);
    }
    const edited = await request(app.getHttpServer()).post('/scheduler-config/slot-templates').send({ ...template, id: ids[0], dayOfWeek: 1, startTime: '20:10', endTime: '22:35' });
    expect(edited.status).toBe(201);
    const config = await request(app.getHttpServer()).get('/scheduler-config');
    expect(config.body.slotTemplates.find((block: { id: string }) => block.id === ids[0])).toMatchObject({ startTime: '20:10', endTime: '22:35' });
    const failed = await request(app.getHttpServer()).post('/scheduler-config/slot-templates/batch').send({ templates: [{ ...template, label: 'SPA-42 rollback', dayOfWeek: 1 }, { ...template, dayOfWeek: 2, staffId: 'foreign-provider' }] });
    expect(failed.status).toBe(400);
    expect(await prisma.schedulerSlotTemplate.count({ where: { label: 'SPA-42 rollback' } })).toBe(0);
  });

  it('validates entire closure batches and recovers repeated requests without duplicating closures', async () => {
    const exceptions = ['2027-02-01', '2027-02-08'].map((date) => ({ date, reason: 'SPA-42 Mondays', providerId: DEV_USER_ID }));
    const saved = await request(app.getHttpServer()).post('/scheduler-config/date-exceptions/batch').send({ exceptions });
    expect(saved.status).toBe(201);
    expect(saved.body).toHaveLength(2);
    const ids = saved.body.map((item: { id: string }) => item.id);
    try {
      const repeated = await request(app.getHttpServer()).post('/scheduler-config/date-exceptions/batch').send({ exceptions });
      expect(repeated.status).toBe(201);
      expect(repeated.body.map((item: { id: string }) => item.id)).toEqual(ids);
      for (const item of saved.body) {
        expect(item).toMatchObject({ organizationId: DEV_ORGANIZATION_ID, locationId: DEV_LOCATION_ID });
        expect(await prisma.schedulerConfigChange.count({ where: { entityId: item.id, action: 'Created' } })).toBe(1);
      }
      const invalid = await request(app.getHttpServer()).post('/scheduler-config/date-exceptions/batch').send({ exceptions: [{ date: '2027-03-01', reason: 'SPA-42 invalid batch' }, { date: '2027-02-30', reason: 'Impossible' }] });
      expect(invalid.status).toBe(400);
      const foreign = await request(app.getHttpServer()).post('/scheduler-config/date-exceptions/batch').send({ exceptions: [{ date: '2027-03-01', reason: 'SPA-42 invalid batch' }, { date: '2027-03-02', reason: 'Foreign provider', providerId: 'foreign-provider' }] });
      expect(foreign.status).toBe(400);
      expect(await prisma.schedulerDateException.count({ where: { reason: 'SPA-42 invalid batch' } })).toBe(0);
    } finally {
      for (const id of ids) await request(app.getHttpServer()).delete(`/scheduler-config/date-exceptions/${id}`).expect(200);
    }
  });

  it('audits date closures, blocks stale booking, and restores weekly availability after removal', async () => {
    const date = new Date(); date.setUTCDate(date.getUTCDate() + 40); date.setUTCHours(12, 0, 0, 0);
    const end = new Date(date); end.setUTCHours(23, 0, 0, 0);
    const input = { appointmentTypeId: wellnessAppointmentTypeId, startDate: date.toISOString(), endDate: end.toISOString(), providerId: DEV_USER_ID };
    const before = await request(app.getHttpServer()).get('/appointments/availability/search').query(input);
    expect(before.status).toBe(200);
    expect(before.body.slots.length).toBeGreaterThan(0);
    const slot = before.body.slots[0];
    const localDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(slot.start));
    const created = await request(app.getHttpServer()).post('/scheduler-config/date-exceptions').send({ date: localDate, reason: 'Integration closure', providerId: DEV_USER_ID });
    expect(created.status).toBe(201);
    const id = created.body.id;
    try {
      const closed = await request(app.getHttpServer()).get('/appointments/availability/search').query(input);
      expect(closed.status).toBe(200);
      expect(closed.body.slots).toEqual([]);
      const booking = await request(app.getHttpServer()).post('/appointments').send({
        patientId, clientId: primaryClientId, appointmentType: 'WellnessPreventiveCare',
        appointmentTypeId: wellnessAppointmentTypeId, startTime: slot.start, visitReason: 'Date closure test',
        assignedProviderId: DEV_USER_ID, scheduleBlockId: slot.blockId,
      });
      expect(booking.status).toBe(409);
      expect(booking.body.message).toBe('That appointment time is no longer available.');
      expect(await prisma.appointment.count({ where: { patientId, scheduledAt: new Date(slot.start) } })).toBe(0);
      const audit = await prisma.schedulerConfigChange.findFirst({ where: { entityId: id, action: 'Created' } });
      expect(audit?.actorId).toBe(DEV_USER_ID);
      const unknown = await request(app.getHttpServer()).delete('/scheduler-config/date-exceptions/unknown-exception');
      expect(unknown.status).toBe(404);
    } finally {
      const removed = await request(app.getHttpServer()).delete(`/scheduler-config/date-exceptions/${id}`);
      expect(removed.status).toBe(200);
    }
    const restored = await request(app.getHttpServer()).get('/appointments/availability/search').query(input);
    expect(restored.body.slots.some((entry: { start: string }) => entry.start === slot.start)).toBe(true);
    expect((await prisma.schedulerDateException.findUniqueOrThrow({ where: { id } })).deletedAt).not.toBeNull();
  });

  it('allows appearance edits but rejects workflow edits and deletion', async () => {
    const config = await request(app.getHttpServer()).get('/dashboard-status-colors');
    expect(config.status).toBe(200);
    expect(config.body.colors).toHaveLength(8);
    const step = config.body.colors.find((entry: { status: string }) => entry.status === 'CheckIn');
    const saved = await request(app.getHttpServer()).post('/dashboard-status-colors').send({ id: step.id, name: 'Arrival', color: '#123456', description: 'Appearance test' });
    expect(saved.status).toBe(201);
    expect(saved.body.lifecyclePhase).toBe(step.lifecyclePhase);
    const changed = await request(app.getHttpServer()).post('/dashboard-status-colors').send({ id: step.id, name: 'Skip intake', color: '#123456', allowedTransitionKeys: ['Checkout'] });
    expect(changed.status).toBe(400);
    const deleted = await request(app.getHttpServer()).delete(`/dashboard-status-colors/${step.id}`);
    expect(deleted.status).toBe(400);
    expect(await prisma.dashboardStatusColorSetting.count({ where: { id: step.id } })).toBe(1);
  });

});
