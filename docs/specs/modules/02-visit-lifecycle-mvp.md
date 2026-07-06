# 02 Visit Lifecycle MVP

## Constitutional Authority

This module spec inherits from the [Product Constitution](../../blueprint/00-product-constitution.md). If this spec conflicts with the Constitution, the Constitution governs.

## Purpose

Define the first buildable Visit Lifecycle module for Sparki.

The Visit Lifecycle is the operational heartbeat of Sparki. It tracks how one patient moves through a clinic episode from intent, arrival, care, approval, treatment, checkout, record completion, and archival.

This spec defines behavior, not screens. It should let engineering plan the first visit state model, transitions, permissions, events, audit requirements, and module boundaries without needing another product clarification pass.

The MVP should help the clinic answer:

- Where is this patient in the visit?
- What must happen next?
- Who owns the next action?
- What is blocking progress?
- What has already happened?
- Can this visit safely close?

## Primary Users

### Receptionist

Creates or confirms visit intent, manages arrival, check-in, communication, checkout readiness, payment routing, and closing exceptions.

### Technician

Moves visits through intake, preparation, treatment support, medication support, handoffs, and completion of delegated work.

### Veterinarian

Owns clinical assessment, plan decisions, diagnostic review, prescriptions, clinical communication, and record signoff.

### Practice Manager

Handles operational exceptions, bottlenecks, disputed ownership, financial blockers, audit-sensitive issues, and unresolved closing paths.

### AI Assistant

May summarize, draft, suggest missing context, and identify bottlenecks. It does not own the visit and cannot make clinical, financial, consent, or archival decisions.

### External Integration

May create or update visit-related context through scheduling, communication, diagnostics, payment, pharmacy, inventory, telemedicine, or migration sources. Integration data must preserve source.

## Core User Problems

- Visit status is often reconstructed from memory, not visible system state.
- Staff cannot quickly tell whether a patient is waiting, being worked, blocked, ready for checkout, or ready to archive.
- Handoffs lose context when a visit moves between roles.
- Approval, estimates, treatment, payment, follow-up, and record completion are often tracked in separate places.
- Work can continue after the visible visit appears complete.
- Clinics need flexibility for emergency, drop-off, technician, surgery, hospitalization, curbside, and telemedicine visits without building separate products.
- Migrated appointments and records may imply visit history but should not pollute active visit state.

## MVP Scope

The MVP Visit Lifecycle includes:

- Creating a Visit from a Visit Intent, Appointment, walk-in, emergency, drop-off, telemedicine request, surgery admission, or hospitalization continuation.
- Tracking one current Visit State per Visit.
- Moving a Visit through a closed MVP state machine.
- Recording valid state transitions as Business Events.
- Showing current owner, next action, blockers, and exceptions.
- Supporting core visit variants through visit type, entry conditions, Work Items, and Exceptions.
- Creating Work Items when the next step needs ownership outside the state itself.
- Linking Visit to Patient, Client, Appointment, Medical Record, Estimate, Consent, Invoice, Payment, Communication, Diagnostic Result, Attachment, and Follow-Up where relevant.
- Closing a Visit as Archived or Archived With Exceptions.
- Preserving migrated source labels and confidence for imported visit-related history.

## Explicit Non-Goals

This MVP does not include:

- Full scheduling calendar.
- Full Patient Workspace.
- Full SOAP or Medical Record editor.
- Full estimate builder.
- Full invoice editor.
- Full payment processor implementation.
- Full lab ordering/result review module.
- Full treatment sheet.
- Full medication dispensing workflow.
- Full surgery checklist.
- Full hospitalization board.
- Full telemedicine experience.
- Full communication inbox.
- Full migration review portal.
- Automated clinical decision-making.
- Custom workflow designer.
- Multi-location reporting.

The Visit Lifecycle may route to these modules when they exist. It should not own their full behavior.

## Visit Lifecycle Overview

A Visit begins when the clinic has a patient-centered need to manage. That need may start before arrival through scheduling, or at arrival through walk-in, emergency, drop-off, telemedicine, or hospitalization continuation.

The Visit then moves through operational states. Not every Visit passes through every state.

High-level lifecycle:

1. Intent or Appointment creates a Visit.
2. Visit is scheduled, confirmed, or arrives directly.
3. Clinic checks in and routes the patient.
4. Clinical team performs intake, exam, diagnostics, approval, treatment, medication, or communication as needed.
5. Front desk completes checkout and payment where relevant.
6. Required record work is completed or explicitly excepted.
7. Visit is archived cleanly or archived with unresolved exceptions.

## Complete State Machine

The MVP state machine is intentionally smaller than the full Visit Engine blueprint. It must be closed: every transition target below is either a defined Visit State, a Work Item, an Exception, or outside MVP.

