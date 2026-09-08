/**
 * Frees the Sparki dev ports before `turbo run dev` starts.
 *
 * `pnpm run dev` fails hard when a previous dev server (often an orphaned
 * `pnpm --filter @sparki/... dev` with PPID 1) is still holding WEB_PORT /
 * API_PORT. This clears only processes that are identifiably Sparki dev
 * servers — anything else on the port (e.g. the CRO local auth login that
 * dev-web.mjs warns about) is left alone and the normal port guard still fires.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

if (process.platform === 'win32') {
  // lsof/ps/kill semantics below are POSIX-only; the port guard still applies.
  process.exit(0);
}

function envPort(key, fallback) {
  try {
    const line = readFileSync(resolve(repoRoot, '.env'), 'utf8')
      .split('\n')
      .find((entry) => entry.trim().startsWith(`${key}=`));
    const value = line?.split('=')[1]?.trim().replace(/^["']|["']$/g, '');
    return value && /^\d+$/.test(value) ? value : fallback;
  } catch {
    return fallback;
  }
}

function run(cmd, args) {
  try {
    return execFileSync(cmd, args, { encoding: 'utf8' }).trim();
  } catch {
    return '';
  }
}

const SPARKI_DEV_SIGNATURES = [
  'sparki/apps/web',
  'sparki/apps/api',
  'scripts/dev-web.mjs',
  'nest start --watch',
  'next dev',
  'next-server',
  'turbo run dev',
  '--filter @sparki/web dev',
  '--filter @sparki/api dev',
];

function commandFor(pid) {
  return run('ps', ['-o', 'command=', '-p', String(pid)]);
}

function parentOf(pid) {
  const ppid = run('ps', ['-o', 'ppid=', '-p', String(pid)]).trim();
  return ppid && ppid !== '0' ? Number(ppid) : null;
}

/** A PID counts as Sparki-owned if it — or any ancestor up to init — was
 *  launched from this repo's dev tooling. */
function isSparkiDevProcess(pid) {
  let current = pid;
  for (let depth = 0; current && current !== 1 && depth < 12; depth += 1) {
    const command = commandFor(current);
    if (SPARKI_DEV_SIGNATURES.some((sig) => command.includes(sig))) return true;
    current = parentOf(current);
  }
  return false;
}

function pidsOnPort(port) {
  const out = run('lsof', ['-tiTCP:' + port, '-sTCP:LISTEN']);
  return out ? [...new Set(out.split('\n').map((line) => Number(line.trim())).filter(Boolean))] : [];
}

function orphanedSparkiDevPids() {
  const out = run('ps', ['-eo', 'pid=,command=']);
  const pids = [];
  for (const line of out.split('\n')) {
    const match = line.trim().match(/^(\d+)\s+(.*)$/);
    if (!match) continue;
    const [, pid, command] = match;
    if (
      (command.includes('--filter @sparki/web dev') ||
        command.includes('--filter @sparki/api dev') ||
        command.includes('scripts/dev-web.mjs') ||
        (command.includes('nest start --watch') && command.includes('sparki')) ||
        (command.includes('next-server') && command.includes(repoRoot))) &&
      !command.includes('free-dev-ports.mjs')
    ) {
      pids.push(Number(pid));
    }
  }
  return pids;
}

const webPort = envPort('WEB_PORT', '3001');
const apiPort = envPort('API_PORT', '4000');

const candidates = new Set([
  ...pidsOnPort(webPort).filter(isSparkiDevProcess),
  ...pidsOnPort(apiPort).filter(isSparkiDevProcess),
  ...orphanedSparkiDevPids(),
]);
candidates.delete(process.pid);

if (candidates.size === 0) {
  process.exit(0);
}

const list = [...candidates];
console.log(`[free-dev-ports] stopping ${list.length} stale Sparki dev process${list.length === 1 ? '' : 'es'} on :${webPort}/:${apiPort}`);
for (const pid of list) {
  try { process.kill(pid, 'SIGTERM'); } catch { /* already gone */ }
}

// Give them a moment to exit cleanly, then force any survivors.
const deadline = Date.now() + 2500;
while (Date.now() < deadline) {
  const alive = list.filter((pid) => {
    try { process.kill(pid, 0); return true; } catch { return false; }
  });
  if (alive.length === 0) break;
  execFileSync('sleep', ['0.2']);
}
for (const pid of list) {
  try { process.kill(pid, 'SIGKILL'); } catch { /* gone */ }
}
