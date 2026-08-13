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
        "expected 200 to be 409"
      ],
      "requiredFailureSummary": {
        "failed": 1
      }
    },
    {
      "command": "pnpm test:e2e",
      "expectedExitCodes": [0, 1],
      "classification": "KNOWN_CROSS_PHASE_PLAYWRIGHT_PRODUCT_TEST_DEBT",
      "requiredFailureSummary": {
        "failed": 24,
        "didNotRun": 1
      },
      "requiredFailureIdentities": [
        "scheduler appointment detail shows records-prep summary and honest confirmation status, and confirmation status can be updated",
        "edits an existing item and opens duplication as an unpersisted copy",
        "uses focused primary and purchasing navigation",
        "creates a clinical usage mapping and exposes review queue destinations",
        "scheduler visible copy says \"New Patient,\" not \"New Client / New Patient\"",
        "\"New Patient\" form captures owner, address, patient, appointment, and records-request fields; saves via the combined endpoint; warns on a possible duplicate client",
        "failed \"New Patient\" save shows friendly, clinic-facing error copy",
        "existing-patient scheduling from the scheduler still works",
        "creating a patient, then choosing New Appointment, opens the shared popup with the patient already selected",
        "search with no match offers patient creation; new client + new patient walk-in opens the workspace and is searchable after refresh",
        "existing client search collapses the new-client fields; existing client + new patient appointment opens the workspace",
        "requires the MVP client fields before creating a new client",
        "New Appointment on the patient profile opens the modal with the patient already selected",
        "search input is focused on load (keyboard-first landing)",
        "typing a patient name, navigating with arrow keys, and opening with Enter reaches the workspace",
        "search result shows operational context and next actions",
        "tolerates a typo via fuzzy search",
        "shows an explicit empty state when nothing matches",
        "refocuses search after focus moves away (keyboard-first shortcut)",
        "search results render within the action-acknowledgement performance budget",
        "appointment -> begin intake -> visit workspace",
        "patient workspace -> start walk-in visit -> visit workspace",
        "active visit is shown instead of duplicate visit actions",
        "tech/assistant can record weight in either unit and gum color during intake, and both persist on reload"
      ]
    }
  ]
}
-->

For the Playwright check, a clean exit remains `COMPLETE`. A nonzero exit is
`COMPLETE_WITH_KNOWN_DEBT` only when every listed historical failure identity and
the documented 24 failed / 1 did-not-run summary reproduce. The passing-test count
may increase without invalidating the known-debt match. This is an
identity-based exception: missing, additional, or materially changed failures are
verification failures. Phase 2 authentication, authorization, SSR identity,
organization-isolation, and location-isolation coverage remains required to pass.
