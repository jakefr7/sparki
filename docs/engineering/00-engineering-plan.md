# 00 Engineering Plan

## Purpose

Define how Sparki will be built from this point forward.

This document marks the transition from product architecture to engineering execution. The next phase is not more blueprinting. The next phase is building the first complete vertical slice, proving the core workflow, and letting implementation reveal what needs to be refined.

## Current State

Sparki has enough foundation to begin Sprint 0.

Completed:

- Product Constitution.
- Blueprint documents.
- ADR scaffolding.
- Core Domain Model.
- Event, Work, Permission, Migration, and Visit architecture.
- Implementation-ready module specifications for:
  - Patient Workspace MVP.
  - Visit Lifecycle MVP.
  - Medical Records MVP.
  - Scheduling MVP.

These documents are the source of truth for product behavior. Engineering should reference them, not rewrite them.

## Engineering Principles

Engineering decisions must align with the Product Constitution.

### Workflow First

Build around clinic flow, not isolated CRUD screens. A feature is not complete until it moves real work forward.

### Speed Is A Product Feature

Performance budgets should be treated as product requirements. Slow workflows will create workarounds and destroy trust.

### Migration First

Migration is not a one-time import. Every core object should be able to preserve source, confidence, and historical context.

### Patient-First Architecture

Patient context should remain central across scheduling, visits, records, work, communication, and billing.

### Simplicity Over Abstraction

Build concrete module behavior first. Extract shared infrastructure only after at least two real modules need the same pattern.

### Durable Truth Over Convenience

Medical records, audit history, permissions, and migrated provenance must be correct before they are clever.

### Avoid Premature Optimization

Optimize the critical path first: login, patient lookup, patient workspace, scheduling, visit state, medical record creation, and persistence.

### Prefer Boring Technology

Choose tools the team can hire for, debug under pressure, and operate with a small staff.

## Recommended Technology Stack

### Frontend

Recommendation: Next.js, React, TypeScript.

Why:

- Supports fast product development with a mature React ecosystem.
- Gives the team server-rendered and client-rendered options without changing frameworks.
- Works well for workflow-heavy applications with authenticated product surfaces.
- Has strong testing, routing, and deployment support.

### Backend

Recommendation: NestJS with TypeScript, built as a modular monolith.

Why:

- Matches Sparki's module structure: scheduling, visits, patients, records, permissions, events.
- Provides clear patterns for controllers, services, modules, guards, validation, queues, and tests.
- Keeps the team from prematurely splitting services.
- Can later extract workers or services when a real scaling boundary appears.

### Database

Recommendation: PostgreSQL.

Why:

- Sparki is relationship-heavy: Patients, Clients, Visits, Appointments, Medical Records, Events, Audit Events, Permissions, and Migration Records.
- Strong transactions matter for medical record integrity, state transitions, audit history, and migration validation.
- PostgreSQL can support early search, JSON metadata, indexing, and reporting without adding extra systems too soon.

### ORM

Recommendation: Prisma for Sprint 0 and early MVP, with explicit permission to use raw SQL for critical queries.

Why:

- Speeds early schema iteration.
- Gives type-safe database access for a TypeScript team.
- Supports readable migrations and shared schema understanding.
- Raw SQL remains available for patient search, timeline queries, audit queries, and migration validation where ORM abstraction gets in the way.

### Caching

Recommendation: Redis only where the first vertical slice needs it.

Why:

- Do not introduce caching before measuring bottlenecks.
- Redis is useful for session-adjacent data, queues, rate limiting, and hot workspace summaries if needed.
- Patient and visit correctness should come from PostgreSQL first.

### Search

Recommendation: PostgreSQL full-text search and trigram indexes first.

Why:

- Patient search is required immediately.
- Adding OpenSearch or another search service before real data volume would increase operational cost.
- If patient search becomes a proven bottleneck, introduce a dedicated search service later.

### Storage

Recommendation: S3-compatible object storage.

Why:

- Attachments, migrated files, diagnostic PDFs, and record exports need durable storage.
- Object storage keeps large files out of PostgreSQL.
- Metadata and permissions remain in the application database.

### Queue

Recommendation: BullMQ with Redis when background work is first required.

Why:

- Migration imports, attachment processing, audit-safe exports, and integration syncs should not block user workflows.
- Keep queue usage tied to concrete jobs. Do not build a generic workflow engine.

### Authentication

Recommendation: WorkOS AuthKit for authentication, with Sparki-owned authorization in the application database.

