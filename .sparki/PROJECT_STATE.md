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

## PARTIAL

- Phase 1 verification infrastructure is implemented, but final deterministic integration, end-to-end, and independent-review evidence is still in progress.
- Authentication and authorization include production-oriented and development paths, but production SSR cookie forwarding appeared incomplete and development auth could silently grant `OWNER` when WorkOS was incomplete.
- Clinical and inventory workflows have broad implementation coverage, but clinical blocking behavior and application-level inventory integrity require dedicated later-phase validation.
- Checkout/payment is a balance-status placeholder; billing is not a financial ledger.
- Client SMS is simulated without a provider but is represented as delivered.

## BROKEN

- `pnpm lint` reproducibly fails with 43 API errors, and five large inventory services use `@ts-nocheck`; the founder classified this as known Phase 4 product debt rather than a Phase 1 infrastructure failure.
- The audited API run passed 279 of 281 tests: appointment transactional creation returned `409` instead of expected `201`, and visit discharge returned `200` instead of expected blocking `409`.
- Patient/client integration teardown fails on relational cleanup, and integration tests share persistent development data.
- Playwright could not run because port `3001` was occupied.

## UNKNOWN

- Whether lint, typecheck, unit, integration, and end-to-end results are reproducible from an isolated supported environment.
- End-to-end behavior, because the audited Playwright run never started.

## DEFERRED

- Authentication and tenant hardening, clinical discharge behavior, inventory integrity guarantees, honest SMS state, checkout/payment behavior, and a financial ledger are sequenced after Phase 1.
- Deployment and automated merge behavior are outside the local-first agent system.
