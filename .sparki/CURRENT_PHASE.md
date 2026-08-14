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
    "pnpm test:e2e"
  ]
}
-->

No Phase 3 implementation is part of the phase-transition bookkeeping that activated this phase.
