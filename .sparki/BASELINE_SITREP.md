# SPARKI ENGINEERING SITREP

## Executive Summary

Overall repository state:
- HIGH RISK

The repository contains a broad, working prototype with substantial scheduling, patient, visit, messaging, and inventory functionality. The configured local database is reachable, all 56 migrations are applied, and the live schema matches `schema.prisma`.

It is not a trustworthy feature-development baseline yet:

- Production authentication will likely break the patient and visit server-rendered pages because their direct API fetches do not forward the session cookie.
- `pnpm lint` fails with 43 errors, concentrated in inventory code.
- Five large inventory services disable TypeScript checking with `@ts-nocheck`.
- The API suite has two real behavioral failures and two teardown/data-isolation failures.
- The documented root `pnpm typecheck` command is unreliable because it reruns production builds; one run failed during Next.js page collection even though direct `tsc --noEmit` passes.
- Playwright could not start because port 3001 was already occupied, and CI mode refuses reuse.
- Client Communication presents database-only messages as delivered SMS despite no SMS integration.
- Billing is only a checkout/balance placeholder, not an invoice/payment system.
- Recent inventory work added thousands of lines rapidly, with weak type coverage, limited integration coverage, and schema relationships enforced mainly in application code.

The repository is a serious prototype, not a production-safe veterinary system.

## Git / Repository State

- Active branch: `main`
- HEAD: `50853e4 feat(inventory): polish workspace UI and workflows`
- `main` exactly matches `origin/main`.
- Worktree contains one untracked directory: `.codex_tmp/`.
- No tracked source modifications were present before or after the inspection.
- No `AGENTS.md` exists in the tracked repository.
- Repository structure:

  - `apps/api`: NestJS modular-monolith API.
  - `apps/web`: Next.js App Router frontend and BFF proxy routes.
  - `packages/config`: shared environment/status configuration.
  - `packages/db`: Prisma client and raw PostgreSQL pool.
  - `prisma`: 3,254-line schema and 56 migrations.
  - `scripts`: demo reset, authentication seeds, inventory seeds, cleanup, and report rendering.
  - `docs`: extensive product blueprints, ADRs, specs, and engineering plans.

- Generated build output is ignored, except for 20 intentionally tracked generated staff profile images.
- The last five feature commits are almost entirely inventory work. Several commits add 2,800–5,600 lines each.

## Build Health

Commands executed and results:

- `pnpm build`
  - First run: passed, 4/4 packages.
  - Next build completed with warnings.
  - Warnings included mixed-support CSS `end` values, four unused scheduler symbols/functions, four raw `<img>` usages, and one obsolete ESLint suppression.

- `pnpm typecheck`
  - Failed before completion because Turbo reruns `@sparki/web#build`.
  - The second Next build reported missing page modules for:
    - `/api/appointments/[id]/move`
    - `/api/appointments/[id]/note`
  - Both route files exist and appeared in the immediately preceding successful build.
  - This indicates nondeterministic or stale `.next`/Turbo orchestration rather than missing source.

- Direct compiler checks:
  - `pnpm --filter @sparki/config exec tsc --noEmit`
  - `pnpm --filter @sparki/db exec tsc --noEmit`
  - `pnpm --filter @sparki/api exec tsc --noEmit`
  - `pnpm --filter @sparki/web exec tsc --noEmit`
  - All passed.

This direct typecheck result is misleadingly positive because five inventory services opt out with `@ts-nocheck`.

- `pnpm lint`
  - Failed: 43 errors and 3 warnings in the API.
  - Primary files:
    - `controlled-closeout.service.ts`
    - `controlled.service.ts`
    - `counts.service.ts`
    - `purchasing.service.ts`
  - Errors include banned `@ts-nocheck`, extensive `any`, and smaller correctness/style problems.
  - Web lint passes with 9 warnings.

Build classification: FUNCTIONAL BUT UNRELIABLE.

## Test Health

### Unit

- Shared config: 9/9 passed.
- Pure API unit/spec tests largely pass, including auth, address handling, appointment availability, lifecycle policy, discharge policy, DTO validation, and messaging DTOs.
- The complete API run reported 279/281 tests passing.
- Inventory’s unit test is not fully isolated: without database access, a test unexpectedly attempted `controlledAuthorization.count()`. It passed only when a real database was available.