### MVP Visit States

- `Intent Created`
- `Scheduled`
- `Pre-Visit Pending`
- `Confirmed`
- `Arrived`
- `Check-In In Progress`
- `Arrived With Exceptions`
- `Triaged`
- `Waiting`
- `Ready For Intake`
- `Intake In Progress`
- `Veterinarian Exam Ready`
- `Veterinarian Exam In Progress`
- `Plan Drafted`
- `Estimate Needed`
- `Estimate Prepared`
- `Client Approval Pending`
- `Approved`
- `Partially Approved`
- `Declined`
- `Diagnostics Pending`
- `Diagnostics In Progress`
- `Results Pending`
- `Results Ready`
- `Veterinarian Review Pending`
- `Treatment Pending`
- `Treatment In Progress`
- `Treatment Complete`
- `Medication Pending`
- `Client Communication Pending`
- `Follow-Up Pending`
- `Checkout Ready`
- `Checkout In Progress`
- `Payment Pending`
- `Payment Complete`
- `Record Completion Pending`
- `Record Complete`
- `Visit Closing`
- `Visit Closing With Exceptions`
- `Archived`
- `Archived With Exceptions`
- `Cancelled`
- `Cancelled After Arrival`
- `No-Show`
- `Rescheduled`
- `Referred`
- `Deferred`

### Variant Handling

The following are not separate MVP state machines:

- Emergency
- Surgery
- Technician appointment
- Hospitalized patient
- Telemedicine
- Curbside
- Drop-off
- Walk-in

These are represented through:

- Visit type.
- Entry source.
- Urgency.
- Required data.
- Work Items.
- Exceptions.
- Permissions.
- Valid transitions.

### State vs Work Rule

A Visit State describes the current condition of the overall visit.

A Work Item describes owned work that must be completed.

If a condition requires an owner, due time, assignment, or completion, it should usually be a Work Item rather than a new Visit State.

### State vs Exception Rule

An Exception describes abnormal or blocked work.

If a Visit cannot move normally because identity, consent, payment, client communication, record completion, inventory, external integration, or clinical ownership is unresolved, create or update an Exception. Do not invent a new state for every blocker.

## Valid State Transitions

### Intent And Scheduling

- `Intent Created -> Scheduled`
- `Intent Created -> Arrived`
- `Intent Created -> Triaged`
- `Intent Created -> Deferred`
- `Intent Created -> Referred`
- `Intent Created -> Cancelled`
- `Scheduled -> Pre-Visit Pending`
- `Scheduled -> Confirmed`
- `Scheduled -> Arrived`
- `Scheduled -> Rescheduled`
- `Scheduled -> Cancelled`
- `Scheduled -> No-Show`
- `Pre-Visit Pending -> Confirmed`
- `Pre-Visit Pending -> Arrived With Exceptions`
- `Pre-Visit Pending -> Rescheduled`
- `Pre-Visit Pending -> Cancelled`
- `Confirmed -> Arrived`
- `Confirmed -> Rescheduled`
- `Confirmed -> Cancelled`
- `Confirmed -> No-Show`

### Arrival And Routing

- `Arrived -> Check-In In Progress`
- `Arrived -> Triaged`
- `Arrived -> Waiting`
- `Arrived -> Cancelled After Arrival`
- `Check-In In Progress -> Ready For Intake`
- `Check-In In Progress -> Arrived With Exceptions`
- `Check-In In Progress -> Triaged`
- `Check-In In Progress -> Waiting`
- `Arrived With Exceptions -> Ready For Intake`
- `Arrived With Exceptions -> Visit Closing With Exceptions`
- `Arrived With Exceptions -> Rescheduled`
- `Arrived With Exceptions -> Referred`
- `Arrived With Exceptions -> Cancelled After Arrival`
- `Triaged -> Waiting`
- `Triaged -> Ready For Intake`
- `Triaged -> Veterinarian Exam Ready`
- `Triaged -> Treatment Pending`
- `Triaged -> Referred`
- `Waiting -> Ready For Intake`
- `Waiting -> Intake In Progress`
- `Waiting -> Veterinarian Exam Ready`
- `Waiting -> Treatment Pending`
- `Waiting -> Cancelled After Arrival`

### Intake And Exam

- `Ready For Intake -> Intake In Progress`
- `Ready For Intake -> Waiting`
- `Ready For Intake -> Veterinarian Exam Ready`
- `Intake In Progress -> Veterinarian Exam Ready`
- `Intake In Progress -> Waiting`
- `Intake In Progress -> Diagnostics Pending`
- `Intake In Progress -> Treatment Pending`
- `Veterinarian Exam Ready -> Veterinarian Exam In Progress`
- `Veterinarian Exam Ready -> Waiting`
- `Veterinarian Exam In Progress -> Plan Drafted`
- `Veterinarian Exam In Progress -> Diagnostics Pending`
- `Veterinarian Exam In Progress -> Estimate Needed`
- `Veterinarian Exam In Progress -> Treatment Pending`
- `Veterinarian Exam In Progress -> Visit Closing`

