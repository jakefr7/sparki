#!/usr/bin/env node
/* global console, URL */
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { readPhase, runFile } from './utilities.mjs';

export async function collectStatus(root = process.cwd()) {
  const phase = await readPhase(root);
  const branch =
    (await runFile('git', ['branch', '--show-current'], { cwd: root })).stdout.trim() || 'UNKNOWN';
  const runsRoot = path.join(root, '.sparki/runs');
  const runs = (await readdir(runsRoot, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  const lastRun = runs.at(-1) ?? 'NONE';
  let state = {};
  if (lastRun !== 'NONE') {
    try {
      state = JSON.parse(await readFile(path.join(runsRoot, lastRun, 'run-state.json'), 'utf8'));
    } catch {
      state = {};
    }
  }
  return {
    currentPhase: phase.config.id,
    phaseStatus: state.phaseStatus ?? phase.config.status,
    currentBranch: branch,
    lastRun,
    verificationState: state.verificationState ?? 'NOT_RUN',
    reviewState: state.reviewState ?? 'NOT_RUN',
    founderDecisionState: state.founderDecisionState ?? 'NOT_REQUIRED',
  };
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  const status = await collectStatus();
  for (const [key, value] of Object.entries(status))
    console.log(`${key.replace(/[A-Z]/g, (letter) => ` ${letter.toLowerCase()}`)}: ${value}`);
}