Unit classification: FUNCTIONAL BUT INCOMPLETE.

### Integration

With local database/process access enabled:

- 29 API test files ran.
- 25 files passed.
- 4 files failed.
- 279 tests passed; 2 behavioral assertions failed.

Real failures:

- Appointment transactional creation expected `201` but returned `409`.
- Visit discharge expected a blocking `409` for active care work but returned `200`.

Teardown/data-isolation failures:

- `patients.e2e-spec.ts` could not delete a Visit because a `SoapNote` still referenced it.
- `clients.e2e-spec.ts` could not delete a Patient because a Visit still referenced it.

The suite shares the configured local database and a fixed development organization. It runs files serially, but tests and persistent demo rows still influence behavior. This is not an isolated test baseline.

Integration classification: BROKEN.

### E2E / Playwright

- 30 tests exist in 12 files.
- Coverage includes patient search/intake, appointment creation, visit creation/intake, patient alerts/medications, appointment records prep, and recent inventory workflows.
- `pnpm test:e2e` did not run tests because port 3001 was already occupied.
- CI mode sets `reuseExistingServer: false`, so the suite aborted instead of using the existing server.
- No Playwright coverage exists for:
  - production WorkOS authentication,
  - dashboard role variants,
  - internal messaging,
  - client communication,
  - checkout/record finalization,
  - tenant/location isolation,
  - controlled-substance closeout,
  - most purchasing/count workflows.

E2E classification: UNKNOWN / NOT CURRENTLY RELIABLE.

### Skipped/disabled/flaky tests

- No committed `test.skip`, `describe.skip`, `it.skip`, `xit`, or `xdescribe` markers were found.
- The initial sandboxed run showed 185 skipped tests because suite setup could not reach PostgreSQL; that was environmental, not explicit skipping.
- The real run exposed database residue and teardown-order fragility.
- The appointment conflict is likely data-dependent.
- Inventory concurrency deliberately induces a write conflict and passed, but the implementation logs a Prisma deadlock/write-conflict error during normal success.
- Playwright uses full parallelism against one shared database, increasing collision risk.
- CI retries Playwright twice, which may conceal fixture races rather than fix them.

## Database / Migration Health

Migration consistency:

- `prisma migrate status`: 56 migrations found; database schema up to date.
- Live database-to-schema diff: empty migration.
- The configured local database and current Prisma schema agree.

Schema concerns:

- The schema now contains more than 100 models/enums and is dominated by inventory.
- The header still describes a “minimum Sprint 1 schema” and says Inventory and Communication are deferred. That is materially false.
- Core tenant entities have organization/location relations, but many newer inventory models store `organizationId`, `clinicLocationId`, user IDs, patient IDs, visit IDs, and invoice IDs without corresponding Prisma relations or database foreign keys.
- Examples include purchase orders, inventory events, count actors, usage records, patient inventory traces, and reservation invoice references.
- This allows dangling or cross-tenant identifiers if any service validation is missed.
- The database correctly enforces one active Visit per organization/location/patient through a partial unique index.
- SOAP notes restrict Visit deletion and correctly exposed incomplete test cleanup.
- Several inventory migrations are compressed into very long SQL lines, which makes review and incident debugging difficult.

Seed state:

- `seed-local-clinic-demo-data.mjs` is mostly idempotent, uses stable IDs, and protects rows tagged `sparki-local-demo`.
- `reset-demo-clinic-data.mjs` performs extensive deletion but scopes it to the fixed development organization and excludes protected demo provenance.
- Inventory seed scripts select the first Location in the database rather than requiring the development location. Running them against a shared or misconfigured database could seed whichever clinic happens to be oldest.
- `seed-auth-users.mjs` can modify both WorkOS accounts and local database identities when WorkOS credentials are configured.
- Seed scripts were not executed because that would mutate data.

Destructive migration risks:

- Historical migrations include additive backfills, non-null changes, index creation, and one obsolete enum drop.
- The active-visit integrity migration intentionally aborts if duplicate active visits exist.
- The migration ledger records only three July 18 operations. It does not record the subsequent inventory migration/seed wave.
- There is no demonstrated rollback or backup workflow for the inventory schema expansion.

