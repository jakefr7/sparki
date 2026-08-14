import { execFile, spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
export const TERMINAL_STATUSES = [
  'PASS',
  'CHANGES_REQUIRED',
  'FOUNDER_DECISION_REQUIRED',
  'FAILED',
];

export async function runFile(command, args, options = {}) {
  try {
    const result = await execFileAsync(command, args, {
      cwd: options.cwd,
      env: options.env ?? process.env,
      maxBuffer: 10 * 1024 * 1024,
    });
    return { code: 0, stdout: result.stdout, stderr: result.stderr };
  } catch (error) {
    return {
      code: Number.isInteger(error.code) ? error.code : 1,
      stdout: error.stdout ?? '',
      stderr: error.stderr ?? error.message,
    };
  }
}

export function runStreaming(command, args, { cwd, env = process.env } = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, args, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    child.on('error', (error) => resolve({ code: 1, stdout, stderr: `${stderr}${error.message}` }));
    child.on('close', (code) => resolve({ code: code ?? 1, stdout, stderr }));
  });
}

export function validateAgentStatus(value, allowed = TERMINAL_STATUSES) {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Agent output must be a JSON object');
  const unexpectedFields = Object.keys(value).filter(
    (field) => !['status', 'summary', 'findings'].includes(field),
  );
  if (unexpectedFields.length)
    throw new Error(`Agent output has unexpected field: ${unexpectedFields[0]}`);
  if (!allowed.includes(value.status))
    throw new Error(`Invalid agent status: ${String(value.status)}`);
  if (typeof value.summary !== 'string') throw new Error('Agent output requires a string summary');
  if (!Array.isArray(value.findings)) throw new Error('Agent output requires a findings array');
  const findingFields = [
    'severity',
    'fileOrSystem',
    'problem',
    'whyItMatters',
    'requiredCorrection',
  ];
  const severities = ['low', 'medium', 'high', 'critical'];
  for (const [index, finding] of value.findings.entries()) {
    if (!finding || typeof finding !== 'object' || Array.isArray(finding))
      throw new Error(`Agent finding ${index} must be a JSON object`);
    const unexpectedFindingFields = Object.keys(finding).filter(
      (field) => !findingFields.includes(field),
    );
    if (unexpectedFindingFields.length)
      throw new Error(
        `Agent finding ${index} has unexpected field: ${unexpectedFindingFields[0]}`,
      );
    if (!severities.includes(finding.severity))
      throw new Error(`Agent finding ${index} has invalid severity`);
    for (const field of findingFields.slice(1)) {
      if (typeof finding[field] !== 'string')
        throw new Error(`Agent finding ${index} requires a string ${field}`);
    }
  }
  return value;
}

export function parseJsonOutput(text, allowed) {
  let value;
  try {
    value = JSON.parse(text.trim());
  } catch {
    throw new Error('Agent returned malformed JSON');
  }
  return validateAgentStatus(value, allowed);
}

export async function readPhase(root) {
  const markdown = await readFile(path.join(root, '.sparki/CURRENT_PHASE.md'), 'utf8');
  const match = markdown.match(/<!-- sparki-phase-config\s*([\s\S]*?)\s*-->/);
  if (!match) throw new Error('CURRENT_PHASE.md has no sparki-phase-config block');
  let config;
  try {
    config = JSON.parse(match[1]);
  } catch {
    throw new Error('CURRENT_PHASE.md has malformed phase configuration JSON');
  }
  if (!config.id || !config.branch || !Array.isArray(config.verification))
    throw new Error('Phase configuration is incomplete');
  return { markdown, config };
}

export function makeRunId(now = new Date()) {
  return now.toISOString().replace(/[:.]/g, '-');
}

export async function createRun(root, now) {
  const id = makeRunId(now);
  const directory = path.join(root, '.sparki/runs', id);
  await mkdir(directory, { recursive: false });
  return { id, directory };
}

export async function writeArtifact(directory, name, markdown, status) {
  await writeFile(path.join(directory, name), `${markdown.trim()}\n`, 'utf8');
  if (status)
    await writeFile(
      path.join(directory, name.replace(/\.md$/, '.json')),
      `${JSON.stringify(status, null, 2)}\n`,
      'utf8',
    );
}

export function redact(text) {
  return String(text)
    .replace(/(api[_-]?key|token|password|secret)(\s*[=:]\s*)\S+/gi, '$1$2[REDACTED]')
    .replace(/(Bearer\s+)\S+/gi, '$1[REDACTED]');
}

export function formatResult(title, result) {
  const classification = result.state
    ? `\n\nVerification state: ${result.state}`
    : '';
  const deferredFailure = result.deferredFailure
    ? `\n\nDeferred failure: ${result.deferredFailure.classification} (exit ${result.deferredFailure.exitCode})`
    : '';
  return `# ${title}\n\nExit code: ${result.code}${classification}${deferredFailure}\n\n## Standard output\n\n\`\`\`text\n${redact(result.stdout)}\n\`\`\`\n\n## Standard error\n\n\`\`\`text\n${redact(result.stderr)}\n\`\`\``;
}
