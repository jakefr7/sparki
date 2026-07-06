# 07 Visit Engine v1

## Constitutional Authority

This document inherits from the [Product Constitution](./00-product-constitution.md). If it conflicts with the Constitution, the Constitution governs.

## Purpose

Define the authoritative workflow architecture for Sparki's Visit Engine v1.

The Visit Engine is the operating layer that carries a patient from scheduling or walk-in through intake, exam, diagnostics, approval, treatment, checkout, follow-up creation, and record archival.

This is not an implementation plan. It does not prescribe database schema, UI components, queues, services, or API design. It defines the states, actors, transitions, events, data requirements, audit expectations, integrations, AI opportunities, migration mappings, and variations that future specs and engineering decisions must depend on.

## Product Boundary

Visit Engine v1 covers the lifecycle of a single patient visit.

It begins when a visit intent is created:

- Scheduled appointment
- Walk-in arrival
- Emergency arrival
- Drop-off request
- Surgery admission
- Hospitalized patient continuation
- Telemedicine appointment
- Technician-only appointment

It ends when the visit is archived:

- Patient work is complete or intentionally deferred
- Required documentation is complete or explicitly marked incomplete
- Financial state is closed or assigned to an exception path
- Follow-up work is created
- Communication commitments are captured
- Audit-relevant events are preserved

## Core Concepts

### Visit

A visit is a patient-centered episode of care or service with a beginning, active state, outcome, and archival record.

### Visit Intent

The reason a visit should exist. It may come from scheduling, walk-in triage, emergency arrival, surgery plan, follow-up need, refill review, or hospitalization continuation.

### Visit State

The current operational condition of the visit. State should be visible across roles and should reduce the need for verbal status reconstruction.

Visit State is a property of `Visit`, not a separate business object.

### Event

An occurrence that changes state, adds context, records work, or creates a downstream obligation.

### Work Item

A task, order, communication, approval step, medication step, diagnostic step, payment step, or follow-up tied to the visit.

### Medical Record / Archived Visit

The Medical Record is the durable clinical history for the patient. An archived Visit contributes to that record but is not the same thing as the full Medical Record.

## Actors

### Client

Provides history, consent, approvals, payment, and follow-up information.

### Patient

The center of the visit.

### Receptionist

Creates or confirms visit intent, manages arrival, client communication, schedule status, checkout, payments, and routing.

### Technician

Performs intake, prepares the patient, executes orders, documents care, coordinates tasks, and supports handoffs.

### Veterinarian

Owns clinical assessment, medical decision-making, plan approval, prescriptions, diagnostics interpretation, and medical record signoff.

### Practice Manager

Handles operational exceptions, schedule disruption, payment escalation, workflow bottlenecks, and policy-sensitive issues.

### Hospital Owner

Usually not active in individual visits unless escalation, risk, or business-critical exceptions require involvement.

### AI Assistant

Assists by preparing context, summarizing, drafting, classifying, detecting missing data, and reducing repetitive work. It does not own clinical decisions.

### External Integration

Scheduling, phone, messaging, payments, labs, imaging, pharmacy, inventory, online booking, client portal, and migrated legacy data sources.

## Visit State Model

The state model should describe reality without forcing every visit through every state.

### State vs Object Rule

A state describes the current condition of work.

An object represents durable business information.

Not every state should become an object.

In Visit Engine v1, Visit State is a property of `Visit`. Work that needs ownership should become a `Work Item`. Abnormal or blocked work should become an `Exception`.

### 1. Intent Created

A visit may be needed.

#### Entry Sources

- Appointment scheduled
- Walk-in request
- Emergency arrival
- Follow-up need
- Surgery plan
- Hospitalization continuation
- Telemedicine request
- Drop-off request

#### Required Data

- Patient identity or provisional patient
- Client identity or provisional client
- Visit reason
- Requested timing
- Visit type
- Source of intent

#### Exit Transitions

- To `Scheduled`
- To `Arrived`
- To `Triaged`
- To `Cancelled`
- To `Referred`
- To `Deferred`

### 2. Scheduled

