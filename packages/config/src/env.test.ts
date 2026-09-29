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

  it('boots in production with no attachment storage configured', () => {
    const env = loadApiEnv({
      DATABASE_URL: 'postgresql://localhost:5432/db',
      NODE_ENV: 'production',
    } as NodeJS.ProcessEnv);

    expect(env.ATTACHMENT_S3_ENDPOINT).toBeUndefined();
  });

  it('rejects partially configured attachment storage regardless of environment', () => {
    expect(() => loadApiEnv({
      DATABASE_URL: 'postgresql://localhost:5432/db',
      ATTACHMENT_S3_ENDPOINT: 'https://objects.example.test',
    } as NodeJS.ProcessEnv)).toThrow(/Complete S3-compatible attachment storage configuration is required/);

    resetEnvCacheForTests();
    expect(() => loadApiEnv({
      DATABASE_URL: 'postgresql://localhost:5432/db',
      NODE_ENV: 'production',
      ATTACHMENT_S3_ENDPOINT: 'https://objects.example.test',
    } as NodeJS.ProcessEnv)).toThrow(/Complete S3-compatible attachment storage configuration is required/);
  });

  it('accepts complete private attachment storage configuration in production', () => {
    const env = loadApiEnv({
      DATABASE_URL: 'postgresql://localhost:5432/db',
      NODE_ENV: 'production',
      ATTACHMENT_S3_ENDPOINT: 'https://objects.example.test',
      ATTACHMENT_S3_REGION: 'us-east-1',
      ATTACHMENT_S3_BUCKET: 'private-messaging',
      ATTACHMENT_S3_ACCESS_KEY_ID: 'access-key',
      ATTACHMENT_S3_SECRET_ACCESS_KEY: 'secret-key',
      STRIPE_SECRET_KEY: 'sk_live_example',
      STRIPE_WEBHOOK_SECRET: 'whsec_example',
      STRIPE_PRICE_STANDARD: 'price_live_example',
      RESEND_API_KEY: 're_example',
      EMAIL_FROM: 'onboarding@sparki.test',
    } as NodeJS.ProcessEnv);

    expect(env.ATTACHMENT_S3_BUCKET).toBe('private-messaging');
  });

  it('boots without Stripe or email configured outside production', () => {
    const env = loadApiEnv({
      DATABASE_URL: 'postgresql://localhost:5432/db',
    } as NodeJS.ProcessEnv);

    expect(env.STRIPE_SECRET_KEY).toBeUndefined();
    expect(env.RESEND_API_KEY).toBeUndefined();
  });

  it('rejects partially configured Stripe credentials', () => {
    expect(() => loadApiEnv({
      DATABASE_URL: 'postgresql://localhost:5432/db',
      STRIPE_SECRET_KEY: 'sk_test',
    } as NodeJS.ProcessEnv)).toThrow(/STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, and STRIPE_PRICE_STANDARD are required together/);
  });

  it('rejects a Stripe key/secret pair with no approved STANDARD plan price', () => {
    expect(() => loadApiEnv({
      DATABASE_URL: 'postgresql://localhost:5432/db',
      STRIPE_SECRET_KEY: 'sk_test',
      STRIPE_WEBHOOK_SECRET: 'whsec_test',
    } as NodeJS.ProcessEnv)).toThrow(/STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, and STRIPE_PRICE_STANDARD are required together/);
  });

  it('rejects partially configured Stripe credentials in production', () => {
    expect(() => loadApiEnv({
      DATABASE_URL: 'postgresql://localhost:5432/db',
      NODE_ENV: 'production',
      STRIPE_SECRET_KEY: 'sk_live_example',
      STRIPE_WEBHOOK_SECRET: 'whsec_example',
    } as NodeJS.ProcessEnv)).toThrow(/STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, and STRIPE_PRICE_STANDARD are required together/);
  });

  it('accepts a complete Stripe key/secret/price set outside production', () => {
    const env = loadApiEnv({
      DATABASE_URL: 'postgresql://localhost:5432/db',
      STRIPE_SECRET_KEY: 'sk_test',
      STRIPE_WEBHOOK_SECRET: 'whsec_test',
      STRIPE_PRICE_STANDARD: 'price_test_standard',
    } as NodeJS.ProcessEnv);

    expect(env.STRIPE_PRICE_STANDARD).toBe('price_test_standard');
  });

  it('rejects partially configured email credentials', () => {
    expect(() => loadApiEnv({
      DATABASE_URL: 'postgresql://localhost:5432/db',
      EMAIL_FROM: 'onboarding@sparki.test',
    } as NodeJS.ProcessEnv)).toThrow(/RESEND_API_KEY and EMAIL_FROM are required together/);
  });

  it('rejects partially configured email credentials in production', () => {
    expect(() => loadApiEnv({
      DATABASE_URL: 'postgresql://localhost:5432/db',
      NODE_ENV: 'production',
      EMAIL_FROM: 'onboarding@sparki.test',
    } as NodeJS.ProcessEnv)).toThrow(/RESEND_API_KEY and EMAIL_FROM are required together/);
  });

  it('boots in production with no storage, Stripe, or email configured', () => {
    const env = loadApiEnv({
      DATABASE_URL: 'postgresql://localhost:5432/db',
      NODE_ENV: 'production',
    } as NodeJS.ProcessEnv);

    expect(env.STRIPE_SECRET_KEY).toBeUndefined();
    expect(env.RESEND_API_KEY).toBeUndefined();
    expect(env.ATTACHMENT_S3_ENDPOINT).toBeUndefined();
  });

  it('accepts complete Stripe and email configuration in production', () => {
    const env = loadApiEnv({
      DATABASE_URL: 'postgresql://localhost:5432/db',
      NODE_ENV: 'production',
      ATTACHMENT_S3_ENDPOINT: 'https://objects.example.test',
      ATTACHMENT_S3_REGION: 'us-east-1',
      ATTACHMENT_S3_BUCKET: 'private-messaging',
      ATTACHMENT_S3_ACCESS_KEY_ID: 'access-key',
      ATTACHMENT_S3_SECRET_ACCESS_KEY: 'secret-key',
      STRIPE_SECRET_KEY: 'sk_live_example',
      STRIPE_WEBHOOK_SECRET: 'whsec_example',
      STRIPE_PRICE_STANDARD: 'price_live_example',
      RESEND_API_KEY: 're_example',
      EMAIL_FROM: 'onboarding@sparki.test',
    } as NodeJS.ProcessEnv);

    expect(env.STRIPE_SECRET_KEY).toBe('sk_live_example');
    expect(env.STRIPE_PRICE_STANDARD).toBe('price_live_example');
    expect(env.EMAIL_FROM).toBe('onboarding@sparki.test');
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