### Plan, Estimate, And Approval

- `Plan Drafted -> Estimate Needed`
- `Plan Drafted -> Estimate Prepared`
- `Plan Drafted -> Client Approval Pending`
- `Plan Drafted -> Diagnostics Pending`
- `Plan Drafted -> Treatment Pending`
- `Plan Drafted -> Medication Pending`
- `Plan Drafted -> Client Communication Pending`
- `Plan Drafted -> Visit Closing`
- `Estimate Needed -> Estimate Prepared`
- `Estimate Needed -> Plan Drafted`
- `Estimate Needed -> Client Approval Pending`
- `Estimate Prepared -> Client Approval Pending`
- `Estimate Prepared -> Plan Drafted`
- `Estimate Prepared -> Visit Closing`
- `Client Approval Pending -> Approved`
- `Client Approval Pending -> Partially Approved`
- `Client Approval Pending -> Declined`
- `Client Approval Pending -> Plan Drafted`
- `Client Approval Pending -> Visit Closing`
- `Approved -> Diagnostics Pending`
- `Approved -> Treatment Pending`
- `Approved -> Medication Pending`
- `Approved -> Client Communication Pending`
- `Partially Approved -> Plan Drafted`
- `Partially Approved -> Diagnostics Pending`
- `Partially Approved -> Treatment Pending`
- `Partially Approved -> Medication Pending`
- `Partially Approved -> Client Communication Pending`
- `Partially Approved -> Visit Closing`
- `Declined -> Plan Drafted`
- `Declined -> Client Communication Pending`
- `Declined -> Follow-Up Pending`
- `Declined -> Visit Closing`

### Diagnostics

- `Diagnostics Pending -> Diagnostics In Progress`
- `Diagnostics Pending -> Client Approval Pending`
- `Diagnostics Pending -> Plan Drafted`
- `Diagnostics Pending -> Visit Closing`
- `Diagnostics In Progress -> Results Pending`
- `Diagnostics In Progress -> Treatment Pending`
- `Diagnostics In Progress -> Visit Closing With Exceptions`
- `Results Pending -> Results Ready`
- `Results Pending -> Visit Closing With Exceptions`
- `Results Ready -> Veterinarian Review Pending`
- `Results Ready -> Plan Drafted`
- `Results Ready -> Treatment Pending`
- `Results Ready -> Client Communication Pending`
- `Veterinarian Review Pending -> Plan Drafted`
- `Veterinarian Review Pending -> Treatment Pending`
- `Veterinarian Review Pending -> Client Communication Pending`
- `Veterinarian Review Pending -> Visit Closing With Exceptions`

### Treatment, Medication, Communication, And Follow-Up

- `Treatment Pending -> Treatment In Progress`
- `Treatment Pending -> Client Approval Pending`
- `Treatment Pending -> Visit Closing`
- `Treatment Pending -> Visit Closing With Exceptions`
- `Treatment In Progress -> Treatment Complete`
- `Treatment In Progress -> Plan Drafted`
- `Treatment In Progress -> Visit Closing With Exceptions`
- `Treatment Complete -> Medication Pending`
- `Treatment Complete -> Client Communication Pending`
- `Treatment Complete -> Follow-Up Pending`
- `Treatment Complete -> Checkout Ready`
- `Medication Pending -> Client Communication Pending`
- `Medication Pending -> Follow-Up Pending`
- `Medication Pending -> Checkout Ready`
- `Medication Pending -> Visit Closing With Exceptions`
- `Client Communication Pending -> Client Approval Pending`
- `Client Communication Pending -> Follow-Up Pending`
- `Client Communication Pending -> Checkout Ready`
- `Client Communication Pending -> Visit Closing With Exceptions`
- `Follow-Up Pending -> Checkout Ready`
- `Follow-Up Pending -> Visit Closing`
- `Follow-Up Pending -> Visit Closing With Exceptions`

### Checkout, Record Completion, And Archive