The visit has a planned date, time, and expected service path.

#### Required Data

- Appointment time
- Visit type
- Veterinarian or resource assignment where applicable
- Reason for visit
- Client contact method
- Pre-visit requirements

#### Exit Transitions

- To `Pre-Visit Pending`
- To `Confirmed`
- To `Arrived`
- To `Cancelled`
- To `No-Show`
- To `Rescheduled`

### 3. Pre-Visit Pending

The visit is scheduled but missing required preparation.

#### Examples

- Forms incomplete
- Deposit needed
- Records requested
- Surgery instructions pending
- Telemedicine consent pending
- Vaccination or medication history missing

#### Exit Transitions

- To `Confirmed`
- To `Arrived With Exceptions`
- To `Rescheduled`
- To `Cancelled`

### 4. Confirmed

The clinic expects the visit to happen and has enough information to prepare.

#### Exit Transitions

- To `Arrived`
- To `Cancelled`
- To `No-Show`
- To `Rescheduled`

### 5. Arrived

The patient or client has arrived physically or virtually.

#### Required Data

- Arrival time
- Arrival mode
- Patient/client confirmation
- Visit reason confirmation
- Initial status

#### Exit Transitions

- To `Check-In In Progress`
- To `Triaged`
- To `Waiting`
- To `Cancelled After Arrival`

### 6. Check-In In Progress

Front desk or intake staff are confirming readiness.

#### Exit Transitions

- To `Ready For Intake`
- To `Arrived With Exceptions`
- To `Triaged`
- To `Waiting`

### 7. Arrived With Exceptions

The patient is present, but a blocker or warning exists.

#### Examples

- Missing consent
- Unknown patient identity
- Balance issue
- Incomplete forms
- Aggressive or special-handling patient
- Late arrival
- Incorrect appointment type

#### Exit Transitions

- To `Ready For Intake`
- To `Visit Closing With Exceptions`
- To `Rescheduled`
- To `Referred`
- To `Cancelled After Arrival`

### 8. Triaged

The clinic has assessed urgency or routing priority.

#### Exit Transitions

- To `Waiting`
- To `Ready For Intake`
- To `Emergency Stabilization`
- To `Referred`
- To `Hospitalized`

### 8A. Emergency Stabilization

The patient is receiving immediate stabilization before the normal visit path can continue.

#### Required Data

- Provisional or confirmed patient identity
- Triage status
- Stabilization actions
- Responsible veterinarian or clinical owner
- Client communication and consent status where possible

#### Exit Transitions

- To `Veterinarian Exam In Progress`
- To `Diagnostics Pending`
- To `Treatment Pending`
- To `Client Approval Pending`
- To `Hospitalized`
- To `Visit Closing With Exceptions`

### 8B. Hospitalized

The patient is admitted or held for ongoing care across a longer time window.

#### Required Data

- Hospitalization reason
- Clinical owner
- Monitoring needs
- Treatment and medication needs
- Client update commitments
- Estimate and approval status

#### Exit Transitions

- To `Treatment Pending`
- To `Medication Pending`
- To `Results Pending`
- To `Client Communication Pending`
- To `Checkout Ready`
- To `Visit Closing With Exceptions`

### 9. Waiting

The visit is active but not currently being worked.

#### Exit Transitions

- To `Ready For Intake`
- To `Intake In Progress`
- To `Veterinarian Exam Ready`
- To `Emergency Stabilization`
- To `Cancelled After Arrival`

### 10. Ready For Intake

The patient is ready for technician intake.

#### Exit Transitions

- To `Intake In Progress`
- To `Waiting`
- To `Veterinarian Exam Ready`
- To `Emergency Stabilization`

### 11. Intake In Progress

Technician or clinical staff are collecting history, vitals, concerns, and initial context.

#### Required Data

- Presenting complaint or visit reason
- Relevant history
- Vitals where applicable
- Current medications where applicable
- Client concerns
- Technician notes

#### Exit Transitions

- To `Veterinarian Exam Ready`
- To `Waiting`
- To `Diagnostics Pending`
- To `Treatment Pending`

