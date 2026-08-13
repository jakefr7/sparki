import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { createServer } from 'node:net';
import process from 'node:process';

const requireFromDbPackage = createRequire(new URL('../packages/db/package.json', import.meta.url));
const pg = requireFromDbPackage('pg');

const mode = process.argv[2];
if (!['integration', 'playwright'].includes(mode)) {
  throw new Error('Usage: node scripts/run-isolated-tests.mjs <integration|playwright>');
}

const baseUrl = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
if (!baseUrl) {
  throw new Error(
    'Set TEST_DATABASE_URL to a disposable PostgreSQL database (DATABASE_URL is also accepted).',
  );
}

const parsed = new URL(baseUrl);
if (
  !['localhost', '127.0.0.1', 'postgres'].includes(parsed.hostname) &&
  process.env.CI !== 'true'
) {
  throw new Error(
    `Refusing test database host ${parsed.hostname}; use loopback or set CI=true in CI.`,
  );
}
if (!parsed.pathname || parsed.pathname === '/')
  throw new Error('Test database URL must name a database.');

const schema = `sparki_test_${mode}_${randomUUID().replaceAll('-', '')}`;
parsed.searchParams.delete('schema');
const adminUrl = new URL(baseUrl);
adminUrl.searchParams.delete('schema');
const client = new pg.Client({ connectionString: adminUrl.toString() });
let activeChild;
let cleanupPromise;
let clientConnected = false;
let schemaCreated = false;

function assertPortAvailable(port) {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', (error) => {
      reject(
        error.code === 'EADDRINUSE'
          ? new Error(
              `Required test port 127.0.0.1:${port} is already in use. Stop the unrelated service and retry; Sparki will not reuse it.`,
            )
          : error,
      );
    });
    server.once('listening', () => server.close(resolve));
    server.listen(port, '127.0.0.1');
  });
}

async function cleanup() {
  if (!cleanupPromise) {
    cleanupPromise = (async () => {
      if (activeChild && activeChild.exitCode === null && activeChild.signalCode === null) {
        activeChild.kill('SIGTERM');
      }
      if (clientConnected && schemaCreated) {
        await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
        schemaCreated = false;
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
if (mode === 'playwright') {
  await Promise.all([assertPortAvailable(4000), assertPortAvailable(3001)]);
}
await client.connect();
clientConnected = true;
try {
  await client.query(`CREATE SCHEMA "${schema}"`);
  schemaCreated = true;
  const extension = await client.query(
    `SELECT namespace.nspname
       FROM pg_extension extension
       JOIN pg_namespace namespace ON namespace.oid = extension.extnamespace
      WHERE extension.extname = 'pg_trgm'`,
  );
  const extensionSchema = extension.rows[0]?.nspname;
  const quoteIdentifier = (identifier) => `"${identifier.replaceAll('"', '""')}"`;
  const searchPath = [schema, extensionSchema].filter(Boolean).map(quoteIdentifier).join(',');
  // Prisma uses the `schema` parameter to select the PostgreSQL namespace,
  // while `options` keeps extension operators (for example pg_trgm) visible.
  // The guarded Vitest and Playwright entry points also verify this explicit
  // marker so they cannot be run accidentally against a shared database.
  parsed.searchParams.set('schema', schema);
  parsed.searchParams.set('options', `-c search_path=${searchPath}`);
  const isolatedUrl = parsed.toString();
  const env = {
    ...process.env,
    NODE_ENV: 'test',
    DATABASE_URL: isolatedUrl,
    API_PORT: '4000',
    API_URL: 'http://127.0.0.1:4000',
    WEB_PORT: '3001',
    CORS_ORIGIN: 'http://127.0.0.1:3001',
    SPARKI_ISOLATED_TEST_SCHEMA: schema,
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