Why:

- Avoids building password, session, MFA, and SSO primitives from scratch.
- Supports future B2B requirements without forcing them into Sprint 0.
- Keeps role capabilities, Location access, and clinical permissions inside Sparki where product behavior depends on them.

### Infrastructure

Recommendation: AWS managed services for production baseline.

Initial target:

- RDS PostgreSQL.
- S3.
- ECS/Fargate or equivalent container runtime for API and workers.
- ElastiCache Redis when queue/cache is needed.
- CloudFront or managed CDN where needed.

Why:

- Durable, boring infrastructure.
- Clear path for security, backups, private networking, and compliance needs.
- Avoids an early migration away from prototype hosting once customer data is real.

### Deployment

Recommendation: GitHub Actions for CI/CD; Vercel for frontend preview deployments; AWS for production API, workers, database, storage, and queues.

Why:

- Fast frontend iteration.
- Production data systems stay in a controlled environment.
- CI/CD remains visible to the team.

### Observability

Recommendation: OpenTelemetry, Sentry, structured logs, and cloud metrics.

Why:

- Sparki must understand slow workflows, failed transitions, migration errors, permission denials, and record/audit failures.
- OpenTelemetry keeps instrumentation portable.
- Sentry catches product-impacting frontend and backend errors quickly.

### Testing

Recommendation:

- Vitest for unit tests.
- Playwright for end-to-end workflow tests.
- Supertest or equivalent for API integration tests.
- Testcontainers or isolated test databases for database-backed tests.

Why:

- Core workflows require end-to-end confidence.
- Medical records, permissions, and audit history need integration tests, not only unit tests.
- Playwright should cover the first vertical slice before broad feature expansion.

### Developer Tooling

Recommendation:

- pnpm workspaces.
- Turborepo.
- ESLint.
- Prettier.
- TypeScript strict mode.
- Zod or class-validator for boundary validation.
- Husky/lint-staged only if it does not slow commits.

Why:

- Keeps a TypeScript monorepo fast and consistent.
- Prevents avoidable type and formatting drift.
- Supports a small team without heavy process.

## Repository Strategy

Use a single monorepo.

Recommended structure:

```text
apps/
  web/
  api/
  worker/

packages/
  db/
  domain/
  authz/
  ui/
  config/

docs/
  blueprint/
  engineering/
  specs/
  adr/

prisma/
  schema.prisma
  migrations/
```

Start smaller if implementation does not need every package on day one.

Recommended Sprint 0 starting structure:

```text
apps/
  web/
  api/

packages/
  db/
  config/

docs/

prisma/
```

Why:

- One repo keeps product, API, database, tests, and docs aligned.
- A modular monolith avoids service boundaries before the domain is proven.
- Shared packages should exist only when they reduce real duplication.
- Documentation stays close to implementation.

## Sprint Strategy

### Sprint 0

Goal: create the production-shaped foundation and prove the vertical slice can be built.

Build:

- Monorepo setup.
- Web app shell.
- API app shell.
- PostgreSQL schema foundation.
- Authentication integration.
- Organization/Location/User/Role basics.
- Patient and Client persistence.
- Appointment persistence.
- Visit persistence and initial state transition support.
- Medical Record creation.
- Event and Audit Event persistence for the vertical slice.
- Basic CI.
- Local developer setup.

Do not build broad platform abstractions.

### Sprint 1

Goal: complete the first usable workflow from login to persisted Visit and Medical Record.

Build:

- Login.
- Patient search.
- Patient Workspace summary.
- Schedule appointment.
- Create Visit from appointment.
- Update Visit State through valid transitions.
- Create Visit Record Entry.
- Create draft SOAP Note.
- Persist Business Events and Audit Events.
- Role-aware access for the slice.
- Playwright test for the slice.

### Sprint 2

Goal: harden the slice into something pilot-worthy.

Build:

- Appointment readiness.
- Visit owner, next action, blockers, and Exceptions.
- Medical Record signoff and locking.
- Record amendment behavior.
- Migration source/confidence fields for patients, appointments, and records.
- Performance pass against Patient Workspace, patient search, and Visit State transitions.
- Seed/demo data that looks like a real clinic day.
- Error handling and observability for core workflows.

## Vertical Slice

The first engineering milestone is one complete vertical slice:

```text
Login
  -> Patient Search
  -> Patient Workspace
  -> Schedule Appointment
  -> Create Visit
  -> Update Visit State
  -> Create Medical Record
  -> Persist Data
```