### 12. Veterinarian Exam Ready

The veterinarian has enough context to begin the exam.

#### Exit Transitions

- To `Veterinarian Exam In Progress`
- To `Waiting`
- To `Emergency Stabilization`

### 13. Veterinarian Exam In Progress

The veterinarian is assessing the patient and forming a plan.

#### Exit Transitions

- To `Plan Drafted`
- To `Diagnostics Pending`
- To `Estimate Needed`
- To `Treatment Pending`
- To `Plan Drafted`
- To `Estimate Needed`
- To `Visit Closing`

### 14. Plan Drafted

A care plan exists but may require estimate, approval, diagnostics, treatment, or client discussion.

#### Exit Transitions

- To `Estimate Needed`
- To `Client Approval Pending`
- To `Diagnostics Pending`
- To `Treatment Pending`
- To `Medication Pending`
- To `Visit Closing`

### 15. Estimate Needed

The plan requires financial translation before approval or execution.

#### Exit Transitions

- To `Estimate Prepared`
- To `Plan Drafted`
- To `Client Approval Pending`

### 16. Estimate Prepared

The estimate is ready for client review.

#### Exit Transitions

- To `Client Approval Pending`
- To `Plan Drafted`
- To `Visit Closing`

### 17. Client Approval Pending

The clinic is waiting for the client to approve, decline, or partially approve care.

#### Exit Transitions

- To `Approved`
- To `Partially Approved`
- To `Declined`
- To `Plan Drafted`
- To `Visit Closing`

### 18. Approved

The client has approved the relevant work.

#### Exit Transitions

- To `Diagnostics Pending`
- To `Treatment Pending`
- To `Medication Pending`
- To `Hospitalized`

### 19. Partially Approved

Some plan items are approved and others are declined or deferred.

#### Exit Transitions

- To `Plan Drafted`
- To `Treatment Pending`
- To `Diagnostics Pending`
- To `Medication Pending`
- To `Visit Closing`

### 20. Declined

The client has declined recommended care.

#### Exit Transitions

- To `Plan Drafted`
- To `Visit Closing`
- To `Follow-Up Pending`

### 21. Diagnostics Pending

Diagnostics have been ordered, requested, or recommended.

#### Exit Transitions

- To `Diagnostics In Progress`
- To `Client Approval Pending`
- To `Plan Drafted`
- To `Visit Closing`

### 22. Diagnostics In Progress

Samples, imaging, or tests are being performed.

#### Exit Transitions

- To `Results Pending`
- To `Visit Closing With Exceptions`
- To `Treatment Pending`

### 23. Results Pending

The clinic is waiting on results.

#### Exit Transitions

- To `Results Ready`
- To `Visit Closing With Exceptions`
- To `Visit Closing With Exceptions`

### 24. Results Ready

Results are available and require review or action.

#### Exit Transitions

- To `Veterinarian Review Pending`
- To `Plan Drafted`
- To `Treatment Pending`
- To `Client Communication Pending`

### 24A. Veterinarian Review Pending

Results, notes, or visit context are ready for veterinarian review before the plan can move forward.

#### Exit Transitions

- To `Plan Drafted`
- To `Treatment Pending`
- To `Client Communication Pending`
- To `Visit Closing With Exceptions`

### 25. Treatment Pending

Approved treatment work exists but has not been completed.

#### Exit Transitions

- To `Treatment In Progress`
- To `Client Approval Pending`
- To `Visit Closing With Exceptions`
- To `Visit Closing`

### 26. Treatment In Progress

Treatment work is actively being performed.

#### Exit Transitions

- To `Treatment Complete`
- To `Visit Closing With Exceptions`
- To `Plan Drafted`
- To `Hospitalized`

### 27. Treatment Complete

Treatment work is complete for this visit stage.

#### Exit Transitions

- To `Medication Pending`
- To `Client Communication Pending`
- To `Checkout Ready`
- To `Follow-Up Pending`
- To `Hospitalized`

### 28. Medication Pending

Medication must be prescribed, administered, filled, reviewed, or communicated.

