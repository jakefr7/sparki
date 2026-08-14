# Phase 4 — Inventory Integrity Hardening

Status: APPROVED / ACTIVE

Previous phase: Phase 3 — Clinical Workflow Integrity is `COMPLETE / FOUNDER_APPROVED`; see [PHASE_3_CLOSEOUT.md](./PHASE_3_CLOSEOUT.md).

## Objective

Harden inventory type safety, persistence guarantees, counts, usage, controlled inventory, and auditability while preserving the verified clinical workflow and tenant-safety guarantees.

## Known problems

- `pnpm lint` reproducibly reports 43 API errors in the approved Phase 4 inventory debt baseline.
- Five inventory services use `@ts-nocheck`, bypassing type-safety enforcement.
- Removing all five bypasses together exposes extensive compile failures across 4,347 lines, which is too broad for one safe implementation pass.
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

## Staged execution plan

Phase 4 remains one phase, but implementation must proceed through the following bounded tranches:

1. `controlled.service.ts` — make the foundational controlled-inventory transaction and event-posting service type-safe first. Both clinical usage and controlled closeout call this service.
2. `purchasing.service.ts` — make the independent inbound purchasing and receiving path type-safe before downstream stock reconciliation and consumption work.
3. `counts.service.ts` — make physical counts and reconciliation type-safe after the inbound stock path.
4. `usage.service.ts` — make clinical usage and stock-consumption flows type-safe after their `ControlledService` dependency and upstream inventory paths are stable.
5. `controlled-closeout.service.ts` — make the terminal controlled-inventory reconciliation and closeout flow type-safe after the shared controlled ledger behavior is stable.

## Tranche progress

- Tranche 1 — `controlled.service.ts`: **COMPLETE**. The `@ts-nocheck` bypass was removed; focused ESLint, API typecheck, and the authoritative local `pnpm test:integration` passed; and the changes were committed and pushed.
- Tranche 2 — `purchasing.service.ts`: **COMPLETE**. The `@ts-nocheck` bypass was removed; focused ESLint, API typecheck, and the closest inventory unit suite (7/7) passed; the authoritative local `pnpm test:integration` passed; and the changes were committed and pushed.
- Tranche 3 — `counts.service.ts`: **COMPLETE**. The `@ts-nocheck` bypass was removed; focused ESLint, API typecheck, and the closest inventory unit suite (7/7) passed; the authoritative local `inventory-counts` integration test passed; and the changes were committed and pushed.
- Tranche 4 — `usage.service.ts`: **IMPLEMENTED (LOCAL AUTHORITATIVE BEHAVIORAL VERIFICATION PENDING)**. The `@ts-nocheck` bypass was removed; focused ESLint, API typecheck, the closest inventory unit suite (7/7), and `git diff --check` passed. The directly relevant isolated `inventory-usage.e2e-spec.ts` test was attempted but could not connect to PostgreSQL because the sandbox denied loopback access with `EPERM`; run `pnpm test:integration -- inventory-usage.e2e-spec.ts` outside the sandbox for authoritative behavioral verification.
- Tranche 5 remains unstarted with the existing `controlled-closeout.service.ts` bypass intact.

For every tranche:

- Remove `@ts-nocheck` only from the service in the current tranche. Leave later-tranche bypasses in place until their tranche begins.
- Resolve that service's TypeScript and in-scope inventory lint failures without changing observable product behavior, weakening tests, or broadening into another tranche.
- Preserve existing validation, authorization, tenant isolation, transaction, audit, and error behavior. Any required product-policy decision stops for founder direction.
- Add or strengthen focused behavior-preservation tests when needed; do not rewrite assertions merely to accommodate an implementation.
- Run focused lint, API typecheck, and the smallest relevant unit/integration test set during implementation. A tranche may complete without running the entire Phase 4 verification matrix, but its focused checks must pass before the next bypass is removed.
- Record completed checks and any remaining approved Phase 4 debt so partial progress is explicit and later tranches cannot be mistaken for final acceptance.

No tranche authorizes Prisma schema or migration changes, production-data changes, deployment, merge, or `sparki:execute`.

## Acceptance criteria

- All five tranches are complete; all five listed inventory `@ts-nocheck` bypasses are removed; and the documented inventory lint/type-safety debt is resolved.
- Inventory source passes the repository's typecheck and lint rules without `@ts-nocheck` bypasses.
- Inventory mutations preserve consistent, auditable state under supported workflows.
- Counts, usage, purchasing, and controlled-inventory behavior pass deterministic tests.
- Authentication, tenant isolation, and clinical workflow guarantees remain intact.
- Any product-policy, schema, migration, controlled-substance, or production-data decision outside this scope is escalated.

Focused tranche checks are implementation checkpoints, not final Phase 4 acceptance. Final acceptance still requires the complete phase verification matrix below after every tranche is complete.

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