This is the smallest usable Sparki product.

The slice proves:

- Authentication works.
- Patient context is central.
- Scheduling can create upstream demand.
- Visit Lifecycle can move work.
- Medical Records can preserve clinical truth.
- Events and Audit Events are captured.
- Permissions can protect role-specific behavior.
- Data survives refresh, logout, and deployment.

Do not expand into billing, diagnostics, reminders, integrations, AI, or migration tooling until this slice works end to end.

## Engineering Risks

### Migration

Risk: imported data becomes untrusted noise or silently corrupts active workflows.

Mitigation:

- Add source and confidence fields from day one.
- Keep migrated history distinct from native Sparki records.
- Prioritize future appointments, active patients, and Medical Records.

### Performance

Risk: the system feels slower than legacy habits.

Mitigation:

- Add budgets to acceptance criteria.
- Measure patient search, workspace load, appointment creation, Visit State transitions, and record opening early.

### Medical Record Integrity

Risk: signed clinical history can be edited, lost, or ambiguously owned.

Mitigation:

- Implement draft, signed, locked, amended, and voided behavior intentionally.
- Use amendments instead of destructive edits.
- Audit every sensitive action.

### Permissions

Risk: users see or modify clinical, financial, or cross-location data they should not access.

Mitigation:

- Build Organization, Location, Role, and capability checks into the first slice.
- Test permission denials, not only happy paths.

### Audit History

Risk: important changes happen without a durable explanation.

Mitigation:

- Treat Event and Audit Event writes as part of the same feature work, not cleanup.
- Include audit expectations in every feature ticket.

### Integrations

Risk: external systems force premature abstractions.

Mitigation:

- Add integration source fields now.
- Build actual connectors only when a module requires them.

### Offline Resilience

Risk: clinics may expect continuity during internet disruptions.

Recommendation:

- Do not build offline-first in Sprint 0.
- Design forms to avoid needless data loss.
- Revisit offline behavior after pilot workflow observation.

## Definition Of Done

A feature is complete when:

- It satisfies the relevant module spec.
- It follows the Product Constitution.
- It has role-aware permission checks.
- It records required Business Events.
- It records required Audit Events.
- It preserves source and confidence for migrated/imported data where relevant.
- It handles empty, loading, unavailable, and permission-denied states.
- It has unit or integration tests for business rules.
- It has an end-to-end test when it affects the vertical slice.
- It meets or records performance budget gaps.
- It has useful errors and logs.
- It does not introduce broad infrastructure beyond the feature's needs.
- Documentation is updated only when implementation changes behavior.

## Immediate Action Items

Create these GitHub issues first:

1. Scaffold pnpm monorepo with `apps/web`, `apps/api`, `packages/db`, and `packages/config`.
2. Configure TypeScript strict mode, ESLint, Prettier, and basic CI.
3. Create local PostgreSQL development setup.
4. Add Prisma schema foundation for Organization, Location, User, Role, Patient, Client, Appointment, Visit, Medical Record, Event, and Audit Event.
5. Implement authentication integration and user bootstrap.
6. Implement Organization/Location access guard for API requests.
7. Implement Patient and Client create/read persistence.
8. Implement Patient Search using PostgreSQL indexes.
9. Implement Patient Workspace read model for MVP summary.
10. Implement Appointment create/reschedule/cancel/confirm/no-show/arrive state model.
11. Implement Create Visit from Appointment.
12. Implement Visit State transition validation for the vertical slice.
13. Implement Business Event persistence for appointment and visit changes.
14. Implement Audit Event persistence for sensitive changes.
15. Implement Medical Record creation tied to Patient.
16. Implement Visit Record Entry creation tied to Visit.
17. Implement draft SOAP Note creation.
18. Build first web flow: login -> patient search -> patient workspace.
19. Build scheduling flow from Patient Workspace.
20. Build Visit creation and Visit State update flow.
21. Build Medical Record creation flow from Visit.
22. Add Playwright test for the full vertical slice.
23. Add seed data for one realistic clinic day.
24. Add basic observability: structured logs, request IDs, error tracking.
25. Add performance checks for patient search, workspace load, appointment creation, Visit State update, and record opening.

## Stack References

- [Next.js Documentation](https://nextjs.org/docs)
- [NestJS Documentation](https://docs.nestjs.com/)
- [Prisma Supported Databases](https://www.prisma.io/docs/orm/reference/supported-databases)
- [PostgreSQL About](https://www.postgresql.org/about/)