#### Exit Transitions

- To `Checkout Ready`
- To `Visit Closing With Exceptions`
- To `Client Communication Pending`
- To `Checkout Ready`

### 29. Client Communication Pending

The client needs an update, explanation, instruction, approval request, or result communication.

#### Exit Transitions

- To `Checkout Ready`
- To `Client Approval Pending`
- To `Follow-Up Pending`

### 30. Follow-Up Pending

Future care, callback, reminder, recheck, lab review, or client communication must be created or assigned.

#### Exit Transitions

- To `Visit Closing`
- To `Visit Closing With Exceptions`

### 31. Checkout Ready

The visit is ready for front desk completion.

#### Required Data

- Invoice or expected charge state
- Discharge instructions where applicable
- Medication readiness
- Follow-up requirements
- Payment expectation
- Open exceptions

#### Exit Transitions

- To `Checkout In Progress`
- To `Visit Closing With Exceptions`

### 32. Checkout In Progress

Client-facing completion is happening.

#### Exit Transitions

- To `Payment Pending`
- To `Payment Complete`
- To `Follow-Up Pending`
- To `Visit Closing With Exceptions`

### 33. Payment Pending

Payment, financing, deposit, adjustment, or balance resolution remains.

#### Exit Transitions

- To `Payment Complete`
- To `Visit Closing With Exceptions`
- To `Visit Closing With Exceptions`
- To `Visit Closing With Exceptions`

### 34. Payment Complete

The financial portion of the visit is complete.

#### Exit Transitions

- To `Record Completion Pending`
- To `Visit Closing`

### 35. Record Completion Pending

Clinical, operational, communication, or financial records need completion, review, or signoff.

#### Exit Transitions

- To `Record Complete`
- To `Visit Closing With Exceptions`

### 36. Record Complete

The visit record is complete enough to archive.

#### Exit Transitions

- To `Archived`

### 37. Visit Closing

The system is resolving remaining visit obligations.

#### Exit Transitions

- To `Record Completion Pending`
- To `Archived`
- To `Visit Closing With Exceptions`

### 38. Visit Closing With Exceptions

The visit can no longer be treated as normally complete.

#### Examples

- Incomplete veterinarian note
- Pending lab result
- Open balance
- Missing consent
- Unfinished communication
- Deferred treatment
- Client left before checkout

#### Exit Transitions

- To `Record Completion Pending`
- To `Follow-Up Pending`
- To `Archived With Exceptions`

### 39. Archived

The visit is closed and preserved as part of the patient record.

### 40. Archived With Exceptions

The visit is closed with explicit unresolved items, owners, and future actions.

## Supporting Visit States

These states close or redirect the visit without continuing the normal care path.

### Cancelled

The planned visit will not happen.

### Cancelled After Arrival

The patient or client arrived, but the visit did not continue.

### No-Show

The patient or client did not arrive for a scheduled appointment.

### Rescheduled

The visit intent or appointment moved to a different time.

### Referred

The clinic directed the patient or client to an external provider, facility, or care path.

### Deferred

The visit intent remains known but is intentionally delayed.

## Approval Mapping

Approval is not a separate Core Object.

Approval state is derived from the relationship between:

- `Clinical Decision`: what the veterinarian recommends.
- `Estimate`: what the recommended work is expected to cost.
- `Consent`: what the client has authorized, declined, or acknowledged.
- `Visit State`: where the visit is waiting or moving because of that authorization.

`Approved`, `Partially Approved`, and `Declined` are Visit States. They describe the current operating condition of the visit. The durable business information lives in the related Estimate, Consent, Clinical Decision, Communication, Event, and Audit Event.

## Archive Semantics

### Record Completion

Record Completion means the required clinical, operational, communication, and financial information for the visit has been captured or explicitly marked as incomplete.

### Record Signoff

Record Signoff is the veterinarian-owned approval of clinical documentation when signoff is required.

### Medical Record

The Medical Record is the durable patient history across visits.

### Archived

Archived means the visit is closed and contributes to the Medical Record without known unresolved blockers.

