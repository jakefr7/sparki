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
const sandboxUnavailable = (resource) => ({
  status: 'PASS',
  summary: `Implementation complete; ${resource} was unavailable in the managed sandbox.`,
  findings: [
    {
      severity: 'medium',
      fileOrSystem: 'Codex managed sandbox',
      problem: `${resource} was unavailable.`,
      whyItMatters: 'The implementer could not run the runtime-dependent check.',
      requiredCorrection: 'Delegate the check to orchestrator-owned local verification.',
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
    implementation,
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

for (const resource of ['PostgreSQL connection', 'loopback port binding']) {
  test(`completed implementation with unavailable ${resource} proceeds to local verification`, async () => {
    const calls = [];
    const result = await runControlLoop({
      implementation: sandboxUnavailable(resource),
      verify: async () => {
        calls.push('verify');
        return { pass: true };
      },
      review: async () => {
        calls.push('review');
        return pass();
      },
      remediate: async () => {
        calls.push('remediate');
        return pass();
      },
    });
    assert.equal(result.status, 'PASS');
    assert.deepEqual(calls, ['verify', 'review']);
  });
}

test('actual implementation failure stops before local verification', async () => {
  let verified = false;
  const implementation = {
    status: 'FAILED',
    summary: 'Required source edit could not be completed.',
    findings: [],
  };
  const result = await runControlLoop({
    implementation,
    verify: async () => {
      verified = true;
      return { pass: true };
    },
    review: async () => pass(),
    remediate: async () => pass(),
  });
  assert.equal(result.status, 'FAILED');
  assert.equal(result.agent, implementation);
  assert.equal(verified, false);
});

test('implementation founder escalation stops before local verification', async () => {
  let verified = false;
  const implementation = {
    status: 'FOUNDER_DECISION_REQUIRED',
    summary: 'The requested edit requires a policy decision.',
    findings: [],
  };
  const result = await runControlLoop({
    implementation,
    verify: async () => {
      verified = true;
      return { pass: true };
    },
    review: async () => pass(),
    remediate: async () => pass(),
  });
  assert.equal(result.status, 'FOUNDER_DECISION_REQUIRED');
  assert.equal(result.agent, implementation);
  assert.equal(verified, false);
});

test('CHANGES_REQUIRED invokes remediation, verification, and another review', async () => {
  const calls = [];
  const result = await runControlLoop({
    verify: async () => {
      calls.push('verify');
      return { pass: true };
    },
    review: async () => {
      calls.push('review');
      return calls.filter((call) => call === 'review').length === 1 ? changes() : pass();
    },
    remediate: async () => {
      calls.push('remediate');
      return pass();
    },
  });
  assert.equal(result.status, 'PASS');
  assert.equal(result.reviewCount, 2);
  assert.equal(result.remediationCount, 1);
  assert.deepEqual(calls, ['verify', 'review', 'remediate', 'verify', 'review']);
});

test('maximum remediation cycles stop before an additional remediation', async () => {
  let remediations = 0;
  const result = await runControlLoop({
    verify: async () => ({ pass: true }),
    review: async () => changes(),
    remediate: async () => {
      remediations += 1;
      return pass();
    },
    maxCycles: 2,
  });
  assert.equal(result.status, 'FAILED');
  assert.equal(result.reason, 'maximum remediation cycles reached');
  assert.equal(result.reviewCount, 3);
  assert.equal(result.remediationCount, 2);
  assert.equal(remediations, 2);
});

test('CHANGES_REQUIRED remediation result is a failure, not a successful remediation', async () => {
  const result = await runControlLoop({
    verify: async () => ({ pass: true }),
    review: async () => changes(),
    remediate: async () => changes(),
  });
  assert.equal(result.status, 'FAILED');
  assert.equal(result.agent.status, 'CHANGES_REQUIRED');
  assert.equal(result.reviewCount, 1);
  assert.equal(result.remediationCount, 1);
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

test('local verification failure triggers remediation and rerun', async () => {
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

test('local verification pass proceeds to Claude review', async () => {
  const calls = [];
  const result = await runControlLoop({
    implementation: pass('implementation complete'),
    verify: async () => {
      calls.push('verify');
      return { pass: true };
    },
    review: async () => {
      calls.push('review');
      return pass('Claude approved');
    },
    remediate: async () => {
      calls.push('remediate');
      return pass();
    },
  });
  assert.equal(result.status, 'PASS');
  assert.equal(result.review.summary, 'Claude approved');
  assert.deepEqual(calls, ['verify', 'review']);
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

test('FAILED review stops automation without remediation', async () => {
  let remediated = false;
  const failure = { status: 'FAILED', summary: 'review infrastructure failed', findings: [] };
  const result = await runControlLoop({
    verify: async () => ({ pass: true }),
    review: async () => failure,
    remediate: async () => {
      remediated = true;
      return pass();
    },
  });
  assert.equal(result.status, 'FAILED');
  assert.equal(result.agent, failure);
  assert.equal(remediated, false);
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
