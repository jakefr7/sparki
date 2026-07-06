# 09 Event Architecture v1

## Constitutional Authority

This document inherits from the [Product Constitution](./00-product-constitution.md). If it conflicts with the Constitution, the Constitution governs.

## Purpose

Define how Sparki records meaningful changes across the system.

Events are the memory of the product. They explain what happened, when it happened, who or what caused it, what changed, and why it matters.

This is a business and product architecture document. It is not a database schema, API specification, event bus design, queue design, or implementation guide.

## Objective

Create a clear event language that supports patient context, visit state, medical records, migration, AI assistance, auditability, communication, and operational trust.

## 1. What An Event Is

An Event records that something meaningful happened.

An event should help a person or system understand:

- What happened
- When it happened
- Who or what caused it
- What object changed
- What the change means
- Whether it matters for care, money, communication, migration, or accountability

Events should reduce the need for humans to reconstruct history from memory, notes, screenshots, inboxes, or verbal handoffs.

This document defines Business Events.

Business Events describe meaningful changes that matter to clinic staff, patients, clients, operations, migration, AI context, or audit history.

Examples:

- Patient arrived
- Estimate approved
- Prescription created
- Payment completed

Technical Events describe internal software behavior.

Examples:

- API request completed
- Cache refreshed
- Queue processed
- Background job retried

Technical Events are implementation details. They may exist inside Sparki infrastructure, but they are not part of product architecture and should not appear in business workflows, timelines, or blueprint documents unless they directly result in a Business Event.

## 2. What An Event Is Not

An Event is not:

- A notification
- A task
- A work queue item
- A full medical record
- A replacement for a signed note
- A substitute for consent
- A hidden technical log
- A technical event
- A user interface requirement
- A database implementation detail

An event may create or relate to these things, but it should not be confused with them.

## 3. Event vs Audit Event

An `Event` records that something meaningful happened.

An `Audit Event` records accountability for a sensitive or consequential change.

All Audit Events are Events. Not all Events are Audit Events.

### Event Example

`Patient arrived for appointment.`

### Audit Event Example

`Estimate changed after client approval.`

Audit Events require stronger preservation because they may affect care, consent, money, identity, records, or trust.

## 4. Event vs Notification

An Event records history.

A Notification asks someone to notice or act.

Example:

- Event: `Diagnostic result received.`
- Notification: `Veterinarian needs to review result.`

Notifications should point back to the event or object that caused them. Notifications should not become the source of truth.

## 5. Event vs Work Item

An Event records what happened.

A Work Item represents work that needs to happen or has happened.

Example:

- Event: `Client requested refill.`
- Work Item: `Veterinarian review refill request.`

Events can create Work Items. Work Items can create Events when they change state.

## 6. Event vs Timeline Item

A Timeline Item is a way to show information in time order.

An Event may appear on a patient, visit, client, or operational timeline. But not every timeline item is an Event.

Examples of timeline items:

- Event
- Communication
- SOAP Note
- Diagnostic Result
- Attachment
- Prescription
- Invoice
- Follow-Up

The timeline is a view. The Event is the memory of what happened.

## 7. Event Ownership

Each Event should have an owner or source.

Ownership answers: who or what caused this?

### Human-Owned Events

Created by a User acting in Sparki.

Examples:

- Receptionist checks in a patient.
- Technician completes intake.
- Veterinarian signs a record.
- Practice Manager resolves an exception.

### System-Owned Events

Created by Sparki based on product behavior.

Examples:

- Appointment marked no-show after policy threshold.
- Reminder becomes due.
- Visit moves to Archived With Exceptions.

### AI-Assisted Events

Created when AI generates, suggests, drafts, maps, or transforms content.

AI can assist an event, but a human or system policy must own accepted high-impact changes.

### External Integration Events

Created from an External Integration.

Examples:

- Lab result received.
- Payment completed.
- Online booking request received.

### Migration Events

Created during migration import, mapping, validation, correction, or acceptance.

Migration Events must preserve source system lineage.

