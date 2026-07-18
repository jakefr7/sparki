import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';

describe('Address (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    // These assertions exercise the explicitly unconfigured behavior. Keep
    // them deterministic even when a developer has a real Mapbox token in
    // their local environment.
    const mapboxToken = process.env.MAPBOX_ACCESS_TOKEN;
    delete process.env.MAPBOX_ACCESS_TOKEN;
    try {
      const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
      app = moduleRef.createNestApplication();
      await app.init();
    } finally {
      if (mapboxToken) process.env.MAPBOX_ACCESS_TOKEN = mapboxToken;
    }
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET /address/autocomplete', () => {
    it('reports when no provider token is configured in this environment', async () => {
      const response = await request(app.getHttpServer())
        .get('/address/autocomplete')
        .query({ query: '123 Main St', sessionToken: 'session-1' });

      expect(response.status).toBe(503);
      expect(response.body.message).toBe('Address search is not configured.');
    });

    it('rejects a query shorter than 3 characters', async () => {
      const response = await request(app.getHttpServer())
        .get('/address/autocomplete')
        .query({ query: 'ab', sessionToken: 'session-1' });

      expect(response.status).toBe(400);
    });

    it('rejects a missing sessionToken', async () => {
      const response = await request(app.getHttpServer())
        .get('/address/autocomplete')
        .query({ query: '123 Main St' });

      expect(response.status).toBe(400);
    });
  });

  describe('GET /address/details', () => {
    it('reports when no provider token is configured in this environment', async () => {
      const response = await request(app.getHttpServer())
        .get('/address/details')
        .query({ placeId: 'place-1', sessionToken: 'session-1' });

      expect(response.status).toBe(503);
      expect(response.body.message).toBe('Address search is not configured.');
    });

    it('rejects a missing placeId', async () => {
      const response = await request(app.getHttpServer())
        .get('/address/details')
        .query({ sessionToken: 'session-1' });

      expect(response.status).toBe(400);
    });
  });
});
