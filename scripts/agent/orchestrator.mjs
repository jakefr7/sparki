#!/usr/bin/env node
/* global console, URL */
import { access, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import {
  createRun,
  formatResult,
  parseJsonOutput,
  readPhase,
  runFile,
  runStreaming,
  validateAgentStatus,
  writeArtifact,
} from './utilities.mjs';
import { createProgressState, ProgressReporter } from './progress.mjs';

const MAX_CYCLES = 3;
const DEFAULT_CLAUDE_BIN = 'claude-sparki';
const MEMORY_FILES = [
  'PROJECT_STATE.md',
  'CURRENT_PHASE.md',
  'PRODUCT_RULES.md',
  'TERMINOLOGY.md',
  'DECISIONS.md',
  'KNOWN_GAPS.md',
];

export async function validateRepository(root, { implementation = false, run = runFile } = {}) {
  const top = await run('git', ['rev-parse', '--show-toplevel'], { cwd: root });
  if (top.code !== 0 || path.resolve(top.stdout.trim()) !== path.resolve(root))
    throw new Error('Run from the Sparki repository root');
  await access(path.join(root, 'pnpm-workspace.yaml'));
  await access(path.join(root, '.sparki/CURRENT_PHASE.md'));
  const branch = (await run('git', ['branch', '--show-current'], { cwd: root })).stdout.trim();
  const dirty = (
    await run('git', ['status', '--porcelain=v1', '--untracked-files=no'], { cwd: root })
  ).stdout.trim();
  if (implementation && ['main', 'master'].includes(branch))
    throw new Error('Implementation is refused on main; switch to the phase branch first');
  if (implementation && dirty)
    throw new Error(
      'Implementation is refused with dirty tracked files; commit or stash them first (or use an explicit library-level override)',
    );
  return { branch, dirty };
}

export function configuredClaudeBin(env = process.env) {
  return env.CLAUDE_BIN?.trim() || DEFAULT_CLAUDE_BIN;
}

export async function detectCli(
  name,
  { root = process.cwd(), run = runFile, kind = name === 'codex' ? 'codex' : 'claude' } = {},
) {
  const version = await run(name, ['--version'], { cwd: root });
  if (version.code !== 0)
    return { installed: false, authenticated: false, detail: `${name} CLI not found` };
  const authArgs = kind === 'codex' ? ['login', 'status'] : ['auth', 'status'];
  const auth = await run(name, authArgs, { cwd: root });
  const combined = `${auth.stdout}\n${auth.stderr}`;
  let authenticated = auth.code === 0 && /logged in|authenticated/i.test(combined);
  if (kind === 'claude') {
    try {
      authenticated = auth.code === 0 && JSON.parse(auth.stdout).loggedIn === true;
    } catch {
      authenticated = false;
    }
  }
  return { installed: true, authenticated, detail: version.stdout.trim() || version.stderr.trim() };
}

function outputSchema(root) {
  return path.join(root, 'scripts/agent/agent-response.schema.json');
}

export async function invokeCodex({ root, prompt, mode, outputPath, run = runStreaming }) {
  const args = [
    'exec',
    '--ephemeral',
    '-C',
    root,
    '--sandbox',
    mode === 'plan' ? 'read-only' : 'workspace-write',
    '--output-schema',
    outputSchema(root),
    '--output-last-message',
    outputPath,
    prompt,
  ];
  const result = await run('codex', args, { cwd: root });
  if (result.code !== 0) throw new Error(`Codex failed: ${result.stderr || result.stdout}`);
  return parseJsonOutput(await readFile(outputPath, 'utf8'));
}

export async function invokeClaude({
  root,
  prompt,
  executable = configuredClaudeBin(),
  run = runStreaming,
}) {
  const sharedSchema = JSON.parse(await readFile(outputSchema(root), 'utf8'));
  const { $schema: _unsupportedDraftDeclaration, ...claudeSchema } = sharedSchema;
  const schema = JSON.stringify(claudeSchema);
  const args = [
    '-p',
    '--no-session-persistence',
    '--permission-mode',
    'plan',
    '--disallowedTools',
    'Edit,Write,NotebookEdit',
    '--json-schema',
    schema,
    prompt,
  ];
  const result = await run(executable, args, { cwd: root });
  if (result.code !== 0) throw new Error(`Claude failed: ${result.stderr || result.stdout}`);
  return parseJsonOutput(result.stdout);
}

function requiredReading() {
  return MEMORY_FILES.map((file) => `.sparki/${file}`).join(', ');
}

function artifactMarkdown(title, status) {
  const findings = status.findings.length
    ? status.findings
        .map((item) => `- ${typeof item === 'string' ? item : JSON.stringify(item)}`)
        .join('\n')
    : '- None';
  return `# ${title}\n\nStatus: ${status.status}\n\n${status.summary}\n\n## Findings\n\n${findings}`;
}

export function normalizePlanningStatus(plan) {
  const validated = validateAgentStatus(plan);
  if (validated.status !== 'CHANGES_REQUIRED') return validated;
  return {
    ...validated,
    status: 'PASS',
    summary: `Planning completed with an executable scoped plan. ${validated.summary}`,
  };
}

export function normalizeRemediationStatus(remediation) {
  const validated = validateAgentStatus(remediation);
  if (
    validated.status === 'FAILED' &&
    /\b(?:edits?|implementation|remediation)(?:\s+\w+){0,3}\s+(?:are|is)\s+complete\b/i.test(
      validated.summary,
    )
  ) {
    return {
      ...validated,
      status: 'PASS',
      summary: `Remediation edits are complete; authoritative local verification remains with the orchestrator. ${validated.summary}`,
    };
  }
  return validated;
}

export function phaseStatusForOutcome(outcome) {
  if (outcome.status === 'PASS') return 'READY_FOR_FOUNDER_REVIEW';
  if (outcome.status === 'FOUNDER_DECISION_REQUIRED') return 'FOUNDER_DECISION_REQUIRED';
  if (outcome.status === 'CHANGES_REQUIRED') return 'CHANGES_REQUIRED';
  return 'FAILED';
}

async function saveRunState(runDirectory, state) {
  await writeFile(
    path.join(runDirectory, 'run-state.json'),
    `${JSON.stringify(state, null, 2)}\n`,
    'utf8',
  );
}

async function founderDecision(runDirectory, status) {
  const findings = status.findings.length
    ? status.findings
        .map((item) => `- ${typeof item === 'string' ? item : JSON.stringify(item)}`)
        .join('\n')
    : '- See agent summary.';
  await writeArtifact(
    runDirectory,
    'FOUNDER_DECISION.md',
    `# Founder Decision\n\n## Decision required\n\n${status.summary}\n\n## Why it is required\n\n${findings}\n\n## Available options\n\n1. Approve a clearly bounded option and update the phase.\n2. Defer the disputed work.\n3. Revise the phase scope.\n\n## Agent recommendation\n\nChoose the narrowest option that preserves documented product and safety rules.\n\n## Risk of each option\n\n- Approval may expand risk and must be explicit.\n- Deferral may leave the phase incomplete.\n- Scope revision requires a new planning pass.`,
  );
}

export async function runControlLoop({
  verify,
  review,
  remediate,
  implementation,
  maxCycles = MAX_CYCLES,
}) {
  let remediationCount = 0;
  let reviewCount = 0;
  if (implementation) {
    const implementationResult = validateAgentStatus(implementation);
    if (implementationResult.status === 'FOUNDER_DECISION_REQUIRED')
      return {
        status: implementationResult.status,
        remediationCount,
        reviewCount,
        agent: implementationResult,
      };
    if (implementationResult.status === 'FAILED')
      return { status: 'FAILED', remediationCount, reviewCount, agent: implementationResult };
    if (implementationResult.status === 'CHANGES_REQUIRED') {
      const remediation = normalizeRemediationStatus(
        await remediate({ kind: 'implementation', implementation: implementationResult }),
      );
      remediationCount += 1;
      if (remediation.status !== 'PASS') {
        const status =
          remediation.status === 'FOUNDER_DECISION_REQUIRED'
            ? 'FOUNDER_DECISION_REQUIRED'
            : 'FAILED';
        return { status, remediationCount, reviewCount, agent: remediation };
      }
    }
  }
  let verification = await verify();
  while (!verification.pass) {
    if (remediationCount >= maxCycles)
      return {
        status: 'FAILED',
        reason: 'maximum remediation cycles reached',
        remediationCount,
        reviewCount,
        verification,
      };
    const remediation = normalizeRemediationStatus(
      await remediate({ kind: 'verification', verification }),
    );
    remediationCount += 1;
    if (remediation.status === 'FOUNDER_DECISION_REQUIRED')
      return { status: remediation.status, remediationCount, reviewCount, agent: remediation };
    if (remediation.status !== 'PASS')
      return { status: 'FAILED', remediationCount, reviewCount, agent: remediation };
    verification = await verify();
  }
  while (true) {
    const result = validateAgentStatus(await review());
    reviewCount += 1;
    if (result.status === 'PASS')
      return { status: 'PASS', remediationCount, reviewCount, verification, review: result };
    if (result.status === 'FOUNDER_DECISION_REQUIRED')
      return { status: result.status, remediationCount, reviewCount, agent: result };
    if (result.status === 'FAILED')
      return { status: 'FAILED', remediationCount, reviewCount, agent: result };
    if (remediationCount >= maxCycles)
      return {
        status: 'CHANGES_REQUIRED',
        reason: 'maximum remediation cycles reached',
        remediationCount,
        reviewCount,
        verification,
        review: result,
      };
    const remediation = normalizeRemediationStatus(
      await remediate({ kind: 'review', review: result }),
    );
    remediationCount += 1;
    if (remediation.status !== 'PASS') {
      const status =
        remediation.status === 'FOUNDER_DECISION_REQUIRED' ? 'FOUNDER_DECISION_REQUIRED' : 'FAILED';
      return { status, remediationCount, reviewCount, agent: remediation };
    }
    verification = await verify();
    while (!verification.pass) {
      if (remediationCount >= maxCycles)
        return {
          status: 'FAILED',
          reason: 'maximum remediation cycles reached',
          remediationCount,
          reviewCount,
          verification,
        };
      const verificationRemediation = normalizeRemediationStatus(
        await remediate({ kind: 'verification', verification }),
      );
      remediationCount += 1;
      if (verificationRemediation.status !== 'PASS')
        return {
          status:
            verificationRemediation.status === 'FOUNDER_DECISION_REQUIRED'
              ? 'FOUNDER_DECISION_REQUIRED'
              : 'FAILED',
          remediationCount,
          reviewCount,
          agent: verificationRemediation,
        };
      verification = await verify();
    }
  }
}

export async function runVerification(
  root,
  commands,
  run = runStreaming,
  { onCheckStart = async () => {}, onCheckComplete = async () => {} } = {},
) {
  const results = [];
  for (const [index, configuredCheck] of commands.entries()) {
    const check =
      typeof configuredCheck === 'string'
        ? { command: configuredCheck, expectedExitCodes: [0], classification: 'REQUIRED_PASS' }
        : configuredCheck;
    const { command, expectedExitCodes = [0], classification = 'REQUIRED_PASS' } = check;
    await onCheckStart({ index, command, check });
    const result = await run('/bin/zsh', ['-lc', command], { cwd: root });
    const accepted = expectedExitCodes.includes(result.code);
    results.push({ command, expectedExitCodes, classification, accepted, ...result });
    await onCheckComplete({ index, command, check, result, accepted });
    if (!accepted) break;
  }
  return {
    pass: results.length === commands.length && results.every((item) => item.accepted),
    results,
  };
}

export async function main(
  command,
  {
    root = process.cwd(),
    codex = invokeCodex,
    claude = invokeClaude,
    claudeBin = configuredClaudeBin(),
    run = runFile,
    stream = runStreaming,
    now,
    clock = () => new Date(),
    progressOutput = process.stderr,
  } = {},
) {
  if (!['plan', 'execute', 'review'].includes(command))
    throw new Error('Usage: orchestrator.mjs <plan|execute|review>');
  const implementation = command === 'execute';
  const repository = await validateRepository(root, { implementation, run });
  const phase = await readPhase(root);
  if (implementation && phase.config.status !== 'APPROVED')
    throw new Error(`Phase status must be APPROVED, got ${phase.config.status}`);
  if (implementation && repository.branch !== phase.config.branch)
    throw new Error(`Switch to the dedicated phase branch: ${phase.config.branch}`);

  const required =
    command === 'review'
      ? [{ executable: claudeBin, kind: 'claude' }]
      : command === 'plan'
        ? [{ executable: 'codex', kind: 'codex' }]
        : [
            { executable: 'codex', kind: 'codex' },
            { executable: claudeBin, kind: 'claude' },
          ];
  for (const { executable, kind } of required) {
    const cli = await detectCli(executable, { root, run, kind });
    if (!cli.installed) throw new Error(`${executable} CLI is required. Install it and retry.`);
    if (!cli.authenticated)
      throw new Error(
        `${executable} CLI is not authenticated. Run '${kind === 'codex' ? `${executable} login` : `${executable} auth login`}' once and retry.`,
      );
  }

  const currentRun = await createRun(root, now);
  const startedAt = (now ?? clock()).toISOString();
  const phaseName =
    phase.markdown.match(/^#\s+(.+)$/m)?.[1].split(/\s+[—-]\s+/)[0] ?? phase.config.id;
  const state = {
    phaseStatus: phase.config.status,
    verificationState: 'NOT_RUN',
    reviewState: 'NOT_RUN',
    founderDecisionState: 'NOT_REQUIRED',
    progress: createProgressState({
      phaseName,
      verificationCommands: phase.config.verification.map((check) =>
        typeof check === 'string' ? check : check.command,
      ),
      startedAt,
      maxCycles: MAX_CYCLES,
      initialStage: command === 'review' ? 'review' : 'planning',
    }),
  };
  const progress = new ProgressReporter({
    state: state.progress,
    persist: async () => saveRunState(currentRun.directory, state),
    output: progressOutput,
    now: clock,
  });
  progress.installSignalHandlers();
  await progress.update({});

  if (command === 'plan' || command === 'execute') {
    const planOutput = path.join(currentRun.directory, '.plan-output.json');
    let plan;
    try {
      plan = normalizePlanningStatus(
        await codex({
          root,
          mode: 'plan',
          outputPath: planOutput,
          prompt: `Act as the read-only PM defined in .sparki/agents/pm.md. Read ${requiredReading()}. Inspect repository state without editing. Produce a concrete plan for the current phase. For this planning stage, PASS means the approved phase has enough information to execute, the plan is concrete and scoped, and no founder decision is required; unresolved implementation work does not make the plan CHANGES_REQUIRED. CHANGES_REQUIRED is reserved for post-implementation review/remediation and must never be returned by the PM. Return only schema-valid JSON.`,
        }),
      );
    } catch (error) {
      await progress.update({
        stage: 'planning',
        stageState: 'failed',
        task: 'PM planning failed.',
        runActive: false,
        completed: true,
      });
      progress.removeSignalHandlers();
      throw error;
    }
    await writeArtifact(currentRun.directory, 'plan.md', artifactMarkdown('Plan', plan), plan);
    if (plan.status === 'FOUNDER_DECISION_REQUIRED') {
      await founderDecision(currentRun.directory, plan);
      state.phaseStatus = plan.status;
      state.founderDecisionState = 'REQUIRED';
      await progress.update({
        stage: 'planning',
        stageState: 'founder',
        task: 'Founder decision required during planning.',
        runActive: false,
        completed: true,
      });
      progress.removeSignalHandlers();
      return state;
    }
    if (plan.status !== 'PASS') {
      await progress.update({
        stage: 'planning',
        stageState: 'failed',
        task: 'PM planning did not pass.',
        runActive: false,
        completed: true,
      });
      progress.removeSignalHandlers();
      throw new Error(`Planning did not pass: ${plan.summary}`);
    }
    await progress.update({
      stage: 'planning',
      stageState: 'complete',
      task: command === 'plan' ? 'PM planning complete.' : 'Starting Codex implementation...',
      runActive: command !== 'plan',
      completed: command === 'plan',
    });
    if (command === 'plan') {
      progress.removeSignalHandlers();
      return state;
    }
    await progress.update({
      stage: 'implementation',
      stageState: 'running',
      task: 'Codex is implementing the approved phase...',
    });
  }

  if (command === 'review') {
    let review;
    try {
      review = await claude({
        root,
        executable: claudeBin,
        prompt: `Perform the read-only review in .sparki/agents/reviewer.md. Read ${requiredReading()}, inspect the current git diff and tests, and return only schema-valid JSON.`,
      });
    } catch (error) {
      await progress.update({
        stage: 'review',
        stageState: 'failed',
        task: 'Claude review failed.',
        runActive: false,
        completed: true,
      });
      progress.removeSignalHandlers();
      throw error;
    }
    await writeArtifact(
      currentRun.directory,
      'review-1.md',
      artifactMarkdown('Independent Review', review),
      review,
    );
    state.reviewState = review.status;
    if (review.status === 'FOUNDER_DECISION_REQUIRED') {
      await founderDecision(currentRun.directory, review);
      state.founderDecisionState = 'REQUIRED';
    }
    await progress.update({
      stage: 'review',
      stageState:
        review.status === 'FOUNDER_DECISION_REQUIRED'
          ? 'founder'
          : review.status === 'FAILED'
            ? 'failed'
            : 'complete',
      task:
        review.status === 'FOUNDER_DECISION_REQUIRED'
          ? 'Founder decision required.'
          : 'Claude review complete.',
      runActive: false,
      completed: true,
    });
    progress.removeSignalHandlers();
    return state;
  }

  const implementationOutput = path.join(currentRun.directory, '.implementation-output.json');
  let implementationResult;
  try {
    implementationResult = await codex({
      root,
      mode: 'implementation',
      outputPath: implementationOutput,
      prompt: `Act as the implementer defined in .sparki/agents/implementer.md. Read ${requiredReading()} and this run's plan.md. Implement only the approved phase. Do not merge or deploy. The orchestrator, not your managed sandbox, owns authoritative verification. Return PASS when the requested implementation edits are complete, even if PostgreSQL, loopback ports, Playwright servers, or other local runtime resources are unavailable in your sandbox; report any checks you could not run in summary and findings for the orchestrator to verify locally. Return FAILED only when the implementation itself could not be completed, and preserve FOUNDER_DECISION_REQUIRED for genuine escalation. Return only schema-valid JSON.`,
    });
  } catch (error) {
    await progress.update({
      stage: 'implementation',
      stageState: 'failed',
      task: 'Codex implementation failed.',
      runActive: false,
      completed: true,
    });
    progress.removeSignalHandlers();
    throw error;
  }
  await writeArtifact(
    currentRun.directory,
    'implementation.md',
    artifactMarkdown('Implementation', implementationResult),
    implementationResult,
  );
  await progress.update({
    stage: 'implementation',
    stageState:
      implementationResult.status === 'FOUNDER_DECISION_REQUIRED'
        ? 'founder'
        : implementationResult.status === 'FAILED'
          ? 'failed'
          : 'complete',
    task:
      implementationResult.status === 'PASS'
        ? 'Codex implementation complete; starting verification.'
        : 'Codex implementation returned an actionable result.',
  });
  let verificationIndex = 0;
  let reviewIndex = 0;
  let remediationIndex = 0;
  const outcome = await runControlLoop({
    implementation: implementationResult,
    verify: async () => {
      await progress.startVerification(Math.max(1, remediationIndex));
      const result = await runVerification(root, phase.config.verification, stream, {
        onCheckStart: ({ index }) => progress.startCheck(index),
        onCheckComplete: ({ index, accepted }) => progress.completeCheck(index, accepted),
      });
      verificationIndex += 1;
      const body = result.results
        .map((item) =>
          formatResult(
            `${item.command} [${item.classification}; expected exit ${item.expectedExitCodes.join(', ')}]`,
            item,
          ),
        )
        .join('\n\n');
      await writeArtifact(
        currentRun.directory,
        verificationIndex === 1 ? 'verification.md' : `verification-${verificationIndex}.md`,
        body,
      );
      state.verificationState = result.pass ? 'PASS' : 'FAILED';
      await progress.update({
        stage: 'verification',
        stageState: result.pass ? 'complete' : 'failed',
        task: result.pass
          ? 'Local verification complete; starting Claude review.'
          : 'Local verification failed; starting remediation.',
        verificationCheck: null,
      });
      return result;
    },
    review: async () => {
      reviewIndex += 1;
      await progress.update({
        stage: 'review',
        stageState: 'running',
        task: `Claude is reviewing cycle ${Math.max(1, remediationIndex)}...`,
        verificationCheck: null,
      });
      let result;
      try {
        result = await claude({
          root,
          executable: claudeBin,
          prompt: `Perform review ${reviewIndex} per .sparki/agents/reviewer.md. Read ${requiredReading()}, the run artifacts in ${path.relative(root, currentRun.directory)}, git diff, architecture, and tests. Return only schema-valid JSON.`,
        });
      } catch (error) {
        await progress.update({
          stage: 'review',
          stageState: 'failed',
          task: 'Claude review failed.',
          runActive: false,
          completed: true,
        });
        throw error;
      }
      await writeArtifact(
        currentRun.directory,
        `review-${reviewIndex}.md`,
        artifactMarkdown(`Review ${reviewIndex}`, result),
        result,
      );
      state.reviewState = result.status;
      await progress.update({
        stage: 'review',
        stageState:
          result.status === 'FOUNDER_DECISION_REQUIRED'
            ? 'founder'
            : result.status === 'FAILED'
              ? 'failed'
              : 'complete',
        task:
          result.status === 'PASS'
            ? 'Claude review passed.'
            : result.status === 'CHANGES_REQUIRED'
              ? 'Claude requested remediation.'
              : result.status === 'FOUNDER_DECISION_REQUIRED'
                ? 'Founder decision required.'
                : 'Claude review failed.',
      });
      return result;
    },
    remediate: async (failure) => {
      remediationIndex += 1;
      await progress.update({
        stage: 'remediation',
        stageState: 'running',
        task: `Codex is applying remediation cycle ${remediationIndex}...`,
        cycle: remediationIndex,
        verificationCheck: null,
      });
      const outputPath = path.join(
        currentRun.directory,
        `.remediation-${remediationIndex}-output.json`,
      );
      let result;
      try {
        result = await codex({
          root,
          mode: 'implementation',
          outputPath,
          prompt: `Act as remediation per .sparki/agents/remediation.md. Read ${requiredReading()} and correct only this failure: ${JSON.stringify(failure)}. Work in the repository working tree; do not create a commit during an orchestrated remediation, and do not treat read-only .git access as a remediation failure. The orchestrator owns authoritative verification outside your managed sandbox. Return PASS when the requested remediation edits are complete, even if PostgreSQL, loopback ports, Playwright servers, or other local runtime resources are unavailable in your sandbox; report unavailable checks in summary and findings. Return FAILED only when remediation itself could not be completed, and preserve FOUNDER_DECISION_REQUIRED for genuine escalation. Return only schema-valid JSON.`,
        });
      } catch (error) {
        await progress.update({
          stage: 'remediation',
          stageState: 'failed',
          task: `Remediation cycle ${remediationIndex} failed.`,
          runActive: false,
          completed: true,
        });
        throw error;
      }
      await writeArtifact(
        currentRun.directory,
        `remediation-${remediationIndex}.md`,
        artifactMarkdown(`Remediation ${remediationIndex}`, result),
        result,
      );
      await progress.update({
        stage: 'remediation',
        stageState:
          result.status === 'FOUNDER_DECISION_REQUIRED'
            ? 'founder'
            : result.status === 'PASS'
              ? 'complete'
              : 'failed',
        task:
          result.status === 'PASS'
            ? `Remediation cycle ${remediationIndex} complete; rerunning verification.`
            : result.status === 'FOUNDER_DECISION_REQUIRED'
              ? 'Founder decision required during remediation.'
              : `Remediation cycle ${remediationIndex} failed.`,
      });
      return result;
    },
  });

  if (outcome.status === 'FOUNDER_DECISION_REQUIRED') {
    await founderDecision(currentRun.directory, outcome.agent);
    state.founderDecisionState = 'REQUIRED';
  }
  state.phaseStatus = phaseStatusForOutcome(outcome);
  if (outcome.status === 'PASS') {
    await progress.update({
      stage: 'founderReview',
      stageState: 'pending',
      task: 'Ready for founder review.',
      runActive: false,
      completed: true,
      verificationCheck: null,
    });
  } else if (outcome.status === 'FOUNDER_DECISION_REQUIRED') {
    await progress.update({
      stage: state.progress.currentStage,
      stageState: 'founder',
      task: 'Founder decision required.',
      runActive: false,
      completed: true,
      verificationCheck: null,
    });
  } else if (outcome.status === 'CHANGES_REQUIRED') {
    await progress.update({
      stage: 'review',
      stageState: 'pending',
      task: 'Maximum remediation cycles reached; review changes remain unresolved.',
      runActive: false,
      completed: true,
      verificationCheck: null,
    });
  } else {
    await progress.update({
      stage: state.progress.currentStage,
      stageState: 'failed',
      task: outcome.reason ?? 'Orchestration failed.',
      runActive: false,
      completed: true,
      verificationCheck: null,
    });
  }
  progress.removeSignalHandlers();
  return state;
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  main(process.argv[2])
    .then((state) => console.log(JSON.stringify(state, null, 2)))
    .catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    });
}