- `Checkout Ready -> Checkout In Progress`
- `Checkout Ready -> Visit Closing With Exceptions`
- `Checkout In Progress -> Payment Pending`
- `Checkout In Progress -> Payment Complete`
- `Checkout In Progress -> Follow-Up Pending`
- `Checkout In Progress -> Visit Closing With Exceptions`
- `Payment Pending -> Payment Complete`
- `Payment Pending -> Visit Closing With Exceptions`
- `Payment Complete -> Record Completion Pending`
- `Payment Complete -> Visit Closing`
- `Record Completion Pending -> Record Complete`
- `Record Completion Pending -> Visit Closing With Exceptions`
- `Record Complete -> Visit Closing`
- `Record Complete -> Archived`
- `Visit Closing -> Record Completion Pending`
- `Visit Closing -> Follow-Up Pending`
- `Visit Closing -> Archived`
- `Visit Closing -> Visit Closing With Exceptions`
- `Visit Closing With Exceptions -> Record Completion Pending`
- `Visit Closing With Exceptions -> Follow-Up Pending`
- `Visit Closing With Exceptions -> Archived With Exceptions`

### Terminal States

The following states do not normally transition further in MVP:

- `Archived`
- `Archived With Exceptions`
- `Cancelled`
- `Cancelled After Arrival`
- `No-Show`
- `Rescheduled`
- `Referred`
- `Deferred`

If a terminal state is entered incorrectly, correction must happen through an audited amendment, not silent state editing.

## State Transition Rules

- Every state transition must create a Business Event.
- Every state transition must record actor, timestamp, source, previous state, new state, and reason where available.
- A Visit can have only one current Visit State.
- State transitions should happen because work changed, not because a user navigated to a different surface.
- The Visit Lifecycle owns Visit State; related modules own their own objects.
- Related module completion may trigger a Visit transition only through an explicit action or trusted system rule.
- A user may only transition a Visit when their role has permission for the target action.
- AI may suggest a transition but cannot apply one silently.
- External Integrations may request or trigger transitions only where the integration is trusted for that source of truth.
- Terminal states require audit-sensitive handling.
- A Visit should not archive while required Work Items, Exceptions, payment blockers, follow-up obligations, or record signoff requirements remain unresolved unless it archives with exceptions.
- Backward transitions are allowed only when they reflect real workflow, not convenience editing.
- Corrections after archival require amendment rules.

## Entry Conditions

### Visit Creation

A Visit may be created when at least one of the following exists:

- Scheduled Appointment.
- Walk-in arrival.
- Emergency arrival.
- Drop-off request.
- Telemedicine request.
- Technician appointment.
- Surgery admission.
- Hospitalized patient continuation.
- Follow-up need that requires a new episode of care.

Minimum required data:

- Patient or provisional patient.
- Client or provisional client where applicable.
- Location.
- Visit type.
- Visit reason.
- Entry source.
- Created by user, system, External Integration, or migration source.

### Scheduled Entry

Required:

- Appointment time.
- Visit reason.
- Patient/client identity or provisional identity.
- Location.
- Visit type.

### Walk-In Entry

Required:

- Arrival time.
- Patient/client identity or provisional identity.
- Presenting concern.
- Triage need.

### Emergency Entry

Required:

- Arrival time.
- Provisional patient/client identity if full identity is unavailable.
- Urgency.
- Responsible clinical owner as soon as possible.
- Stabilization Work Items or Treatment Work Items where relevant.

Emergency visits may skip normal scheduling and check-in states.

### Telemedicine Entry

Required:

- Virtual arrival or scheduled time.
- Client identity.
- Patient identity.
- Communication channel.
- Telemedicine consent or exception.
- Visit reason.

### Surgery, Drop-Off, Hospitalized, And Technician Entry

Required:

- Visit type.
- Expected path.
- Current owner or responsible role.
- Pre-visit requirements where relevant.
- Client communication expectation.

## Exit Conditions

### Clean Archive

A Visit may move to `Archived` when:

- Required clinical documentation is complete or not required.
- Record signoff is complete when required.
- Required Communication has been sent or logged.
- Required Follow-Up has been created or explicitly marked unnecessary.
- Required payment or invoice state is complete enough for policy.
- No unresolved Exceptions remain.
- Open Work Items are complete, cancelled, or moved to appropriate post-visit ownership.

### Archive With Exceptions

A Visit may move to `Archived With Exceptions` when:

- The visit must close operationally.
- One or more unresolved Exceptions remain.
- Each Exception has owner, reason, next action, and due date where relevant.
- The client, patient, financial, clinical, or record risk is visible.

Examples:

- Pending lab result after patient leaves.
- Open balance.
- Missing veterinarian signoff.
- Deferred treatment.
- Client could not be reached.
- Attachment or migrated record uncertainty affects current context.

### Non-Care Exit

A Visit may move to `Cancelled`, `Cancelled After Arrival`, `No-Show`, `Rescheduled`, `Referred`, or `Deferred` when the clinic intentionally stops or redirects the visit before normal completion.

## User Actions Available In Each State

Actions are role-aware and may be hidden or disabled when the user lacks permission.

