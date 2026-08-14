# Phase 3 — Clinical Workflow Integrity

Status: APPROVED / ACTIVE

Previous phase: Phase 2 — Authentication & Tenant Safety is `COMPLETE / FOUNDER_APPROVED`; see [PHASE_2_CLOSEOUT.md](./PHASE_2_CLOSEOUT.md).

## Objective

Reconcile and verify the clinically central visit workflow across lifecycle states, work items, discharge, record locking, checkout handoff, and patient-facing operational views.

## Known problems

- The approved visit-discharge mismatch remains unresolved: current behavior permits discharge preparation with open care work and returns `200`, while the existing integration assertion expects a blocking `409`.
- Visit states, phases, work items, dashboard statuses, discharge, record locking, and checkout require one coherent workflow contract.
- See [BASELINE_SITREP.md](./BASELINE_SITREP.md) for the verified audit record.

## Scope

- Establish and enforce the approved visit lifecycle and transition invariants.
- Resolve the documented discharge-blocking behavior conflict through explicit clinical workflow policy.
- Verify record locking, amendments, care completion, and checkout handoff behavior.
- Verify that Dashboard, Today, patient, and visit views agree after lifecycle transitions.
- Add deterministic clinical workflow verification where needed.
- Preserve the Phase 1 verification baseline and Phase 2 authentication and tenant-safety guarantees.

## Out of scope

- Inventory lint, type-safety, and integrity debt assigned to Phase 4.
- External communication, payment, billing, and ledger behavior assigned to Phase 5.
- Broad remediation of historical Playwright product/test drift unrelated to clinical workflow integrity.
- Prisma schema or migration changes unless separately authorized by the founder.
- Production data changes, deployment, or merging.

## Acceptance criteria

- A single visit transition contract governs lifecycle state and phase changes.
- Discharge and closure invariants reflect explicit approved clinical workflow policy and pass deterministic tests.
- Clinical records lock and allow amendments according to the approved workflow.
- Open care work, follow-up, and checkout handoff remain consistent and actionable across transitions.
- Dashboard, Today, patient, and visit views agree on visit state after each supported transition.
- Authentication and tenant-isolation guarantees remain intact.
- Any product-policy, schema, migration, or production-data decision outside this scope is escalated.

## Phase configuration

<!-- sparki-phase-config
{
  "id": "phase-3-clinical-workflow-integrity",
  "branch": "codex/phase-3-clinical-workflow-integrity",
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
`COMPLETE_WITH_KNOWN_DEBT` only when all 24 listed historical failure identities
and exactly 1 did-not-run test reproduce. The passing-test count is not part of
the match. Any missing, additional, or materially changed failure fails
verification. All Phase 3 clinical workflow tests must pass normally and cannot
be included in this debt classification.

This bounded acceptance clears `FOUNDER_DECISION_REQUIRED` for the exact known
Playwright baseline only. Phase 3 remains Clinical Workflow Integrity; it does
not authorize broad E2E remediation, unrelated product behavior changes, test
weakening, Phase 4 work, or changes to historical run artifacts.