## 8. Required Event Fields

Every Event should have enough information to be understandable later.

Required fields in business terms:

- Event type
- Human-readable summary
- Timestamp
- Source
- Actor or system that caused it
- Related object
- Patient where relevant
- Client where relevant
- Visit where relevant
- Previous state where relevant
- New state where relevant
- Related Work Item where relevant
- Related Communication where relevant
- Related External Integration where relevant
- Related Migration Record where relevant
- Audit sensitivity
- Confidence where imported or migrated
- Source reference where imported, migrated, or integrated

## 9. Event Categories

Sparki v1 should recognize these event categories:

- Scheduling
- Arrival
- Identity
- Triage
- Intake
- Visit state
- Clinical decision
- Estimate
- Consent and approval
- Diagnostic order
- Diagnostic result
- Treatment
- Medication
- Prescription
- Communication
- Payment
- Follow-up
- Reminder
- Record completion
- Record signoff
- Attachment
- Exception
- External integration
- Migration
- AI suggestion
- Archive

Categories should help filtering, review, migration validation, and AI context. They should not become product modules.

## 10. Human-Created Events

Human-created Events come from User actions.

Examples:

- Receptionist marks patient arrived.
- Technician records vitals.
- Veterinarian creates a Clinical Decision.
- Client approval is captured.
- Payment exception is resolved.

Human-created Events need clear User attribution.

When a human accepts AI-generated content, the Event should show both:

- AI assisted
- Human accepted

## 11. System-Created Events

System-created Events come from Sparki behavior.

Examples:

- Reminder becomes due.
- Visit moves to Archived With Exceptions because required work remains.
- Follow-Up becomes overdue.
- Integration sync fails.

System-created Events must be understandable to users and support teams. They should not read like internal logs.

## 12. AI-Assisted Events

AI-assisted Events happen when AI drafts, summarizes, classifies, extracts, maps, or suggests something.

Examples:

- AI draft created for SOAP Note.
- AI summarized client communication.
- AI suggested duplicate patient match during migration.
- AI draft discharge instructions accepted.

### Rules

- AI-generated content must remain distinguishable from human-owned content.
- Accepted AI content should create an Event.
- Accepted AI content affecting care, consent, payment, migration, identity, or records should create an Audit Event.
- Rejected AI suggestions may be tracked for quality, but should not clutter patient history.

## 13. External Integration Events

External Integration Events come from connected systems.

Examples:

- Diagnostic Result received from lab.
- Payment completed by processor.
- Client message received from portal.
- Online booking request received.
- Pharmacy fulfillment update received.

### Rules

- Source must be clear.
- Processing status must be clear.
- Failed or unmatched events should become Exceptions when they affect work.
- External events should not silently overwrite human-owned decisions.

## 14. Migration Events

Migration Events record how legacy data entered Sparki.

Examples:

- Legacy patient imported.
- Legacy appointment mapped to Visit Intent.
- Legacy medical note imported into Medical Record.
- Attachment imported with uncertain patient match.
- Migration field mapping corrected.

### Rules

- Preserve source system.
- Preserve source record reference where available.
- Preserve confidence.
- Preserve whether the data was mapped automatically, AI-assisted, or human-verified.
- Do not make migrated history look identical to native Sparki events when uncertainty matters.

## 15. Event Visibility By Role

Not every Event should be equally visible to every role.

### Receptionist

Needs events that affect arrival, scheduling, client communication, checkout, payment, and routing.

### Technician

Needs events that affect intake, tasks, treatment, diagnostic status, medication readiness, patient movement, and handoffs.

### Veterinarian

Needs events that affect clinical decisions, patient history, diagnostics, treatment, medications, communication, follow-up, and record signoff.

### Practice Manager

Needs events that affect exceptions, bottlenecks, payment issues, schedule disruption, staff accountability, and unresolved work.

### Hospital Owner

Needs high-level events, trends, exceptions, and audit-sensitive history when reviewing risk, operations, or business health.

### AI Assistant

May use events as context only within permission, safety, and product boundaries.