| State Group                 | Available Actions                                                                                                                                                                         |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Intent and scheduling       | Create Visit, schedule, confirm, mark pre-visit pending, cancel, reschedule, defer, refer, mark no-show.                                                                                  |
| Arrival and check-in        | Mark arrived, start check-in, confirm identity, update arrival mode, route to triage, route to intake, create arrival Exception.                                                          |
| Triage and waiting          | Record triage summary, set urgency, assign owner, move to waiting, move to intake, move to veterinarian-ready, refer, create Work Item.                                                   |
| Intake                      | Start intake, add intake summary, record vitals where applicable, create handoff, create Work Item, move to veterinarian-ready, route to diagnostics/treatment where allowed.             |
| Veterinarian exam           | Start exam, draft plan, order diagnostics where module exists, request estimate, route to treatment, route to closing, create clinical Work Item.                                         |
| Plan and estimate           | Mark estimate needed, mark estimate prepared, request approval, revise plan, move approved/partial/declined based on durable evidence.                                                    |
| Approval                    | Record approval outcome through Consent, Estimate, Communication, or Event; move to diagnostics, treatment, medication, communication, follow-up, or closing.                             |
| Diagnostics                 | Mark diagnostics pending/in progress/results pending/results ready, request veterinarian review, create client communication Work Item, close with exception when results remain pending. |
| Treatment and medication    | Start treatment, complete treatment, create medication Work Item, mark medication pending, route to communication, follow-up, checkout, or exception.                                     |
| Communication and follow-up | Create or log Communication, create Follow-Up, create Reminder, request approval, route to checkout, route to closing.                                                                    |
| Checkout and payment        | Mark checkout ready, start checkout, mark payment pending/complete where billing module allows, create payment Exception, route to record completion.                                     |
| Record and archive          | Mark record completion pending, mark record complete, archive, archive with exceptions, create post-visit Work Items.                                                                     |
| Terminal states             | View, audit, amend through permitted correction path, create follow-up where allowed.                                                                                                     |

## Required Data Captured In Each State

### Intent Created

- Patient or provisional patient.
- Client or provisional client where applicable.
- Visit reason.
- Visit type.
- Entry source.
- Location.

### Scheduled, Pre-Visit Pending, Confirmed

- Appointment time or expected visit window.
- Visit type.
- Reason for visit.
- Resource or veterinarian assignment where applicable.
- Pre-visit requirements and blockers.
- Confirmation status.

### Arrived, Check-In In Progress, Arrived With Exceptions

- Arrival time.
- Arrival mode.
- Identity confirmation status.
- Client authority or consent warning where relevant.
- Check-in owner.
- Arrival Exceptions.

### Triaged, Waiting, Ready For Intake

- Urgency where applicable.
- Routing decision.
- Current owner or responsible role.
- Waiting reason where applicable.
- Next action.

### Intake In Progress

- Presenting concern.
- Relevant history.
- Vitals where applicable.
- Current medications where applicable.
- Allergies or alerts where applicable.
- Client concerns.
- Technician summary.

### Veterinarian Exam Ready, Veterinarian Exam In Progress

- Veterinarian owner.
- Exam start where relevant.
- Clinical context needed for plan.
- Draft findings or exam summary where available.

### Plan Drafted

- Clinical Decision or plan summary.
- Recommended diagnostics, treatments, medications, communication, or follow-up.
- Veterinarian attribution.
- Whether estimate or approval is required.

### Estimate Needed, Estimate Prepared, Client Approval Pending

- Estimate status.
- Related Clinical Decision.
- Approval request status.
- Consent requirement.
- Client communication reference.

### Approved, Partially Approved, Declined

- Approval outcome.
- Approved, declined, or deferred items.
- Related Consent, Estimate, Communication, or Event.
- Actor who recorded the outcome.
- Any change to plan.

### Diagnostics Pending, Diagnostics In Progress, Results Pending, Results Ready

- Diagnostic Order or expected diagnostic work.
- Result status.
- External Integration source where relevant.
- Diagnostic Result reference where available.
- Veterinarian review requirement.

### Veterinarian Review Pending

- Item requiring review.
- Responsible veterinarian.
- Review reason.
- Related Diagnostic Result, record note, Communication, or Work Item.

### Treatment Pending, Treatment In Progress, Treatment Complete

- Treatment or Procedure reference where available.
- Owner.
- Status.
- Completion time where relevant.
- Exceptions or deviations.

### Medication Pending

- Medication Order or Prescription reference where available.
- Preparation, administration, dispensing, or review need.
- Inventory or pharmacy dependency where relevant.
- Owner.

### Client Communication Pending

- Communication reason.
- Client contact method.
- Owner.
- Related approval, result, discharge, or follow-up context.

