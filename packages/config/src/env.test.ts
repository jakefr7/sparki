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
