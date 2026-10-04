import assert from 'node:assert/strict';
import test from 'node:test';

import {
  assertTestDatabaseName,
  createTestDatabaseName,
  databaseNameFromUrl,
  databaseUrlFor,
  parseAdminDatabaseUrl,
  quoteIdentifier,
} from './lib/isolated-test-database.mjs';

import {
  EXTERNAL_SERVICE_VARIABLES,
  isolatedTestEnvironment,
  liveExternalServiceVariables,
} from './lib/isolated-test-environment.mjs';

const UUID = '12345678-1234-4abc-8def-1234567890ab';

// What a developer's .env typically carries: staging/sandbox credentials.
const DEVELOPER_ENV = {
  PATH: '/usr/bin',
  NODE_ENV: 'development',
  DATABASE_URL: 'postgresql://user:pass@localhost:55432/sparki',
  SPARKI_DEVELOPMENT_AUTH: 'disabled',
  WORKOS_API_KEY: 'sk_test_developer',
  WORKOS_CLIENT_ID: 'client_developer',
  WORKOS_COOKIE_PASSWORD: 'a-developer-cookie-password-of-32-chars',
  WORKOS_REDIRECT_URI: 'http://localhost:3000/callback',
  ATTACHMENT_S3_ENDPOINT: 'https://objects.example.test',
  ATTACHMENT_S3_REGION: 'us-east-1',
  ATTACHMENT_S3_BUCKET: 'staging-attachments',
  ATTACHMENT_S3_ACCESS_KEY_ID: 'access-key',
  ATTACHMENT_S3_SECRET_ACCESS_KEY: 'secret-key',
  TELNYX_API_KEY: 'KEY_developer',
  RESEND_API_KEY: 're_developer',
  EMAIL_FROM: 'clinic@example.test',
  MAPBOX_ACCESS_TOKEN: 'pk.developer',
  STRIPE_SECRET_KEY: 'sk_test_developer_sandbox',
  STRIPE_WEBHOOK_SECRET: 'whsec_developer',
  STRIPE_PRICE_STANDARD: 'price_developer',
};

const ISOLATED_RUN = {
  databaseUrl: 'postgresql://user:pass@localhost:55432/sparki_test_integration_abc',
  databaseName: 'sparki_test_integration_abc',
  apiPort: 4000,
  webPort: 3001,
  attachmentDirectory: '/tmp/sparki-test-attachments-abc',
};

for (const mode of ['integration', 'playwright']) {
  test(`${mode} runs cannot reach a developer's live services`, () => {
    const env = isolatedTestEnvironment(DEVELOPER_ENV, { mode, ...ISOLATED_RUN });

    assert.deepEqual(liveExternalServiceVariables(env), []);
    for (const value of Object.values(DEVELOPER_ENV)) {
      if (value === DEVELOPER_ENV.PATH) continue;
      assert.equal(Object.values(env).includes(value), false, `${value} leaked into the run`);
    }
    // Present but empty: a tool that loads .env for missing variables (the
    // servers' own start scripts do) must not put the live value back.
    for (const name of ['WORKOS_API_KEY', 'ATTACHMENT_S3_BUCKET', 'TELNYX_API_KEY', 'RESEND_API_KEY', 'MAPBOX_ACCESS_TOKEN']) {
      assert.equal(env[name], '');
    }
    assert.equal(env.PATH, '/usr/bin');
  });

  test(`${mode} runs use the disposable database, fixed sign-in and their own attachment folder`, () => {
    const env = isolatedTestEnvironment(DEVELOPER_ENV, { mode, ...ISOLATED_RUN });

    assert.equal(env.NODE_ENV, 'test');
    assert.equal(env.DATABASE_URL, ISOLATED_RUN.databaseUrl);
    assert.equal(env.SPARKI_ISOLATED_TEST_DATABASE, ISOLATED_RUN.databaseName);
    assert.equal(env.SPARKI_DEVELOPMENT_AUTH, 'fixed');
    assert.equal(env.API_URL, 'http://127.0.0.1:4000');
    assert.equal(env.CORS_ORIGIN, 'http://127.0.0.1:3001');
    assert.equal(env.ATTACHMENT_LOCAL_DIRECTORY, ISOLATED_RUN.attachmentDirectory);
  });
}

