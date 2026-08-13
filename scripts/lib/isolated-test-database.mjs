import { randomUUID } from 'node:crypto';

const TEST_DATABASE_PATTERN = /^sparki_test_(integration|playwright)_[a-f0-9]{32}$/;
const SAFE_LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', 'postgres']);

export function quoteIdentifier(identifier) {
  return `"${identifier.replaceAll('"', '""')}"`;
}

export function createTestDatabaseName(mode, uuid = randomUUID()) {
  if (!['integration', 'playwright'].includes(mode)) {
    throw new Error(`Unsupported isolated-test mode: ${mode}`);
  }
  const suffix = uuid.replaceAll('-', '').toLowerCase();
  if (!/^[a-f0-9]{32}$/.test(suffix)) {
    throw new Error('The isolated-test UUID must contain exactly 32 hexadecimal characters.');
  }
  return `sparki_test_${mode}_${suffix}`;
}

export function assertTestDatabaseName(databaseName, mode) {
  if (!TEST_DATABASE_PATTERN.test(databaseName)) {
    throw new Error(`Refusing to manage unsafe test database name: ${databaseName}`);
  }
  if (mode && !databaseName.startsWith(`sparki_test_${mode}_`)) {
    throw new Error(`Test database ${databaseName} does not belong to ${mode}.`);
  }
}

export function parseAdminDatabaseUrl(baseUrl, { ci = false } = {}) {
  const parsed = new URL(baseUrl);
  if (parsed.protocol !== 'postgresql:' && parsed.protocol !== 'postgres:') {
    throw new Error('Test database URL must use the PostgreSQL protocol.');
  }
  if (!SAFE_LOCAL_HOSTS.has(parsed.hostname) && !ci) {
    throw new Error(
      `Refusing test database host ${parsed.hostname}; use loopback or set CI=true in CI.`,
    );
  }
  const databaseName = decodeURIComponent(parsed.pathname.slice(1));
  if (!databaseName || databaseName.includes('/')) {
    throw new Error('Test database URL must name one administrative database.');
  }
  if (databaseName.startsWith('sparki_test_')) {
    throw new Error(
      'TEST_DATABASE_URL must name the administrative database, not a test database.',
    );
  }
  parsed.searchParams.delete('schema');
  parsed.searchParams.delete('options');
  return parsed;
}

export function databaseUrlFor(adminUrl, databaseName) {
  assertTestDatabaseName(databaseName);
  const isolated = new URL(adminUrl);
  isolated.pathname = `/${databaseName}`;
  isolated.searchParams.delete('schema');
  isolated.searchParams.delete('options');
  return isolated;
}

export function databaseNameFromUrl(databaseUrl) {
  return decodeURIComponent(new URL(databaseUrl).pathname.slice(1));
}
