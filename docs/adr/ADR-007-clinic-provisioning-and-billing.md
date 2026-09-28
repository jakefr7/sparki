# ADR-007 Clinic Provisioning And Billing

## Status

Accepted

## Date

2026-09-28

## Constitutional Reference

This ADR inherits from the [Product Constitution](../blueprint/00-product-constitution.md), and from [ADR-006 Multi-Tenant Membership Model](./ADR-006-multi-tenant-membership-model.md), whose normalized-membership decision this ADR extends rather than replaces. The relevant constitutional grounding is Commandment 10, "One Source Of Truth" (subscription state must have one authoritative owner — the billing webhook, never a client redirect) and [Permission And Ownership v1](../blueprint/11-permission-and-ownership-v1.md)'s requirement that clinic data boundaries stay explicit and trustworthy.

## Purpose

Record how a brand-new veterinary clinic goes from "chose a Sparki plan" to "operating inside Sparki with a team," and how Sparki enforces that a clinic's Sparki subscription is actually active.

## Context

Sparki had no formal path from a paying customer to a usable clinic tenant. `Organization` already existed as the tenant boundary (see [08 Core Domain Model v1](../blueprint/08-core-domain-model-v1.md) and `prisma/schema.prisma`), and ADR-006 had already normalized clinic membership into `OrganizationMembership` + `ClinicLocationAccess` — Sparki did not need a new "Clinic" model or a new "ClinicMembership" model; it needed billing/contact state added to `Organization`, an invitation model, and the billing integration that provisions both.

[00 Clinic Provisioning v1](../specs/modules/00-clinic-provisioning-v1.md) explicitly scopes itself to "what must exist before a clinic can see patients" and explicitly excludes signup, billing, and auth. This ADR is the layer that spec assumes already happened: how the `Organization` and its first `Location` come to exist at all, and how the owner gets a Sparki identity, before that spec's provisioning checklist becomes relevant.

## Decision

**Reuse `Organization` as the billing tenant.** Added subscription/contact fields directly to `Organization` (`subscriptionStatus`, `subscriptionStatusUpdatedAt`, `stripeCustomerId`, `stripeSubscriptionId`, `subscriptionPriceId`, `subscriptionCurrentPeriodEnd`, `onboardingCompletedAt`, `legalName`, `phone`, `email`, address fields, `timezone`). No separate `Clinic` model — `Organization` already *is* the tenant; a parallel model would just be a second source of truth for the same boundary ADR-006 already drew.

**Reuse `OrganizationMembership` as the membership model**, adding a `status: MembershipStatus` (`ACTIVE` | `DISABLED`) column alongside the existing `isActive` boolean. `isActive` stays exactly what every pre-existing read site filters on (`AuthService.resolveMembership`, `appointment-availability.service.ts`, `scheduler-config.service.ts`) — this migration changes no existing query's behavior. `status` is the richer value new team-management code reads and displays; the two are always written together by the same call site, never independently, and a later migration can drop `isActive` once every read site moves to `status`.

**No `INVITED` membership status.** `OrganizationMembership.userId` is a required foreign key; a membership row cannot exist before a real `User` does. The pending-invitation state is owned entirely by the new `ClinicInvitation` model (`PENDING` / `ACCEPTED` / `REVOKED`, with expiry computed from `expiresAt` at read time rather than a stored `EXPIRED` status that would need a background job to keep in sync). A membership is created exactly once, at acceptance, already `ACTIVE`.

**The clinic owner's own account is provisioned through the same `ClinicInvitation` model as staff**, not a separate "owner activation" concept — `invitedByUserId: null` and `role: OWNER` is the only difference. `POST /invitations/:token/accept` is the one endpoint that creates a Sparki identity, for both cases. This was a deliberate simplification over the literal "owner activation" flow described in the originating product brief: building a second account-creation code path for the owner would duplicate every security property (token expiry, single-use, email binding) the staff path already needs.

**Billing provider integration is Stripe**, chosen as the de facto standard for hosted subscription checkout; the integration is isolated behind `apps/api/src/billing` (`BillingService` for checkout-session creation, `BillingWebhookService` for webhook processing) so swapping providers later touches one module, not the domain model. `Organization`'s Stripe columns are the "durable mapping between billing customer, billing subscription, and Sparki clinic" the product brief asked for — a separate join-table model would be unwarranted for what is a 1:1 relationship in v1.

**Provisioning is entirely webhook-driven.** `POST /billing/checkout-sessions` (public) creates a Stripe Checkout session with no local database row — the owner's email and chosen plan travel as Stripe session/subscription metadata, not Sparki state, until Stripe confirms. `checkout.session.completed`, verified by `BillingWebhookService` via Stripe's signature scheme, is the only thing that creates an `Organization`. The frontend's post-checkout landing page polls `GET /billing/checkout-sessions/:id/status`, which reports only a coarse `pending` / `provisioned` status derived from whether an `Organization` now exists for that session's Stripe customer — never a claim of "payment succeeded" derived from the redirect itself.

