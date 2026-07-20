import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { prisma } from '@sparki/db';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { DEV_LOCATION_ID, DEV_ORGANIZATION_ID, DEV_USER_ID } from '../src/auth/development-user.service';

const TEST_SOURCE_SYSTEM = 'sparki-operations-e2e';

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

    const otherOrganization = await prisma.organization.create({
      data: { name: 'Operations E2E Org (other)' },
    });
    otherOrganizationId = otherOrganization.id;

    const client = await prisma.client.create({
      data: { organizationId: DEV_ORGANIZATION_ID, firstName: 'Ops', lastName: 'Owner', sourceSystem: TEST_SOURCE_SYSTEM },
    });
    clientId = client.id;

    const patient = await prisma.patient.create({
      data: { organizationId: DEV_ORGANIZATION_ID, name: 'Ops Patient', species: 'Canine', sourceSystem: TEST_SOURCE_SYSTEM },
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
        sourceSystem: TEST_SOURCE_SYSTEM,
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
        // listUpcomingForOrganization caps at the nearest 10 upcoming
        // appointments org-wide, and the shared dev DB may carry many more
        // (protected local demo data spans the next 7 days) — scheduling
        // this a few minutes out, not a full week, keeps it reliably within
        // that top-10 regardless of what else is upcoming.
        scheduledAt: new Date(Date.now() + 5 * 60 * 1000),
        providerId: vetId,
        sourceSystem: TEST_SOURCE_SYSTEM,
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
        sourceSystem: TEST_SOURCE_SYSTEM,
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
    await prisma.visitWorkItem.create({
      data: {
        organizationId: DEV_ORGANIZATION_ID,
        locationId: DEV_LOCATION_ID,
        visitId: activeVisit.id,
        type: 'Treatment',
        title: 'Administer fluids',
        assigneeId: techId,
      },
    });
    await prisma.visitWorkItem.create({
      data: {
        organizationId: DEV_ORGANIZATION_ID,
        locationId: DEV_LOCATION_ID,
        visitId: activeVisit.id,
        type: 'RecordSignoff',
        title: 'Finalize medical record',
        assigneeId: vetId,
      },
    });
    await prisma.visitException.create({
      data: {
        organizationId: DEV_ORGANIZATION_ID,
        locationId: DEV_LOCATION_ID,
        visitId: activeVisit.id,
        type: 'OperationsTestDelay',
        severity: 'Warning',
        reason: 'Waiting on client approval',
        nextAction: 'Call client',
        createdById: DEV_USER_ID,
      },
    });

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
      data: { organizationId: otherOrganizationId, firstName: 'Other', lastName: 'Org Client', sourceSystem: TEST_SOURCE_SYSTEM },
    });
    const otherPatient = await prisma.patient.create({
      data: { organizationId: otherOrganizationId, name: 'Other Org Patient', species: 'Feline', sourceSystem: TEST_SOURCE_SYSTEM },
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
      where: {
        organizationId: { in: [DEV_ORGANIZATION_ID, otherOrganizationId] },
        patient: { sourceSystem: TEST_SOURCE_SYSTEM },
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
    await prisma.staffProfile.deleteMany({ where: { userId: { in: [vetId, techId] } } });
    await prisma.user.deleteMany({ where: { id: { in: [vetId, techId] } } });
    await prisma.location.deleteMany({ where: { organizationId: otherOrganizationId } });
    await prisma.organization.deleteMany({ where: { id: otherOrganizationId } });
    await app.close();
  });

  describe('GET /operations/dashboard', () => {
    it('returns a snapshot scoped to the authenticated organization', async () => {
      const response = await request(app.getHttpServer()).get('/operations/dashboard');

      // Not exact-equality: the shared dev DB may also carry protected local
      // demo data (scripts/seed-local-clinic-demo-data.mjs) scheduled for
      // "today" too, so these assert this file's own fixtures are counted
      // rather than assuming an isolated snapshot.
      expect(response.status).toBe(200);
      expect(response.body.summary.scheduledToday).toBeGreaterThanOrEqual(1);
      expect(response.body.summary.arrived).toBeGreaterThanOrEqual(1);
      expect(response.body.summary.active).toBeGreaterThanOrEqual(1);
      expect(response.body.summary.completedToday).toBeGreaterThanOrEqual(1);
      expect(response.body.summary.totalToday).toBeGreaterThanOrEqual(2);
    });

    it("includes today's appointments with patient/client/provider context", async () => {
      const response = await request(app.getHttpServer()).get('/operations/dashboard');

      const todayAppointment = response.body.todaysAppointments.find(
        (appointment: { id: string }) => appointment.id === todayAppointmentId,
      );
      expect(todayAppointment).toMatchObject({
        state: 'Scheduled',
        patient: { id: patientId, name: 'Ops Patient' },
        client: { id: clientId, firstName: 'Ops', lastName: 'Owner', contactReady: false },
        provider: { id: vetId, role: 'VETERINARIAN' },
      });
    });

    it('includes upcoming (future) appointments separate from today', async () => {
      const response = await request(app.getHttpServer()).get('/operations/dashboard');

      const upcoming = response.body.upcomingAppointments.find(
        (appointment: { reason: string }) => appointment.reason === 'Future recheck',
      );
      expect(upcoming).toBeDefined();
    });

    it('includes active visits with provider/technician assignments and elapsed time', async () => {
      const response = await request(app.getHttpServer()).get('/operations/dashboard');

      const visit = response.body.activeVisits.find(
        (candidate: { id: string }) => candidate.id === activeVisitId,
      );
      expect(visit).toMatchObject({
        id: activeVisitId,
        state: 'Arrived',
        primaryVeterinarian: { id: vetId, role: 'VETERINARIAN' },
        assignedTechnician: { id: techId, role: 'TECHNICIAN' },
      });
      expect(typeof visit.elapsedMinutes).toBe('number');
      expect(visit.elapsedMinutes).toBeGreaterThanOrEqual(0);
      expect(visit.openWorkItems).toEqual(expect.arrayContaining([
        expect.objectContaining({
          title: 'Administer fluids',
          assignee: expect.objectContaining({ id: techId }),
        }),
      ]));
      expect(visit.openExceptions).toEqual(expect.arrayContaining([
        expect.objectContaining({ reason: 'Waiting on client approval', nextAction: 'Call client' }),
      ]));
    });

    it('excludes terminal visits (Archived) from activeVisits', async () => {
      const response = await request(app.getHttpServer()).get('/operations/dashboard');

      expect(
        response.body.activeVisits.every((visit: { state: string }) => visit.state !== 'Archived'),
      ).toBe(true);
    });

    it('groups active visits by state', async () => {
      const response = await request(app.getHttpServer()).get('/operations/dashboard');

      const arrivedGroup = response.body.visitsByState.find(
        (entry: { state: string }) => entry.state === 'Arrived',
      );
      expect(arrivedGroup?.count).toBeGreaterThanOrEqual(1);
    });

    it('populates arrivedOrWaiting for arrived visits', async () => {
      const response = await request(app.getHttpServer()).get('/operations/dashboard');

      expect(
        response.body.arrivedOrWaiting.some(
          (visit: { id: string }) => visit.id === activeVisitId,
        ),
      ).toBe(true);
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

  describe('GET /visits/records/open', () => {
    it('returns location-wide open record signoffs for owner oversight', async () => {
      const response = await request(app.getHttpServer()).get('/visits/records/open');

      expect(response.status).toBe(200);
      expect(response.body).toEqual(expect.arrayContaining([
        expect.objectContaining({
          type: 'RecordSignoff',
          assignee: expect.objectContaining({ id: vetId }),
          visit: expect.objectContaining({ id: activeVisitId }),
        }),
      ]));
      expect(response.body.every((item: { visit: { reason: string } }) => item.visit.reason !== 'Should not leak')).toBe(true);
    });
  });
});
