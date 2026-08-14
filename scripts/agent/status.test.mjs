import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { collectStatus } from './status.mjs';

test('status reports durable active stage, verification check, cycle, and elapsed time', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'sparki-status-test-'));
  const runDirectory = path.join(root, '.sparki/runs/2026-08-13T20-00-00-000Z');
  await mkdir(runDirectory, { recursive: true });
  await writeFile(
    path.join(root, '.sparki/CURRENT_PHASE.md'),
    `# Phase 1 — Test\n\n<!-- sparki-phase-config\n{"id":"phase-1","branch":"feature","status":"APPROVED","verification":[]}\n-->\n`,
  );
  await writeFile(
    path.join(runDirectory, 'run-state.json'),
    JSON.stringify({
      phaseStatus: 'APPROVED',
      verificationState: 'NOT_RUN',
      reviewState: 'NOT_RUN',
      founderDecisionState: 'NOT_REQUIRED',
      progress: {
        runActive: true,
        currentStage: 'verification',
        currentVerificationCheck: 'Integration',
        cycle: 2,
        startedAt: '2026-08-13T20:00:00.000Z',
        updatedAt: '2026-08-13T20:04:00.000Z',
      },
    }),
  );
  const status = await collectStatus(root, new Date('2026-08-13T20:04:18.000Z'));
  assert.equal(status.runActive, true);
  assert.equal(status.currentStage, 'Verification');
  assert.equal(status.currentVerificationCheck, 'Integration');
  assert.equal(status.cycle, 2);
  assert.equal(status.elapsed, '04:18');
});