### Follow-Up Pending

- Follow-Up or Reminder type.
- Owner.
- Due date or timing.
- Related Visit, Diagnostic Result, Treatment, Prescription, or Communication.

### Checkout Ready, Checkout In Progress, Payment Pending, Payment Complete

- Invoice status.
- Payment status.
- Payment exception where relevant.
- Discharge readiness.
- Follow-up readiness.
- Checkout owner.

### Record Completion Pending, Record Complete

- Required record sections complete or explicitly incomplete.
- Signoff requirement.
- Veterinarian signoff where required.
- Open record Exceptions.

### Visit Closing, Visit Closing With Exceptions

- Closing reason.
- Remaining blockers.
- Exception owners.
- Next actions.
- Archive readiness.

### Archived, Archived With Exceptions

- Archive timestamp.
- Archive actor or source.
- Record completion status.
- Remaining Exceptions for Archived With Exceptions.
- Medical Record link.

## Required API Capabilities

These are module-level capabilities, not endpoint designs.

### Read Capabilities

- Fetch Visit by Visit ID.
- Fetch current Visit State.
- Fetch valid next transitions for current user and current Visit.
- Fetch Visit summary by Patient, Appointment, or Visit Intent.
- Fetch active Visits for a patient.
- Fetch Visit timeline Events.
- Fetch Work Items and Exceptions tied to Visit.
- Fetch Visit-related Communication, Estimate, Consent, Invoice, Payment, Diagnostic Result, Prescription, Attachment, Follow-Up, and Medical Record summary references.
- Fetch migration source labels and confidence for imported visit-related history.
- Fetch role-aware available actions.

### Write Capabilities

- Create Visit from Appointment, Visit Intent, walk-in, emergency, drop-off, telemedicine request, surgery admission, or hospitalization continuation.
- Update Visit State through valid transition.
- Record Business Event for each transition.
- Create or update Visit owner, responsible role, next action, blocker, or Exception.
- Link related objects to Visit where permitted.
- Create Work Item from Visit context.
- Create Follow-Up from Visit context.
- Mark Visit ready for archive.
- Archive Visit.
- Archive Visit With Exceptions.
- Amend incorrect state or terminal status through audited correction.

### Access Capabilities

- Enforce Organization and Location isolation.
- Enforce role capabilities by transition.
- Enforce clinical authority for veterinarian-owned actions.
- Enforce financial authority for payment and adjustment actions.
- Enforce audit-sensitive access for terminal states, amendments, and exceptions.
- Scope AI context to the current user's permissions.

## Required Database Concepts

This module likely requires persistence or read models for:

- Visit.
- Visit State as property of Visit.
- Visit Intent.
- Appointment reference.
- Patient.
- Client.
- Location.
- User.
- Role.
- Work Item.
- Exception.
- Event.
- Audit Event.
- Communication reference.
- Clinical Decision reference.
- Estimate reference.
- Consent reference.
- Diagnostic Order reference.
- Diagnostic Result reference.
- Treatment or Procedure reference.
- Medication Order reference.
- Prescription reference.
- Invoice reference.
- Payment reference.
- Follow-Up.
- Reminder.
- Attachment reference.
- Medical Record summary / archived Visit link.
- Migration Record/source label.
- External Integration source.

Recommendation: do not create separate objects for every Visit State. Visit State is a property of Visit. Durable information belongs in related Core Objects.

## Business Rules

- A Visit belongs to one Patient.
- A Visit belongs to one Location.
- A Visit should reference a Client where client involvement exists.
- A Visit may originate from an Appointment, Visit Intent, External Integration, or migration source.
- A Visit may have one current Visit State.
- A Visit may have many Events.
- A Visit may have many Work Items and Exceptions.
- A Visit may have many Communications, Attachments, Diagnostic Results, Estimates, Consents, Invoices, Payments, and Follow-Ups.
- A Visit State should never be used to store durable clinical, financial, consent, or communication evidence.
- Approval states require supporting Consent, Estimate, Communication, Clinical Decision, Event, or Audit Event evidence.
- Record completion and record signoff are not the same thing.
- A clean archive requires no unresolved Exceptions.
- Archived With Exceptions requires visible owner, reason, next action, and due date where relevant.
- Migrated historical visits should not become active Visits unless explicitly verified.
- A Visit may be corrected, but correction must preserve original Events and Audit Events.

## Permission Rules

### Receptionist

- Can create scheduled, walk-in, arrival, check-in, communication, checkout, payment-routing, cancellation, no-show, reschedule, deferred, and referred states where policy allows.
- Can view clinical context needed for routing and communication.
- Cannot create or approve Clinical Decisions.
- Cannot sign clinical records.

