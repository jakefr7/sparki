import assert from 'node:assert/strict';
import test from 'node:test';
import { createProgressState, ProgressReporter, renderProgress } from './progress.mjs';

const start = new Date('2026-08-13T20:00:00.000Z');
const later = new Date('2026-08-13T20:04:18.000Z');

function output(isTTY) {
  return {
    isTTY,
    writes: [],
    write(value) {
      this.writes.push(value);
    },
  };
}

function fixture(isTTY = true) {
  const state = createProgressState({
    phaseName: 'Phase 1',
    verificationCommands: [
      'pnpm test',
      'pnpm test:integration',
      'pnpm test:e2e',
      'pnpm lint',
      'pnpm typecheck',
      'pnpm build',
    ],
    startedAt: start.toISOString(),
    maxCycles: 3,
  });
  const writes = output(isTTY);
  const persisted = [];
  const reporter = new ProgressReporter({
    state,
    output: writes,
    now: () => later,
    persist: async (value) => persisted.push(structuredClone(value)),
  });
  return { state, reporter, writes, persisted };
}

test('normal stage progression renders completed and active major stages', async () => {
  const { state, reporter, persisted } = fixture();
  await reporter.update({ stage: 'planning', stageState: 'complete', task: 'Planning complete.' });
  await reporter.update({
    stage: 'implementation',
    stageState: 'running',
    task: 'Implementing...',
  });
  const frame = renderProgress(state, later);
  assert.match(frame, /✓ PM Planning/);
  assert.match(frame, /● Codex Implementation/);
  assert.match(frame, /○ Verification/);
  assert.equal(persisted.length, 2);
});

test('verification sub-stage progression shows checks as they run and complete', async () => {
  const { state, reporter } = fixture();
  await reporter.startVerification(1);
  await reporter.startCheck(0);
  await reporter.completeCheck(0, true);
  await reporter.startCheck(1);
  const frame = renderProgress(state, later);
  assert.match(frame, /  ✓ Unit/);
  assert.match(frame, /  ● Integration/);
  assert.match(frame, /  ○ Playwright/);
  assert.equal(state.currentVerificationCheck, 'Integration');
});

test('known deferred verification debt is recorded without marking the check failed', async () => {
  const { state, reporter } = fixture();
  await reporter.startVerification(1);
  await reporter.startCheck(1);
  await reporter.completeCheck(1, 'COMPLETE_WITH_KNOWN_DEBT');
  assert.equal(state.verificationChecks[1].state, 'COMPLETE_WITH_KNOWN_DEBT');
  assert.equal(state.stages.verification, 'running');
  assert.equal(state.currentTask, 'Integration completed with known deferred debt.');
  assert.match(renderProgress(state, later), /◇ Integration/);
});

test('remediation cycle is displayed with the configured maximum', async () => {
  const { state, reporter } = fixture();
  await reporter.update({
    stage: 'remediation',
    stageState: 'running',
    task: 'Applying findings...',
    cycle: 2,
  });
  const frame = renderProgress(state, later);
  assert.match(frame, /● Remediation/);
  assert.match(frame, /Cycle: 2 \/ 3/);
  assert.match(frame, /Elapsed: 04:18/);
});

test('failed stage remains visible with a concise current task', async () => {
  const { state, reporter } = fixture();
  await reporter.update({
    stage: 'verification',
    stageState: 'failed',
    task: 'Integration failed; preparing remediation.',
  });
  const frame = renderProgress(state, later);
  assert.match(frame, /✗ Verification/);
  assert.match(frame, /Current: Integration failed; preparing remediation\./);
});

test('founder decision state uses the founder marker', async () => {
  const { state, reporter } = fixture();
  await reporter.update({
    stage: 'review',
    stageState: 'founder',
    task: 'Founder decision required.',
    runActive: false,
    completed: true,
  });
  assert.match(renderProgress(state, later), /! Claude Review/);
  assert.equal(state.runActive, false);
});

test('interrupt marks the active stage failed and closes the durable run', async () => {
  const { state, reporter } = fixture();
  await reporter.update({
    stage: 'implementation',
    stageState: 'running',
    task: 'Implementing...',
  });
  await reporter.interrupt('SIGINT');
  assert.equal(state.stages.implementation, 'failed');
  assert.equal(state.runActive, false);
  assert.equal(state.currentTask, 'Interrupted by SIGINT.');
  assert.equal(state.completedAt, later.toISOString());
});

test('completed run reports ready for founder review without marking it complete', async () => {
  const { state, reporter } = fixture();
  await reporter.update({ stage: 'planning', stageState: 'complete', task: 'Planning complete.' });
  await reporter.update({
    stage: 'implementation',
    stageState: 'complete',
    task: 'Implementation complete.',
  });
  await reporter.update({
    stage: 'verification',
    stageState: 'complete',
    task: 'Verification complete.',
  });
  await reporter.update({ stage: 'review', stageState: 'complete', task: 'Review complete.' });
  await reporter.update({
    stage: 'founderReview',
    stageState: 'pending',
    task: 'Ready for founder review.',
    runActive: false,
    completed: true,
  });
  const frame = renderProgress(state, later);
  assert.match(frame, /✓ Claude Review/);
  assert.match(frame, /○ Founder Review/);
  assert.match(frame, /Current: Ready for founder review\./);
});

test('non-TTY fallback emits one concise line per meaningful update without ANSI control codes', async () => {
  const { reporter, writes } = fixture(false);
  await reporter.update({ stage: 'planning', stageState: 'complete', task: 'Planning complete.' });
  await reporter.update({
    stage: 'implementation',
    stageState: 'running',
    task: 'Implementing...',
  });
  assert.equal(writes.writes.length, 2);
  assert.match(writes.writes[0], /^\[SPARKI\] ✓ PM Planning/);
  assert.match(writes.writes[1], /^\[SPARKI\] ● Codex Implementation/);
  assert.equal(
    writes.writes.some((value) => value.includes('\u001b[')),
    false,
  );
});
