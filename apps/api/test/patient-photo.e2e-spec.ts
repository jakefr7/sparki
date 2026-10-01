import type { INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { prisma } from '@sparki/db';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { AppConfigService } from '../src/config/app-config.service';
import { AttachmentStorageService } from '../src/messaging/attachment-storage.service';
import { DEV_ORGANIZATION_ID } from '../src/auth/development-user.service';

const SOURCE = 'patient-photo-e2e';

// Smallest possible valid 1x1 GIF, used as JPEG/PNG/WEBP are harder to fake
// minimally and the magic-byte check only inspects the declared type's own
// signature — a 'GIF87a' body declared as image/gif is sufficient here.
const gif = () => Buffer.from('GIF87a' + 'x'.repeat(10)).toString('base64');

describe('Patient photo upload/content lifecycle (e2e)', () => {
  let app: INestApplication;
  let patientId: string;
  let otherOrganizationId: string;
  let otherOrgPatientId: string;
  let webOrigin: string;
  const storedKeys: string[] = [];

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>({ bodyParser: false });
    // An 8 MB photo expands to roughly 10.7 MB as base64 JSON — matches the
    // production bootstrap's own json() limit (main.ts), just scoped smaller
    // here since this suite's uploads are tiny.
    app.useBodyParser('json', { limit: '12mb' });
    await app.init();

    // Create the foreign-tenant fixtures *before* any authenticated request.
    // TenantContextGuard binds the dev organization to an AsyncLocalStorage
    // context that the tenant-scoping Prisma extension (packages/db/src/
    // tenant-scoping.ts) then uses to force organizationId on every
    // `create` — including these raw prisma fixture calls, since they run
    // in the same continuation as the request below. Creating them first
    // (context not entered yet) keeps the explicit organizationId.
    const otherOrganization = await prisma.organization.create({ data: { name: 'Patient Photo Other Organization' } });
    otherOrganizationId = otherOrganization.id;
    const otherOrgPatient = await prisma.patient.create({ data: { organizationId: otherOrganizationId, name: 'Other Tenant Patient', species: 'Feline', sourceSystem: SOURCE } });
    otherOrgPatientId = otherOrgPatient.id;

    await request(app.getHttpServer()).get('/patients');
    webOrigin = app.get(AppConfigService).webOrigin;
    const patient = await prisma.patient.create({ data: { organizationId: DEV_ORGANIZATION_ID, name: 'Photo Patient', species: 'Canine', sourceSystem: SOURCE } });
    patientId = patient.id;
  });

  afterAll(async () => {
    const patients = await prisma.patient.findMany({ where: { sourceSystem: SOURCE }, select: { imageStorageKey: true } });
    storedKeys.push(...patients.map(({ imageStorageKey }) => imageStorageKey).filter((key): key is string => Boolean(key)));
    // Raw SQL, not prisma.patient.deleteMany: by now a dev-organization
    // tenant context is active (see the beforeAll comment above), and the
    // tenant-scoping extension would silently AND an organizationId filter
    // onto a scoped deleteMany, leaving the other-organization fixture row
    // behind and failing the Organization delete below on its FK.
    await prisma.$executeRaw`DELETE FROM "Patient" WHERE "sourceSystem" = ${SOURCE}`;
    await prisma.$executeRaw`DELETE FROM "Organization" WHERE "id" = ${otherOrganizationId}`;
    const storage = app.get(AttachmentStorageService);
    await Promise.all(storedKeys.map((key) => storage.remove(key).catch(() => undefined)));
    await app.close();
  });

  it('uploads a photo to object storage and serves it back from the authenticated content endpoint', async () => {
    const upload = await request(app.getHttpServer())
      .post(`/patients/${patientId}/photo`)
      .send({ fileName: 'murph.gif', mimeType: 'image/gif', contentBase64: gif() })
      .expect(201);

    expect(upload.body.imageUrl).toBe(`${webOrigin}/api/patients/${patientId}/photo/content`);

    const content = await request(app.getHttpServer()).get(`/patients/${patientId}/photo/content`).expect(200);
    expect(content.headers['content-type']).toBe('image/gif');
    expect(Buffer.from(content.body).subarray(0, 6).toString()).toBe('GIF87a');
  });

  it('rejects an unreadable image, a type mismatch, and an oversized upload', async () => {
    await request(app.getHttpServer())
      .post(`/patients/${patientId}/photo`)
      .send({ fileName: 'not-base64.gif', mimeType: 'image/gif', contentBase64: '***not base64***' })
      .expect(400);

    await request(app.getHttpServer())
      .post(`/patients/${patientId}/photo`)
      .send({ fileName: 'mismatch.gif', mimeType: 'image/gif', contentBase64: Buffer.from('not actually a gif').toString('base64') })
      .expect(400);

    const tooLarge = Buffer.alloc(8 * 1024 * 1024 + 1, 0);
    tooLarge.write('GIF87a');
    await request(app.getHttpServer())
      .post(`/patients/${patientId}/photo`)
      .send({ fileName: 'large.gif', mimeType: 'image/gif', contentBase64: tooLarge.toString('base64') })
      .expect(400);
  });

  it('denies uploading to, and fetching the photo of, a patient in another organization', async () => {
    await request(app.getHttpServer())
      .post(`/patients/${otherOrgPatientId}/photo`)
      .send({ fileName: 'intrusion.gif', mimeType: 'image/gif', contentBase64: gif() })
      .expect(404);
    await request(app.getHttpServer()).get(`/patients/${otherOrgPatientId}/photo/content`).expect(404);
  });

  it('404s when no photo has been uploaded yet', async () => {
    const patient = await prisma.patient.create({ data: { organizationId: DEV_ORGANIZATION_ID, name: 'No Photo Patient', species: 'Canine', sourceSystem: SOURCE } });
    await request(app.getHttpServer()).get(`/patients/${patient.id}/photo/content`).expect(404);
  });

  it('clears the stored photo key, and stops serving the old object, when imageUrl is edited directly', async () => {
    const patient = await prisma.patient.create({ data: { organizationId: DEV_ORGANIZATION_ID, name: 'Replaced Photo Patient', species: 'Canine', sourceSystem: SOURCE } });
    await request(app.getHttpServer())
      .post(`/patients/${patient.id}/photo`)
      .send({ fileName: 'before.gif', mimeType: 'image/gif', contentBase64: gif() })
      .expect(201);

    await request(app.getHttpServer()).patch(`/patients/${patient.id}`).send({ imageUrl: 'https://example.com/external-photo.jpg' }).expect(200);

    await request(app.getHttpServer()).get(`/patients/${patient.id}/photo/content`).expect(404);
  });
});
