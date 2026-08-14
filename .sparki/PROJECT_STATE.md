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
- Phase 3 clinical workflow integrity is verified, independently reviewed, and founder-approved; see [PHASE_3_CLOSEOUT.md](./PHASE_3_CLOSEOUT.md).

## PARTIAL

- Authentication and authorization include production-oriented and development paths, but production SSR cookie forwarding appeared incomplete and development auth could silently grant `OWNER` when WorkOS was incomplete.
- Inventory workflows have broad implementation coverage, but application-level inventory integrity requires dedicated Phase 4 validation and hardening.
- Checkout/payment is a balance-status placeholder; billing is not a financial ledger.
- Client SMS is simulated without a provider but is represented as delivered.

## BROKEN

- The historical Phase 4 baseline had 43 API lint errors and five large inventory services using `@ts-nocheck`. All five inventory tranches are now implemented with the bypasses removed and focused checks passing; final Phase 4 verification is pending.
- The current product end-to-end suite is not green even though its isolated Playwright harness is operational.

## VERIFIED WITH DEFERRED FINDINGS

- Manual Phase 1 verification completed outside the latest review run: typecheck, unit/verification-infrastructure tests, and build passed; lint and integration reproduced only their exact approved Phase 4 and Phase 3 debt classifications.
- The Playwright harness is operational against the actual isolated application. Its authoritative full run discovered 30 tests: 5 passed, 24 failed, and 1 did not run. These are product/test-drift findings, not runner/bootstrap failure.
- The latest Claude review's `CHANGES_REQUIRED` result reflects its run-local `verificationState: NOT_RUN`; the review run did not inherit the external manual verification evidence. Historical run records remain authoritative for what occurred inside each run.
- Phase 3's authoritative verification passed: typecheck, unit, build, and all 192 integration tests passed; lint reproduced only approved Phase 4 debt; and Playwright reproduced the exact approved 24-failed/1-did-not-run/5-passed baseline with no changed failure identities.
- Phase 3's latest independent Claude review passed. Optional direct Today-view lifecycle coverage and the prior placeholder review artifact remain non-blocking follow-up notes only.

## DEFERRED

- Inventory integrity guarantees are active in Phase 4. Honest SMS state, checkout/payment behavior, and a financial ledger remain sequenced for later phases.
- Deployment and automated merge behavior are outside the local-first agent system.
- Phase 4's five service-level implementation tranches are complete with all five inventory `@ts-nocheck` bypasses removed. Final acceptance still requires the full phase verification matrix.

## CURRENT PHASE

- Phase 1 — Trustworthy Engineering Baseline: **READY_FOR_FOUNDER_REVIEW**.
- Phase 2 — Authentication & Tenant Safety: **COMPLETE / FOUNDER_APPROVED**. Authoritative verification passed and Claude Review 1 is `PASS`; historical artifacts are preserved unchanged.
- Phase 3 — Clinical Workflow Integrity: **COMPLETE / FOUNDER_APPROVED**. Authoritative verification and the latest independent Claude review are `PASS`; see [PHASE_3_CLOSEOUT.md](./PHASE_3_CLOSEOUT.md).
- Phase 4 — Inventory Integrity Hardening: **APPROVED / ACTIVE**. All five implementation tranches are implemented; only final Phase 4 verification remains pending.