### Archived With Exceptions

Archived With Exceptions means the visit is closed, but unresolved work remains visible with an owner, reason, and next action. It is not a clean close.

## Primary Transitions

Transitions should be caused by meaningful events, not arbitrary navigation.

### Scheduling Transitions

- `Intent Created -> Scheduled`
- `Scheduled -> Confirmed`
- `Scheduled -> Rescheduled`
- `Scheduled -> Cancelled`
- `Scheduled -> No-Show`

### Arrival Transitions

- `Scheduled -> Arrived`
- `Intent Created -> Arrived`
- `Arrived -> Check-In In Progress`
- `Arrived -> Triaged`
- `Arrived -> Arrived With Exceptions`

### Clinical Transitions

- `Ready For Intake -> Intake In Progress`
- `Intake In Progress -> Veterinarian Exam Ready`
- `Veterinarian Exam Ready -> Veterinarian Exam In Progress`
- `Veterinarian Exam In Progress -> Plan Drafted`
- `Plan Drafted -> Estimate Needed`
- `Plan Drafted -> Diagnostics Pending`
- `Plan Drafted -> Treatment Pending`

### Approval Transitions

- `Estimate Prepared -> Client Approval Pending`
- `Client Approval Pending -> Approved`
- `Client Approval Pending -> Partially Approved`
- `Client Approval Pending -> Declined`
- `Partially Approved -> Plan Drafted`
- `Declined -> Visit Closing`

### Diagnostic Transitions

- `Diagnostics Pending -> Diagnostics In Progress`
- `Diagnostics In Progress -> Results Pending`
- `Results Pending -> Results Ready`
- `Results Ready -> Veterinarian Review Pending`
- `Results Ready -> Plan Drafted`

### Treatment Transitions

- `Treatment Pending -> Treatment In Progress`
- `Treatment In Progress -> Treatment Complete`
- `Treatment Complete -> Medication Pending`
- `Treatment Complete -> Checkout Ready`

### Checkout Transitions

- `Checkout Ready -> Checkout In Progress`
- `Checkout In Progress -> Payment Pending`
- `Payment Pending -> Payment Complete`
- `Payment Complete -> Record Completion Pending`
- `Record Completion Pending -> Record Complete`
- `Record Complete -> Archived`

## Event Model

Events are the Visit Engine's memory.

### Event Categories

- Scheduling events
- Arrival events
- Identity events
- Triage events
- Intake events
- Exam events
- Plan events
- Estimate events
- Approval events
- Diagnostic events
- Diagnostic result events
- Treatment events
- Medication events
- Communication events
- Payment events
- Follow-up events
- Record completion events
- Exception events
- Archive events

### Required Event Attributes

- Event type
- Visit ID or provisional visit reference
- Patient reference
- Client reference where applicable
- Actor
- Timestamp
- Source system or source surface
- Previous state where applicable
- New state where applicable
- Related work item where applicable
- Audit sensitivity
- Human-readable summary

### Event Principles

- Events should explain why state changed.
- Events should preserve source traceability.
- Events should distinguish human action, system action, AI suggestion, and external integration event.
- Events should be readable enough for support and operations to understand.

## Required Data By Visit Phase

### Intent And Scheduling

- Patient identity or provisional patient
- Client identity or provisional client
- Reason for visit
- Visit type
- Appointment time or arrival mode
- Preferred veterinarian or resource where applicable
- Communication preferences
- Source of visit intent

### Arrival And Intake

- Arrival timestamp
- Patient/client confirmation
- Presenting concern
- Vitals where applicable
- Current medications where applicable
- Allergies or alerts where applicable
- Client concerns
- Technician intake notes
- Special handling instructions

### Exam And Plan

- Exam findings
- Assessment
- Plan
- Recommended diagnostics
- Recommended treatments
- Medication decisions
- Follow-up instructions
- Veterinarian attribution

### Estimate And Approval

- Estimate items
- Estimate total or range
- Approval status
- Approved, declined, and deferred items
- Consent where required
- Client communication record
- Payment or deposit expectations

