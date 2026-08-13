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

const UUID = '12345678-1234-4abc-8def-1234567890ab';

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
