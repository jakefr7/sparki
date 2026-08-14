/* global console, fetch */
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { readFile, readdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { createServer, connect } from 'node:net';
import process from 'node:process';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath, URL } from 'node:url';

const mode = process.argv[2];
const require = createRequire(import.meta.url);
const { Client: PostgresClient } = require('../packages/db/node_modules/pg');
const root = new URL('../', import.meta.url);
const rootPath = fileURLToPath(root);
const schemaPath = 'prisma/schema.prisma';
const migrationsPath = new URL('../prisma/migrations/', import.meta.url);
const DEFAULT_API_PORT = 4000;
const DEFAULT_WEB_PORT = 3001;
// These migrations were applied to the established local database before their
// checked-in SQL reached its current form. The Phase 1 baseline subsequently
// verified that the fully migrated live schema matched the Prisma schema. Keep
// this list exact: it is compatibility metadata, not a general drift bypass.
const acceptedLegacyMigrationChecksums = new Map([
  [
    '20260709200049_add_user_can_manage_admin_settings',
    new Set(['55f33b65d2177c06795f80b5956143dc881d9c59892d804960fb6528e6a9b82f']),
  ],
  [
    '20260723050000_inventory_pass_4',
    new Set(['a05a11e261be69a6340edda359d6ceeca8c035a3d4be283b1397b2ec45b5dee7']),
  ],
  [
    '20260723060000_inventory_pass_4_closeout',
    new Set(['c4ed6c65117a4093ce5847609cdef3ab96e0fbb40d1de8dfff6ab51155a420d2']),
  ],
]);
const apiPort = configuredPort('API_PORT', DEFAULT_API_PORT);
const webPort = configuredPort('WEB_PORT', DEFAULT_WEB_PORT);
const apiUrl = process.env.API_URL || `http://localhost:${apiPort}`;
const databaseUrl = process.env.DATABASE_URL;
let prisma;
const children = new Set();

if (!['dev', 'doctor'].includes(mode)) {
  console.error('Usage: node scripts/sparki-local.mjs <dev|doctor>');
  process.exit(1);
}

function configuredPort(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  if (!/^\d+$/.test(raw)) throw new Error(`${name} must be a numeric port (received "${raw}").`);
  const port = Number(raw);
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error(`${name} must be between 1 and 65535 (received "${raw}").`);
  return port;
}

function command(program, args, options = {}) {
  return new Promise((resolve) => {
    const child = spawn(program, args, {
      cwd: root,
      env: process.env,
      stdio: options.capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
    });
    let output = '';
    if (options.capture) {
      child.stdout.on('data', (chunk) => (output += chunk));
      child.stderr.on('data', (chunk) => (output += chunk));
    }
    child.on('error', (error) => resolve({ code: 1, output: error.message }));
    child.on('exit', (code) => resolve({ code: code ?? 1, output: output.trim() }));
  });
}

function authDiagnostic() {
  const workosKeys = ['WORKOS_API_KEY', 'WORKOS_CLIENT_ID', 'WORKOS_COOKIE_PASSWORD'];
  const configured = workosKeys.filter((key) => Boolean(process.env[key]));
  if (process.env.NODE_ENV === 'production') {
    return { ok: false, detail: 'local tooling refuses NODE_ENV=production' };
  }
  if (configured.length === workosKeys.length) return { ok: true, detail: 'WorkOS configured' };
  if (configured.length > 0) {
    return {
      ok: false,
      detail: `partial WorkOS configuration; set all of ${workosKeys.join(', ')}`,
    };
  }
  if (process.env.SPARKI_DEVELOPMENT_AUTH === 'fixed') {
    return { ok: true, detail: 'fixed development auth explicitly enabled' };
  }
  return {
    ok: false,
    detail: 'configure WorkOS or set SPARKI_DEVELOPMENT_AUTH=fixed in .env for local development',
  };
}

