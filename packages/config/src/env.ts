import { z } from 'zod';

const optionalString = z.preprocess((value) => (value === '' ? undefined : value), z.string().optional());
const optionalCookiePassword = z.preprocess(
  (value) => (value === '' ? undefined : value),
  z.string().min(32).optional(),
);

const baseEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
});

/** Variables only apps/api and packages/db need. */
export const apiEnvSchema = baseEnvSchema.extend({
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  API_PORT: z.coerce.number().int().positive().default(4000),

  // WorkOS AuthKit (docs/engineering/00-engineering-plan.md). Optional so
  // Sprint 0 auth scaffolding still boots with no live integration; once set,
  // AuthModule switches from DevelopmentAuthGuard to the real AuthGuard.
  WORKOS_API_KEY: optionalString,
  WORKOS_CLIENT_ID: optionalString,
  WORKOS_REDIRECT_URI: optionalString,
  // Encrypts the sealed session cookie (iron-session under the hood).
  // Required whenever WorkOS is configured; must be >=32 chars.
  WORKOS_COOKIE_PASSWORD: optionalCookiePassword,

  // Fixed local identities are a test/developer fixture, never an implicit
  // fallback for an incompletely configured deployment.
  SPARKI_DEVELOPMENT_AUTH: z.enum(['disabled', 'fixed']).default('disabled'),

  // Origin apps/web is served from; the API only accepts browser requests
  // (CORS) from this origin.
  CORS_ORIGIN: z.string().min(1).default('http://localhost:3000'),

  // Address autocomplete (Owner address, Phase 2). Server-side secret key
  // for the Mapbox Search Box API — never sent to the browser; the web app
  // only ever talks to this API's own /address/* BFF endpoints (see
  // AddressService). Optional: autocomplete degrades to "no suggestions"
  // rather than erroring when unset, so patient creation is never blocked.
  MAPBOX_ACCESS_TOKEN: z.string().optional(),

  // Private, S3-compatible storage for staff-message attachments. Optional so
  // staging/production can boot without it configured — AttachmentStorageService
  // falls back to a private local filesystem store until the complete set is
  // provided; a partial set is always a configuration error.
  ATTACHMENT_S3_ENDPOINT: optionalString,
  ATTACHMENT_S3_REGION: optionalString,
  ATTACHMENT_S3_BUCKET: optionalString,
  ATTACHMENT_S3_ACCESS_KEY_ID: optionalString,
  ATTACHMENT_S3_SECRET_ACCESS_KEY: optionalString,

  // Stripe billing (docs/adr/ADR-007-clinic-provisioning-and-billing.md).
  // Optional so the app still boots without live billing configured —
  // BillingService throws ServiceUnavailable only when a billing action is
  // actually invoked, the same graceful-degradation shape as Mapbox above,
  // not the fail-at-boot shape WorkOS uses (billing isn't on every request).
  // STRIPE_WEBHOOK_SECRET is required together with STRIPE_SECRET_KEY:
  // accepting webhook calls without a way to verify them would be worse than
  // not accepting them at all.
  STRIPE_SECRET_KEY: optionalString,
  STRIPE_WEBHOOK_SECRET: optionalString,
  // The approved Stripe Price id for Sparki's one customer-facing plan
  // (docs/adr/ADR-008-trusted-plan-catalog.md). Required alongside the pair
  // above: a deployment that can create Checkout sessions but has no
  // trusted price to sell them at is exactly as broken as one with no
  // Stripe credentials at all. Never sent to the browser — see
  // apps/api/src/billing/plans.ts, the only place a Sparki plan identifier
  // resolves to a Stripe Price id.
  STRIPE_PRICE_STANDARD: optionalString,

  // Transactional email (owner activation + staff invitations). Optional so
  // staging/dev/test can run without a provider — EmailService logs the
  // message and (test-only) callers inject a fake to capture it instead of
  // sending. Required together, same shape as attachment storage.
  RESEND_API_KEY: optionalString,
  EMAIL_FROM: optionalString,
}).superRefine((env, ctx) => {
  const workosValues = [env.WORKOS_API_KEY, env.WORKOS_CLIENT_ID, env.WORKOS_COOKIE_PASSWORD];
  const configuredValues = workosValues.filter(Boolean).length;
  if (configuredValues > 0 && configuredValues < workosValues.length) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'WORKOS_API_KEY, WORKOS_CLIENT_ID, and WORKOS_COOKIE_PASSWORD must be configured together',
      path: ['WORKOS_API_KEY'],
    });
  }
  if (env.NODE_ENV === 'production' && env.SPARKI_DEVELOPMENT_AUTH !== 'disabled') {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'SPARKI_DEVELOPMENT_AUTH must be disabled in production',
      path: ['SPARKI_DEVELOPMENT_AUTH'],
    });
  }
  // Each optional integration below follows the same graceful-degradation
  // shape regardless of NODE_ENV: fully unset is a valid "not enabled" state
  // (staging can boot without it), but a partial set is always a
  // configuration error — accepting webhooks/checkout/email/storage calls
  // with an incomplete credential set would be worse than not accepting them.
  const storageValues = [env.ATTACHMENT_S3_ENDPOINT, env.ATTACHMENT_S3_REGION, env.ATTACHMENT_S3_BUCKET, env.ATTACHMENT_S3_ACCESS_KEY_ID, env.ATTACHMENT_S3_SECRET_ACCESS_KEY];
  const storageConfigured = storageValues.filter(Boolean).length;
  if (storageConfigured > 0 && storageConfigured < storageValues.length) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Complete S3-compatible attachment storage configuration is required', path: ['ATTACHMENT_S3_ENDPOINT'] });
  }
  const stripeValues = [env.STRIPE_SECRET_KEY, env.STRIPE_WEBHOOK_SECRET, env.STRIPE_PRICE_STANDARD];
  const stripeConfigured = stripeValues.filter(Boolean).length;
  if (stripeConfigured > 0 && stripeConfigured < stripeValues.length) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, and STRIPE_PRICE_STANDARD are required together', path: ['STRIPE_SECRET_KEY'] });
  }
  const emailValues = [env.RESEND_API_KEY, env.EMAIL_FROM];
  const emailConfigured = emailValues.filter(Boolean).length;
  if (emailConfigured > 0 && emailConfigured < emailValues.length) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'RESEND_API_KEY and EMAIL_FROM are required together', path: ['RESEND_API_KEY'] });
  }
});

