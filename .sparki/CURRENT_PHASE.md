# Phase 2 — Authentication & Tenant Safety

Status: APPROVED

Previous phase: Phase 1 — Trustworthy Engineering Baseline is `READY_FOR_FOUNDER_REVIEW`; see [PHASE_1_CLOSEOUT.md](./PHASE_1_CLOSEOUT.md).

## Objective

Prove and harden authentication identity propagation, authorization defaults, and organization/location tenant isolation without weakening the verified engineering baseline.

## Known problems

- Patient and visit server-rendered pages appear to call the API without forwarding the authenticated request cookie.
- In non-production environments without complete WorkOS configuration, development authentication can silently grant the fixed `OWNER` identity.
- Production WorkOS behavior and organization/location isolation require deterministic verification.
- See [BASELINE_SITREP.md](./BASELINE_SITREP.md) for the verified audit record.

## Scope

- Verify identity and session propagation across browser, server-rendered web, and API boundaries.
- Make development authentication defaults explicit and safe.
- Prove authorization and organization/location isolation for authenticated workflows.
- Add deterministic authentication and tenant-safety verification where needed.
- Preserve Phase 1's isolated verification infrastructure.

## Out of scope

- Clinical discharge behavior and policy assigned to Phase 3.
- Inventory lint, type-safety, and integrity debt assigned to Phase 4.
- External communication, payment, billing, and ledger behavior assigned to Phase 5.
- Prisma schema or migration changes unless separately authorized by the founder.
- Production data changes, deployment, merging, and Phase 3 or Phase 4 remediation.

## Acceptance criteria

- Authenticated identity is propagated correctly through supported browser, server-rendered, and API paths.
- Missing or incomplete authentication configuration cannot silently create elevated access in an environment that may be externally reachable.
- Organization and location boundaries are enforced and covered by deterministic tests.
- Authorization behavior remains owned by Sparki's application model while WorkOS remains the authentication boundary.
- Phase 1 verification remains reproducible, and deferred Phase 3 and Phase 4 findings are not silently reclassified or remediated.
- Any product-policy, schema, migration, or production-data decision outside this scope is escalated.

## Phase configuration

<!-- sparki-phase-config
{
  "id": "phase-2-authentication-tenant-safety",
  "branch": "codex/phase-2-authentication-tenant-safety",
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
    {
      "command": "pnpm test:integration",
      "expectedExitCodes": [0, 1],
      "classification": "KNOWN_PHASE_3_PRODUCT_DEBT",
      "requiredOutput": [
        "Visits (e2e) > Visit lifecycle hardening > enforces care completion through discharge, locks the record, preserves amendments, and keeps follow-up actionable",
        "expected 200 to be 409",
        "Test Files  1 failed | 11 passed (12)",
        "Tests  1 failed | 191 passed (192)"
      ]
    },
    "pnpm test:e2e"
  ]
}
-->
