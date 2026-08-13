# Sparki Agent Operations

This local-first system runs a controlled phase through planning, Codex implementation, deterministic verification, independent Claude review, and at most three remediation/review cycles. Every run writes durable artifacts to `.sparki/runs/<run-id>/`; project memory lives in the concise Markdown files beside this README.

## Roles

- **PM:** read-only readiness and execution planning.
- **Codex:** implementation and narrowly scoped remediation for an approved phase.
- **Claude:** independent, read-only review of the objective, diff, tests, security, integrity, regressions, and scope.
- **Founder:** makes escalated decisions and reviews every passing phase before merge.

## Commands

```sh
pnpm sparki:status
pnpm sparki:plan
pnpm sparki:execute
pnpm sparki:review
```

`sparki:plan` only creates the PM artifact. `sparki:execute` requires a clean tracked worktree, an approved phase, a non-main phase branch, and authenticated Codex and Claude CLIs. `sparki:review` creates an independent review artifact without modifying product code.

If human authority is required, automation stops and writes `FOUNDER_DECISION.md` with the decision, reason, options, recommendation, and risks.

The orchestrator never merges, deploys, force-pushes, resets the repository, deletes untracked files, touches `.codex_tmp/`, changes production data, weakens tests, or silently substitutes one agent for another. GitHub connectivity is not required.
