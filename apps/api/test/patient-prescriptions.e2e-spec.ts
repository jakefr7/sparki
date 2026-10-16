import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { prisma } from '@sparki/db';
import request from 'supertest';
import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { DEV_LOCATION_ID, DEV_ORGANIZATION_ID } from '../src/auth/development-user.service';
import { PatientPrescriptionsService, prescriptionDateOfBirth } from '../src/patients/patient-prescriptions.service';
import type { AuthenticatedUser } from '../src/auth/types';

describe('Patient prescriptions', () => {
  let app: INestApplication;
  let patientId: string;
  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication(); await app.init();
    await request(app.getHttpServer()).get('/patients');
    const patient = await prisma.patient.create({ data: { name: 'Prescription fixture', species: 'Canine', organizationId: DEV_ORGANIZATION_ID } });
    patientId = patient.id;
  });
  afterAll(async () => {
    await prisma.patientPrescriptionEvent.deleteMany({ where: { prescription: { patientId } } });
    await prisma.patientPrescription.deleteMany({ where: { patientId } });
    await prisma.patient.delete({ where: { id: patientId } });
    await app.close();
  });
  const draft = { medicationName: 'Sample medication', strength: 'Sample strength', directions: 'Reviewed sample directions for a test fixture.', quantity: '30', quantityUnit: 'tablets', allowedRefills: 1, expiresAt: '2030-01-01T00:00:00Z' };
  it('supports draft, clinician authorization, PDF, cancellation, and immutable authorization', async () => {
    const prepared = await request(app.getHttpServer()).post(`/patients/${patientId}/prescriptions`).send(draft);
    expect(prepared.status).toBe(201);
    expect(prepared.body.status).toBe('DRAFT');
    const id = prepared.body.id as string;
    expect((await request(app.getHttpServer()).get(`/patients/${patientId}/prescriptions/${id}/pdf`)).status).toBe(409);
    // SPA-40: a prescription carries the patient's date of birth, so authorizing waits for one.
    const listed = await request(app.getHttpServer()).get(`/patients/${patientId}/prescriptions`);
    expect(listed.body.patient).toEqual({ dateOfBirth: null, dateOfBirthEstimated: false });
    const withoutDateOfBirth = await request(app.getHttpServer()).post(`/patients/${patientId}/prescriptions/${id}/authorize`).send({ version: 1 });
    expect(withoutDateOfBirth.status).toBe(409);
    expect(withoutDateOfBirth.body.message).toContain('date of birth or estimated age');
    expect((await request(app.getHttpServer()).patch(`/patients/${patientId}`).send({ dateOfBirth: '2021-03-04', dateOfBirthEstimated: true })).status).toBe(200);
    const authorized = await request(app.getHttpServer()).post(`/patients/${patientId}/prescriptions/${id}/authorize`).send({ version: 1 });
    expect(authorized.status).toBe(201);
    expect(authorized.body.status).toBe('AUTHORIZED');
    expect(authorized.body.authorizedById).toBeTruthy();
    expect((await request(app.getHttpServer()).post(`/patients/${patientId}/prescriptions/${id}/authorize`).send({ version: 1 })).status).toBe(409);
    const pdf = await request(app.getHttpServer()).get(`/patients/${patientId}/prescriptions/${id}/pdf`);
    expect(pdf.status).toBe(200); expect(pdf.headers['content-type']).toContain('application/pdf');
    // Downloading an authorized prescription also needs the date of birth.
    await prisma.patient.update({ where: { id: patientId }, data: { dateOfBirth: null, dateOfBirthEstimated: false } });
    const pdfWithoutDateOfBirth = await request(app.getHttpServer()).get(`/patients/${patientId}/prescriptions/${id}/pdf`);
    expect(pdfWithoutDateOfBirth.status).toBe(409);
    expect(pdfWithoutDateOfBirth.body.message).toContain('date of birth or estimated age');
    const cancelled = await request(app.getHttpServer()).post(`/patients/${patientId}/prescriptions/${id}/cancel`).send({ version: 2, reason: 'Test correction' });
    expect(cancelled.status).toBe(201);
    expect((await request(app.getHttpServer()).get(`/patients/${patientId}/prescriptions/${id}/pdf`)).status).toBe(409);
    expect(await prisma.patientPrescriptionEvent.count({ where: { prescriptionId: id } })).toBe(3);
  });
  it('prints the date of birth as MM/DD/YYYY on its calendar day', () => {
    expect(prescriptionDateOfBirth(new Date('2021-03-04T00:00:00.000Z'))).toBe('03/04/2021');
    expect(prescriptionDateOfBirth(new Date('2019-12-31T00:00:00.000Z'))).toBe('12/31/2019');
  });
  it('allows technicians to prepare but rejects their authorization; isolates location and organization', async () => {
    const service = app.get(PatientPrescriptionsService);
    const technician = { id: 'dev-user', role: 'TECHNICIAN', organizationId: DEV_ORGANIZATION_ID, locationId: DEV_LOCATION_ID } as AuthenticatedUser;
    const prepared = await service.create(technician, patientId, { ...draft, expiresAt: new Date(draft.expiresAt) });
    await expect(service.action(technician, patientId, prepared.id, 'authorize', { version: 1 })).rejects.toThrow('Only a veterinarian');
    await expect(service.list({ ...technician, organizationId: 'foreign' }, patientId)).rejects.toThrow('Patient not found');
    const foreignLocation = await service.list({ ...technician, locationId: 'foreign' }, patientId);
    expect(foreignLocation.prescriptions).toEqual([]);
  });
});