function errorSummary(error) {
  if (!(error instanceof Error)) return String(error);
  if (error.message) return error.message.split('\n')[0];
  if (error instanceof AggregateError && error.errors.length > 0) {
    return error.errors.map((cause) => errorSummary(cause)).join('; ');
  }
  return error.name;
}

function apiUrlDiagnostic() {
  try {
    const url = new URL(apiUrl);
    const port = url.port || (url.protocol === 'http:' ? '80' : '443');
    const localHost = ['localhost', '127.0.0.1'].includes(url.hostname);
    const ok =
      url.protocol === 'http:' && localHost && port === String(apiPort) && url.pathname === '/';
    return {
      ok,
      detail: ok
        ? apiUrl
        : `${apiUrl} (expected http://localhost:${apiPort} or http://127.0.0.1:${apiPort})`,
    };
  } catch {
    return { ok: false, detail: `${apiUrl} is not a valid URL` };
  }
}

async function listenerDetails(port) {
  const listeners = await command(
    'lsof',
    ['-nP', '-a', `-iTCP:${port}`, '-sTCP:LISTEN', '-Fpc'],
    { capture: true },
  );
  if (listeners.code !== 0 || !listeners.output) return null;

  const processes = [];
  let current;
  for (const line of listeners.output.split('\n')) {
    if (line.startsWith('p')) {
      current = { pid: line.slice(1), command: 'unknown process' };
      processes.push(current);
    } else if (line.startsWith('c') && current) {
      current.command = line.slice(1);
    }
  }

  for (const owner of processes) {
    const cwd = await command('lsof', ['-a', '-p', owner.pid, '-d', 'cwd', '-Fn'], {
      capture: true,
    });
    owner.isSparki = cwd.output
      .split('\n')
      .some((line) => line.startsWith('n') && line.slice(1).startsWith(rootPath));
  }
  return processes;
}

async function postgresReachable() {
  if (!databaseUrl) return { ok: false, detail: 'DATABASE_URL is not set' };
  const client = new PostgresClient({
    connectionString: databaseUrl,
    connectionTimeoutMillis: 2_000,
  });
  try {
    await client.connect();
    await client.query('SELECT 1');
    return { ok: true, detail: 'reachable' };
  } catch (error) {
    return {
      ok: false,
      detail: errorSummary(error),
    };
  } finally {
    await client.end().catch(() => {});
  }
}

async function localMigrations() {
  const entries = await readdir(migrationsPath, { withFileTypes: true });
  const migrations = new Map();
  for (const entry of entries
    .filter((item) => item.isDirectory())
    .sort((a, b) => a.name.localeCompare(b.name))) {
    const sql = await readFile(new URL(`${entry.name}/migration.sql`, migrationsPath));
    migrations.set(entry.name, createHash('sha256').update(sql).digest('hex'));
  }
  return migrations;
}