test('integration runs sign billing webhooks with fixed placeholders, browser runs have no billing provider', () => {
  const integration = isolatedTestEnvironment(DEVELOPER_ENV, { mode: 'integration', ...ISOLATED_RUN });
  assert.equal(integration.STRIPE_SECRET_KEY, 'sk_test_local_isolated_placeholder');
  assert.equal(integration.STRIPE_WEBHOOK_SECRET, 'whsec_local_placeholder_not_a_real_secret');
  assert.equal(integration.STRIPE_PRICE_STANDARD, 'price_test_standard');

  const playwright = isolatedTestEnvironment(DEVELOPER_ENV, { mode: 'playwright', ...ISOLATED_RUN });
  assert.equal(playwright.STRIPE_SECRET_KEY, '');
});

test('reports every live service setting by name, never by value', () => {
  assert.deepEqual(liveExternalServiceVariables({}), []);
  assert.deepEqual(
    liveExternalServiceVariables({ ATTACHMENT_S3_BUCKET: 'staging-attachments', TELNYX_API_KEY: 'KEY_developer', PATH: '/usr/bin' }),
    ['ATTACHMENT_S3_BUCKET', 'TELNYX_API_KEY'],
  );
  // A real Stripe sandbox key is still a live credential.
  assert.deepEqual(liveExternalServiceVariables({ STRIPE_SECRET_KEY: 'sk_test_developer_sandbox' }), ['STRIPE_SECRET_KEY']);
  for (const name of Object.keys(DEVELOPER_ENV)) {
    if (/^(WORKOS|ATTACHMENT_S3|TELNYX|RESEND|EMAIL_FROM|MAPBOX|STRIPE)/.test(name)) {
      assert.ok(EXTERNAL_SERVICE_VARIABLES.includes(name), `${name} is not covered`);
    }
  }
});

test('refuses an unknown mode', () => {
  assert.throws(() => isolatedTestEnvironment({}, { mode: 'unit', ...ISOLATED_RUN }), /Unsupported/);
});

test('creates collision-resistant, mode-owned database names', () => {
  const integration = createTestDatabaseName('integration', UUID);
  const playwright = createTestDatabaseName('playwright', UUID);
  assert.equal(integration, 'sparki_test_integration_1234567812344abc8def1234567890ab');
  assert.notEqual(integration, playwright);
  assertTestDatabaseName(integration, 'integration');
  assert.throws(() => assertTestDatabaseName(integration, 'playwright'), /does not belong/);
});

test('rejects malformed ownership targets and UUIDs', () => {
  assert.throws(() => assertTestDatabaseName('sparki_development'), /unsafe/);
  assert.throws(
    () => assertTestDatabaseName('sparki_test_integration_1234567812344abc8def1234567890abx'),
    /unsafe/,
  );
  assert.throws(() => createTestDatabaseName('integration', 'not-a-uuid'), /32 hexadecimal/);
  assert.throws(() => createTestDatabaseName('unit', UUID), /Unsupported/);
});

test('accepts local administrative URLs and strips schema-scoped settings', () => {
  const admin = parseAdminDatabaseUrl(
    'postgresql://user:pass@127.0.0.1:55432/sparki?schema=public&options=unsafe',
  );
  assert.equal(admin.searchParams.has('schema'), false);
  assert.equal(admin.searchParams.has('options'), false);
  const isolated = databaseUrlFor(admin, createTestDatabaseName('integration', UUID));
  assert.equal(
    databaseNameFromUrl(isolated),
    'sparki_test_integration_1234567812344abc8def1234567890ab',
  );
  assert.equal(isolated.searchParams.has('schema'), false);
  assert.equal(isolated.searchParams.has('options'), false);
});

test('allows a remote administrative URL only when CI explicitly opts in', () => {
  assert.throws(() => parseAdminDatabaseUrl('postgresql://u:p@db.example/sparki'), /Refusing/);
  assert.equal(
    parseAdminDatabaseUrl('postgresql://u:p@db.example/sparki', { ci: true }).hostname,
    'db.example',
  );
});

test('rejects remote, test-owned, and non-PostgreSQL administrative targets', () => {
  assert.throws(() => parseAdminDatabaseUrl('postgresql://u:p@db.example/sparki'), /Refusing/);
  assert.throws(
    () => parseAdminDatabaseUrl('postgresql://u:p@localhost/sparki_test_integration_deadbeef'),
    /administrative database/,
  );
  assert.throws(() => parseAdminDatabaseUrl('postgresql://u:p@localhost/'), /must name/);
  assert.throws(
    () => parseAdminDatabaseUrl('postgresql://u:p@localhost/admin/nested'),
    /must name/,
  );
  assert.throws(() => parseAdminDatabaseUrl('https://localhost/sparki'), /PostgreSQL/);
});

test('quotes PostgreSQL identifiers defensively', () => {
  assert.equal(quoteIdentifier('safe"name'), '"safe""name"');
});