Models that appear incomplete or disconnected:

- Invoice-related fields exist as bare string references in inventory reservations and usage events, but there is no Invoice model.
- Visit work items support Estimate and Payment, but no Estimate, Invoice, Payment, Order, Diagnostic, or Treatment domain model exists.
- `InventoryUsageEvent` anticipates medication orders, administrations, prescriptions, vaccines, laboratory records, procedures, and invoices that are not modeled elsewhere.
- Migration provenance columns exist, but no migration engine/service exists.
- Client Communication has provider identifiers and delivery timestamps but no provider integration or webhook processing.

Database assessment: the current local schema is consistent, but the model is not yet trustworthy as a production data-integrity boundary.

## Authentication / Authorization / Tenant Safety

Strengths:

- The API uses a global default-deny authentication guard; public routes are explicit.
- Production refuses to start without complete WorkOS configuration.
- Tenant identity comes from server-resolved membership, not request parameters.
- Multiple active organizations or locations are rejected until a switcher exists.
- Core patient, client, appointment, visit, task, message, and inventory reads generally include organization and often location scope.
- Clinical record finalization and controlled-substance workflows contain meaningful server-side authorization checks.

Risks:

- The patient and visit server pages fetch the API directly without forwarding the request cookie. They work under the automatic development OWNER guard but should receive `401` under real WorkOS auth.
- In every non-production environment without complete WorkOS configuration, any request—including one without a cookie—is silently assigned the fixed development OWNER. An accidentally internet-accessible staging environment would be fully exposed.
- Old authorization fields remain active alongside normalized membership/location tables:
  - `User.organizationId`
  - `User.role`
  - `User.locations`
  - `OrganizationMembership`
  - `ClinicLocationAccess`
  Services still use both models, so drift can produce inconsistent access.
- Inventory permissions are coarse role-derived sets. Receptionists can view stock and all staff can post clinical usage, which needs explicit product/security validation.
- Most inventory foreign keys are validated in services rather than the database.
- No rate limiting, CSRF strategy, request-size limit, audit middleware, security headers, or explicit production cookie-domain strategy was found.
- Message attachments accept arbitrary MIME types, are written into public same-origin storage, and have no malware/content scanning.
- Uploaded profile, patient, and messaging files use local web-server disk rather than durable object storage.

## Current Product Surfaces

| System | State | Assessment |
|---|---|---|
| Dashboard | FUNCTIONAL BUT INCOMPLETE | Role-aware command center, notes, tasks, appointment/visit queues, and status controls exist. Some navigation destinations remain disabled. |
| Today | FUNCTIONAL BUT INCOMPLETE | Live appointment/visit aggregation and quick actions exist. It shares workflow mapping risks with Dashboard. |
| Patients | FUNCTIONAL BUT INCOMPLETE | Search, fuzzy matching, create/edit, profile, alerts, medications, photo, appointments, and visit history exist. Production SSR auth is broken. |
| Clients | FUNCTIONAL BUT INCOMPLETE | Create/search/update and patient association exist. There is no standalone client detail route or robust client account workflow. |
| Scheduler | FUNCTIONAL BUT INCOMPLETE | Availability, booking, new-patient transactions, move/cancel/arrive, blocks, configurable types, and audit history exist. Unused confirmation handlers show UI regression/drift. |
| Appointments | FUNCTIONAL BUT INCOMPLETE | Broad API lifecycle and history exist, but one transactional creation test currently returns `409`. |
| Visit workspace | FUNCTIONAL BUT INCOMPLETE | Intake, exam, work items, record, discharge, and checkout are composed. Production SSR auth is broken. |
| Intake | FUNCTIONAL BUT INCOMPLETE | Extensive structured intake, persistence, completion, and emergency deferral exist. Required-field policy remains hard-coded/incomplete. |
| Exam | FUNCTIONAL BUT INCOMPLETE | SOAP-like exam findings and veterinarian-only actions exist. Diagnostics/plan execution is not modeled. |
| Treatment | PARTIALLY IMPLEMENTED | Generic work items exist; there are no treatment orders, administrations, procedures, approvals, or treatment-specific records. |
| Checkout | PARTIALLY IMPLEMENTED | Discharge, contact confirmation, balance status, and closure transitions exist. No real invoice/payment posting exists. |
| Internal Messaging | FUNCTIONAL BUT INCOMPLETE | Conversations, members, messages, reactions, mentions, attachments, drafts, and channels exist. Coverage and storage/security are weak. |
| Inventory | FUNCTIONAL BUT INCOMPLETE | Catalog, stock, lots, purchasing, counts, controlled substances, usage, traceability, exports, and UI exist. Type safety, data constraints, tests, and maintainability are fragile. |
| Admin / Settings | PARTIALLY IMPLEMENTED | Profile, account, appearance, scheduler settings, workflow colors, visit policy, and record-signoff grants exist. Clinic/users/notifications/shortcuts/about are “Soon.” |
| Billing / Invoicing | PARTIALLY IMPLEMENTED | Only checkout balance flags, cents, Payment work items, and inventory billing-unit metadata exist. No invoice ledger, charges, payments, refunds, taxes, estimates, or reconciliation. |

