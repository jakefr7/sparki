# Phase 4 — Inventory Integrity Hardening

Status: APPROVED / ACTIVE

Previous phase: Phase 3 — Clinical Workflow Integrity is `COMPLETE / FOUNDER_APPROVED`; see [PHASE_3_CLOSEOUT.md](./PHASE_3_CLOSEOUT.md).

## Objective

Harden inventory type safety, persistence guarantees, counts, usage, controlled inventory, and auditability while preserving the verified clinical workflow and tenant-safety guarantees.

## Known problems

- `pnpm lint` reproducibly reports 43 API errors in the approved Phase 4 inventory debt baseline.
- Five inventory services use `@ts-nocheck`, bypassing type-safety enforcement.
- Application-level inventory integrity requires dedicated validation and hardening.
- See [BASELINE_SITREP.md](./BASELINE_SITREP.md) and [PHASE_3_CLOSEOUT.md](./PHASE_3_CLOSEOUT.md) for the inherited evidence.

## Scope

- Remove the founder-confirmed inventory lint and `@ts-nocheck` debt without weakening checks.
- Strengthen inventory persistence guarantees, counts, clinical usage, controlled inventory, and auditability.
- Add deterministic inventory integrity verification where needed.
- Preserve the Phase 1 verification baseline, Phase 2 authentication and tenant-safety guarantees, and Phase 3 clinical workflow guarantees.

## Out of scope

- External communication, payment, billing, and ledger behavior assigned to Phase 5.
- Remediation of the Phase 3 closeout's optional direct Today-view lifecycle coverage note.
- Remediation or rewriting of the preserved placeholder review artifact.
- Broad remediation of historical Playwright product/test drift unrelated to inventory integrity.
- Prisma schema or migration changes unless separately authorized by the founder.
- Production data changes, deployment, or merging.

## Acceptance criteria

- Inventory source passes the repository's typecheck and lint rules without `@ts-nocheck` bypasses.
- Inventory mutations preserve consistent, auditable state under supported workflows.
- Counts, usage, purchasing, and controlled-inventory behavior pass deterministic tests.
- Authentication, tenant isolation, and clinical workflow guarantees remain intact.
- Any product-policy, schema, migration, controlled-substance, or production-data decision outside this scope is escalated.

## Phase configuration

<!-- sparki-phase-config
{
  "id": "phase-4-inventory-integrity-hardening",
  "branch": "codex/phase-4-inventory-integrity-hardening",
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

This phase activation authorizes Phase 4 as the current bounded phase. It does not itself execute Phase 4, authorize product-policy or schema decisions, weaken tests, modify production data, deploy, or merge.