### Diagnostics And Lab

- Orders
- Sample or imaging status
- Result status
- Result values or attachments
- Review status
- Client communication status

### Treatment And Medication

- Treatment tasks
- Medication orders
- Administration status
- Dispensing status
- Inventory impact where applicable
- Treatment notes
- Exceptions or changes

### Checkout And Archive

- Invoice status
- Payment status
- Discharge instructions
- Follow-up tasks
- Record completion status
- Signoff status
- Archive status
- Exceptions and owners

## Permissions And Role Boundaries

Permissions should follow responsibility, clinical authority, financial authority, and audit sensitivity.

### Receptionist

- Can create and update visit intent, scheduling, arrival, check-in, communication, checkout, and payment status.
- Can view clinically relevant context needed for routing and client communication.
- Should not make clinical decisions or approve clinical plans.

### Technician

- Can update intake, vitals, tasks, treatment completion, medication preparation, and handoff notes.
- Can prepare draft documentation and client instructions.
- Should not finalize veterinarian-owned medical decisions unless explicitly delegated.

### Veterinarian

- Can create and approve medical assessments, plans, prescriptions, diagnostic interpretations, clinical signoff, and clinical record completion.
- Owns high-risk clinical decisions.

### Practice Manager

- Can resolve operational, financial, schedule, and workflow exceptions.
- Can review audit history and operational bottlenecks.
- Should not override clinical authority.

### AI Assistant

- Can suggest, summarize, draft, classify, and flag.
- Cannot finalize clinical decisions, consent, payment adjustments, or record signoff without human action.

### External Integration

- Can create events through integrations.
- Must preserve source attribution and confidence.
- Should not silently overwrite human-owned decisions.

## Audit Requirements

Auditability matters whenever state affects care, money, communication, accountability, or trust.

### Always Audit

- Visit creation
- Arrival and triage
- Patient/client identity changes
- Clinical plan creation and revision
- Estimate creation and revision
- Approval, partial approval, and decline
- Consent capture
- Diagnostic orders and result review
- Medication prescription, administration, and dispensing
- Treatment completion
- Client communication related to care, approval, or instructions
- Invoice and payment changes
- Record signoff
- Archive and archive-with-exception events
- AI-generated content accepted into the record

### Audit Attributes

- Who acted
- What changed
- When it changed
- Why it changed where available
- Previous value where relevant
- Source of action
- Related patient, client, visit, and work item
- Whether AI suggested or generated any accepted content

## AI Opportunities

AI should make the visit lighter without becoming a second workflow.

### Before The Visit

- Summarize relevant history for the reason for visit.
- Extract reason-for-visit details from client messages.
- Flag missing pre-visit information.
- Prepare likely intake questions.

### During Intake

- Convert client narrative into structured draft intake.
- Identify missing medication, allergy, or symptom context.
- Summarize technician notes for veterinarian review.

### During Exam

- Surface relevant history, trends, and unresolved problems.
- Draft visit notes from structured events and clinician input.
- Prepare plan summaries for review.

### Estimate And Approval

- Draft client-friendly explanations.
- Identify mismatches between plan and estimate.
- Summarize approved, declined, and deferred items.

### Diagnostics And Treatment

- Summarize result trends.
- Flag results without review or communication.
- Draft treatment or discharge notes from completed work.

### Checkout And Follow-Up

- Draft discharge instructions.
- Generate follow-up message drafts.
- Identify incomplete follow-up tasks.
- Summarize archive exceptions.

### AI Guardrails

- AI outputs must remain reviewable.
- AI uncertainty must be visible.
- AI should not make clinical decisions.
- AI should not silently alter the record.
- AI should not create extra review queues without reducing work.

## Integrations

### Scheduling

- Online booking
- Calendar/resource management
- Reminder systems

### Communication

- Phone
- SMS
- Email
- Client portal
- Telemedicine

### Diagnostics And Lab

- Reference labs
- In-house analyzers
- Imaging
- Monitoring equipment

### Pharmacy And Inventory