### Technician

- Can move visits through intake, waiting, ready-for-veterinarian, delegated treatment, medication support, communication support, and follow-up states where allowed.
- Can create Work Items and handoff notes.
- Cannot finalize veterinarian-owned clinical decisions.
- Cannot sign clinical records unless policy explicitly delegates limited record completion.

### Veterinarian

- Can move visits through exam, plan, diagnostic review, treatment decision, prescription, clinical communication, record completion, and signoff states.
- Owns clinical decision transitions.
- Can approve clinical record readiness for archive where required.

### Practice Manager

- Can resolve operational, workflow, financial, and ownership Exceptions.
- Can manage blocked closing paths.
- Can review audit-sensitive transition history.
- Cannot override veterinarian-owned clinical decisions without appropriate clinical authority.

### AI Assistant

- Can suggest next state, missing data, likely owner, or unresolved blockers.
- Can draft summaries or communication.
- Cannot transition Visit State without permitted human or trusted system action.
- Cannot mark approval, payment, clinical decision, record completion, or archive complete.

### External Integration

- Can create or update Visit-related context only for trusted integration domains.
- Must preserve source attribution.
- Must not silently overwrite human-owned states or decisions.

## Audit Requirements

Audit Events are required when Visit Lifecycle actions affect:

- Visit creation.
- Visit State transitions.
- Arrival, triage, and urgent routing.
- Patient/client identity changes.
- Client authority or consent.
- Clinical Decision, plan, diagnostic review, treatment decision, or prescription context.
- Estimate approval, partial approval, or decline.
- Payment status or financial exception.
- Record completion, signoff, archive, or archive with exceptions.
- Terminal state correction or amendment.
- Migration source mapping or confidence correction.
- AI-generated content accepted into sensitive records.
- External Integration actions that alter visit-relevant state.

Simple viewing of Visit State should not be audited by default unless required for sensitive support access, cross-location policy, or compliance.

## Migration Implications

Migration must support Visit continuity without forcing legacy data into the active lifecycle incorrectly.

MVP must support:

- Source labels for migrated appointments, historical visits, medical records, invoices, attachments, diagnostic results, and communications.
- Confidence labels where migrated data is uncertain.
- Mapping future legacy appointments to Visit Intent or Scheduled Visit candidates.
- Mapping completed legacy appointments to historical Medical Record context, not active Visit State, unless verified.
- Preserving legacy status such as cancelled, no-show, completed, checked out, or invoiced where available.
- Flagging duplicate or conflicting migrated visit history.
- Preventing uncertain migrated history from triggering active Work Items without human verification.

Do not block MVP on full migration review tooling. But Visit Lifecycle must not hide source uncertainty.

## AI Opportunities

AI is optional/future unless explicitly marked required.

### Optional / Future

- Suggest likely next Visit State based on completed work.
- Detect stale Visits with no owner or next action.
- Summarize what happened during a Visit.
- Identify missing intake, approval, payment, follow-up, or record completion data.
- Draft client updates when Visit State changes.
- Summarize pending Exceptions before archive.
- Explain migrated visit uncertainty.
- Suggest Work Item owner or escalation.

### Required For MVP

None.

MVP should work without AI.

## UX Principles

These are behavioral review criteria for implementation.

- Never hide current Visit State.
- Never make staff reconstruct visit status from separate modules.
- Always show what happens next.
- Always show who owns the next action when ownership matters.
- Show blockers plainly.
- Preserve patient context when moving through Visit actions.
- Keep state changes fast and reversible through audited correction.
- Do not make users choose from invalid transitions.
- Do not let archival hide unresolved work.
- Do not require AI for core visit flow.
- Treat exceptions as visible work, not invisible failure.

## Success Metrics

MVP should establish baselines first. Targets should be set after internal testing and early clinic observation.

- Average time to answer: "Where is this patient in the visit?"
- Average time to identify the next action and owner.
- Average time between arrival and intake start.
- Average time between intake complete and veterinarian exam start.
- Average time between approval request and approval outcome.
- Average time between checkout ready and checkout start.
- Percentage of active Visits with visible state, owner, and next action.
- Percentage of Visits archived with unresolved Exceptions.
- Number of stale active Visits with no state change after expected time.
- Number of state corrections after archival.
- User confidence that current Visit status is understood.

Metrics should improve workflow. They should not become staff surveillance.

## Performance Budgets

These are product speed targets, not fixed implementation requirements.

- Visit state read: current Visit State and next actions should load fast enough to be trusted during active clinic flow.
- State transition acknowledgement: users should receive immediate feedback after a valid transition.
- Transition validation: invalid transitions should be blocked quickly and explained plainly.
- Visit timeline update: state change Events should appear without requiring a manual refresh.
- Patient Workspace update: current Visit State should refresh quickly after a transition.
- Active visit list refresh: active visit state changes should appear quickly enough for handoff and routing.