## Partially Implemented Work

- Production authentication:
  - WorkOS service integration exists.
  - Real credentials are blank locally.
  - Production SSR cookie forwarding is missing on patient and visit pages.
  - No production-auth browser test exists.

- Multi-org/location:
  - Normalized membership tables exist.
  - Multiple memberships/locations are rejected instead of switchable.
  - Legacy user scope fields remain live and are still queried.

- Visit care flow:
  - Intake, exam, work items, discharge, and record locking exist.
  - Diagnostics, estimates, approvals, treatments, medication administrations, and client approvals remain generic work items.
  - A failing test shows discharge policy and implementation disagree.

- Client communication:
  - Inbox and message persistence exist.
  - “Send SMS” only inserts a row and immediately sets `deliveredAt`.
  - New-conversation button has no handler.
  - No provider, webhook, delivery failure, opt-out, consent, or phone validation workflow exists.

- Inventory:
  - Broad UI/API/schema surface exists.
  - Five large services bypass the compiler.
  - Controlled closeout has approximately 975 lines and sparse direct test coverage.
  - Clinical usage anticipates domain events that do not yet exist.
  - Exports are synchronous and local-process based.

- Settings:
  - Users, clinic setup, notifications, keyboard shortcuts, and About are disabled placeholders.
  - Admin grants can be changed for record signoff, but general user/role/access administration is absent.

- Billing:
  - UI wording implies payment collection and balance resolution.
  - Backend only stores a status and integer outstanding amount.
  - “Mark Balance Paid” is not connected to a payment transaction.

- Background jobs/integrations:
  - No worker, queue, scheduler, Redis, retry worker, webhook consumer, object storage, or integration runtime exists.
  - Mapbox address search is the only real external operational integration visible.
  - WorkOS authentication exists but is not configured locally.

## Disconnected / Dead / Duplicate Code

- Dashboard navigation contains disabled Tasks, Reports, Billing, and Help items although task functionality exists inside Dashboard.
- Settings contains five permanently disabled “Soon” sections.
- Scheduler imports confirmation labels/status constants and defines `handleConfirmationStatusChange`, but none are used.
- Client Communication’s “New” button is inert.
- Client Communication claims outbound SMS delivery but only writes database rows.
- Legacy `User.organizationId`, `User.role`, and `User.locations` duplicate normalized membership/access.
- Patient medication support includes `legacyNotes`, indicating a partially migrated representation.
- `VisitState` contains 47 detailed states while `VisitPhase`, work items, and configurable dashboard statuses form overlapping workflow systems.
- The schema contains future integration IDs for several nonexistent domains.
- `packages/db` exposes a raw pool, but most product code uses Prisma; its practical use is primarily health checking.
- Documentation repeatedly describes inventory, messaging, audit/event work, and auth as deferred even though they now exist.

## Data Integrity Risks