- In-house pharmacy
- Online pharmacy
- Inventory management
- Vendor ordering

### Payments And Finance

- Payment processor
- Financing
- Accounting
- Invoicing

### Migration

- Legacy appointment data
- Legacy medical records
- Legacy invoices
- Legacy attachments
- Legacy communication
- Legacy lab history
- Legacy inventory

## Migration Mappings

Migrated data should support visit continuity without forcing legacy structures into Sparki's future model.

### Legacy Appointments

Map to visit intent, scheduled state, veterinarian/resource hints, reason for visit, appointment type, status, and historical attendance.

### Legacy Medical Records

Map to patient history, prior visit records, problems, notes, procedures, vaccines, medications, attachments, and clinical chronology.

### Legacy Invoices

Map to financial history, open balances, visit-related charges where identifiable, and historical invoice references.

### Legacy Communications

Map to client/patient communication history where confidence is high; otherwise preserve with uncertainty labels.

### Legacy Labs

Map to lab history, result attachments, structured values where confidence is high, and source reports.

### Legacy Inventory

Map to medication/item availability, historical item references, and active inventory candidates after verification.

### Legacy Attachments

Map to patient, client, visit, or historical record references with source traceability and confidence level.

### Migration Requirements For Visit Engine

- Migrated data must be distinguishable from native Sparki visit events.
- Uncertain relationships must be visible.
- Historical records should support care without polluting active visit state.
- Future appointments must be verified before go-live.
- Recent and active patients should receive higher verification priority.

## Common Variations

### Emergency Visit

Emergency visits may skip scheduling, confirmation, routine check-in, and normal approval timing.

#### State Differences

- `Intent Created -> Arrived -> Triaged -> Emergency Stabilization`
- Documentation may trail action.
- Approval may happen in stages.
- Schedule disruption becomes part of the visit's operational context.

#### Special Requirements

- Rapid provisional identity support
- Critical event timeline
- Stabilization actions
- Consent and estimate exceptions
- Staff alerting
- Schedule impact tracking

### Surgery

Surgery is a coordinated episode that may begin before the day of care.

#### State Differences

- Pre-op requirements may exist before arrival.
- Consent, estimate, diagnostics, and payment may be required before procedure.
- Intra-op and post-op states may need their own work items.

#### Special Requirements

- Surgical checklist
- Anesthesia and monitoring records
- Consent verification
- Medication and discharge plan
- Post-op follow-up

### Technician Appointment

Technician appointments may not require veterinarian exam unless exceptions arise.

#### State Differences

- `Intake In Progress` may transition directly to `Treatment Pending`, `Medication Pending`, or `Checkout Ready`.
- Veterinarian review may be conditional.

#### Special Requirements

- Clear delegation rules
- Standing order support
- Exception escalation
- Completion documentation

### Hospitalized Patient

Hospitalization extends visit logic across time and shifts.

#### State Differences

- The patient may remain in `Hospitalized`, `Treatment Pending`, `Results Pending`, or `Client Communication Pending` across multiple days.
- Closing does not necessarily mean care completion.

#### Special Requirements

- Shift handoffs
- Monitoring schedule
- Medication timing
- Client update commitments
- Estimate review
- Inpatient status summary

### Telemedicine

Telemedicine changes arrival, exam, communication, and documentation expectations.

#### State Differences

- Arrival may be virtual.
- Intake may happen asynchronously.
- Exam constraints must be explicit.
- Payment may precede or follow the visit depending on policy.

#### Special Requirements

- Telemedicine consent
- Client identity confirmation
- Communication channel record
- Jurisdiction and policy constraints
- Follow-up or in-person referral path

### Curbside

Curbside separates client and patient physically.

#### State Differences

- Communication events become more central.
- Intake and discharge may happen through calls or messages.
- Approval timing can create bottlenecks.

#### Special Requirements

- Patient custody handoff
- Client communication timeline
- Approval and estimate clarity
- Pickup/discharge coordination

### Drop-Off

Drop-off visits stretch the visit across a larger time window.

#### State Differences

