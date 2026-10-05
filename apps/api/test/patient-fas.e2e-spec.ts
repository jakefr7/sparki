import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { prismaUnscoped as db } from '@sparki/db';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import {
  DEV_LOCATION_ID,
  DEV_ORGANIZATION_ID,
  DEV_USER_ID,
} from '../src/auth/development-user.service';

describe('FAS assessments (isolated e2e)', () => {
  let app: INestApplication;
  let patientId: string;
  let visitId: string;
  let otherOrgId: string;
  let otherLocationId: string;
  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication();
    await app.init();
    await request(app.getHttpServer()).get('/patients');
    const patient = await db.patient.create({
      data: {
        name: 'Synthetic FAS patient',
        species: 'Canine',
        organizationId: DEV_ORGANIZATION_ID,
      },
    });
    patientId = patient.id;
    const visit = await db.visit.create({
      data: {
        organizationId: DEV_ORGANIZATION_ID,
        locationId: DEV_LOCATION_ID,
        patientId,
        reason: 'Synthetic FAS test',
        visitType: 'WalkIn',
        state: 'IntakeInProgress',
      },
    });
    visitId = visit.id;
    const org = await db.organization.create({ data: { name: 'Other FAS test clinic' } });
    otherOrgId = org.id;
    const location = await db.location.create({
      data: { organizationId: DEV_ORGANIZATION_ID, name: 'Other FAS test location' },
    });
    otherLocationId = location.id;
  });
  afterAll(async () => {
    await db.patientFasAssessment.deleteMany({ where: { patientId } });
    await db.soapNote.deleteMany({ where: { visitId } });
    await db.visit.deleteMany({ where: { patientId } });
    await db.patient.delete({ where: { id: patientId } });
    await db.location.delete({ where: { id: otherLocationId } });
    await db.patient.deleteMany({ where: { organizationId: otherOrgId } });
    await db.organization.delete({ where: { id: otherOrgId } });
    await app.close();
  });
  it('preserves score zero, repeated observations and retry identity; rejects forged author and invalid scores', async () => {
    const payload = { requestId: randomUUID(), score: 0, handlingNotes: 'Quiet approach helped.' };
    const first = await request(app.getHttpServer())
      .post(`/visits/${visitId}/fas`)
      .send(payload)
      .expect(201);
    expect(first.body).toMatchObject({ score: 0, authorId: DEV_USER_ID, patientId, visitId });
    const retry = await request(app.getHttpServer())
      .post(`/visits/${visitId}/fas`)
      .send(payload)
      .expect(201);
    expect(retry.body.id).toBe(first.body.id);
    await request(app.getHttpServer())
      .post(`/visits/${visitId}/fas`)
      .send({ ...payload, score: 3 })
      .expect(409);
    await request(app.getHttpServer())
      .post(`/visits/${visitId}/fas`)
      .send({ requestId: randomUUID(), score: 3, handlingNotes: 'Behavior changed during exam.' })
      .expect(201);
    const history = await request(app.getHttpServer())
      .get(`/patients/${patientId}/fas`)
      .expect(200);
    expect(history.body.items.map((entry: { score: number }) => entry.score)).toEqual([3, 0]);
    for (const score of [-1, 6, 1.5])
      await request(app.getHttpServer())
        .post(`/visits/${visitId}/fas`)
        .send({ requestId: randomUUID(), score })
        .expect(400);
    await request(app.getHttpServer())
      .post(`/visits/${visitId}/fas`)
      .send({ requestId: randomUUID(), score: 2, authorId: 'forged' })
      .expect(400);
  });
  it('isolates other organizations, other locations, and pagination cursors', async () => {
    const foreign = await db.patient.create({
      data: { name: 'Other clinic patient', species: 'Feline', organizationId: otherOrgId },
    });
    await request(app.getHttpServer()).get(`/patients/${foreign.id}/fas`).expect(404);
    const hiddenVisit = await db.visit.create({
      data: {
        organizationId: DEV_ORGANIZATION_ID,
        locationId: otherLocationId,
        patientId,
        reason: 'Other location',
        visitType: 'WalkIn',
      },
    });
    await request(app.getHttpServer())
      .post(`/visits/${hiddenVisit.id}/fas`)
      .send({ requestId: randomUUID(), score: 2 })
      .expect(404);
    const hidden = await db.patientFasAssessment.create({
      data: {
        organizationId: DEV_ORGANIZATION_ID,
        locationId: otherLocationId,
        patientId,
        visitId: hiddenVisit.id,
        requestId: randomUUID(),
        score: 5,
        authorId: DEV_USER_ID,
        authorName: 'Other location observer',
        authorRole: 'OWNER',
      },
    });
    const history = await request(app.getHttpServer())
      .get(`/patients/${patientId}/fas`)
      .expect(200);
    expect(history.body.items).toHaveLength(2);
    await request(app.getHttpServer())
      .get(`/patients/${patientId}/fas?cursor=${hidden.id}`)
      .expect(404);
    for (let i = 0; i < 22; i++)
      await db.patientFasAssessment.create({
        data: {
          organizationId: DEV_ORGANIZATION_ID,
          locationId: DEV_LOCATION_ID,
          patientId,
          visitId,
          requestId: randomUUID(),
          score: 1,
          authorId: DEV_USER_ID,
          authorName: 'Observer',
          authorRole: 'OWNER',
        },
      });
    const page = await request(app.getHttpServer()).get(`/patients/${patientId}/fas`).expect(200);
    expect(page.body.items).toHaveLength(20);
    const next = await request(app.getHttpServer())
      .get(`/patients/${patientId}/fas?cursor=${page.body.nextCursor}`)
      .expect(200);
    expect(next.body.items).toHaveLength(4);
    expect(next.body.nextCursor).toBeNull();
  });
  it('prevents fresh entries on signed or closed visits', async () => {
    const record = await db.medicalRecord.create({ data: { patientId } });
    await db.soapNote.create({
      data: {
        medicalRecordId: record.id,
        visitId,
        authorId: DEV_USER_ID,
        veterinarianId: DEV_USER_ID,
        status: 'Locked',
      },
    });
    await request(app.getHttpServer())
      .post(`/visits/${visitId}/fas`)
      .send({ requestId: randomUUID(), score: 2 })
      .expect(409);
    await db.soapNote.deleteMany({ where: { visitId } });
    await db.visit.update({ where: { id: visitId }, data: { state: 'Archived' } });
    await request(app.getHttpServer())
      .post(`/visits/${visitId}/fas`)
      .send({ requestId: randomUUID(), score: 2 })
      .expect(409);
    await db.medicalRecord.delete({ where: { id: record.id } });
  });
});
