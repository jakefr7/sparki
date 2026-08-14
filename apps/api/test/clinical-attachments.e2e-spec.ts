import type { INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { prisma } from '@sparki/db';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { AttachmentStorageService } from '../src/messaging/attachment-storage.service';
import { DEV_LOCATION_ID, DEV_ORGANIZATION_ID, DEV_USER_ID } from '../src/auth/development-user.service';

const SOURCE = 'clinical-attachments-e2e';
const pdf = (text = 'clinical') => Buffer.from(`%PDF-1.4\n${text}`).toString('base64');

describe('Clinical attachment lifecycle (e2e)', () => {
  let app: INestApplication;
  let patientId: string;
  let secondPatientId: string;
  let visitId: string;
  let otherOrganizationId: string;
  let otherLocationId: string;
  const storedKeys: string[] = [];

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>({ bodyParser: false });
    app.useBodyParser('json', { limit: '35mb' });
    await app.init();
    await request(app.getHttpServer()).get('/patients');

    const [patient, secondPatient, otherOrganization, otherLocation] = await Promise.all([
      prisma.patient.create({ data: { organizationId: DEV_ORGANIZATION_ID, name: 'Attachment Patient', species: 'Canine', sourceSystem: SOURCE } }),
      prisma.patient.create({ data: { organizationId: DEV_ORGANIZATION_ID, name: 'Wrong Association Patient', species: 'Feline', sourceSystem: SOURCE } }),
      prisma.organization.create({ data: { name: 'Attachment Other Organization' } }),
      prisma.location.create({ data: { organizationId: DEV_ORGANIZATION_ID, name: 'Attachment Other Location' } }),
    ]);
    patientId = patient.id;
    secondPatientId = secondPatient.id;
    otherOrganizationId = otherOrganization.id;
    otherLocationId = otherLocation.id;
    const visit = await prisma.visit.create({ data: { organizationId: DEV_ORGANIZATION_ID, locationId: DEV_LOCATION_ID, patientId, visitType: 'Scheduled', reason: 'Attachment audit', createdById: DEV_USER_ID } });
    visitId = visit.id;
  });

  afterAll(async () => {
    const attachments = await prisma.clinicalAttachment.findMany({ where: { OR: [{ patient: { sourceSystem: SOURCE } }, { organizationId: otherOrganizationId }] }, select: { storageKey: true } });
    storedKeys.push(...attachments.map(({ storageKey }) => storageKey));
    await prisma.clinicalAttachmentEvent.deleteMany({ where: { attachment: { OR: [{ patient: { sourceSystem: SOURCE } }, { organizationId: otherOrganizationId }] } } });
    await prisma.clinicalAttachment.deleteMany({ where: { OR: [{ patient: { sourceSystem: SOURCE } }, { organizationId: otherOrganizationId }] } });
    await prisma.soapNote.deleteMany({ where: { visit: { patient: { sourceSystem: SOURCE } } } });
    await prisma.visit.deleteMany({ where: { patient: { sourceSystem: SOURCE } } });
    await prisma.medicalRecord.deleteMany({ where: { patient: { sourceSystem: SOURCE } } });
    await prisma.patient.deleteMany({ where: { sourceSystem: SOURCE } });
    await prisma.location.deleteMany({ where: { id: otherLocationId } });
    await prisma.organization.deleteMany({ where: { id: otherOrganizationId } });
    const storage = app.get(AttachmentStorageService);
    await Promise.all(storedKeys.map((key) => storage.remove(key)));
    await app.close();
  });

  it('uploads and retrieves an allowed file in the authenticated tenant and location', async () => {
    const upload = await request(app.getHttpServer()).post('/clinical-attachments').send({ patientId, visitId, fileName: 'history.pdf', mimeType: 'application/pdf', contentBase64: pdf() }).expect(201);
    expect(upload.body).toMatchObject({ patientId, visitId, mimeType: 'application/pdf', sizeBytes: 17 });
    expect(upload.body.storageKey).toBeUndefined();
    const download = await request(app.getHttpServer()).get(`/clinical-attachments/${upload.body.id}/content`).expect(200);
    expect(download.headers['content-type']).toContain('application/pdf');
    expect(Buffer.from(download.body).subarray(0, 5).toString()).toBe('%PDF-');
    const patientOnly = await request(app.getHttpServer()).post('/clinical-attachments').send({ patientId, fileName: 'prior-history.pdf', mimeType: 'application/pdf', contentBase64: pdf('prior history') }).expect(201);
    expect(patientOnly.body).toMatchObject({ patientId, visitId: null });
    const history = await request(app.getHttpServer()).get(`/patients/${patientId}/workspace`).expect(200);
    expect(history.body.patientAttachments).toEqual(expect.arrayContaining([expect.objectContaining({ id: patientOnly.body.id, href: expect.stringContaining('/content') })]));
  });

  it('denies invalid, cross-organization, and cross-location associations and retrieval', async () => {
    const otherPatient = await prisma.patient.create({ data: { organizationId: otherOrganizationId, name: 'Other Tenant Patient', species: 'Canine', sourceSystem: SOURCE } });
    const otherVisit = await prisma.visit.create({ data: { organizationId: DEV_ORGANIZATION_ID, locationId: otherLocationId, patientId, visitType: 'Scheduled', reason: 'Other location' } });
    await request(app.getHttpServer()).post('/clinical-attachments').send({ patientId: secondPatientId, visitId, fileName: 'mismatch.pdf', mimeType: 'application/pdf', contentBase64: pdf() }).expect(400);
    await request(app.getHttpServer()).post('/clinical-attachments').send({ patientId: otherPatient.id, fileName: 'other.pdf', mimeType: 'application/pdf', contentBase64: pdf() }).expect(404);
    await request(app.getHttpServer()).post('/clinical-attachments').send({ visitId: otherVisit.id, fileName: 'other-location.pdf', mimeType: 'application/pdf', contentBase64: pdf() }).expect(404);

    const otherOrgAttachment = await prisma.clinicalAttachment.create({ data: { organizationId: otherOrganizationId, locationId: DEV_LOCATION_ID, patientId: otherPatient.id, fileName: 'private.pdf', mimeType: 'application/pdf', sizeBytes: 10, storageKey: `organizations/${otherOrganizationId}/locations/${DEV_LOCATION_ID}/clinical/not-public`, uploadedById: DEV_USER_ID } });
    const otherLocationAttachment = await prisma.clinicalAttachment.create({ data: { organizationId: DEV_ORGANIZATION_ID, locationId: otherLocationId, patientId, fileName: 'private-location.pdf', mimeType: 'application/pdf', sizeBytes: 10, storageKey: `organizations/${DEV_ORGANIZATION_ID}/locations/${otherLocationId}/clinical/not-public`, uploadedById: DEV_USER_ID } });
    await request(app.getHttpServer()).get(`/clinical-attachments/${otherOrgAttachment.id}/content`).expect(404);
    await request(app.getHttpServer()).get(`/clinical-attachments/${otherLocationAttachment.id}/content`).expect(404);
  });

  it('rejects an invalid file type and content larger than 25 MB', async () => {
    await request(app.getHttpServer()).post('/clinical-attachments').send({ patientId, fileName: 'script.txt', mimeType: 'text/plain', contentBase64: Buffer.from('text').toString('base64') }).expect(400);
    const tooLarge = Buffer.alloc(25 * 1024 * 1024 + 1, 0);
    tooLarge.write('%PDF-');
    const response = await request(app.getHttpServer()).post('/clinical-attachments').send({ patientId, fileName: 'large.pdf', mimeType: 'application/pdf', contentBase64: tooLarge.toString('base64') }).expect(400);
    expect(response.body.message).toContain('25 MB');
  });

  it('requires audited finalized correction/removal and preserves Medical History evidence', async () => {
    const medicalRecord = await prisma.medicalRecord.create({ data: { patientId } });
    await prisma.visit.update({ where: { id: visitId }, data: { medicalRecordId: medicalRecord.id } });
    await prisma.soapNote.create({ data: { medicalRecordId: medicalRecord.id, visitId, authorId: DEV_USER_ID, status: 'Locked', lockedAt: new Date(), version: 1 } });

    const original = await request(app.getHttpServer()).post('/clinical-attachments').send({ patientId, visitId, fileName: 'original.pdf', label: 'Original result', mimeType: 'application/pdf', contentBase64: pdf('original') }).expect(201);
    await request(app.getHttpServer()).put(`/clinical-attachments/${original.body.id}/remove`).send({ reason: 'wrong patient result' }).expect(400);
    const replacement = await request(app.getHttpServer()).post('/clinical-attachments').send({ patientId, visitId, replacesAttachmentId: original.body.id, correctionReason: 'Corrected laboratory result', fileName: 'corrected.pdf', label: 'Corrected result', mimeType: 'application/pdf', contentBase64: pdf('corrected') }).expect(201);

    const removable = await request(app.getHttpServer()).post('/clinical-attachments').send({ patientId, visitId, fileName: 'remove.pdf', label: 'Remove result', mimeType: 'application/pdf', contentBase64: pdf('remove') }).expect(201);
    await request(app.getHttpServer()).put(`/clinical-attachments/${removable.body.id}/remove`).send({ reason: 'Attached in error', auditedFinalizedRemoval: true }).expect(200);
    await request(app.getHttpServer()).get(`/clinical-attachments/${original.body.id}/content`).expect(404);
    await request(app.getHttpServer()).get(`/clinical-attachments/${removable.body.id}/content`).expect(404);
    await request(app.getHttpServer()).get(`/clinical-attachments/${replacement.body.id}/content`).expect(200);

    const history = await request(app.getHttpServer()).get(`/patients/${patientId}/workspace`).expect(200);
    const projected = history.body.recentVisits.find((visit: { id: string }) => visit.id === visitId).attachments as Array<{ id: string; href: string | null; removedAt: string | null; supersededById: string | null; auditEvents: Array<{ action: string; reason: string; actor: { firstName: string } }> }>;
    expect(projected.find((item) => item.id === original.body.id)).toMatchObject({ href: null, supersededById: replacement.body.id });
    expect(projected.find((item) => item.id === original.body.id)?.auditEvents).toEqual(expect.arrayContaining([expect.objectContaining({ action: 'SUPERSEDED', reason: 'Corrected laboratory result', actor: expect.objectContaining({ firstName: 'Development' }) })]));
    expect(projected.find((item) => item.id === removable.body.id)).toMatchObject({ href: null });
    expect(projected.find((item) => item.id === removable.body.id)?.auditEvents).toEqual(expect.arrayContaining([expect.objectContaining({ action: 'REMOVED_FROM_FINALIZED_HISTORY', reason: 'Attached in error' })]));
    expect(projected.find((item) => item.id === replacement.body.id)?.href).toContain('/content');
  });
});
