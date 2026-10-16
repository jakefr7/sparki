import type { INestApplication } from '@nestjs/common';
import { estimateDateOfBirth } from '../../web/src/lib/date-of-birth';
import { Test } from '@nestjs/testing';
import { prisma } from '@sparki/db';
import request from 'supertest';
import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { AppModule } from '../src/app.module';
import { DEV_ORGANIZATION_ID, DEV_LOCATION_ID } from '../src/auth/development-user.service';
import {
  PatientOptionsService,
  savePatientProviders,
} from '../src/patient-options/patient-options.service';
import { TasksService } from '../src/tasks/tasks.service';
import type { AuthenticatedUser } from '../src/auth/types';

describe('Estimated age calendar arithmetic', () => {
  it('converts fractional years into months rather than dropping the decimal', () => {
    expect(estimateDateOfBirth(1.5, 0, new Date(2026, 9, 16))).toBe('2025-04-16');
    expect(estimateDateOfBirth(0.5, 0, new Date(2026, 9, 16))).toBe('2026-04-16');
  });
  it('clamps leap days and month ends', () => {
    expect(estimateDateOfBirth(1, 0, new Date(2024, 1, 29))).toBe('2023-02-28');
    expect(estimateDateOfBirth(0, 1, new Date(2026, 2, 31))).toBe('2026-02-28');
  });
});