- Inventory models frequently lack database foreign keys for tenant, clinic, actor, patient, visit, item, lot, and invoice references.
- Application-level parent checks are followed by ID-only updates. Correctness therefore depends on every future caller preserving the check/update sequence.
- Two integration test teardowns already fail because relationship deletion order is wrong.
- Tests and demo data share the same fixed development organization, allowing state leakage and appointment conflicts.
- Inventory seeds target the first database location rather than a fixed development tenant.
- Client messages are marked delivered without delivery evidence.
- Checkout balances can be marked paid without a payment ledger or audit-grade financial record.
- The local upload filesystem can diverge from database URLs and will not survive stateless deployment.
- Inventory stock writes retry write conflicts, but several related lot/container/balance representations must remain synchronized manually.
- Visit policy is split between lifecycle assertions, discharge assertions, work-item state, 47 visit states, phases, and configured workflow steps.
- Schema references to absent invoice/clinical domains are unconstrained strings and can accumulate orphan data.

## Security / Permission Risks

- P0: production patient and visit pages omit authentication cookies on direct API requests.
- P0 if deployed incorrectly: non-production without WorkOS is anonymous automatic OWNER access.
- Arbitrary messaging attachments are served from same-origin public storage.
- No observable upload scanning, retention policy, access-controlled download, or tenant-specific storage prefix exists.
- Client SMS UI can create false records of communication and delivery.
- No explicit audit trail exists for many ordinary patient/client/profile mutations.
- Coarse role permissions do not constitute a complete authorization matrix.
- Legacy and normalized membership models can disagree.
- No API rate limiting or brute-force mitigation is visible around login.
- The fixed development password is committed by design and must never be valid in production identity infrastructure.
- Sensitive clinical and controlled-inventory exports are synchronous HTTP downloads; audit rows exist for some exports, but storage and transport controls are not documented.

## UI / Backend Contract Risks

- Patient/visit SSR pages assume unauthenticated direct API access; production API requires a sealed cookie.
- Client Communication displays “Messages are sent as clinic SMS” and “Delivered,” but no SMS is sent.
- Checkout UI says “Mark Balance Paid,” while the API only toggles a balance status.
- The failing discharge test expects active clinical work to block discharge; current behavior permits it.
- The appointment test expects a new-patient transaction to succeed; current data/state returns conflict.
- Scheduler confirmation controls remain partly implemented in code but are no longer rendered.
- A 47-state Visit enum, eight phases, generic work items, dashboard status configuration, and frontend coarse buckets all encode overlapping workflow meaning.
- `visit-states.ts` explicitly skips estimate/diagnostic/approval workflow and jumps from exam completion to `TreatmentPending`, while UI offers those work-item categories.
- Billing is visible in navigation and checkout language but has no billing backend.
- Inventory usage mapping includes events for lab, medication, vaccine, retail, procedures, and invoices that current product domains cannot emit reliably.
- Today passes `appointmentTypes={[]}` to its appointment popover, potentially making appointment detail behavior differ from Scheduler.
- Direct server API requests and BFF proxy requests use different authentication behavior.

## Technical Debt That Is Now Dangerous

- `@ts-nocheck` across roughly 4,300 lines of inventory business logic.
- Very large components and services:
  - inventory workspace: several thousand lines,
  - scheduler: 1,692 lines,
  - usage service: 1,258 lines,
  - appointment modal: 1,220 lines,
  - controlled closeout: 975 lines.
- Shared integration database and fixed tenant fixtures make tests non-hermetic.
- Root `typecheck` rebuilds the application and can fail for reasons unrelated to `tsc`.
- Database constraints lag behind the expanding inventory domain.
- Overlapping visit state representations make policy regressions difficult to detect.
- BFF proxy routes are largely repetitive and can drift in cookie/body/error handling.
- No CI result can be trusted from current `main` because lint and tests fail locally, while the README says CI runs them.
- Recent high-volume inventory commits were not followed by documentation, migration-ledger, or type-safety cleanup.

## Highest-Risk Areas

### P0

1. Problem: production-authenticated patient and visit pages are likely unusable.
   - Evidence: `layout.tsx` explicitly forwards cookies; `patients/[id]/page.tsx` and `visits/[id]/page.tsx` do not.
   - Affected files/systems: patient workspace, visit workspace, WorkOS production auth.
   - Recommended response: centralize authenticated server-side API fetching and add production-guard integration tests before feature work.