async function migrationDiagnostic() {
  const local = await localMigrations();
  const client = new PostgresClient({
    connectionString: databaseUrl,
    connectionTimeoutMillis: 2_000,
  });
  try {
    await client.connect();
    const { rows } = await client.query(
      'SELECT migration_name, checksum, finished_at, rolled_back_at, logs FROM "_prisma_migrations" ORDER BY started_at',
    );
    const active = rows.filter((row) => row.rolled_back_at === null);
    const failed = active.filter((row) => row.finished_at === null);
    const missingLocally = active.filter((row) => !local.has(row.migration_name));
    const changed = active.filter(
      (row) => local.has(row.migration_name) && local.get(row.migration_name) !== row.checksum,
    );
    const acceptedLegacy = changed.filter((row) =>
      acceptedLegacyMigrationChecksums.get(row.migration_name)?.has(row.checksum),
    );
    const modified = changed.filter((row) => !acceptedLegacy.includes(row));
    const appliedNames = new Set(
      active.filter((row) => row.finished_at !== null).map((row) => row.migration_name),
    );
    const pending = [...local.keys()].filter((name) => !appliedNames.has(name));
    const drift = [...new Set([...modified, ...missingLocally].map((row) => row.migration_name))];
    if (failed.length > 0) {
      return {
        ok: false,
        kind: 'failed',
        detail: `failed migration: ${failed.map((row) => row.migration_name).join(', ')}`,
        pending,
      };
    }
    if (drift.length > 0) {
      return {
        ok: false,
        kind: 'drift',
        detail: `historical migration drift: ${drift.join(', ')}`,
        pending,
      };
    }
    return {
      ok: true,
      kind: pending.length ? 'pending' : 'current',
      detail: pending.length
        ? `${pending.length} pending migration(s): ${pending.join(', ')}`
        : acceptedLegacy.length
          ? `up to date; ${acceptedLegacy.length} verified legacy migration checksum(s) accepted`
          : 'up to date; no historical drift',
      pending,
    };
  } catch (error) {
    const message = errorSummary(error);
    if (message.includes('_prisma_migrations')) {
      return {
        ok: true,
        kind: 'pending',
        detail: `${local.size} pending migration(s) on an empty database`,
        pending: [...local.keys()],
      };
    }
    return { ok: false, kind: 'unavailable', detail: message.split('\n')[0], pending: [] };
  } finally {
    await client.end().catch(() => {});
  }
}

async function portStatus(port) {
  const occupied = await new Promise((resolve) => {
    const socket = connect({ host: '127.0.0.1', port });
    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.once('error', () => resolve(false));
    socket.setTimeout(500, () => {
      socket.destroy();
      resolve(false);
    });
  });
  if (occupied) {
    const owners = await listenerDetails(port);
    if (!owners?.length) return { ok: false, kind: 'unknown', detail: 'in use by an unknown process' };
    const sparki = owners.every((owner) => owner.isSparki);
    const summary = owners.map((owner) => `${owner.command} (PID ${owner.pid})`).join(', ');
    return {
      ok: false,
      kind: sparki ? 'sparki' : 'unrelated',
      detail: `in use by ${sparki ? 'a Sparki process' : 'an unrelated process'}: ${summary}`,
    };
  }
  return new Promise((resolve) => {
    const server = createServer();
    server.once('error', (error) =>
      resolve({ ok: false, detail: `cannot bind (${error.code || error.message})` }),
    );
    server.listen(port, '127.0.0.1', () =>
      server.close(() => resolve({ ok: true, detail: 'available' })),
    );
  });
}

function portInUseError(label, port, state) {
  const action =
    state.kind === 'sparki'
      ? 'Stop the existing Sparki process or keep using that running stack.'
      : `Stop that process or configure a different ${label === 'API' ? 'API_PORT' : 'WEB_PORT'}.`;
  return new Error(
    `${label} port ${port} is ${state.detail}. ${action} Sparki will not kill it or choose another port automatically.`,
  );
}

