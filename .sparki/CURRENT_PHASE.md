# Phase 1 — Trustworthy Engineering Baseline

Status: APPROVED

Founder decision status: CLEARED — visit-discharge policy conflict deferred to Phase 3

## Objective

Establish deterministic, isolated, and honest repository verification. Phase 1 must make supported checks reproducible and record their results so later phases can distinguish test-infrastructure failures from product defects.

## Known problems

- Root `pnpm typecheck` reruns the Next.js build and is nondeterministic even though direct `tsc --noEmit` passed.
- `pnpm lint` reports 43 API errors, while five large inventory services bypass typechecking with `@ts-nocheck`.
- The audited API run passed 279 of 281 tests, but integration suites share persistent development data and patient/client teardown fails on relational cleanup.
- Playwright could not run because port `3001` was occupied.
- See `BASELINE_SITREP.md` for the complete verified audit record and later-phase findings.

## Scope

- Define deterministic, single-purpose lint, typecheck, build, unit, integration, and end-to-end commands.
- Isolate integration data and teardown so repeated runs start and finish predictably.
- Make end-to-end port and server prerequisites deterministic and document required local services or environment variables.
- Reproduce and classify the 43 lint errors, five `@ts-nocheck` bypasses, two API behavioral failures, teardown failures, and blocked Playwright run.
- Correct verification infrastructure only; record product defects for their assigned later phases.
- Add or adjust tests only where necessary to prove the verification infrastructure itself.
- Replace or adjust per-schema integration-test isolation with a disposable per-run PostgreSQL database strategy, or another test-only isolation mechanism, when needed to replay the existing migration history unchanged with `pg_trgm` available before migrations requiring `gin_trgm_ops`.
- Ensure every integration run uses isolated disposable state and cleanup removes only test-owned disposable resources.

## Out of scope

- Product behavior changes, schema changes, migrations, production data, deployment, and merging.
- Authentication or tenant architecture changes.
- Fixing SSR cookie forwarding or development-auth privilege behavior, except test scaffolding strictly necessary to validate verification infrastructure.
- Changing appointment or visit-discharge product behavior.
- Schema, migration, clinical, controlled-substance, inventory, financial, SMS, payment, billing, or external-integration behavior or policy.
- Weakening or deleting tests to obtain a passing result.

## Acceptance criteria

- Each supported verification command is single-purpose, repeatable, and produces the same classification from the same clean test state.
- Integration tests use isolated, deterministic data and complete teardown without relational-cleanup errors.
- Playwright can start using a documented, deterministic server and port lifecycle.
- The known audit results are reproduced or explicitly superseded by recorded evidence.
- Product-behavior failures remain failing/recorded or are deferred to the correct later phase; Phase 1 does not silently redefine expected behavior.
- The exact deterministic visit-discharge mismatch—`assertVisitReadyForDischarge` permits discharge preparation with open care work while the existing integration assertion expects a blocking `409`—is classified as `KNOWN_PHASE_3_PRODUCT_DEBT` and as a deferred product failure, not a verification-infrastructure failure, when reproduced exactly as documented. Any materially different integration failure fails Phase 1 verification.
- Phase 1 does not change visit-discharge behavior, the existing integration-test assertion, or clinical workflow policy.
- The reproducible 43-error API lint baseline and inventory `@ts-nocheck` debt are recorded Phase 4 blockers. Their known nonzero lint result does not fail Phase 1 when it is reproduced exactly; any different lint result remains a verification failure.
- Every correction is limited to verification infrastructure and tied to a reproduced baseline failure.
- No Prisma schema or migration changes exist in the phase diff.
- All existing applied migration files remain unchanged, including `prisma/migrations/20260706025500_add_trigram_search_indexes/migration.sql`.
- Integration migrations replay unchanged in isolated disposable state, with `pg_trgm` available before any migration requiring `gin_trgm_ops` runs, and cleanup removes only resources owned by that test run.
- No test assertion is weakened merely to make verification pass.
- Remaining environment or product-policy blockers are escalated, not guessed around.

## Phase configuration

<!-- sparki-phase-config
{
  "id": "phase-1-trustworthy-engineering-baseline",
  "branch": "codex/phase-1-trustworthy-engineering-baseline",
  "status": "APPROVED",
  "verification": [
    {
      "command": "pnpm lint",
      "expectedExitCodes": [1],
      "classification": "KNOWN_PHASE_4_PRODUCT_DEBT"
    },
    "pnpm typecheck",
    "pnpm test",
    "pnpm build",
    "pnpm test:integration",
    "pnpm test:e2e"
  ]
}
-->