## 16. Patient Timeline Rules

The Patient Timeline should show events and related objects that help explain patient history.

Patient timeline should favor:

- Visits
- Clinical decisions
- Diagnoses and problems
- Diagnostic results
- Treatments and procedures
- Prescriptions
- Vaccinations
- Relevant communication
- Follow-ups
- Attachments
- Record signoff
- Imported legacy history with source labels

Patient timeline should avoid:

- Noisy technical events
- Internal-only system chatter
- Notifications without durable meaning
- Low-value AI suggestion history

## 17. Visit Timeline Rules

The Visit Timeline should show what happened during the visit and what remains unresolved.

Visit timeline should favor:

- State changes
- Intake events
- Clinical decisions
- Orders
- Diagnostic results
- Estimate and approval events
- Consent events
- Treatments
- Medication and prescription events
- Client communication
- Payment completion or exceptions
- Follow-up creation
- Record completion and signoff
- Archive state

The Visit Timeline should make handoffs easier. It should not become a raw event dump.

## 18. Medical Record Impact

Not every Event belongs in the Medical Record.

Events should affect the Medical Record when they carry durable clinical meaning.

Examples:

- Clinical decision finalized
- SOAP Note signed
- Diagnostic Result reviewed
- Prescription created
- Treatment completed
- Vaccination administered
- Relevant client communication captured
- AI draft accepted into signed clinical documentation
- Legacy medical record imported

Operational events may support the visit without becoming part of the Medical Record.

## 19. Audit Requirements

Events should become Audit Events when they affect:

- Patient identity
- Client identity or authority
- Clinical decisions
- Medical record content
- Consent
- Estimate approval
- Invoice or payment state
- Prescription
- Diagnostic result review
- Treatment completion
- Record signoff
- Migration mapping or correction
- Accepted AI-generated clinical, financial, consent, identity, or migration content

Audit Events should be durable, attributable, and hard to erase.

## 20. Correction And Amendment Rules

Events should not be casually edited.

When correction is needed:

- Preserve the original Event where accountability matters.
- Create a correction Event.
- Explain what changed.
- Identify who made the correction.
- Link the correction to the original Event.
- Use an Audit Event when the correction affects care, money, consent, identity, migration, or records.

Corrections should make history clearer, not rewrite history silently.

## 21. Source Tracking

Every Event should identify its source.

Source examples:

- Human user
- Sparki system behavior
- AI suggestion
- External Integration
- Migration import
- Migration correction

For imported, migrated, or integrated events, source tracking should include enough information to trace back to the origin when possible.

## 22. Confidence Scoring For Migrated Or Imported Events

Migrated or imported Events may have uncertain meaning.

Confidence should describe how sure Sparki is that the event is correctly understood and linked.

### Confidence Should Consider

- Source system
- Source record quality
- Patient match certainty
- Client match certainty
- Date and time reliability
- Object mapping certainty
- Field mapping certainty
- Whether AI assisted mapping
- Whether a human verified it

### Rules

- Low-confidence Events should be visible as uncertain.
- Low-confidence Events should not silently drive high-risk workflow.
- High-risk migrated Events need human verification.
- Confidence should help migration review, not overwhelm users.

## 23. Rules For Events That Should Never Be Deleted

Some Events should never be deleted through normal product behavior.

These include:

- Audit Events
- Consent granted, declined, revoked, or changed
- Estimate approval, partial approval, or decline
- Clinical decision finalized or amended
- Diagnostic result received, reviewed, or corrected
- Prescription created, changed, cancelled, or refilled
- Payment completed, refunded, reversed, disputed, or adjusted
- Medical record signoff or amendment
- Visit archived or archived with exceptions
- Migration mapping accepted or corrected
- AI-generated content accepted into clinical, financial, consent, identity, migration, or record content

If these need correction, create a correction or amendment Event.

## 24. How Events Support AI Context

Events help AI understand what happened without guessing.

AI can use Events to:

- Summarize a visit
- Prepare veterinarian review
- Draft discharge instructions
- Identify missing follow-up
- Explain estimate approval status
- Summarize diagnostic history
- Detect unresolved exceptions
- Support migration review

AI should not use Events to invent facts. If event history is incomplete or low-confidence, AI output should reflect that uncertainty.

## 25. How Events Support Migration Validation

Migration Events help prove what moved, what changed, and what remains uncertain.

Events support migration validation by showing:

- Source system
- Source record
- Imported object
- Mapping confidence
- AI-assisted mapping
- Human verification
- Correction history
- Objects excluded or unresolved

Migration validation should use Events to give clinics confidence before go-live and clarity after go-live.

## Examples

### Visit State Change

Event: `Visit moved from Intake In Progress to Veterinarian Exam Ready.`

Meaning: The patient is ready for veterinarian review.

Audit: Usually no, unless the state change affects care, consent, payment, or record accountability.

### Client Communication

Event: `Client approved estimate by SMS.`

Meaning: Communication changed the visit's approval state.

Audit: Yes, because approval affects care and cost.

### Estimate Approval

Event: `Estimate partially approved.`

Meaning: Some recommended work can proceed; some work is declined or deferred.

Audit: Yes.

### Diagnostic Result Received

Event: `Diagnostic Result received from lab.`

Meaning: Result is available but may still need veterinarian review.

Audit: Yes when tied to clinical record or review.

### Prescription Created

Event: `Prescription created by veterinarian.`

Meaning: Medication has been authorized for fulfillment.

Audit: Yes.

### Payment Completed

Event: `Payment completed.`

Meaning: Invoice or balance changed.

Audit: Yes.

### Record Signed Off

Event: `SOAP Note signed by veterinarian.`

Meaning: Clinical documentation was finalized.

Audit: Yes.

### Migrated Legacy Record Imported

Event: `Legacy medical note imported from Cornerstone export.`

Meaning: Historical record is available in Sparki with source tracking.

Audit: Yes when accepted into Medical Record or migration verification.

### AI Draft Accepted Into The Record

Event: `AI-drafted discharge instructions accepted by technician.`

Meaning: AI-assisted content became part of the visit record after human acceptance.

Audit: Yes if the accepted content affects care instructions, clinical record, consent, payment, or migration.

## Event Principles

- Events should explain meaningful change.
- Events should be readable by humans.
- Events should preserve source and actor.
- Events should separate history from action.
- Events should not become noisy technical logs.
- Business Events should not include implementation details unless those details create business meaning.
- Audit-sensitive events should not be deleted.
- Imported and migrated events should show confidence.
- AI-assisted events should show AI involvement and human acceptance.
- Timelines should show useful event history, not every possible event.

## Open Questions

- Which event categories are required for v1 launch?
- Which Events should be visible to clients?
- Which Events should appear on the Patient Timeline by default?
- Which Events should appear on the Visit Timeline by default?
- What confidence scale should migration use?
- Which Events require legal retention by market?
- Which AI-assisted rejected suggestions should be retained for quality review?

## Future Work

- Define v1 event category list.
- Define patient timeline inclusion rules.
- Define visit timeline inclusion rules.
- Define audit event retention policy.
- Define migration confidence language.
- Create ADR for Event vs Audit Event storage and retention semantics.
- Map Visit Engine state changes to event categories.

## Related Documents

### References

- [Product Constitution](./00-product-constitution.md)
- [Visit Engine v1](./07-visit-engine-v1.md)
- [Core Domain Model v1](./08-core-domain-model-v1.md)
- [Migration Strategy](./06-migration-strategy.md)
- [AI Strategy](../specs/09-ai-strategy.md)

### Depends On

- [Product Constitution](./00-product-constitution.md)
- [Visit Engine v1](./07-visit-engine-v1.md)
- [Core Domain Model v1](./08-core-domain-model-v1.md)
- [Migration Strategy](./06-migration-strategy.md)

### Referenced By

- TODO: Add links as ADRs, specs, timelines, audit policies, migration maps, and AI prompts depend on this event architecture.