async function prismaReadiness({ generate = false } = {}) {
  const result = await command('pnpm', ['exec', 'prisma', 'validate', '--schema', schemaPath], {
    capture: true,
  });
  if (result.code !== 0) return { ok: false, detail: result.output };
  if (generate) {
    const generated = await command(
      'pnpm',
      ['exec', 'prisma', 'generate', '--schema', schemaPath],
      {
        capture: true,
      },
    );
    if (generated.code !== 0) return { ok: false, detail: generated.output };
  }
  try {
    const { PrismaClient } = require('../packages/db/generated/client');
    prisma = new PrismaClient();
    return {
      ok: true,
      detail: generate
        ? 'schema valid; client generated and ready'
        : 'schema valid; client generated',
    };
  } catch (error) {
    return {
      ok: false,
      detail: `schema valid; Prisma client is not generated (run pnpm db:generate): ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

function printDiagnostic(label, result) {
  console.log(`${result.ok ? '✓' : '✗'} ${label}: ${result.detail}`);
}

function isComposeDatabase() {
  if (!databaseUrl) return false;
  try {
    const url = new URL(databaseUrl);
    return (
      ['localhost', '127.0.0.1'].includes(url.hostname) &&
      url.port === '55432' &&
      url.pathname === '/sparki'
    );
  } catch {
    return false;
  }
}

async function waitForPostgres(timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const state = await postgresReachable();
    if (state.ok) return state;
    await delay(1_000);
  }
  return postgresReachable();
}

async function ensurePostgres() {
  let state = await postgresReachable();
  if (state.ok) return state;
  if (!isComposeDatabase()) {
    throw new Error(
      `PostgreSQL is unreachable and DATABASE_URL does not identify Sparki's local Compose database.\n${state.detail}`,
    );
  }
  console.log('Starting the existing Docker Compose PostgreSQL service...');
  const compose = await command('docker', ['compose', 'up', '-d', 'postgres'], { capture: true });
  if (compose.code !== 0)
    throw new Error(
      `Could not start PostgreSQL with docker compose up -d postgres:\n${compose.output}`,
    );
  state = await waitForPostgres();
  if (!state.ok)
    throw new Error(`PostgreSQL did not become ready within 60 seconds.\n${state.detail}`);
  return state;
}

function driftError(migration) {
  return new Error(
    `Database startup stopped: ${migration.detail}.\n` +
      'Sparki will not reset the database or rewrite migration history. Preserve your data, then inspect with:\n' +
      '  pnpm exec prisma migrate status --schema prisma/schema.prisma\n' +
      'Resolve the changed applied migration manually (restore its original file or reconcile the local database), then rerun pnpm sparki:doctor.',
  );
}

async function applyPendingMigrations(migration) {
  if (migration.kind === 'drift' || migration.kind === 'failed') throw driftError(migration);
  if (migration.pending.length === 0) return;
  console.log(
    `Applying ${migration.pending.length} pending migration(s) with prisma migrate deploy...`,
  );
  const result = await command(
    'pnpm',
    ['exec', 'prisma', 'migrate', 'deploy', '--schema', schemaPath],
    { capture: true },
  );
  if (result.code !== 0)
    throw new Error(
      `Prisma migration deploy failed without resetting the database:\n${result.output}`,
    );
}

function startAttached(label, args, extraEnv = {}) {
  const child = spawn('pnpm', args, {
    cwd: root,
    env: { ...process.env, ...extraEnv },
    stdio: 'inherit',
    detached: process.platform !== 'win32',
  });
  child.sparkiLabel = label;
  children.add(child);
  child.once('exit', () => children.delete(child));
  return child;
}

async function stopChildren(signal = 'SIGTERM') {
  for (const child of children) {
    if (!child.pid || child.exitCode !== null) continue;
    try {
      process.kill(process.platform === 'win32' ? child.pid : -child.pid, signal);
    } catch (error) {
      if (error.code !== 'ESRCH')
        console.error(`Could not stop ${child.sparkiLabel}: ${error.message}`);
    }
  }
  await Promise.race([
    Promise.all(
      [...children].map((child) => new Promise((resolve) => child.once('exit', resolve))),
    ),
    delay(5_000),
  ]);
}

async function waitForHttp(urls, child, label, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (child.exitCode !== null)
      throw new Error(`${label} exited with code ${child.exitCode} before becoming ready.`);
    if (child.signalCode !== null)
      throw new Error(`${label} exited from signal ${child.signalCode} before becoming ready.`);
    try {
      const responses = await Promise.all(urls.map((url) => fetch(url)));
      if (responses.every((response) => response.ok)) return;
    } catch {
      // The server is still starting; retry until the bounded deadline.
    }
    await delay(500);
  }
  throw new Error(
    `${label} did not become healthy within 60 seconds (${urls.join(', ')}). Review the ${label} output above.`,
  );
}

