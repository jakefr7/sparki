/**
 * Settings for the third-party services the API can call. A developer's .env
 * usually carries real ones — the staging attachment bucket, sandbox sign-in,
 * billing, email and texting keys — and an isolated test run must not reach
 * any of them, exactly as it must not reach the development database.
 */
export const EXTERNAL_SERVICE_VARIABLES = Object.freeze([
  'WORKOS_API_KEY',
  'WORKOS_CLIENT_ID',
  'WORKOS_COOKIE_PASSWORD',
  'WORKOS_REDIRECT_URI',
  'ATTACHMENT_S3_ENDPOINT',
  'ATTACHMENT_S3_REGION',
  'ATTACHMENT_S3_BUCKET',
  'ATTACHMENT_S3_ACCESS_KEY_ID',
  'ATTACHMENT_S3_SECRET_ACCESS_KEY',
  'TELNYX_API_KEY',
  'TELNYX_PUBLIC_KEY',
  'RESEND_API_KEY',
  'EMAIL_FROM',
  'MAPBOX_ACCESS_TOKEN',
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET',
  'STRIPE_PRICE_STANDARD',
]);

// Billing webhook fixtures sign with this fixed secret. Never use a
// developer's real Stripe sandbox credentials in an isolated test run.
const INTEGRATION_PLACEHOLDERS = Object.freeze({
  STRIPE_SECRET_KEY: 'sk_test_local_isolated_placeholder',
  STRIPE_WEBHOOK_SECRET: 'whsec_local_placeholder_not_a_real_secret',
  STRIPE_PRICE_STANDARD: 'price_test_standard',
});

/**
 * The environment an isolated run's migrations, seed scripts, servers and
 * tests receive: the caller's own, pointed at the disposable database and
 * attachment folder, with every third-party service switched off.
 */
export function isolatedTestEnvironment(
  baseEnv,
  { mode, databaseUrl, databaseName, apiPort, webPort, attachmentDirectory },
) {
  if (!['integration', 'playwright'].includes(mode)) {
    throw new Error(`Unsupported isolated-test mode: ${mode}`);
  }
  const env = {
    ...baseEnv,
    NODE_ENV: 'test',
    DATABASE_URL: databaseUrl,
    API_PORT: String(apiPort),
    API_URL: `http://127.0.0.1:${apiPort}`,
    WEB_PORT: String(webPort),
    CORS_ORIGIN: `http://127.0.0.1:${webPort}`,
    SPARKI_ISOLATED_TEST_DATABASE: databaseName,
    // Sign-in uses the fixed development identities and their
    // `dev:<user-id>` sessions. Those are only honored while WorkOS is not
    // configured, which the loop below guarantees.
    SPARKI_DEVELOPMENT_AUTH: 'fixed',
    ATTACHMENT_LOCAL_DIRECTORY: attachmentDirectory,
  };
  // Empty rather than removed: the servers' start scripts load .env for any
  // variable that is missing, which would put the developer's live value
  // back. An empty value stays put, and the API reads it as "not configured".
  for (const name of EXTERNAL_SERVICE_VARIABLES) env[name] = '';
  if (mode === 'integration') Object.assign(env, INTEGRATION_PLACEHOLDERS);
  return env;
}

/** Names (never values) of the third-party settings `env` could still reach. */
export function liveExternalServiceVariables(env) {
  return EXTERNAL_SERVICE_VARIABLES.filter(
    (name) => env[name] && env[name] !== INTEGRATION_PLACEHOLDERS[name],
  );
}
