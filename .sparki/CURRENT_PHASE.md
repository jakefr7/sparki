# Phase 5 — Honest External / Financial Workflows

Status: APPROVED / ACTIVE

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
    "pnpm test:e2e"
  ]
}
-->

This phase activation authorizes Phase 5 as the current bounded phase. It does not itself execute Phase 5, authorize communication-compliance or financial-policy decisions, change product behavior, weaken tests, modify production data, deploy, or merge.
