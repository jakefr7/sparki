# Project State

Last reviewed: 2026-08-13

Risk classification: **HIGH RISK**

The verified audit record is [BASELINE_SITREP.md](./BASELINE_SITREP.md).

## IMPLEMENTED

- TypeScript monorepo with Next.js web, NestJS API, shared configuration, Prisma/PostgreSQL, Vitest, and Playwright.
- Core patient, client, appointment, visit, clinical record, and inventory surfaces are present in source and tests.
- Product constitution, architecture, specs, ADRs, and permanent AI role documentation exist.
- All 56 migrations were applied and the audited live schema matched the Prisma schema.
- Direct `tsc --noEmit` passed during the audit.
- Phase 1 verification infrastructure now provides isolated PostgreSQL creation, migration, and seeding; deterministic API/web boot; development receptionist authentication; real-application Playwright execution; and targeted argument forwarding.
- Phase 1 manual verification is recorded in [PHASE_1_CLOSEOUT.md](./PHASE_1_CLOSEOUT.md). The trustworthy engineering baseline is satisfied and Phase 1 is `READY_FOR_FOUNDER_REVIEW`.
- Phase 2 authentication and tenant-safety hardening is verified, independently reviewed, and founder-approved; see [PHASE_2_CLOSEOUT.md](./PHASE_2_CLOSEOUT.md).

## PARTIAL

- Authentication and authorization include production-oriented and development paths, but production SSR cookie forwarding appeared incomplete and development auth could silently grant `OWNER` when WorkOS was incomplete.
- Clinical and inventory workflows have broad implementation coverage, but clinical blocking behavior and application-level inventory integrity require dedicated later-phase validation.
- Checkout/payment is a balance-status placeholder; billing is not a financial ledger.
- Client SMS is simulated without a provider but is represented as delivered.

## BROKEN

- `pnpm lint` reproducibly fails with 43 API errors, and five large inventory services use `@ts-nocheck`; the founder classified this as known Phase 4 product debt rather than a Phase 1 infrastructure failure.
- The exact approved Phase 3 visit-discharge mismatch remains: current behavior returns `200` while the existing integration assertion expects a blocking `409`.
- The current product end-to-end suite is not green even though its isolated Playwright harness is operational.

## VERIFIED WITH DEFERRED FINDINGS

- Manual Phase 1 verification completed outside the latest review run: typecheck, unit/verification-infrastructure tests, and build passed; lint and integration reproduced only their exact approved Phase 4 and Phase 3 debt classifications.
- The Playwright harness is operational against the actual isolated application. Its authoritative full run discovered 30 tests: 5 passed, 24 failed, and 1 did not run. These are product/test-drift findings, not runner/bootstrap failure.
- The latest Claude review's `CHANGES_REQUIRED` result reflects its run-local `verificationState: NOT_RUN`; the review run did not inherit the external manual verification evidence. Historical run records remain authoritative for what occurred inside each run.
- The founder classified the exact identity-based Playwright baseline as cross-phase product/test debt for Phase 2. If all 24 known failures reproduce with the documented 5 passes and 1 test not run, while Phase 2 auth/tenant coverage passes, Playwright is `COMPLETE_WITH_KNOWN_DEBT`. New or materially changed failures still fail verification.

## DEFERRED

- Clinical workflow integrity is active in Phase 3. Inventory integrity guarantees, honest SMS state, checkout/payment behavior, and a financial ledger remain sequenced for later phases.
- Deployment and automated merge behavior are outside the local-first agent system.
- Phase 3 retains the approved visit-discharge product mismatch, and Phase 4 retains the exact approved lint and inventory type-safety debt.

## CURRENT PHASE

- Phase 1 — Trustworthy Engineering Baseline: **READY_FOR_FOUNDER_REVIEW**.
- Phase 2 — Authentication & Tenant Safety: **COMPLETE / FOUNDER_APPROVED**. Authoritative verification passed and Claude Review 1 is `PASS`; historical artifacts are preserved unchanged.
- Phase 3 — Clinical Workflow Integrity: **APPROVED / ACTIVE**. No Phase 3 implementation, execution, or verification is part of this state transition.