2. Problem: anonymous OWNER fallback outside production.
   - Evidence: `DevelopmentAuthGuard` attaches the fixed OWNER when no valid cookie exists and WorkOS is not fully configured.
   - Affected files/systems: every protected API route in development/test/staging-like deployments.
   - Recommended response: require an explicit local-only flag and fail closed for any remotely deployed environment.

3. Problem: inventory data integrity depends heavily on unchecked application code.
   - Evidence: five `@ts-nocheck` services; many inventory tenant/actor/domain IDs lack database foreign keys.
   - Affected files/systems: stock, controlled substances, purchasing, counts, clinical usage, traceability.
   - Recommended response: stop inventory expansion, restore compiler coverage, define database invariants, and add tenant/concurrency integration tests.

4. Problem: database-mutating tests share the development tenant/database and leave inconsistent residue.
   - Evidence: appointment conflict, Patient/Visit teardown FK failures, fixed `dev-organization`.
   - Affected files/systems: CI reliability, local data, visit and appointment regression detection.
   - Recommended response: use isolated per-run databases or schemas and transaction-safe fixtures.

### P1

1. Problem: discharge accepts a state the test says must be blocked.
   - Evidence: expected `409`, received `200`.
   - Affected files/systems: visit lifecycle, clinical work items, discharge.
   - Recommended response: reconcile policy, test expectation, and `assertVisitReadyForDischarge`; document the chosen invariant.

2. Problem: client SMS delivery is simulated as real.
   - Evidence: API writes `deliveredAt: new Date()` without a provider call.
   - Affected files/systems: client communication, medical/legal communication history.
   - Recommended response: relabel as internal prototype data or implement provider-backed queued delivery and webhooks.

3. Problem: build/typecheck orchestration is nondeterministic.
   - Evidence: first build passed; subsequent root typecheck failed collecting two existing routes.
   - Affected files/systems: local development and CI.
   - Recommended response: make `typecheck` compiler-only, isolate Next output/cache, and reproduce from a clean checkout.

4. Problem: visit workflow has multiple competing sources of truth.
   - Evidence: 47 states, phases, work items, configured workflow steps, frontend coarse buckets.
   - Affected files/systems: Dashboard, Today, Visit Workspace, discharge, reporting.
   - Recommended response: define one canonical transition contract and derive every projection from it.

5. Problem: the test command mixes unit and database e2e suites.
   - Evidence: API `vitest.config.ts` includes both `src/**/*.spec.ts` and `test/**/*.e2e-spec.ts`.
   - Affected files/systems: feedback speed, diagnosis, CI.
   - Recommended response: split unit and integration projects/scripts.

6. Problem: inventory seed selection is unsafe.
   - Evidence: scripts use `location.findFirst()` rather than the fixed development clinic.
   - Affected files/systems: local/shared databases and demo data.
   - Recommended response: require explicit organization/location IDs and refuse non-development environments.

### P2

1. Problem: stale documentation describes an early Sprint 0/1 repository.
   - Evidence: README and schema header say Inventory and Communication are deferred.
   - Affected files/systems: onboarding and project planning.
   - Recommended response: rewrite current-state documentation after stabilization.

2. Problem: dead/inert navigation and controls.
   - Evidence: disabled Tasks/Reports/Billing/Help, inert client “New” button, unused scheduler confirmation code.
   - Affected files/systems: navigation, communication, scheduler.
   - Recommended response: hide nonfunctional actions or complete their existing intended paths.

3. Problem: local public-disk uploads are deployment-unsafe.
   - Evidence: BFF routes write directly under `apps/web/public/uploads`.
   - Affected files/systems: profile images, patient photos, message attachments.
   - Recommended response: move to authenticated object storage before real patient data.

4. Problem: major modules have become monolithic.
   - Evidence: several 1,000–4,000-line files.
   - Affected files/systems: scheduler, inventory, appointments, patient creation.
   - Recommended response: extract bounded domain operations only after tests provide protection.

## Recent Work Reconstruction

Based on git history and current code:

- July 23: inventory UI/workflow polish and dedicated Playwright coverage.
- July 22: rapid inventory expansion across:
  - clinical usage/reservation/traceability,
  - controlled-substance ledger/count/correction/disposal/reporting,
  - purchasing, receipts, transfers,
  - physical counts,
  - catalog/lots/stock balances.
