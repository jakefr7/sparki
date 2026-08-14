# No Active Implementation Phase

Status: **NONE ACTIVE**

Phase 5 — Honest External / Financial Workflows is **COMPLETE / FOUNDER_APPROVED**. See [PHASE_5_CLOSEOUT.md](./PHASE_5_CLOSEOUT.md).

No Phase 6 or other successor phase has been selected, approved, or activated. Product implementation requires a new explicit founder decision.

## Preserved Phase 5 record

Previous phase: Phase 4 — Inventory Integrity Hardening is `COMPLETE / FOUNDER_APPROVED`; see [PHASE_4_CLOSEOUT.md](./PHASE_4_CLOSEOUT.md).

## Objective

Make external communication and financial workflows honest by either implementing their real system behavior or clearly constraining what the product claims to do.

## Known problems

- Client SMS is simulated without a provider but is represented as delivered.
- Attachments do not yet have a defined durable, controlled storage workflow.
- Checkout and payment behavior is a balance-status placeholder rather than a financial transaction model.
- Billing is not a financial ledger, and its scope and invariants are not yet documented.

## Scope

- Reconcile SMS delivery state with provider events or clearly label the workflow as simulated.
- Define durable, controlled attachment storage behavior.
- Replace payment-like status toggles with honest checkout and balance semantics.
- Document billing scope and financial invariants before invoice development begins.
- Preserve the verified authentication, tenant-safety, clinical-workflow, and inventory-integrity guarantees from prior phases.

## Out of scope

- The two optional Phase 4 follow-ups recorded in [PHASE_4_CLOSEOUT.md](./PHASE_4_CLOSEOUT.md).
- Broad remediation of historical Playwright product/test drift unrelated to Phase 5.
- Prisma schema or migration changes unless separately authorized by the founder.
- Production data changes, deployment, or merging.
- Phase 5 implementation as part of this activation change.

## Acceptance criteria

- SMS delivery states come from provider events, or the feature is clearly labeled simulated.
- Attachments use durable, controlled storage.
- Checkout no longer represents status toggles as payment transactions.
- Billing scope and invariants are documented before invoice development begins.
- Authentication, tenant isolation, clinical workflow, and inventory integrity guarantees remain intact.
- Any communication-compliance, financial-policy, schema, migration, or production-data decision outside this scope is escalated.

## Phase configuration

<!-- sparki-phase-config
{
  "id": "phase-5-honest-external-financial-workflows",
  "branch": "codex/phase-5-honest-external-financial-workflows",
  "status": "APPROVED",
  "verification": [
    "pnpm lint",
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
        "passed": 5,
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

For the Playwright check, a clean exit remains `COMPLETE`. The documented nonzero
baseline is `COMPLETE_WITH_KNOWN_DEBT` only when the failures are the exact
historical identities listed above and the summary is 24 failed, 5 passed, and
1 did not run. Classification is identity-based, not count-only. No new,
substituted, or materially changed failure is accepted. Historical failures are
allowed to pass and must not cause verification failure; an absent historical
failure may not be silently replaced by another failure.

Broad remediation of the 24 historical Playwright failures is outside Phase 5.
All other Phase 5 checks and acceptance criteria must pass normally and cannot
be hidden by this classification. Existing tests, completed Phase 5
implementation, and historical run artifacts remain unchanged.

This preserved configuration records the bounded Phase 5 acceptance policy. Phase 5 is closed; it no longer authorizes implementation. The exact approved Playwright debt baseline above remains unchanged and no historical failure is remediated by the closeout.
