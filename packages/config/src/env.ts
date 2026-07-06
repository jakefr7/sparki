import { z } from 'zod';

const baseEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
});

/** Variables only apps/api and packages/db need. */
export const apiEnvSchema = baseEnvSchema.extend({
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  API_PORT: z.coerce.number().int().positive().default(4000),

  // WorkOS AuthKit (docs/engineering/00-engineering-plan.md). Optional at
  // Sprint 0: auth scaffolding only, no live integration yet.
  WORKOS_API_KEY: z.string().optional(),
  WORKOS_CLIENT_ID: z.string().optional(),
  WORKOS_REDIRECT_URI: z.string().optional(),

  // Origin apps/web is served from; the API only accepts browser requests
  // (CORS) from this origin.
  CORS_ORIGIN: z.string().min(1).default('http://localhost:3000'),
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
