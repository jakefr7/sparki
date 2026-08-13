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
