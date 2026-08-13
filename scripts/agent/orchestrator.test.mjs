import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  configuredClaudeBin,
  detectCli,
  invokeClaude,
  normalizePlanningStatus,
  runControlLoop,
  runVerification,
  validateRepository,
} from './orchestrator.mjs';
import { parseJsonOutput } from './utilities.mjs';

const pass = (summary = 'ok') => ({ status: 'PASS', summary, findings: [] });
const changes = () => ({
  status: 'CHANGES_REQUIRED',
  summary: 'fix it',
  findings: [
    {
      severity: 'high',
      fileOrSystem: 'agent orchestrator',
      problem: 'broken behavior',
      whyItMatters: 'the phase cannot proceed safely',
      requiredCorrection: 'repair the behavior',
    },
  ],
});

const schemaPath = new URL('./agent-response.schema.json', import.meta.url);

function assertStrictObjectSchemas(schema, location = '$') {
  if (!schema || typeof schema !== 'object' || Array.isArray(schema)) return;
  if (schema.type === 'object') {
    assert.equal(
      schema.additionalProperties,
      false,
      `${location} must set additionalProperties to false`,
    );
    assert.deepEqual(
      [...(schema.required ?? [])].sort(),
      Object.keys(schema.properties ?? {}).sort(),
      `${location} must require every declared property`,
    );
  }
  for (const [key, value] of Object.entries(schema)) {
    if (key !== 'required' && key !== 'enum')
      assertStrictObjectSchemas(value, `${location}.${key}`);
  }
}

test('structured output schema makes every object strict and requires every property', async () => {
  const schema = JSON.parse(await readFile(schemaPath, 'utf8'));
  assertStrictObjectSchemas(schema);
});

test('Claude receives the strict schema without the unsupported draft declaration', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'sparki-claude-schema-test-'));
  await mkdir(path.join(root, 'scripts/agent'), { recursive: true });
  const sharedSchema = JSON.parse(await readFile(schemaPath, 'utf8'));
  await writeFile(
    path.join(root, 'scripts/agent/agent-response.schema.json'),
    JSON.stringify(sharedSchema),
  );
  let suppliedSchema;
  let suppliedExecutable;
  const result = await invokeClaude({
    root,
    prompt: 'review',
    executable: 'claude-team-profile',
    run: async (command, args) => {
      suppliedExecutable = command;
      suppliedSchema = JSON.parse(args[args.indexOf('--json-schema') + 1]);
      return { code: 0, stdout: JSON.stringify(pass()), stderr: '' };
    },
  });
  assert.equal(result.status, 'PASS');
  assert.equal(suppliedExecutable, 'claude-team-profile');
  assert.equal('$schema' in suppliedSchema, false);
  assert.deepEqual(suppliedSchema, (({ $schema: _, ...schema }) => schema)(sharedSchema));
  assertStrictObjectSchemas(suppliedSchema);
  assert.deepEqual(suppliedSchema.required.sort(), ['findings', 'status', 'summary']);
  assert.deepEqual(suppliedSchema.properties.status.enum, [
    'PASS',
    'CHANGES_REQUIRED',
    'FOUNDER_DECISION_REQUIRED',
    'FAILED',
  ]);
});

test('Sparki defaults Claude to its authenticated profile and supports CLAUDE_BIN', () => {
  assert.equal(configuredClaudeBin({}), 'claude-sparki');
  assert.equal(configuredClaudeBin({ CLAUDE_BIN: 'claude-custom' }), 'claude-custom');
});

test('custom Claude executable uses Claude authentication semantics', async () => {
  const calls = [];
  const result = await detectCli('claude-custom', {
    kind: 'claude',
    run: async (command, args) => {
      calls.push([command, args]);
      if (args[0] === '--version') return { code: 0, stdout: '1.0.0', stderr: '' };
      return { code: 0, stdout: JSON.stringify({ loggedIn: true }), stderr: '' };
    },
  });
  assert.equal(result.authenticated, true);
  assert.deepEqual(calls, [
    ['claude-custom', ['--version']],
    ['claude-custom', ['auth', 'status']],
  ]);
});

test('PM planning treats a concrete implementation plan as PASS even if labeled CHANGES_REQUIRED', () => {
  const result = normalizePlanningStatus(changes());
  assert.equal(result.status, 'PASS');
  assert.match(result.summary, /Planning completed with an executable scoped plan/);
  assert.deepEqual(result.findings, changes().findings);
});

test('PM planning preserves founder decisions and genuine infrastructure failures', () => {
  const founderDecision = {
    status: 'FOUNDER_DECISION_REQUIRED',
    summary: 'policy decision needed',
    findings: [],
  };
  const failure = { status: 'FAILED', summary: 'CLI unavailable', findings: [] };
  assert.equal(normalizePlanningStatus(founderDecision).status, 'FOUNDER_DECISION_REQUIRED');
  assert.equal(normalizePlanningStatus(failure).status, 'FAILED');
});

test('PASS transitions directly to founder-review-ready outcome', async () => {
  const result = await runControlLoop({
    verify: async () => ({ pass: true }),
    review: async () => pass(),
    remediate: async () => pass(),
  });
  assert.equal(result.status, 'PASS');
  assert.equal(result.reviewCount, 1);
  assert.equal(result.remediationCount, 0);
});

