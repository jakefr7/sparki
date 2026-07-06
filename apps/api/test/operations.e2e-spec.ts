import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { prisma } from '@sparki/db';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { DEV_LOCATION_ID, DEV_ORGANIZATION_ID } from '../src/auth/development-user.service';

describe('Operations (e2e)', () => {
  let app: INestApplication;
  let otherOrganizationId: string;
  let clientId: string;
  let patientId: string;
  let vetId: string;
  let techId: string;
  let todayAppointmentId: string;
  let activeVisitId: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();

    // Any authenticated request lazily seeds the dev identity under
    // DEV_ORGANIZATION_ID; do it here so fixtures below can reference it.
    await request(app.getHttpServer()).get(`/patients/${DEV_ORGANIZATION_ID}`);

    // Other e2e spec files share this same organization and reset its
    // Appointment/Visit rows in their own afterAll hooks; reset here too so
    // the dashboard's counts reflect only the fixtures this file creates,
    // regardless of file execution order.
    await prisma.visit.deleteMany({ where: { organizationId: DEV_ORGANIZATION_ID } });
    await prisma.appointment.deleteMany({ where: { organizationId: DEV_ORGANIZATION_ID } });

    const otherOrganization = await prisma.organization.create({
      data: { name: 'Operations E2E Org (other)' },
    });
    otherOrganizationId = otherOrganization.id;

    const client = await prisma.client.create({
      data: { organizationId: DEV_ORGANIZATION_ID, firstName: 'Ops', lastName: 'Owner' },
    });
    clientId = client.id;

    const patient = await prisma.patient.create({
      data: { organizationId: DEV_ORGANIZATION_ID, name: 'Ops Patient', species: 'Canine' },
    });
    patientId = patient.id;

    const vet = await prisma.user.create({
      data: {
        organizationId: DEV_ORGANIZATION_ID,
        email: `ops-vet-${Date.now()}@example.com`,
        firstName: 'Ops',
        lastName: 'Vet',
        role: 'VETERINARIAN',
        staffProfile: { create: { canReceiveAppointments: true, canOwnVisits: true } },
      },
    });
    vetId = vet.id;

    const tech = await prisma.user.create({
      data: {
        organizationId: DEV_ORGANIZATION_ID,
        email: `ops-tech-${Date.now()}@example.com`,
        firstName: 'Ops',
        lastName: 'Tech',
        role: 'TECHNICIAN',
        staffProfile: { create: { canReceiveAppointments: true, canOwnVisits: true } },
      },
    });
    techId = tech.id;

    const todayAppointment = await prisma.appointment.create({
      data: {
        organizationId: DEV_ORGANIZATION_ID,
        locationId: DEV_LOCATION_ID,
        patientId,
        clientId,
        type: 'WellnessPreventiveCare',
        reason: 'Annual checkup',
        source: 'Phone',
        state: 'Scheduled',
        scheduledAt: new Date(),
        providerId: vetId,
      },
    });
    todayAppointmentId = todayAppointment.id;

    await prisma.appointment.create({
      data: {
        organizationId: DEV_ORGANIZATION_ID,
        locationId: DEV_LOCATION_ID,
        patientId,
        clientId,
        type: 'Recheck',
        reason: 'Future recheck',
        source: 'Phone',
        state: 'Scheduled',
        scheduledAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        providerId: vetId,
      },
    });

    await prisma.appointment.create({
      data: {
        organizationId: DEV_ORGANIZATION_ID,
        locationId: DEV_LOCATION_ID,
        patientId,
        clientId,
        type: 'SickVisit',
        reason: 'Completed today',
        source: 'Phone',
        state: 'Completed',
        scheduledAt: new Date(),
      },
    });

    const activeVisit = await prisma.visit.create({
      data: {
        organizationId: DEV_ORGANIZATION_ID,
        locationId: DEV_LOCATION_ID,
        patientId,
        clientId,
        visitType: 'WalkIn',
        reason: 'Not eating',
        state: 'Arrived',
        primaryVeterinarianId: vetId,
        assignedTechnicianId: techId,
      },
    });
    activeVisitId = activeVisit.id;

    await prisma.visit.create({
      data: {
        organizationId: DEV_ORGANIZATION_ID,
        locationId: DEV_LOCATION_ID,
        patientId,
        clientId,
        visitType: 'WalkIn',
        reason: 'Closed episode',
        state: 'Archived',
      },
    });

    // Cross-org fixture: must never appear in DEV_ORGANIZATION_ID's dashboard.
    const otherLocation = await prisma.location.create({
      data: { organizationId: otherOrganizationId, name: 'Other Org Location' },
    });
    const otherClient = await prisma.client.create({
      data: { organizationId: otherOrganizationId, firstName: 'Other', lastName: 'Org Client' },
    });
    const otherPatient = await prisma.patient.create({
      data: { organizationId: otherOrganizationId, name: 'Other Org Patient', species: 'Feline' },
    });
    await prisma.visit.create({
      data: {
        organizationId: otherOrganizationId,
        locationId: otherLocation.id,
        patientId: otherPatient.id,
        clientId: otherClient.id,
        visitType: 'WalkIn',
        reason: 'Should not leak',
        state: 'Arrived',
      },
    });
  });

  afterAll(async () => {
    await prisma.visit.deleteMany({
      where: { organizationId: { in: [DEV_ORGANIZATION_ID, otherOrganizationId] } },
    });
    await prisma.appointment.deleteMany({
      where: { organizationId: { in: [DEV_ORGANIZATION_ID, otherOrganizationId] } },
    });
    await prisma.patientClient.deleteMany({
      where: { patient: { organizationId: { in: [DEV_ORGANIZATION_ID, otherOrganizationId] } } },
    });
    await prisma.patient.deleteMany({
      where: { organizationId: { in: [DEV_ORGANIZATION_ID, otherOrganizationId] } },
    });
    await prisma.client.deleteMany({
      where: { organizationId: { in: [DEV_ORGANIZATION_ID, otherOrganizationId] } },
    });
    await prisma.staffProfile.deleteMany({ where: { userId: { in: [vetId, techId] } } });
    await prisma.user.deleteMany({ where: { id: { in: [vetId, techId] } } });
    await prisma.location.deleteMany({ where: { organizationId: otherOrganizationId } });
    await prisma.organization.deleteMany({ where: { id: otherOrganizationId } });
    await app.close();
  });

  describe('GET /operations/dashboard', () => {
    it('returns a snapshot scoped to the authenticated organization', async () => {
      const response = await request(app.getHttpServer()).get('/operations/dashboard');

      expect(response.status).toBe(200);
      expect(response.body.summary).toMatchObject({
        scheduledToday: 1,
        arrived: 1,
        active: 1,
        checkoutReady: 0,
        completedToday: 1,
        totalToday: 2,
      });
    });

    it("includes today's appointments with patient/client/provider context", async () => {
      const response = await request(app.getHttpServer()).get('/operations/dashboard');

      const todayAppointment = response.body.todaysAppointments.find(
        (appointment: { id: string }) => appointment.id === todayAppointmentId,
      );
      expect(todayAppointment).toMatchObject({
        state: 'Scheduled',
        patient: { id: patientId, name: 'Ops Patient' },
        client: { id: clientId, firstName: 'Ops', lastName: 'Owner' },
        provider: { id: vetId, role: 'VETERINARIAN' },
      });
    });

    it('includes upcoming (future) appointments separate from today', async () => {
      const response = await request(app.getHttpServer()).get('/operations/dashboard');

      expect(response.body.upcomingAppointments).toHaveLength(1);
      expect(response.body.upcomingAppointments[0].reason).toBe('Future recheck');
    });

    it('includes active visits with provider/technician assignments and elapsed time', async () => {
      const response = await request(app.getHttpServer()).get('/operations/dashboard');

      expect(response.body.activeVisits).toHaveLength(1);
      const visit = response.body.activeVisits[0];
      expect(visit).toMatchObject({
        id: activeVisitId,
        state: 'Arrived',
        primaryVeterinarian: { id: vetId, role: 'VETERINARIAN' },
        assignedTechnician: { id: techId, role: 'TECHNICIAN' },
      });
      expect(typeof visit.elapsedMinutes).toBe('number');
      expect(visit.elapsedMinutes).toBeGreaterThanOrEqual(0);
    });

    it('excludes terminal visits (Archived) from activeVisits', async () => {
      const response = await request(app.getHttpServer()).get('/operations/dashboard');

      expect(response.body.activeVisits).toHaveLength(1);
      expect(
        response.body.activeVisits.every((visit: { state: string }) => visit.state !== 'Archived'),
      ).toBe(true);
    });

    it('groups active visits by state', async () => {
      const response = await request(app.getHttpServer()).get('/operations/dashboard');

      expect(response.body.visitsByState).toEqual(
        expect.arrayContaining([{ state: 'Arrived', count: 1 }]),
      );
    });

    it('populates arrivedOrWaiting for arrived visits', async () => {
      const response = await request(app.getHttpServer()).get('/operations/dashboard');

      expect(response.body.arrivedOrWaiting).toHaveLength(1);
      expect(response.body.arrivedOrWaiting[0].id).toBe(activeVisitId);
    });

    it('never leaks another organization data into the dashboard', async () => {
      const response = await request(app.getHttpServer()).get('/operations/dashboard');

      const allVisitReasons = [
        ...response.body.activeVisits.map((v: { reason: string }) => v.reason),
        ...response.body.arrivedOrWaiting.map((v: { reason: string }) => v.reason),
      ];
      expect(allVisitReasons).not.toContain('Should not leak');
    });
  });
});
