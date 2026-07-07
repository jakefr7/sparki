# ADR-006 Multi-Tenant Membership Model

## Status

Proposed

## Date

2026-07-07

## Constitutional Reference

This ADR inherits from the [Product Constitution](../blueprint/00-product-constitution.md), especially the requirement that clinic data boundaries remain explicit and trustworthy.

## Purpose

Record the decision that authentication identity, organization membership, and clinic location access are separate concepts in Sparki.

## Context

WorkOS AuthKit owns credentials, password storage, sessions, and the external user id. Sparki still owns authorization: which organization a person belongs to, which clinic location a request acts within, whether that access is active, and what staff role should be used for product behavior.

The first implementation stored a user's current organization, role, and locations directly on `User`. That was enough for a single demo clinic, but it mixes identity with tenant grants. It also makes future multi-location and multi-organization support harder because a login cannot be resolved without guessing which organization or location should be active.

Sprint 1 still has no organization switcher or location switcher. Until those product surfaces exist, request identity must resolve deterministically.

## Decision

Sparki will model tenant access with additive normalized grants:

- `OrganizationMembership` links a `User` to an `Organization`, with `role` and `isActive`.
- `ClinicLocationAccess` links a `User` to a clinic `Location`, scoped by `organizationId`, with `role` and `isActive`.
- `User.workosUserId` links the Sparki user to the WorkOS user. WorkOS remains the source of authentication state only.
- `AuthService.resolveMembership` builds `AuthenticatedUser` from active membership/access rows, not from `User.organizationId`, `User.role`, or `User.locations`.
- In v1, exactly one active organization membership and exactly one active clinic location access are supported per resolved login. Zero rows are unauthorized; multiple active rows are conflict errors until switcher UX exists.

The legacy `User.organizationId`, `User.role`, and `User.locations` fields stay populated during the transition for existing staff and seed flows, but they are not the request authorization source of truth.

## Consequences

This makes tenant isolation explicit and keeps the WorkOS boundary clean: WorkOS authenticates a person, while Sparki authorizes clinic access.

Seed scripts and development-user setup must write both the legacy user fields and the new membership/access rows until the old fields are retired.

Multi-organization and multi-location support now has a clear extension point: add an organization/location switcher and carry the selected context in session or request state, then relax the single-active-row guardrails.

The model introduces some duplicate-looking data during the transition. That is intentional and should be removed only through a later migration once all services read the normalized grants.

## Goals

- Prevent accidental tenant guessing during login.
- Keep authentication vendor data separate from clinic authorization data.
- Support deterministic request context for Sprint 1.
- Preserve a path toward multi-location and multi-organization accounts.

## Guiding Questions

- Does this request have exactly one active organization context?
- Does this request have exactly one active clinic location context?
- Is WorkOS being used only for authentication, not Sparki authorization?
- Can a future switcher choose between the same rows without changing the data model?

## Future Sections

- Organization switcher session design
- Location switcher session design
- Migration plan for retiring legacy `User` tenant fields
- Admin workflows for granting and revoking membership/access

## Known Decisions

- WorkOS owns credentials and sessions.
- Sparki owns organization membership, clinic location access, roles, and active authorization state.
- Multiple active memberships or location grants are unsupported without an explicit switcher.

## Open Questions

- Should organization role and location role always match, or can location role narrow privileges later?
- Where should selected organization/location context live once switchers exist?
- What admin audit events are required for membership and access changes?

## Notes

Related implementation points:

- `prisma/schema.prisma` defines `OrganizationMembership` and `ClinicLocationAccess`.
- `apps/api/src/auth/auth.service.ts` resolves request identity from the normalized grants.
- `scripts/seed-auth-users.mjs` writes both legacy and normalized rows for development login accounts.