Suggested planning targets:

- Current Visit State load: under 500 milliseconds after Visit context is available.
- Valid transition list: under 500 milliseconds.
- State transition acknowledgement: under 300 milliseconds.
- State transition reflected in timeline: under 1 second.
- State transition reflected in Patient Workspace: under 1 second.
- Active visit list reflects transition: under 2 seconds.

## Edge Cases

- Visit created for provisional patient.
- Visit created for provisional client.
- Patient has multiple active Visits.
- Appointment is marked arrived but Patient or Client identity is wrong.
- Client authority is unclear.
- Patient arrives for the wrong appointment type.
- Emergency care begins before complete check-in.
- Walk-in is referred without full visit progression.
- Telemedicine visit has no physical arrival.
- Drop-off visit remains waiting for hours.
- Technician appointment unexpectedly requires veterinarian review.
- Surgery visit has missing pre-op consent.
- Hospitalized patient spans shift changes.
- Diagnostic results arrive after checkout.
- Payment remains open after patient leaves.
- Client declines recommended care.
- Treatment is deferred.
- Record is incomplete after checkout.
- Visit is ready to archive except for pending result.
- External Integration sends delayed or duplicate status.
- Migrated appointment duplicates a native Visit.
- User attempts invalid transition.
- Visit was archived incorrectly.

MVP should handle edge cases by preserving state, showing Exceptions, and requiring audited correction where needed. It should not solve every downstream module inside Visit Lifecycle.

## Acceptance Criteria

Engineering can consider MVP ready when:

- A Visit can be created from the required entry sources.
- A Visit has one current Visit State.
- The MVP state machine is closed.
- Valid transitions are enforced.
- Invalid transitions are blocked and explainable.
- State transitions create Business Events.
- Audit Events are created for sensitive transitions.
- Role permissions are enforced for transitions.
- Visit owner, next action, blockers, Work Items, and Exceptions can be represented.
- Approval states require durable supporting evidence.
- Archived and Archived With Exceptions are clearly separated.
- Terminal state corrections require audited amendment.
- Migrated visit-related data shows source and confidence where relevant.
- AI is not required for core Visit flow.
- Patient Workspace can display current Visit State and next action.
- Performance budget gaps are known before implementation starts.

## Open Questions

- What exact Visit types are enabled in MVP launch clinics?
- Which terminal state corrections require Practice Manager approval?
- Which payment states can Visit Lifecycle record before the billing module exists?
- Which clinical record completion rules are required for the first pilot?
- How should multiple active Visits for one patient be resolved before a merge or conflict tool exists?
- Which external integrations, if any, are trusted to trigger Visit State changes in MVP?

## Engineering Starting Point

Engineering can start:

- Visit creation from Appointment, Visit Intent, and direct arrival.
- Visit State property and transition validation.
- Role-aware transition capability.
- Business Event creation for state transitions.
- Audit Event creation for sensitive transitions.
- Visit summary read capability for Patient Workspace.
- Visit timeline Event read capability.
- Work Item and Exception linkage to Visit.
- Archive and Archive With Exceptions behavior.
- Migration source/confidence display support for visit-related history.

Do not start broad workflow infrastructure beyond what this module requires.

## Related Documents

### References

- [Product Constitution](../../blueprint/00-product-constitution.md)
- [Visit Engine v1](../../blueprint/07-visit-engine-v1.md)
- [Core Domain Model v1](../../blueprint/08-core-domain-model-v1.md)
- [Event Architecture v1](../../blueprint/09-event-architecture-v1.md)
- [Work System v1](../../blueprint/10-work-system-v1.md)
- [Permission And Ownership v1](../../blueprint/11-permission-and-ownership-v1.md)
- [Migration Strategy](../../blueprint/06-migration-strategy.md)
- [Patient Workspace MVP](./01-patient-workspace-mvp.md)

### Depends On

- [Product Constitution](../../blueprint/00-product-constitution.md)
- [Core Domain Model v1](../../blueprint/08-core-domain-model-v1.md)
- [Visit Engine v1](../../blueprint/07-visit-engine-v1.md)
- [Event Architecture v1](../../blueprint/09-event-architecture-v1.md)
- [Permission And Ownership v1](../../blueprint/11-permission-and-ownership-v1.md)

### Referenced By

- TODO: Add implementation tickets, ADRs, API notes, and test plans once engineering planning begins.

### Future Work

- TODO: Split follow-on specs for Scheduling, Medical Record, Estimate/Approval, Diagnostics, Treatment, Communication, Billing, and Record Completion only when implementation needs them.