- July 21: visit intake and exam UI redesign; older intake/records-prep panels removed.
- July 20: role-specific operational dashboards.
- July 18: visit lifecycle kernel, phases, work items, exceptions, handoffs, record locking/amendments, discharge, checkout, and integrity constraints.
- July 17–18: scheduler hardening, audit history, profile/auth improvements, internal messaging, and client communication.
- July 14 and earlier: configurable appointment/status administration, alerts, medications, patient intake, and appointment preparation.

The work pattern suggests fast vertical expansion followed by UI polish, with stabilization, typing, test isolation, production-auth testing, and documentation lagging behind.

## Recommended Recovery Sequence

1. Freeze feature development and preserve the current database.
2. Reproduce CI from a clean checkout with isolated ports and a dedicated test database.
3. Fix production-authenticated SSR fetching for patient and visit pages; add real-guard tests.
4. Separate unit, integration, and Playwright commands.
5. Make API integration fixtures hermetic and correct teardown ordering.
6. Resolve the two behavioral test failures by confirming product policy first.
7. Make `pnpm build`, `pnpm typecheck`, `pnpm lint`, `pnpm test`, and `pnpm test:e2e` repeatably green.
8. Remove `@ts-nocheck` from inventory incrementally, beginning with stock mutation and controlled-substance services.
9. Audit inventory database constraints, tenant/location references, idempotency, and transaction boundaries.
10. Disable or relabel simulated SMS/payment behavior until backed by real systems.
11. Guard all seed/reset scripts against wrong environments and require explicit tenant selection.
12. Update README, schema header, engineering plan status, and data-change ledger.
13. Establish one canonical visit workflow contract and regression matrix.
14. Only then resume scoped feature development.

## Recommended Next 5 Development Phases

### Phase 1: Trustworthy Engineering Baseline

- Objective: make every documented verification command deterministic and green.
- Why it comes next: current failures make regressions indistinguishable from fixture/build noise.
- Dependencies: dedicated PostgreSQL test database, free deterministic ports, clean-output strategy.
- Major risks: existing tests may rely on persistent demo data.
- Completion criteria:
  - two consecutive clean runs of build, typecheck, lint, unit, integration, and Playwright pass;
  - no tracked or persistent demo data is altered;
  - CI matches local commands.

### Phase 2: Authentication and Tenant-Safety Closure

- Objective: prove production WorkOS behavior and organization/location isolation.
- Why it comes next: authenticated server rendering and tenant boundaries are release blockers.
- Dependencies: isolated auth fixtures or a deterministic WorkOS test strategy.
- Major risks: legacy and normalized membership fields disagree.
- Completion criteria:
  - protected SSR pages work with real guard semantics;
  - anonymous requests fail closed outside explicit local mode;
  - cross-org and cross-location tests cover all major modules;
  - one source of membership truth is documented and enforced.

### Phase 3: Visit Workflow Reconciliation

- Objective: align states, phases, work items, dashboard statuses, discharge, record locking, and checkout.
- Why it comes next: visit behavior is clinically central and already has a confirmed regression.
- Dependencies: stable tests and agreed pilot policy.
- Major risks: changing state rules may invalidate existing demo rows and configured statuses.
- Completion criteria:
  - one transition matrix;
  - no direct state mutations outside lifecycle service;
  - discharge and closure invariants pass;
  - Dashboard, Today, patient, and visit views agree after every transition.

### Phase 4: Inventory Integrity Hardening

- Objective: make existing inventory functionality safe before adding breadth.
- Why it comes next: this is the largest and least type-safe recent subsystem.
- Dependencies: stable test harness and finalized tenant rules.
- Major risks: exposing latent type and transaction defects may require careful data reconciliation.
- Completion criteria:
  - no `@ts-nocheck`;
  - mutation services have typed Prisma inputs;
  - critical foreign keys/check constraints exist;
  - concurrency, reversal, controlled authorization, and tenant-isolation tests pass;
  - seed scripts require explicit development scope.

### Phase 5: Honest External and Financial Workflows

