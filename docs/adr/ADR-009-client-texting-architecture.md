# ADR-009 Client Texting Architecture

## Status

Proposed

## Date

2026-10-02

## Constitutional Reference

This ADR inherits from the [Product Constitution](../blueprint/00-product-constitution.md): commandment 8 (communication belongs with the patient), commandment 10 (one source of truth — "auditability matters when state affects … communication"), and the conflict order's first rule, safety and correctness. It gives [ADR-005](./ADR-005-communication-inside-patient-workflow.md) a concrete data model without accepting ADR-005 on the founder's behalf.

## Purpose

Record how Sparki sends and receives client text messages, so the choices that are expensive to reverse are deliberate: who carries the texts, how clinics are kept apart, what a conversation is, and what Sparki will and will not claim about delivery.

## Context

Before this change, client SMS was a labelled simulation ([phase 5 specification](../specs/phase-5-honest-external-financial-workflows.md)), and that specification reserved provider-backed SMS, compliance, and delivery webhooks for founder approval. On 2026-10-02 the founder directed a real backend, chose recorded consent, and limited the first pass to two-way texting.

Constraints that shaped the design:

- Sparki is a multi-clinic product. Carriers register each clinic as its own business, and a pet owner can be a client of two Sparki clinics.
- An inbound text arrives with no signed-in user, so tenant isolation cannot come from a session.
- Text providers do not offer an idempotent send. A timeout leaves the outcome unknown.
- Delivery updates arrive by webhook, out of order and sometimes twice.
- The API runs as a single process on a small server with PostgreSQL and no queue service.
- No provider account exists yet; staging and local data must never reach a real phone.

## Decision

1. **Provider behind an adapter; Telnyx first.** All provider knowledge lives in `apps/api/src/client-communication/providers/`. Sparki owns the conversation history. Telnyx was chosen because it can add texting to a clinic's existing landline; the adapter is what keeps that choice reversible in code.
2. **One Sparki provider account; one sender number, registration, and messaging profile per clinic location.** A nullable `providerAccountRef` keeps a per-clinic sub-account possible later.
3. **Tenant isolation by the clinic's own number.** An inbound message is routed by the number that was texted, a delivery update by the message Sparki sent. Only then is the organization's tenant context entered. The sender's number never selects the clinic.
4. **One conversation per phone number per location**, optionally linked to a client. Patient and appointment context is recorded per message.
5. **The message row is the send queue.** A message is committed as `QUEUED`, then sent by a dispatcher that claims rows with a conditional update. No separate queue service.
6. **Unknown outcomes are never retried.** Only an explicit provider refusal to accept (rate limit, outage) is retried, three times. A later delivery webhook can settle an unknown outcome.
7. **Delivery status only moves forward**, by rank, so late or duplicated webhooks cannot regress it.
8. **Consent is stored per organization and phone number with an append-only history.** An opt-out by the client (keyword or carrier block) cannot be reversed by staff.
9. **Hidden until approved; simulation is opt-in.** A location with nothing registered has no texting and no Communication tab. Simulation exists only for locations explicitly marked as demo or test. A location with a real number that cannot send refuses, and never falls back to simulation.
10. **Automated appointment texts are driven by the appointment change log.** The appointments module already writes a change row in the same transaction as every booking, move, and cancellation; a planner reads those rows. Booking code is untouched and a notification failure cannot undo a booking.
11. **Automated texts are re-validated when due and again immediately before every send attempt**, against the appointment, the clinic's rules, the recipient, and the client's consent as they are at that moment; a message that fails is withdrawn (`CANCELLED`), never sent. Work on one appointment, and every consent change for one number, is serialized with a transaction-scoped advisory lock.
12. **Sparki always adds the clinic's name and an opt-out line to an automated text**, whatever wording the clinic saved, and offers no placeholder for appointment type or reason.

## Consequences

Benefits:

- A reply always has exactly one home; shared and unknown numbers are visible states rather than guesses.
- Switching provider does not touch the history, the API, or the UI.
- Every state shown to staff is a recorded fact with a source.

Costs and risks:

- Switching provider is still not free: each clinic's number hosting and carrier registration would have to be redone.
- Staff must record consent before the first clinic-initiated text, and a migrated clinic needs a bulk "already agreed" import that does not exist yet.
- The dispatcher runs inside the API process. More than one API process is safe (claims are atomic), but a long outage of the process delays retries.
- Polling, not push, carries updates to the browser.
- Normalization is US and Canada only.
- The Telnyx adapter has not been exercised against a live account.

Future constraints:

- Any future automated message should create messages in this same model (`source: AUTOMATED`), not a parallel store.
- The planner depends on every appointment change writing an `AppointmentChange` row. A new code path that changes an appointment without one will not trigger texts (it fails safe: nothing stale is sent, because of decision 11).
- Any second channel (email) needs its own decision on whether it shares a conversation with SMS.

## Goals

- Keep clinics isolated without relying on a session.
- Never send a duplicate text because of a retry.
- Never claim delivery, reading, or confirmation that was not recorded.
- Keep the provider replaceable.

## Guiding Questions

- Could this change cause one clinic's message to appear in another's?
- Could this change cause a client to receive the same text twice?
- Does every status shown to staff trace to a recorded event?

## Future Sections

- Appointment notification scheduling and cancellation
- Clinic onboarding with carriers
- Usage and billing per clinic
- Additional channels

## Known Decisions

- Recorded consent (founder, 2026-10-02).
- First pass is two-way texting only (founder, 2026-10-02).
- Existing simulated conversations are deleted by the migration (founder, 2026-10-02).
- A clinic sees no Communication tab until its number is approved (founder, 2026-10-02).
- Automated texts require staff-recorded agreement; the client texting first is not enough (founder, 2026-10-02).
- Confirmations and reminders are each clinic's own choice, set by an owner or practice manager (founder, 2026-10-02).

## Open Questions

- Is texting included in the subscription or billed by usage? (Founder: undecided, 2026-10-02.)
- Should a client be able to confirm an appointment by replying to a reminder?
- Does a clinic's brand registration belong to the organization with a number per location, as modelled?

## Notes

Contract and behavior detail: [client communication backend](../engineering/client-communication-backend.md). Frontend plan: [frontend roadmap](../research/client-communication-frontend-roadmap-2026-10-02.md). Product backlog for notifications: [post-booking workflow backlog](../research/post-booking-workflow-backlog-2026-10-02.md).

An ADR-008 (trusted plan catalog) is referenced in `packages/config/src/env.ts` but is not present in this directory; this ADR takes the next number to avoid a collision.
