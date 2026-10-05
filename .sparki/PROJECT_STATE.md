# Project State

Last reviewed: 2026-09-16

Risk classification: **HIGH RISK** because Sparki handles clinical records, medication permissions, inventory, tenant-scoped data, and financial attestations.

The original verified audit is preserved in [BASELINE_SITREP.md](./BASELINE_SITREP.md). Historical phase closeouts remain evidence only; they are not the current operating model.

For user-authorized staging testing, Codex and Claude should read [shared staging testing memory](./STAGING_TESTING.md) for the existing five-person test clinic and local credential location.

## Current product state

- TypeScript monorepo with Next.js, NestJS, Prisma/PostgreSQL, Vitest, and Playwright.
- Patient, client, appointment, visit, clinical record, inventory, invoice, checkout, messaging, and settings surfaces are implemented.
- Clinical record attribution, locking/amendment behavior, controlled-inventory rules, tenant isolation, authenticated attachments, and honest external-payment semantics must be preserved.
- The active working tree adds patient-profile invoice access, medication inventory presets and audited actions, medication-clerk permission, Hospital Services settings, exam-closeout refinements, and patient-first intake layout.
- The latest local verification for that work passed typecheck, unit/infrastructure tests, production build, and 226 integration tests. Lint passed with no errors and nine pre-existing warnings.

## Partial or intentionally bounded

- Billing records clinic-managed invoice and external-payment state; Sparki does not process or verify card/bank payments.
- Client texting has a real backend (2026-10-02, local only) but no provider account or clinic number, so every location remains in simulation and is represented as simulated rather than externally delivered.
- Patient-profile invoices currently require an active visit for new charges.
- Behavior/FAS: 0–5 capture with staff attribution and append-only visit/patient history is implemented locally (October 5). Migration verified in disposable test databases only; rollout and automatic SOAP/PDF inclusion remain pending.
- Service markup is stored as metadata but does not alter price until its calculation policy is defined.

## Operating model

- There is no active development phase.
- Work follows [CURRENT_WORK.md](./CURRENT_WORK.md): build the smallest cohesive requested change, run focused tests, fix failures, and expand verification in proportion to risk.
- Full browser or repository suites are release-readiness checks, not mandatory gates for every local change.
- Historical phase and run artifacts must not be used to infer current scope or continue stale plans.