describe('SPA-40 patient options and records requests', () => {
  let app: INestApplication;
  let service: PatientOptionsService;
  let patientId: string;
  let contactId: string;
  let otherOrg: string;
  let foreignContactId: string;
  const user = {
    id: 'dev-user',
    name: 'Development User',
    role: 'OWNER',
    organizationId: DEV_ORGANIZATION_ID,
    locationId: DEV_LOCATION_ID,
    canManageAdminSettings: true,
  } as AuthenticatedUser;
  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication();
    await app.init();
    await request(app.getHttpServer()).get('/staff').expect(200);
    service = app.get(PatientOptionsService);
    patientId = (
      await prisma.patient.create({
        data: { organizationId: user.organizationId, name: 'Juniper Records', species: 'Cat' },
      })
    ).id;
    otherOrg = (await prisma.organization.create({ data: { name: 'Foreign referral clinic' } })).id;
    foreignContactId = (
      await prisma.referralContact.create({
        data: { organizationId: otherOrg, hospitalName: 'Private foreign hospital' },
      })
    ).id;
  });
  afterAll(async () => {
    await prisma.task.deleteMany({ where: { patientId } });
    await prisma.patientProvider.deleteMany({ where: { patientId } });
    await prisma.patient.delete({ where: { id: patientId } });
    if (contactId) await prisma.referralContact.delete({ where: { id: contactId } });
    await prisma.referralContact.delete({ where: { id: foreignContactId } });
    await prisma.breedChoice.deleteMany({
      where: { organizationId: user.organizationId, species: 'SPA40-test' },
    });
    await prisma.organization.delete({ where: { id: otherOrg } });
    await app.close();
  });
  it('ships complete registry lists and allows Admin-only overrides without changing patient data', async () => {
    const defaults = await request(app.getHttpServer()).get('/patient-options/breeds').expect(200);
    expect(
      defaults.body.choices.filter((item: { species: string }) => item.species === 'Dog').length,
    ).toBeGreaterThan(290);
    expect(defaults.body.choices).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ species: 'Cat', name: 'Turkish Van' }),
        expect.objectContaining({ species: 'Dog', name: 'Labrador Retriever' }),
      ]),
    );
    await expect(
      service.saveBreed(
        { ...user, role: 'RECEPTIONIST', canManageAdminSettings: false },
        { species: 'SPA40-test', name: 'Custom breed', isActive: true },
      ),
    ).rejects.toThrow('admin settings');
    await service.saveBreed(user, { species: 'SPA40-test', name: 'Custom breed', isActive: true });
    await service.saveBreed(user, {
      species: 'SPA40-test',
      key: 'custom breed',
      name: 'Renamed breed',
      isActive: false,
    });
    expect((await service.breeds(user)).choices).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ species: 'SPA40-test', name: 'Renamed breed', isActive: false }),
      ]),
    );
    expect(
      (await service.breeds({ ...user, organizationId: otherOrg })).choices.some(
        (item) => item.species === 'SPA40-test',
      ),
    ).toBe(false);
  });
  it('searches and saves patient contacts while isolating clinics and rolling back invalid replacements', async () => {
    const created = await request(app.getHttpServer())
      .post('/referral-contacts')
      .send({
        hospitalName: 'Juniper Referral Hospital',
        veterinarian: 'Dr Test',
        email: 'records@example.test',
      })
      .expect(201);
    contactId = created.body.id as string;
    const found = await request(app.getHttpServer())
      .get('/referral-contacts?query=juniper')
      .expect(200);
    expect(found.body.map((item: { id: string }) => item.id)).toContain(contactId);
    expect((await service.contacts(user, 'Private foreign')).length).toBe(0);
    await request(app.getHttpServer())
      .patch(`/patients/${patientId}/providers`)
      .send({ referringProviderId: contactId })
      .expect(200);
    await request(app.getHttpServer())
      .patch(`/patients/${patientId}/providers`)
      .send({ referringProviderId: foreignContactId })
      .expect(400);
    expect((await service.providers(user, patientId))[0]!.contactId).toBe(contactId);
    await expect(
      service.providers({ ...user, organizationId: otherOrg }, patientId),
    ).rejects.toThrow('Patient not found');
    await expect(
      prisma.$transaction((tx) =>
        savePatientProviders(tx, user.organizationId, patientId, {
          additionalProviderIds: [foreignContactId],
        }),
      ),
    ).rejects.toThrow('this clinic');
    expect(await prisma.task.count({ where: { patientId } })).toBe(0);
  });
  it('creates one attributed task on retry, persists editable drafts, and restricts task editing', async () => {
    const input = { contactId, assigneeId: user.id, requestKey: randomUUID() };
    const first = await request(app.getHttpServer())
      .post(`/patients/${patientId}/records-requests`)
      .send(input)
      .expect(201);
    const retry = await request(app.getHttpServer())
      .post(`/patients/${patientId}/records-requests`)
      .send(input)
      .expect(201);
    expect(retry.body.id).toBe(first.body.id);
    expect(first.body).toMatchObject({
      patientId,
      assigneeId: user.id,
      createdById: user.id,
      emailTo: 'records@example.test',
      status: 'Pending',
    });
    expect(first.body.emailBody).toContain('Juniper Records');
    expect(await prisma.task.count({ where: { patientId } })).toBe(1);
    await request(app.getHttpServer())
      .patch(`/tasks/${first.body.id}`)
      .send({
        emailSubject: 'Edited subject',
        emailBody: 'Please include imaging.',
        emailTo: 'new@example.test',
      })
      .expect(200);
    const tasks = await request(app.getHttpServer()).get('/tasks').expect(200);
    expect(tasks.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: first.body.id,
          emailSubject: 'Edited subject',
          emailBody: 'Please include imaging.',
        }),
      ]),
    );
    await expect(
      app
        .get(TasksService)
        .update({ ...user, id: 'someone-else' }, first.body.id, { emailBody: 'Unauthorized edit' }),
    ).rejects.toThrow('assignee');
    await expect(
      service.recordsRequest(user, patientId, { ...input, assigneeId: 'foreign' }),
    ).rejects.toThrow('active staff');
    await expect(
      service.recordsRequest(user, patientId, { ...input, contactId: foreignContactId }),
    ).rejects.toThrow('linked');
    await expect(
      app.get(TasksService).list({ ...user, locationId: 'another-location' }),
    ).resolves.toEqual([]);
  });
  it('rejects tomorrow at all patient-writing endpoints using clinic dates', async () => {
    const tomorrow = new Date(Date.now() + 24 * 3600000).toISOString().slice(0, 10);
    await request(app.getHttpServer())
      .patch(`/patients/${patientId}`)
      .send({ dateOfBirth: tomorrow })
      .expect(400);
    const client = await prisma.client.create({
      data: { organizationId: user.organizationId, firstName: 'Future', lastName: 'DOB' },
    });
    try {
      await request(app.getHttpServer())
        .post('/patients')
        .send({
          name: 'Future DOB',
          species: 'Dog',
          dateOfBirth: tomorrow,
          clients: [{ clientId: client.id, isPrimary: true }],
        })
        .expect(400);
      await request(app.getHttpServer())
        .post('/appointments/new-patient')
        .send({
          client: { firstName: 'Future', lastName: 'DOB' },
          patient: { name: 'Future DOB', species: 'Dog', dateOfBirth: tomorrow },
          appointment: {
            appointmentType: 'SickVisit',
            visitReason: 'Exam',
            startTime: new Date(Date.now() + 3600000).toISOString(),
          },
        })
        .expect(400);
    } finally {
      await prisma.client.delete({ where: { id: client.id } });
    }
  });
});