/** Variables only apps/web needs. */
export const webEnvSchema = baseEnvSchema.extend({
  API_URL: z.string().min(1).default('http://localhost:4000'),
  WEB_PORT: z.coerce.number().int().positive().default(3000),
});

export type ApiEnv = z.infer<typeof apiEnvSchema>;
export type WebEnv = z.infer<typeof webEnvSchema>;

let cachedApiEnv: ApiEnv | undefined;
let cachedWebEnv: WebEnv | undefined;

export function loadApiEnv(source: NodeJS.ProcessEnv = process.env): ApiEnv {
  if (!cachedApiEnv) {
    const parsed = apiEnvSchema.safeParse(source);
    if (!parsed.success) {
      throw new Error(`Invalid environment configuration:\n${parsed.error.toString()}`);
    }
    cachedApiEnv = parsed.data;
  }
  return cachedApiEnv;
}

export function loadWebEnv(source: NodeJS.ProcessEnv = process.env): WebEnv {
  if (!cachedWebEnv) {
    const parsed = webEnvSchema.safeParse(source);
    if (!parsed.success) {
      throw new Error(`Invalid environment configuration:\n${parsed.error.toString()}`);
    }
    cachedWebEnv = parsed.data;
  }
  return cachedWebEnv;
}

/** Test-only escape hatch so env validation doesn't leak state across test files. */
export function resetEnvCacheForTests(): void {
  cachedApiEnv = undefined;
  cachedWebEnv = undefined;
}
