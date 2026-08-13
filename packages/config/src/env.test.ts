import { beforeEach, describe, expect, it } from 'vitest';
import { loadApiEnv, loadWebEnv, resetEnvCacheForTests } from './env';

describe('loadApiEnv', () => {
  beforeEach(() => {
    resetEnvCacheForTests();
  });

  it('applies defaults and coerces the API port', () => {
    const env = loadApiEnv({
      DATABASE_URL: 'postgresql://localhost:5432/db',
    } as NodeJS.ProcessEnv);

    expect(env.NODE_ENV).toBe('development');
    expect(env.API_PORT).toBe(4000);
    expect(env.SPARKI_DEVELOPMENT_AUTH).toBe('disabled');
  });

  it('throws a readable error when DATABASE_URL is missing', () => {
    expect(() => loadApiEnv({} as NodeJS.ProcessEnv)).toThrow(/Invalid environment configuration/);
  });

  it('caches the parsed result across calls', () => {
    const first = loadApiEnv({
      DATABASE_URL: 'postgresql://localhost:5432/db',
    } as NodeJS.ProcessEnv);
    const second = loadApiEnv({
      DATABASE_URL: 'postgresql://ignored:5432/db',
    } as NodeJS.ProcessEnv);

    expect(second).toBe(first);
  });

  it('accepts explicit fixed auth for local and test execution', () => {
    const env = loadApiEnv({
      DATABASE_URL: 'postgresql://localhost:5432/db',
      NODE_ENV: 'test',
      SPARKI_DEVELOPMENT_AUTH: 'fixed',
    } as NodeJS.ProcessEnv);

    expect(env.SPARKI_DEVELOPMENT_AUTH).toBe('fixed');
  });

  it('rejects fixed development auth in production', () => {
    expect(() => loadApiEnv({
      DATABASE_URL: 'postgresql://localhost:5432/db',
      NODE_ENV: 'production',
      SPARKI_DEVELOPMENT_AUTH: 'fixed',
    } as NodeJS.ProcessEnv)).toThrow(/must be disabled in production/);
  });

  it('rejects partially configured WorkOS credentials', () => {
    expect(() => loadApiEnv({
      DATABASE_URL: 'postgresql://localhost:5432/db',
      WORKOS_API_KEY: 'sk_test',
    } as NodeJS.ProcessEnv)).toThrow(/must be configured together/);
  });

  it('treats blank optional WorkOS values as unconfigured', () => {
    const env = loadApiEnv({
      DATABASE_URL: 'postgresql://localhost:5432/db',
      WORKOS_API_KEY: '',
      WORKOS_CLIENT_ID: '',
      WORKOS_COOKIE_PASSWORD: '',
    } as NodeJS.ProcessEnv);

    expect(env.WORKOS_API_KEY).toBeUndefined();
    expect(env.WORKOS_COOKIE_PASSWORD).toBeUndefined();
  });
});

describe('loadWebEnv', () => {
  beforeEach(() => {
    resetEnvCacheForTests();
  });

  it('does not require DATABASE_URL', () => {
    const env = loadWebEnv({} as NodeJS.ProcessEnv);
    expect(env.API_URL).toBe('http://localhost:4000');
    expect(env.WEB_PORT).toBe(3000);
  });
});