**Webhook idempotency** is layered: (1) `BillingWebhookEvent`, keyed by Stripe's own event id, is upserted before any handler runs — a row whose `processedAt` is already set short-circuits a retried delivery; (2) `checkout.session.completed` is additionally idempotent on `Organization.stripeCustomerId` (unique), so even a *different* Stripe event id for an already-provisioned customer resolves to the same `Organization`; (3) subscription-state handlers only apply an update whose Stripe `created` timestamp is at least as new as `Organization.subscriptionStatusUpdatedAt`, tolerating out-of-order delivery.

**Authorization gains a fourth, orthogonal check.** The existing stack already answers "is this a real session?" (`AuthGuard`) and "does this user belong to exactly one active clinic?" (`AuthService.resolveMembership`, per ADR-006) before a request ever reaches a controller; every controller already derives `organizationId` from that resolved identity, never from a client-supplied value (see `patients.controller.ts`, `staff.controller.ts` for the existing pattern this ADR did not change). What was missing was "is this clinic allowed to use Sparki right now?" — a new, global `SubscriptionGuard`, registered as a second `APP_GUARD` after the identity guard, opt-out via `@AllowInactiveClinic()` for the handful of routes (own identity, clinic/billing self-service reads, public invitation acceptance) that must stay reachable even when a clinic is blocked. Role-based authorization (`requireRole`) is unchanged and layered on top, inside controllers, exactly as before.

**Subscription enforcement:** `ACTIVE` and `PAST_DUE` both allow full access (`PAST_DUE` is surfaced only via `GET /clinic/billing` for a frontend warning banner); `PENDING`, `CANCELED`, and `SUSPENDED` block every non-exempt route with `402 Payment Required` and a machine-readable `{ code: 'SUBSCRIPTION_INACTIVE', subscriptionStatus }` body. `SUSPENDED` is reserved for a future internal administrative action (Stripe never drives it directly in this release, though a Stripe "paused" subscription maps to it) — the enum value and guard behavior exist today so that capability needs no further schema or authorization change later.

**Existing `Organization`-creating code never becomes gated.** `subscriptionStatus` defaults to `ACTIVE` at the column level. Every pre-existing organization-creating path (dev seeds, other modules' test fixtures) predates billing and has no reason to be blocked; only `BillingWebhookService`, reacting to a verified Stripe event, ever creates an `Organization` with a different status, and it always sets one explicitly. This is what keeps the entire pre-existing test suite and local dev flow green without touching unrelated fixtures.

## Consequences

Sparki can accept paying customers without a second parallel tenant model, and the existing tenant-isolation pattern (server-derived `organizationId`, never client-supplied) extends to the new modules unchanged. Adding a real read-only/grace-period policy for `PAST_DUE` later is a change to `isClinicActive`/`SubscriptionGuard` in one place, not a rewrite. The `isActive`/`status` duplication on `OrganizationMembership` is intentional transitional debt, matching the same pattern ADR-006 already established for `User`'s legacy tenant fields — it should be resolved by a follow-up migration once every read site moves to `status`, not accumulated indefinitely.

## Goals

- A clinic cannot exist in Sparki without a confirmed, server-verified subscription.
- No anonymous, unauthenticated path can create a clinic tenant.
- Tenant and role authorization remain exactly as trustworthy as ADR-006 already made them; billing gating is additive, not a rewrite.
- The billing provider integration is isolated enough to be replaced without a domain-model change.

## Guiding Questions

- Does every new Organization-affecting write still derive its tenant from the authenticated session, never a client-supplied id?
- Does a webhook handler behave correctly if Stripe redelivers the same event, delivers a different event id for the same underlying change, or delivers events out of order?
- Does blocking a clinic's access ever require touching more than `SubscriptionGuard`/`isClinicActive`?

## Future Sections

- Read-only/grace-period access policy for `PAST_DUE` or newly `CANCELED` clinics (deliberately deferred — see "Subscription Enforcement" above).
- Multi-clinic membership UX (the data model does not prevent it — see ADR-006 — but v1 keeps the single-active-membership constraint).
- Retiring `OrganizationMembership.isActive` once all read sites move to `status`.

## Known Decisions

- `Organization` is the Sparki billing tenant; no separate `Clinic` model.
- `OrganizationMembership` is the clinic membership model; no separate `ClinicMembership` model, and no `INVITED` membership status.
- Owner account creation and staff invitation acceptance share one endpoint and one model (`ClinicInvitation`).
- Stripe is the billing provider; the integration is isolated to `apps/api/src/billing`.
- Provisioning happens only from a verified webhook, never a client redirect.

## Open Questions

- What administrative surface sets `SUSPENDED` (a future internal admin tool, out of scope here)?
- Should `PAST_DUE` eventually carry a grace-period countdown before becoming blocking?

## Notes

Related implementation points:

- `prisma/schema.prisma`: `SubscriptionStatus`, `MembershipStatus`, `InvitationStatus`, `ClinicInvitation`, `OrganizationEvent`, `BillingWebhookEvent`.
- `apps/api/src/billing/`: Stripe checkout session creation and webhook processing.
- `apps/api/src/invitations/`: `ClinicInvitation` lifecycle (issue, resend, revoke, inspect, accept).
- `apps/api/src/team/`: authenticated team management (Settings > Team).
- `apps/api/src/clinic/`: clinic profile, onboarding state, billing status.
- `apps/api/src/auth/subscription.guard.ts`: the fourth authorization question.