- Objective: either implement or clearly constrain client messaging and checkout/balance behavior.
- Why it comes next: current UI overstates what the backend actually does.
- Dependencies: job/integration design, object storage, audit model, product decision on billing scope.
- Major risks: communication compliance and financial-record semantics.
- Completion criteria:
  - SMS delivery states come from provider events, or the feature is clearly labeled simulated;
  - attachments use durable controlled storage;
  - checkout no longer represents status toggles as payment transactions;
  - billing scope and invariants are documented before invoice development begins.

## Files / Areas The Project Manager Should Inspect First

- [package.json](/Users/jakefranco/sparki/package.json)
- [turbo.json](/Users/jakefranco/sparki/turbo.json)
- [Prisma schema](/Users/jakefranco/sparki/prisma/schema.prisma)
- [Production/development auth selection](/Users/jakefranco/sparki/apps/api/src/auth/auth.module.ts)
- [Authentication service](/Users/jakefranco/sparki/apps/api/src/auth/auth.service.ts)
- [Development OWNER fallback](/Users/jakefranco/sparki/apps/api/src/auth/development-auth.guard.ts)
- [Patient SSR page](/Users/jakefranco/sparki/apps/web/src/app/patients/[id]/page.tsx)
- [Visit SSR page](/Users/jakefranco/sparki/apps/web/src/app/visits/[id]/page.tsx)
- [Visit lifecycle service](/Users/jakefranco/sparki/apps/api/src/visits/visit-lifecycle.service.ts)
- [Visit discharge service](/Users/jakefranco/sparki/apps/api/src/visits/visit-discharge.service.ts)
- [Visit lifecycle integration tests](/Users/jakefranco/sparki/apps/api/test/visits.e2e-spec.ts)
- [Appointment integration tests](/Users/jakefranco/sparki/apps/api/test/appointments.e2e-spec.ts)
- [Inventory permissions](/Users/jakefranco/sparki/apps/api/src/inventory/inventory.permissions.ts)
- [Inventory usage service](/Users/jakefranco/sparki/apps/api/src/inventory/usage.service.ts)
- [Controlled closeout service](/Users/jakefranco/sparki/apps/api/src/inventory/controlled-closeout.service.ts)
- [Inventory workspace](/Users/jakefranco/sparki/apps/web/src/components/inventory/inventory-workspace.tsx)
- [Client communication service](/Users/jakefranco/sparki/apps/api/src/messaging/messaging.service.ts)
- [Client communication UI](/Users/jakefranco/sparki/apps/web/src/components/client-communication-workspace.tsx)
- [API test configuration](/Users/jakefranco/sparki/apps/api/vitest.config.ts)
- [Playwright configuration](/Users/jakefranco/sparki/apps/web/playwright.config.ts)
- [Local demo seed](/Users/jakefranco/sparki/scripts/seed-local-clinic-demo-data.mjs)
- [Inventory seed entry point](/Users/jakefranco/sparki/scripts/seed-inventory-pass-1.mjs)
- [Data change ledger](/Users/jakefranco/sparki/docs/database/DATA_CHANGE_LEDGER.md)
- [README](/Users/jakefranco/sparki/README.md)

## Final Assessment

1. Is it safe to resume feature development immediately?

No. Stabilization and production-auth correction should happen first.

2. Is the current database/migration state trustworthy?

The configured local database is migration-complete and matches the Prisma schema. The broader data model is not yet fully trustworthy because newer inventory relationships lack database enforcement, tests share persistent data, seed targeting is unsafe, and the change ledger is incomplete.

3. Is main currently a trustworthy baseline?

No. `main` matches origin, but lint fails, integration tests fail, Playwright cannot run reliably, root typecheck orchestration is nondeterministic, and production-authenticated SSR behavior appears broken.

4. What is the single highest-risk technical issue?

The mismatch between real production authentication and direct unauthenticated server-side API fetches in the patient and visit workspaces. It can make the central clinical workflow fail immediately when WorkOS is enabled, while development mode hides the defect by granting automatic OWNER access.

5. What is the single highest-value next action?

Create a clean, isolated CI-equivalent verification baseline and make it green—starting with authenticated SSR tests for patient/visit pages, then the failing API integration cases and inventory typecheck/lint debt.
