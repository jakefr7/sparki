import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { createConnection, createServer } from 'node:net';
import process from 'node:process';

import {
  assertTestDatabaseName,
  createTestDatabaseName,
  databaseUrlFor,
  parseAdminDatabaseUrl,
  quoteIdentifier,
} from './lib/isolated-test-database.mjs';

const requireFromDbPackage = createRequire(new URL('../packages/db/package.json', import.meta.url));
const pg = requireFromDbPackage('pg');

const mode = process.argv[2];
if (!['integration', 'playwright'].includes(mode)) {
  throw new Error('Usage: node scripts/run-isolated-tests.mjs <integration|playwright>');
}

const baseUrl = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
if (!baseUrl) {
  throw new Error(
    'Set TEST_DATABASE_URL to a PostgreSQL administrative database (DATABASE_URL is also accepted).',
  );
}

const adminUrl = parseAdminDatabaseUrl(baseUrl, { ci: process.env.CI === 'true' });
const databaseName = createTestDatabaseName(mode);
const isolatedUrl = databaseUrlFor(adminUrl, databaseName).toString();
const client = new pg.Client({ connectionString: adminUrl.toString() });
let activeChild;
let cleanupPromise;
let clientConnected = false;
let databaseCreated = false;

async function findAvailablePort(preferredPort) {
  for (let port = preferredPort; port < preferredPort + 100; port += 1) {
    const reachable = await new Promise((resolve) => {
      const socket = createConnection({ host: '127.0.0.1', port });
      socket.once('connect', () => {
        socket.destroy();
        resolve(true);
      });
      socket.once('error', () => resolve(false));
    });
    if (reachable) continue;

    const available = await new Promise((resolve, reject) => {
      const server = createServer();
      server.once('error', (error) => {
        if (error.code === 'EADDRINUSE') resolve(false);
        else reject(error);
      });
      server.once('listening', () => server.close(() => resolve(true)));
      server.listen(port, '127.0.0.1');
    });
    if (available) return port;
  }
  throw new Error(
    `No available loopback test port found from ${preferredPort} through ${preferredPort + 99}.`,
  );
}

async function cleanup() {
  if (!cleanupPromise) {
    cleanupPromise = (async () => {
      if (activeChild && activeChild.exitCode === null && activeChild.signalCode === null) {
        activeChild.kill('SIGTERM');
      }
      if (clientConnected && databaseCreated) {
        assertTestDatabaseName(databaseName, mode);
        await client.query(`DROP DATABASE IF EXISTS ${quoteIdentifier(databaseName)} WITH (FORCE)`);
        databaseCreated = false;
      }
      if (clientConnected) {
        await client.end();
        clientConnected = false;
      }
    })();
  }
  return cleanupPromise;
}

function run(command, args, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: process.cwd(), env, stdio: 'inherit' });
    activeChild = child;
    child.on('error', reject);
    child.on('exit', (code, signal) => {
      activeChild = undefined;
      resolve(code ?? (signal ? 1 : 0));
    });
  });
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => {
    cleanup()
      .catch((error) => console.error(`Test cleanup failed: ${error.message}`))
      .finally(() => process.exit(128 + (signal === 'SIGINT' ? 2 : 15)));
  });
}

let exitCode = 1;
const apiPort = mode === 'playwright' ? await findAvailablePort(4000) : 4000;
const webPort = mode === 'playwright' ? await findAvailablePort(3001) : 3001;
await client.connect();
clientConnected = true;
try {
  await client.query(`CREATE DATABASE ${quoteIdentifier(databaseName)} TEMPLATE template0`);
  databaseCreated = true;
  const isolatedClient = new pg.Client({ connectionString: isolatedUrl });
  await isolatedClient.connect();
  try {
    // The unchanged migration history expects pg_trgm operators to exist when
    // its trigram indexes are created.
    await isolatedClient.query('CREATE EXTENSION IF NOT EXISTS pg_trgm');
  } finally {
    await isolatedClient.end();
  }
  const env = {
    ...process.env,
    NODE_ENV: 'test',
    DATABASE_URL: isolatedUrl,
    API_PORT: String(apiPort),
    API_URL: `http://127.0.0.1:${apiPort}`,
    WEB_PORT: String(webPort),
    CORS_ORIGIN: `http://127.0.0.1:${webPort}`,
    SPARKI_ISOLATED_TEST_DATABASE: databaseName,
  };
  exitCode = await run(
    'pnpm',
    [
      '--filter',
      '@sparki/db',
      'exec',
      'prisma',
      'migrate',
      'deploy',
      '--schema',
      '../../prisma/schema.prisma',
    ],
    env,
  );
  if (exitCode === 0) {
    const args =
      mode === 'integration'
        ? ['--filter', '@sparki/api', 'run', 'test:integration:raw']
        : ['--filter', '@sparki/web', 'run', 'test:e2e:raw'];
    exitCode = await run('pnpm', args, env);
  }
} finally {
  await cleanup();
}
process.exitCode = exitCode;
