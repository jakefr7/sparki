import type { INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { prisma, prismaUnscoped } from '@sparki/db';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { DEV_LOCATION_ID, DEV_ORGANIZATION_ID, DEV_USER_ID } from '../src/auth/development-user.service';
import { ProfileAvatarService } from '../src/auth/profile-avatar.service';

const image = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=', 'base64');
const upload = { fileName: 'profile.png', mimeType: 'image/png', contentBase64: image.toString('base64') };
const apiPath = (url: string) => url.replace(/^\/api/, '');

describe('Profile photo upload and authenticated content', () => {
  let app: INestApplication;
  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>({ bodyParser: false });
    app.useBodyParser('json', { limit: '12mb' });
    await app.init();
    await request(app.getHttpServer()).get('/auth/profile').expect(200);
  });
  afterAll(async () => { await app.close(); });

  it('serves a newly uploaded image immediately, retains identity fields and revokes replaced/removed URLs', async () => {
    const before = (await request(app.getHttpServer()).get('/auth/profile')).body;
    const first = await request(app.getHttpServer()).post('/auth/profile/avatar').send(upload).expect(201);
    expect(first.body.avatarUrl).toMatch(/^\/api\/auth\/profile\/avatar\//);
    expect(first.body).toMatchObject({ id: DEV_USER_ID, displayName: before.displayName, phone: before.phone, statusEmoji: before.statusEmoji, statusText: before.statusText });
    const content = await request(app.getHttpServer()).get(apiPath(first.body.avatarUrl)).expect(200);
    expect(content.headers['content-type']).toContain('image/png');
    expect(content.headers['cache-control']).toBe('private, no-store');
    expect(content.headers['x-content-type-options']).toBe('nosniff');
    expect(Buffer.from(content.body)).toEqual(image);
    await request(app.getHttpServer()).get(apiPath(first.body.avatarUrl)).set('Cookie', 'sparki_session=invalid').expect(401);
    const second = await request(app.getHttpServer()).post('/auth/profile/avatar').send(upload).expect(201);
    expect(second.body.avatarUrl).not.toBe(first.body.avatarUrl);
    await request(app.getHttpServer()).get(apiPath(first.body.avatarUrl)).expect(404);
    expect((await request(app.getHttpServer()).delete('/auth/profile/avatar').expect(200)).body.avatarUrl).toBeNull();
    await request(app.getHttpServer()).get(apiPath(second.body.avatarUrl)).expect(404);
  });

  it('rejects corrupt, mismatched and oversized images without changing the saved profile', async () => {
    const before = await prisma.user.findUniqueOrThrow({ where: { id: DEV_USER_ID } });
    await request(app.getHttpServer()).post('/auth/profile/avatar').send({ ...upload, contentBase64: '!not base64!' }).expect(400);
    await request(app.getHttpServer()).post('/auth/profile/avatar').send({ ...upload, mimeType: 'image/jpeg' }).expect(400);
    await request(app.getHttpServer()).post('/auth/profile/avatar').send({ ...upload, contentBase64: Buffer.alloc(5 * 1024 * 1024 + 1).toString('base64') }).expect(400);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: DEV_USER_ID } })).avatarUrl).toBe(before.avatarUrl);
  });

  it('denies content from another clinic or an inaccessible location, and rejects invalid resource IDs', async () => {
    const organization = await prismaUnscoped.organization.create({ data: { name: 'Profile avatar other clinic' } });
    const imageId = '11111111-1111-4111-8111-111111111111';
    for (const organizationId of [organization.id, DEV_ORGANIZATION_ID]) {
      const owner = await prismaUnscoped.user.create({ data: { organizationId, firstName: 'Other', lastName: 'Avatar', email: `${organizationId}-avatar@example.test`, role: 'VETERINARIAN' } });
      const url = `/api/auth/profile/avatar/${owner.id}/${imageId}`;
      await prismaUnscoped.user.update({ where: { id: owner.id }, data: { avatarUrl: url } });
      await request(app.getHttpServer()).get(apiPath(url)).expect(404);
    }
    await request(app.getHttpServer()).get(`/auth/profile/avatar/${DEV_USER_ID}/not-a-uuid`).expect(404);
  });

  it('lets clinic colleagues read the current avatar, but denies it after their location access is removed', async () => {
    const owner = await prismaUnscoped.user.create({ data: { organizationId: DEV_ORGANIZATION_ID, firstName: 'Colleague', lastName: 'Avatar', email: 'colleague-avatar@example.test', role: 'VETERINARIAN' } });
    const access = await prismaUnscoped.clinicLocationAccess.create({ data: { organizationId: DEV_ORGANIZATION_ID, clinicLocationId: DEV_LOCATION_ID, userId: owner.id, role: 'VETERINARIAN' } });
    const profile = await app.get(ProfileAvatarService).upload({ id: owner.id, organizationId: DEV_ORGANIZATION_ID } as never, upload);
    const url = apiPath(profile.avatarUrl!);
    await request(app.getHttpServer()).get(url).expect(200);
    await prismaUnscoped.clinicLocationAccess.update({ where: { id: access.id }, data: { isActive: false } });
    await request(app.getHttpServer()).get(url).expect(404);
  });
});
