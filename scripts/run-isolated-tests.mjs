import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
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
parsed.searchParams.set('schema', schema);
const isolatedUrl = parsed.toString();
const adminUrl = new URL(baseUrl);
adminUrl.searchParams.delete('schema');
const client = new pg.Client({ connectionString: adminUrl.toString() });

function run(command, args, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: process.cwd(), env, stdio: 'inherit' });
    child.on('error', reject);
    child.on('exit', (code, signal) => resolve(code ?? (signal ? 1 : 0)));
  });
}

let exitCode = 1;
await client.connect();
try {
  await client.query(`CREATE SCHEMA "${schema}"`);
  const env = {
    ...process.env,
    NODE_ENV: 'test',
    DATABASE_URL: isolatedUrl,
    API_PORT: '4000',
    API_URL: 'http://127.0.0.1:4000',
    WEB_PORT: '3001',
    CORS_ORIGIN: 'http://127.0.0.1:3001',
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
  await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
  await client.end();
}
process.exitCode = exitCode;
