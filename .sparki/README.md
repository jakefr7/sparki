# Sparki Agent Operations

Sparki now uses a lightweight build → test → fix workflow. The older phase orchestrator and its immutable `.sparki/runs/<run-id>/` artifacts remain available as historical tooling and evidence, but they are not the default development process or a source of current scope.

## Roles

- **PM:** read-only readiness and execution planning.
- **Codex:** focused implementation and remediation for the user's current request.
- **Claude:** independent, read-only review of the objective, diff, tests, security, integrity, regressions, and scope.
- **Founder:** makes escalated product, architecture, deployment, and destructive-action decisions.

## Historical orchestration commands

```sh
pnpm sparki:status
pnpm sparki:plan
pnpm sparki:execute
pnpm sparki:review
```

These commands belong to the retired phase orchestrator. Do not use them as the normal implementation path unless the user explicitly requests the legacy workflow. For current work, inspect the affected code, implement a cohesive change, run focused checks, fix failures, and broaden verification according to risk.

If human authority is required, automation stops and writes `FOUNDER_DECISION.md` with the decision, reason, options, recommendation, and risks.

The orchestrator never merges, deploys, force-pushes, resets the repository, deletes untracked files, touches `.codex_tmp/`, changes production data, weakens tests, or silently substitutes one agent for another. GitHub connectivity is not required.
