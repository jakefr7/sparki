import process from 'node:process';

export const STAGES = [
  ['planning', 'PM Planning'],
  ['implementation', 'Codex Implementation'],
  ['verification', 'Verification'],
  ['review', 'Claude Review'],
  ['remediation', 'Remediation'],
  ['founderReview', 'Founder Review'],
];

const SYMBOLS = {
  complete: '✓',
  running: '●',
  pending: '○',
  failed: '✗',
  founder: '!',
};

export function verificationLabel(command) {
  const labels = new Map([
    ['pnpm test', 'Unit'],
    ['pnpm test:integration', 'Integration'],
    ['pnpm test:e2e', 'Playwright'],
    ['pnpm lint', 'Lint'],
    ['pnpm typecheck', 'Typecheck'],
    ['pnpm build', 'Build'],
  ]);
  return labels.get(command) ?? command;
}

export function formatElapsed(milliseconds) {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const clock = [minutes, seconds].map((value) => String(value).padStart(2, '0')).join(':');
  return hours ? `${String(hours).padStart(2, '0')}:${clock}` : clock;
}

export function createProgressState({
  phaseName,
  verificationCommands,
  startedAt,
  maxCycles,
  initialStage = 'planning',
}) {
  return {
    runActive: true,
    phaseName,
    currentStage: initialStage,
    currentVerificationCheck: null,
    cycle: 1,
    maxCycles,
    startedAt,
    updatedAt: startedAt,
    completedAt: null,
    currentTask:
      initialStage === 'review' ? 'Preparing Claude review...' : 'Preparing PM planning...',
    stages: Object.fromEntries(
      STAGES.map(([key]) => [key, key === initialStage ? 'running' : 'pending']),
    ),
    verificationChecks: verificationCommands.map((command) => ({
      command,
      label: verificationLabel(command),
      state: 'pending',
    })),
  };
}

export function renderProgress(state, now = new Date()) {
  const lines = [`SPARKI — ${state.phaseName}`, ''];
  for (const [key, label] of STAGES) {
    const stageState = state.stages[key] ?? 'pending';
    lines.push(`${SYMBOLS[stageState]} ${label}`);
    if (key === 'verification' && stageState !== 'pending') {
      for (const check of state.verificationChecks)
        lines.push(`  ${SYMBOLS[check.state] ?? SYMBOLS.pending} ${check.label}`);
    }
  }
  lines.push(
    '',
    `Cycle: ${state.cycle} / ${state.maxCycles}`,
    `Elapsed: ${formatElapsed(now.getTime() - new Date(state.startedAt).getTime())}`,
    `Current: ${state.currentTask}`,
  );
  return lines.join('\n');
}

function fallbackLine(state, now) {
  const stage = STAGES.find(([key]) => key === state.currentStage);
  const label = stage?.[1] ?? state.currentStage;
  const stageState = state.stages[state.currentStage] ?? 'pending';
  const check = state.currentVerificationCheck ? ` / ${state.currentVerificationCheck}` : '';
  return `[SPARKI] ${SYMBOLS[stageState]} ${label}${check} — ${state.currentTask} (cycle ${state.cycle}/${state.maxCycles}, elapsed ${formatElapsed(now.getTime() - new Date(state.startedAt).getTime())})`;
}

export class ProgressReporter {
  constructor({ state, persist, output = process.stderr, now = () => new Date() }) {
    this.state = state;
    this.persist = persist;
    this.output = output;
    this.now = now;
    this.renderedLines = 0;
    this.signalHandlers = new Map();
  }

  async update({ stage, stageState, task, verificationCheck, cycle, runActive, completed }) {
    const timestamp = this.now();
    if (stage) this.state.currentStage = stage;
    if (stage && stageState) this.state.stages[stage] = stageState;
    if (task) this.state.currentTask = task;
    if (verificationCheck !== undefined) this.state.currentVerificationCheck = verificationCheck;
    if (cycle !== undefined) this.state.cycle = cycle;
    if (runActive !== undefined) this.state.runActive = runActive;
    if (completed) this.state.completedAt = timestamp.toISOString();
    this.state.updatedAt = timestamp.toISOString();
    await this.persist(this.state);
    this.render(timestamp);
  }

  async startVerification(cycle) {
    for (const check of this.state.verificationChecks) check.state = 'pending';
    await this.update({
      stage: 'verification',
      stageState: 'running',
      task: 'Starting local verification...',
      verificationCheck: null,
      cycle,
    });
  }

  async startCheck(index) {
    const check = this.state.verificationChecks[index];
    check.state = 'running';
    await this.update({
      stage: 'verification',
      stageState: 'running',
      task: `Running ${check.label}...`,
      verificationCheck: check.label,
    });
  }

  async completeCheck(index, passed) {
    const check = this.state.verificationChecks[index];
    check.state = passed ? 'complete' : 'failed';
    await this.update({
      stage: 'verification',
      stageState: passed ? 'running' : 'failed',
      task: passed ? `${check.label} completed.` : `${check.label} failed; preparing remediation.`,
      verificationCheck: check.label,
    });
  }

  async interrupt(signal) {
    await this.update({
      stage: this.state.currentStage,
      stageState: 'failed',
      task: `Interrupted by ${signal}.`,
      runActive: false,
      completed: true,
    });
  }

  installSignalHandlers(target = process) {
    for (const signal of ['SIGINT', 'SIGTERM']) {
      const handler = () => {
        void this.interrupt(signal).finally(() => {
          target.removeListener(signal, handler);
          target.kill(target.pid, signal);
        });
      };
      this.signalHandlers.set(signal, handler);
      target.once(signal, handler);
    }
  }

  removeSignalHandlers(target = process) {
    for (const [signal, handler] of this.signalHandlers) target.removeListener(signal, handler);
    this.signalHandlers.clear();
  }

  render(now = this.now()) {
    if (!this.output.isTTY) {
      this.output.write(`${fallbackLine(this.state, now)}\n`);
      return;
    }
    const frame = renderProgress(this.state, now);
    if (this.renderedLines) this.output.write(`\x1b[${this.renderedLines}A\x1b[0J`);
    this.output.write(`${frame}\n`);
    this.renderedLines = frame.split('\n').length;
  }
}