- Arrival and intake may happen early.
- Veterinarian exam may occur later.
- Client communication is asynchronous.
- Checkout may be separated from treatment completion.

#### Special Requirements

- Drop-off instructions
- Client availability
- Update commitments
- Pickup timing
- Holding status

### Walk-In

Walk-ins begin with uncertainty and capacity evaluation.

#### State Differences

- `Intent Created -> Arrived -> Triaged`
- Acceptance, referral, or scheduling may be the outcome.

#### Special Requirements

- Capacity awareness
- Triage documentation
- Client expectation setting
- Schedule impact

## Exception Model

Exceptions should be explicit states, not hidden notes.

### Common Exceptions

- Unknown patient identity
- Duplicate client or patient
- Missing consent
- Missing approval
- Payment dispute
- Veterinarian unavailable
- Lab delayed
- Treatment declined
- Patient deteriorated
- Client left before checkout
- Incomplete documentation
- Missing attachment or migrated history
- Integration failure

### Exception Requirements

- Owner
- Severity
- Patient/client/visit reference
- Blocking status
- Next action
- Due time where applicable
- Audit trail

## Metrics

Visit Engine v1 should eventually support measurement without turning care into a stopwatch.

### Workflow Metrics

- Schedule-to-arrival conversion
- Arrival-to-intake time
- Intake-to-veterinarian time
- Veterinarian-to-plan time
- Plan-to-estimate time
- Estimate-to-approval time
- Approval-to-treatment time
- Treatment-to-checkout-ready time
- Checkout duration
- Visit archive lag

### Quality Metrics

- Incomplete note rate
- Follow-up creation rate
- Uncommunicated result count
- Approval-state conflict count
- Payment exception rate
- Archive-with-exception rate
- Duplicate data entry rate

### Experience Metrics

- Client wait time
- Staff interruption rate
- Handoff clarification rate
- Repeat question rate
- After-hours documentation burden

## v1 Non-Goals

- Designing exact UI screens
- Defining database schema
- Choosing implementation services or queues
- Fully modeling every specialty workflow
- Replacing clinical judgment
- Automating high-risk clinical decisions
- Treating migrated history as identical to native visit events

## Open Questions

- Which states are required for v1, and which can be represented as work items or exceptions?
- Which visit variations must be supported on day one?
- Which state transitions require explicit human confirmation?
- Which events must be visible to clients?
- Which audit events are legally or operationally required by target market?
- How should multi-patient appointments be represented?
- How should visit state interact with hospitalization across days?
- What is the minimum migration mapping required for safe first visits after go-live?

## Notes

This document should become the parent blueprint for visit-related specs, ADRs, AI behavior, migration requirements, and workflow metrics.

Future specs should reference this document rather than redefining visit state.

## Related Documents

### References

- [Product Constitution](./00-product-constitution.md)
- [Sparki Thesis](./03-sparki-thesis.md)
- [Veterinary Mental Models](./04-veterinary-mental-models.md)
- [Clinic Workflow Atlas](./05-clinic-workflow-atlas.md)
- [Migration Strategy](./06-migration-strategy.md)
- [Patient Workspace](../specs/08-patient-workspace.md)
- [AI Strategy](../specs/09-ai-strategy.md)
- [Migration Engine](../specs/10-migration-engine.md)

### Depends On

- [Product Constitution](./00-product-constitution.md)
- [Veterinary Mental Models](./04-veterinary-mental-models.md)
- [Clinic Workflow Atlas](./05-clinic-workflow-atlas.md)
- [Migration Strategy](./06-migration-strategy.md)

### Referenced By

- TODO: Add links as visit specs, workflow specs, ADRs, AI prompts, and implementation plans reference this blueprint.

### Future Work

- TODO: Create detailed specs for scheduling, check-in, intake, estimates, approvals, diagnostics, checkout, and archival.
- TODO: Create ADRs for visit state ownership, event model, audit model, and archive semantics.
- TODO: Validate state transitions through direct clinic observation.
- TODO: Map legacy source-system exports to Visit Engine concepts.
- TODO: Define v1 readiness criteria for each visit variation.