async function doctor() {
  console.log('Sparki local development doctor');
  const auth = authDiagnostic();
  const api = apiUrlDiagnostic();
  const client = await prismaReadiness();
  const database = await postgresReachable();
  const migration = database.ok
    ? await migrationDiagnostic()
    : {
        ok: false,
        kind: 'unavailable',
        detail: 'unavailable until PostgreSQL is reachable',
        pending: [],
      };
  const [webPortState, apiPortState] = await Promise.all([
    portStatus(webPort),
    portStatus(apiPort),
  ]);
  printDiagnostic('PostgreSQL', database);
  printDiagnostic('Migrations', migration);
  if (migration.kind === 'drift') {
    console.log(
      '  Remediation: pnpm exec prisma migrate status --schema prisma/schema.prisma (then restore the original migration or reconcile the local database manually)',
    );
  }
  printDiagnostic('Auth', auth);
  printDiagnostic('API_URL', api);
  printDiagnostic(`Web port ${webPort}`, webPortState);
  printDiagnostic(`API port ${apiPort}`, apiPortState);
  printDiagnostic('Prisma', client);
  await prisma?.$disconnect();
  if (![database, migration, auth, api, webPortState, apiPortState, client].every((item) => item.ok))
    process.exitCode = 1;
}

async function dev() {
  const auth = authDiagnostic();
  const api = apiUrlDiagnostic();
  if (!databaseUrl)
    throw new Error('DATABASE_URL is required. Copy .env.example to .env and configure it.');
  if (!auth.ok) throw new Error(`Authentication preflight failed: ${auth.detail}.`);
  if (!api.ok) throw new Error(`API_URL preflight failed: ${api.detail}.`);
  if (apiPort === webPort)
    throw new Error(`API_PORT and WEB_PORT cannot both use port ${apiPort}.`);
  const client = await prismaReadiness({ generate: true });
  if (!client.ok) throw new Error(`Prisma preflight failed: ${client.detail}`);
  await ensurePostgres();
  const migration = await migrationDiagnostic();
  await applyPendingMigrations(migration);
  const afterMigration = await migrationDiagnostic();
  if (!afterMigration.ok || afterMigration.pending.length > 0) throw driftError(afterMigration);
  const [apiPortState, webPortState] = await Promise.all([
    portStatus(apiPort),
    portStatus(webPort),
  ]);
  if (!apiPortState.ok)
    throw portInUseError('API', apiPort, apiPortState);
  if (!webPortState.ok)
    throw portInUseError('Web', webPort, webPortState);

  await prisma?.$disconnect();
  const apiChild = startAttached('API', ['--filter', '@sparki/api', 'dev'], {
    API_PORT: String(apiPort),
    API_URL: apiUrl,
  });
  await waitForHttp([`${apiUrl}/health/live`, `${apiUrl}/health/ready`], apiChild, 'API');

  const webChild = startAttached('web', ['--filter', '@sparki/web', 'dev'], {
    API_URL: apiUrl,
    WEB_PORT: String(webPort),
    ...(webPort === 3000 ? { SPARKI_ALLOW_PORT_3000: 'true' } : {}),
  });
  await waitForHttp([`http://127.0.0.1:${webPort}`], webChild, 'web');

  console.log('\nSparki local development ready');
  console.log('✓ PostgreSQL');
  console.log('✓ Database');
  console.log(`✓ API ${apiUrl}`);
  console.log(`✓ Web http://localhost:${webPort}`);

  await new Promise((resolve, reject) => {
    for (const child of [apiChild, webChild]) {
      child.once('exit', (code, signal) =>
        reject(new Error(`${child.sparkiLabel} exited (${signal || `code ${code}`}).`)),
      );
    }
    process.once('SIGINT', resolve);
    process.once('SIGTERM', resolve);
  });
}

try {
  if (mode === 'doctor') await doctor();
  else await dev();
} catch (error) {
  console.error(
    `\nSparki local startup failed\n${error instanceof Error ? error.message : String(error)}`,
  );
  process.exitCode = 1;
} finally {
  await prisma?.$disconnect().catch(() => {});
  if (children.size > 0) await stopChildren();
}