test('execute remediates an implementer CHANGES_REQUIRED result before verification', async () => {
  const calls = [];
  const implementation = changes();
  const result = await runControlLoop({
    initialFailure: { kind: 'implementation', implementation },
    remediate: async (failure) => {
      calls.push(['remediate', failure]);
      return pass();
    },
    verify: async () => {
      calls.push(['verify']);
      return { pass: true };
    },
    review: async () => pass(),
  });
  assert.equal(result.status, 'PASS');
  assert.equal(result.remediationCount, 1);
  assert.deepEqual(calls[0], ['remediate', { kind: 'implementation', implementation }]);
  assert.deepEqual(calls[1], ['verify']);
});

test('CHANGES_REQUIRED invokes remediation, verification, and another review', async () => {
  let reviews = 0;
  let verifications = 0;
  const result = await runControlLoop({
    verify: async () => ({ pass: ++verifications > 0 }),
    review: async () => (++reviews === 1 ? changes() : pass()),
    remediate: async () => pass(),
  });
  assert.equal(result.status, 'PASS');
  assert.equal(result.reviewCount, 2);
  assert.equal(result.remediationCount, 1);
  assert.equal(verifications, 2);
});

test('maximum review loop stops after three reviews', async () => {
  const result = await runControlLoop({
    verify: async () => ({ pass: true }),
    review: async () => changes(),
    remediate: async () => pass(),
  });
  assert.equal(result.status, 'FAILED');
  assert.equal(result.reviewCount, 3);
});

test('malformed agent response never counts as PASS', () => {
  assert.throws(() => parseJsonOutput('not json'), /malformed JSON/);
  assert.throws(() => parseJsonOutput('{"status":"PASS"}'), /summary/);
  assert.throws(
    () =>
      parseJsonOutput(
        JSON.stringify({
          ...changes(),
          findings: [{ ...changes().findings[0], unexpected: true }],
        }),
      ),
    /unexpected field/,
  );
  assert.throws(
    () => parseJsonOutput(JSON.stringify({ ...changes(), findings: [{ severity: 'high' }] })),
    /requires a string fileOrSystem/,
  );
});

test('verification failure triggers remediation and rerun', async () => {
  let checks = 0;
  let remediations = 0;
  const result = await runControlLoop({
    verify: async () => ({ pass: ++checks > 1 }),
    review: async () => pass(),
    remediate: async ({ kind }) => {
      assert.equal(kind, 'verification');
      remediations += 1;
      return pass();
    },
  });
  assert.equal(result.status, 'PASS');
  assert.equal(checks, 2);
  assert.equal(remediations, 1);
});

test('verification records an exact known product-debt exit without stopping later checks', async () => {
  const commands = [];
  const result = await runVerification(
    '/repo',
    [
      {
        command: 'pnpm lint',
        expectedExitCodes: [1],
        classification: 'KNOWN_PHASE_4_PRODUCT_DEBT',
      },
      'pnpm typecheck',
    ],
    async (_shell, args) => {
      commands.push(args[1]);
      return { code: args[1] === 'pnpm lint' ? 1 : 0, stdout: '', stderr: '' };
    },
  );
  assert.equal(result.pass, true);
  assert.deepEqual(commands, ['pnpm lint', 'pnpm typecheck']);
  assert.equal(result.results[0].classification, 'KNOWN_PHASE_4_PRODUCT_DEBT');
  assert.equal(result.results[0].accepted, true);
});

test('known product-debt verification fails when its result changes unexpectedly', async () => {
  const result = await runVerification(
    '/repo',
    [{ command: 'pnpm lint', expectedExitCodes: [1], classification: 'KNOWN_PRODUCT_DEBT' }],
    async () => ({ code: 2, stdout: '', stderr: 'configuration failure' }),
  );
  assert.equal(result.pass, false);
  assert.equal(result.results[0].accepted, false);
});

test('founder escalation stops automation', async () => {
  const result = await runControlLoop({
    verify: async () => ({ pass: true }),
    review: async () => ({ status: 'FOUNDER_DECISION_REQUIRED', summary: 'policy', findings: [] }),
    remediate: async () => {
      throw new Error('must not run');
    },
  });
  assert.equal(result.status, 'FOUNDER_DECISION_REQUIRED');
});

async function repositoryFixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'sparki-agent-test-'));
  await mkdir(path.join(root, '.sparki'));
  await writeFile(path.join(root, '.sparki/CURRENT_PHASE.md'), 'phase');
  await writeFile(path.join(root, 'pnpm-workspace.yaml'), 'packages: []');
  return root;
}

function gitMock(root, { branch = 'feature', dirty = '' } = {}) {
  return async (_command, args) => {
    if (args[0] === 'rev-parse') return { code: 0, stdout: `${root}\n`, stderr: '' };
    if (args[0] === 'branch') return { code: 0, stdout: `${branch}\n`, stderr: '' };
    if (args[0] === 'status') return { code: 0, stdout: dirty, stderr: '' };
    throw new Error('unexpected git call');
  };
}

test('execution is refused on main', async () => {
  const root = await repositoryFixture();
  await assert.rejects(
    validateRepository(root, { implementation: true, run: gitMock(root, { branch: 'main' }) }),
    /refused on main/,
  );
});

test('execution is refused with dirty tracked source', async () => {
  const root = await repositoryFixture();
  await assert.rejects(
    validateRepository(root, {
      implementation: true,
      run: gitMock(root, { dirty: ' M apps/api/source.ts\n' }),
    }),
    /dirty tracked files/,
  );
});

test('missing CLI is reported without fallback', async () => {
  const result = await detectCli('codex', {
    run: async () => ({ code: 127, stdout: '', stderr: 'not found' }),
  });
  assert.deepEqual(result, {
    installed: false,
    authenticated: false,
    detail: 'codex CLI not found',
  });
});
