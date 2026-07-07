import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { prisma } from '@sparki/db';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { DEV_ORGANIZATION_ID } from '../src/auth/development-user.service';

describe('Staff (e2e)', () => {
  let app: INestApplication;
  let otherOrganizationId: string;
  let veterinarianId: string;
  let technicianId: string;
  let otherOrganizationUserId: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();

    // Any authenticated request lazily seeds the dev identity
    // (Organization/Location/Role/User under DEV_ORGANIZATION_ID); do it here
    // so DEV_ORGANIZATION_ID is guaranteed to exist before fixtures below
    // reference it directly via prisma.
    await request(app.getHttpServer()).get('/staff');

    const otherOrganization = await prisma.organization.create({
      data: { name: 'Staff E2E Org (other)' },
    });
    otherOrganizationId = otherOrganization.id;

    const veterinarian = await prisma.user.create({
      data: {
        organizationId: DEV_ORGANIZATION_ID,
        email: `staff-e2e-vet-${Date.now()}@example.com`,
        firstName: 'Priya',
        lastName: 'Shah',
        role: 'VETERINARIAN',
        staffProfile: { create: { canReceiveAppointments: true, canOwnVisits: true } },
      },
    });
    veterinarianId = veterinarian.id;

    const technician = await prisma.user.create({
      data: {
        organizationId: DEV_ORGANIZATION_ID,
        email: `staff-e2e-tech-${Date.now()}@example.com`,
        firstName: 'Jordan',
        lastName: 'Blake',
        role: 'TECHNICIAN',
        staffProfile: { create: { canReceiveAppointments: false, canOwnVisits: false } },
      },
    });
    technicianId = technician.id;

    const otherOrganizationUser = await prisma.user.create({
      data: {
        organizationId: otherOrganizationId,
        email: `staff-e2e-other-org-${Date.now()}@example.com`,
        firstName: 'Other',
        lastName: 'Org Vet',
        role: 'VETERINARIAN',
      },
    });
    otherOrganizationUserId = otherOrganizationUser.id;
  });

  afterAll(async () => {
    const createdUserIds = [veterinarianId, technicianId, otherOrganizationUserId].filter(Boolean);
    await prisma.staffProfile.deleteMany({ where: { userId: { in: createdUserIds } } });
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    await prisma.organization.deleteMany({ where: { id: otherOrganizationId } });
    await app.close();
  });

  describe('GET /staff', () => {
    it('lists staff scoped to the authenticated organization', async () => {
      const response = await request(app.getHttpServer()).get('/staff');

      expect(response.status).toBe(200);
      expect(response.body).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: veterinarianId, role: 'VETERINARIAN' }),
          expect.objectContaining({ id: technicianId, role: 'TECHNICIAN' }),
        ]),
      );
      expect(response.body).not.toEqual(
        expect.arrayContaining([expect.objectContaining({ lastName: 'Org Vet' })]),
      );
    });

    it('filters by role', async () => {
      const response = await request(app.getHttpServer())
        .get('/staff')
        .query({ role: 'TECHNICIAN' });

      expect(response.status).toBe(200);
      expect(response.body).toEqual(
        expect.arrayContaining([expect.objectContaining({ id: technicianId })]),
      );
      expect(response.body).not.toEqual(
        expect.arrayContaining([expect.objectContaining({ id: veterinarianId })]),
      );
    });

    it('filters by canReceiveAppointments', async () => {
      const response = await request(app.getHttpServer())
        .get('/staff')
        .query({ canReceiveAppointments: 'true' });

      expect(response.status).toBe(200);
      expect(response.body).toEqual(
        expect.arrayContaining([expect.objectContaining({ id: veterinarianId })]),
      );
      expect(response.body).not.toEqual(
        expect.arrayContaining([expect.objectContaining({ id: technicianId })]),
      );
    });
  });

  describe('GET /staff/:id', () => {
    it('fetches a staff member within the authenticated organization', async () => {
      const response = await request(app.getHttpServer()).get(`/staff/${veterinarianId}`);

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({ id: veterinarianId, role: 'VETERINARIAN' });
    });

    it('returns 404 when the staff member belongs to a different organization', async () => {
      const crossOrgUser = await prisma.user.findFirstOrThrow({
        where: { organizationId: otherOrganizationId },
      });

      const response = await request(app.getHttpServer()).get(`/staff/${crossOrgUser.id}`);

      expect(response.status).toBe(404);
    });
  });
});
