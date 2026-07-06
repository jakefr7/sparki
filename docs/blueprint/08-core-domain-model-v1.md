# 08 Core Domain Model v1

## Constitutional Authority

This document inherits from the [Product Constitution](./00-product-constitution.md). If it conflicts with the Constitution, the Constitution governs.

## Purpose

Define Sparki's core business language.

Every future blueprint, ADR, specification, migration plan, API design, AI feature, and engineering decision should use this vocabulary unless a future accepted ADR changes it.

This is not a database schema, API specification, implementation guide, or UI specification. It defines what core business objects mean, who owns them, how they relate, and what must remain true about them.

## Objective

Create a stable domain model for Sparki v1 that supports patient-centered workflows, the Visit Engine, migration, communication, AI assistance, auditability, and future extensibility.

## Global Domain Principles

### 1. Patient Context Is The Center

Objects that affect care should be traceable back to the patient whenever clinically or operationally relevant.

### 2. Business Meaning Comes Before System Shape

The domain model describes clinic reality. It should not mirror database tables, screens, source-system exports, or integration payloads.

### 3. State Must Be Knowable

Important objects must have clear ownership, lifecycle, and current status. Users should not have to infer operational truth from scattered fragments.

### 4. Events Preserve Memory

Meaningful changes should produce events. Audit-sensitive changes should produce audit events. The system should remember what humans should not have to reconstruct.

### 5. AI Suggests; Humans Own Decisions

AI may draft, classify, summarize, map, or flag. It does not own clinical, financial, consent, identity, or record-finalization decisions.

### 6. Migration Is A First-Class Source Of Domain Reality

Migrated objects may be incomplete, uncertain, duplicated, or historically shaped by legacy systems. The model must preserve their usefulness without pretending they are native Sparki objects.

### 7. Exceptions Are Domain Objects

Operational problems should not hide in notes. Exceptions require ownership, severity, next action, and closure.

### 8. Communication Is Part Of Care When It Carries Patient Context

Communication that affects care, approval, instructions, follow-up, or accountability must relate to the relevant patient, visit, or work item where possible.

## State vs Object Rule

A state describes the current condition of work.

An object represents durable business information.

Not every state should become an object.

In Sparki v1, `Visit State` is a property of `Visit`, not a separate Core Object. The durable business information behind a state usually lives in objects such as `Event`, `Audit Event`, `Work Item`, `Exception`, `Consent`, `Estimate`, `Invoice`, `Medical Record`, or `Communication`.

## Core Relationship Model

At the highest level:

- An `Organization` owns one or more `Locations`.
- A `Location` has `Users`, `Roles`, `Resources`, `Schedules`, and `Calendars`.
- A `Client` owns or is responsible for one or more `Patients`.
- A `Patient` has `Appointments`, `Visits`, `Medical Records`, `Communications`, `Attachments`, `Reminders`, and `Follow-Ups`.
- An `Appointment` may create or fulfill a `Visit Intent`.
- A `Visit Intent` creates or becomes a `Visit`.
- A `Visit` coordinates `Work Items`, `Clinical Decisions`, `Orders`, `Diagnostic Orders`, `Diagnostic Results`, `Treatments`, `Procedures`, `Medication Orders`, `Estimates`, `Consents`, `Communications`, `Invoices`, `Payments`, `Follow-Ups`, `Exceptions`, `Events`, and `Audit Events`.
- A `Medical Record` contains durable clinical history, including `SOAP Notes`, `Problems`, `Diagnoses`, `Allergies`, `Vaccinations`, `Prescriptions`, `Attachments`, and archived visit records.
- `Orders` request work; `Treatments` and `Procedures` are performed work.
- `Diagnostic Orders` request diagnostic work; `Diagnostic Results` record what came back.
- `Estimates` describe expected cost; `Invoices` describe actual charges.
- `Communications` carry content between people; `Notifications` alert users about something requiring awareness or action.
- `Events` describe meaningful system or workflow occurrences; `Audit Events` preserve accountability for sensitive changes.
- `AI Suggestions` may attach to many objects but must remain distinguishable from accepted human-owned decisions.
- `Migration Records` preserve source lineage and uncertainty for migrated objects.
- `External Integrations` produce `Integration Events`, which may create or update domain objects after validation.
- `Queues` organize pending work, while `Exceptions` represent blocked, risky, or abnormal states requiring ownership.

## Commonly Confused Concepts

### Appointment vs Visit

An `Appointment` is a scheduled commitment or planned time allocation.

A `Visit` is the actual episode of care or service. A visit may come from an appointment, walk-in, emergency, drop-off, surgery admission, telemedicine request, or hospitalization continuation.

### Visit vs Encounter

Sparki should use `Visit` as the core v1 term.

`Encounter` may appear in legacy systems, integrations, or clinical contexts. In Sparki v1, treat encounter as a source-system or external term unless a future ADR introduces it as a distinct concept.

### Work Item vs Task

A `Work Item` is any unit of work that belongs to a visit or operational process.

A `Task` is a human-actionable work item with an owner, status, and expected completion. All tasks are work items. Not all work items are tasks.

### Order vs Treatment

An `Order` requests or authorizes work.

A `Treatment` is care that is performed. An order may lead to treatment, diagnostics, medication, procedures, or other work.

### Medication Order vs Prescription

A `Medication Order` is the clinical instruction to administer, dispense, or prescribe medication.

A `Prescription` is the authorized medication record intended for dispensing or fulfillment under clinical and regulatory constraints.

### Estimate vs Invoice

An `Estimate` is a proposed expected cost for recommended or possible work.

An `Invoice` is the actual financial record of charges, adjustments, taxes, payments, and balances.

### Communication vs Notification

`Communication` is message content exchanged between people or parties.

`Notification` is an alert or signal intended to create awareness or action. A notification may point to communication, but it is not itself the conversation.

### Event vs Audit Event

An `Event` records that something meaningful happened.

An `Audit Event` records accountability for a sensitive or consequential change. All audit events are events. Not all events require audit treatment.

### Reminder vs Follow-Up

A `Reminder` is a scheduled prompt for future awareness or action.

A `Follow-Up` is a care, communication, or operational obligation that closes a loop after an event, visit, result, or client interaction.

### Clinical Decision vs Diagnosis

A `Clinical Decision` is a veterinarian-owned judgment or choice about care.

A `Diagnosis` is a clinical conclusion or identified condition. A diagnosis may result from clinical decisions, evidence, and interpretation, but not every clinical decision is a diagnosis.

### Approval State vs Consent

Approval state describes where the visit is operationally blocked or moving.

`Consent` is the durable record of what the client authorized, declined, acknowledged, or revoked.

### Archived Visit vs Medical Record

An archived Visit is a closed episode of care or service.

The `Medical Record` is the durable patient history across visits. Archived visits contribute to the Medical Record, but one archived visit is not the whole Medical Record.

## Core Business Objects

## Organization

### Purpose

Represent the business entity operating one or more veterinary locations.

### Definition

An Organization is the top-level business unit in Sparki.

### Ownership

Owned by hospital leadership or group administration.

### Responsibilities

- Hold business identity.
- Group locations, users, permissions, and operating standards.
- Provide a boundary for reporting, configuration, billing, and governance.

### Lifecycle

Created during onboarding, expanded as locations are added, and preserved for historical reporting even if inactive.

### Relationships

- Owns Locations.
- Contains Users and Roles.
- May have External Integrations.
- May be associated with Migration Records.

### Invariants

- An Organization must be identifiable.
- Organization-level decisions must not erase Location-level operational context.

### Audit Considerations

Audit ownership, status, location membership, and permission-affecting changes.

### AI Interaction Rules

AI may summarize organizational patterns but should not change business identity, permissions, or governance.

### Migration Considerations

Legacy systems may not distinguish organization and location clearly. Preserve source assumptions.

### Future Extensibility

Multi-location groups, corporate ownership, regional reporting, and acquisition scenarios.

## Location

### Purpose

Represent a physical or operational veterinary site.

### Definition

A Location is where clinic work happens, including schedule, resources, staff assignments, visits, inventory, and local operating rules.

### Ownership

Owned by an Organization; operationally managed by practice leadership.

### Responsibilities

- Anchor daily workflow.
- Scope schedules, resources, inventory, users, and visit activity.
- Preserve local operating context.

### Lifecycle

Created during onboarding, modified as operations change, and archived if a site closes.

### Relationships

- Belongs to an Organization.
- Has Users, Resources, Schedules, Calendars, Appointments, Visits, Queues, Inventory-related objects, and External Integrations.

### Invariants

- Visits should be associated with a Location when care is delivered or managed by a site.

### Audit Considerations

Audit location creation, deactivation, operating status, and critical configuration changes.

### AI Interaction Rules

AI may summarize location activity and exceptions but should not change operating rules without human approval.

### Migration Considerations

Legacy data may merge multiple sites or represent them inconsistently.

### Future Extensibility

Mobile clinics, specialty centers, emergency sites, and virtual care locations.

## User

### Purpose

Represent a person who works in or administers Sparki.

### Definition

A User is an authenticated human actor with identity, role assignments, permissions, and audit attribution.

### Ownership

Owned by the Organization or Location administration.

### Responsibilities

- Perform actions.
- Own tasks and decisions.
- Provide attribution for events and audit events.

### Lifecycle

Invited, activated, assigned roles, modified, deactivated, and retained for historical attribution.

### Relationships

- Belongs to Organization and may belong to Locations.
- Has Roles.
- Owns Tasks, Clinical Decisions, Communications, Events, and Audit Events.

### Invariants

- Historical actions must remain attributable after user deactivation.

### Audit Considerations

Audit role changes, permission changes, deactivation, and sensitive actions.

### AI Interaction Rules

AI may assist users but must distinguish AI-generated suggestions from user-owned actions.

### Migration Considerations

Legacy staff names may not map cleanly to active Sparki users.

### Future Extensibility

Contractors, relief veterinarians, students, external specialists, and service accounts.

## Role

### Purpose

Represent a set of responsibilities and permissions.

### Definition

A Role defines what a User is expected and allowed to do.

### Ownership

Owned by Organization or Location administration.

### Responsibilities

- Group permissions.
- Clarify authority boundaries.
- Support audit interpretation.

### Lifecycle

Created, assigned, modified, retired.

### Relationships

- Assigned to Users.
- Shapes access to Visits, Medical Records, Payments, Reports, and administrative functions.

### Invariants

- Role names should reflect responsibility, not only access level.

### Audit Considerations

Audit role creation, changes, assignment, and removal.

### AI Interaction Rules

AI should respect role boundaries when suggesting actions or surfacing information.

### Migration Considerations

Legacy permission models may be informal or incompatible.

### Future Extensibility

Custom roles, temporary role elevation, location-specific roles.

## Client

### Purpose

Represent the person or entity responsible for a patient.

### Definition

A Client is a pet owner, caretaker, organization, rescue, breeder, or other party responsible for communication, decisions, consent, and payment.

### Ownership

Owned by the clinic relationship; maintained by front desk and management with clinical relevance where appropriate.

### Responsibilities

- Provide patient history.
- Receive communication.
- Give consent and approvals.
- Pay invoices.
- Participate in follow-up.

### Lifecycle

Created through onboarding, scheduling, migration, or first contact; updated over time; may become inactive.

### Relationships

- Associated with Patients.
- Has Communications, Appointments, Visits, Estimates, Invoices, Payments, Consents, Reminders, and Follow-Ups.

### Invariants

- A client must not be treated as interchangeable with a patient.
- Client identity must be clear when consent, communication, or payment is involved.

### Audit Considerations

Audit identity merges, contact changes, consent-affecting changes, and financial responsibility changes.

### AI Interaction Rules

AI may summarize client communication and preferences but must not infer legal authority where uncertain.

### Migration Considerations

Duplicate clients, household structures, deceased clients, shared ownership, and incomplete contact details are common.

### Future Extensibility

Multiple owners, guardianship, organizations, shelters, split billing, and client portal identity.

## Patient

### Purpose

Represent the animal receiving care.

### Definition

A Patient is the center of clinical and workflow context in Sparki.

### Ownership

Owned by the clinic's patient record; clinically governed by veterinarians and operationally maintained by the team.

### Responsibilities

- Anchor care history.
- Connect visits, medical records, communication, reminders, attachments, and financial context.
- Preserve clinical continuity.

### Lifecycle

Created through migration, scheduling, intake, or first visit; updated through care; marked inactive, transferred, or deceased when appropriate.

### Relationships

- Associated with Clients.
- Has Appointments, Visits, Medical Records, Problems, Diagnoses, Allergies, Vaccinations, Prescriptions, Communications, Attachments, Reminders, and Follow-Ups.

### Invariants

- Patient context should remain central for care-related work.
- A patient should retain durable identity across visits and migrated history.

### Audit Considerations

Audit identity merges, species/breed/sex/status changes, deceased status, and clinically material changes.

### AI Interaction Rules

AI may summarize patient history and suggest missing context but must not silently alter patient identity or clinical status.

### Migration Considerations

Duplicate patients, deceased patients, transferred patients, and incomplete demographics are common.

### Future Extensibility

Herd/flock care, shelter populations, equine, exotic, livestock, and multi-patient appointments.

## Appointment

### Purpose

Represent a scheduled time commitment.

### Definition

An Appointment is planned time for a patient, client, veterinarian, resource, or service.

### Ownership

Operationally owned by reception and scheduling staff.

### Responsibilities

- Reserve time and resources.
- Capture reason for visit.
- Prepare the clinic for expected work.

### Lifecycle

Created, confirmed, rescheduled, arrived, cancelled, no-showed, or fulfilled by a Visit.

### Relationships

- Belongs to Client, Patient, Location, Schedule, and Calendar.
- May create or satisfy a Visit Intent.
- May become a Visit.

### Invariants

- An appointment is not the visit itself.
- Future appointments must be trustworthy after migration.

### Audit Considerations

Audit creation, reschedule, cancellation, no-show, appointment type changes, and veterinarian/resource changes.

### AI Interaction Rules

AI may suggest appointment type, urgency, and preparation needs; humans own scheduling decisions.

### Migration Considerations

Appointment types, veterinarian mappings, recurring appointments, and future schedule verification require review.

### Future Extensibility

Online booking, waitlists, recurring care plans, multi-patient appointments.

## Visit

### Purpose

Represent an episode of care or service.

### Definition

A Visit is the actual patient-centered workflow from intent or arrival through archival.

### Ownership

Operationally shared across roles; clinical portions owned by veterinarians.

### Responsibilities

- Coordinate care, work, communication, approvals, payment, follow-up, and record completion.
- Preserve state across interruptions.
- Hold current Visit State.

### Lifecycle

Created from Visit Intent or Appointment; progresses through Visit Engine states; closes as Archived or Archived With Exceptions.

Visit State is a property of Visit, not a separate Core Object.

### Relationships

- Belongs to Patient, Client where applicable, Location, and Visit Intent.
- Contains Work Items, Tasks, Orders, Diagnostic Orders, Diagnostic Results, Clinical Decisions, Treatments, Procedures, Medication Orders, Estimates, Consents, Communications, Invoices, Payments, Events, Audit Events, Follow-Ups, Exceptions, and Attachments.

### Invariants

- Visit state must be knowable.
- A visit must not hide unresolved exceptions.
- Approval states must be supported by durable Consent, Estimate, Clinical Decision, Communication, Event, or Audit Event records.
- Archived With Exceptions must preserve unresolved owners and next actions.

### Audit Considerations

Audit lifecycle state changes, clinical decisions, approvals, payments, record completion, and archival.

### AI Interaction Rules

AI may summarize, draft, and flag visit context but must not finalize clinical, consent, payment, or archive decisions.

### Migration Considerations

Legacy systems may represent visits as encounters, invoices, appointments, or medical notes. Preserve source lineage.

### Future Extensibility

Multi-day visits, specialty visits, telemedicine, emergency, hospitalization, surgery episodes.

## Visit Intent

### Purpose

Represent the reason a visit should exist.

### Definition

A Visit Intent is the initiating need or request that may become a Visit.

### Ownership

Created by scheduling, reception, clinical staff, client action, automation, migration, or external integration.

### Responsibilities

- Capture why work is needed.
- Preserve source and urgency.
- Start the Visit Engine when appropriate.

### Lifecycle

Created, refined, scheduled, converted to Visit, deferred, referred, cancelled, or closed.

### Relationships

- May be linked to Appointment, Patient, Client, Communication, Reminder, Follow-Up, or Migration Record.

### Invariants

- Visit Intent should preserve origin and reason.

### Audit Considerations

Audit intent creation, urgency changes, cancellation, referral, and conversion to Visit.

### AI Interaction Rules

AI may classify or summarize intent but must not create false urgency or clinical certainty.

### Migration Considerations

Legacy future appointments and reminders may imply Visit Intents.

### Future Extensibility

Client portal requests, AI-generated draft intents, referral intake, waitlists.

## Clinical Decision

### Purpose

Represent veterinarian-owned judgment about care.

### Definition

A Clinical Decision is a documented choice, interpretation, approval, or recommendation made under clinical authority.

### Ownership

Owned by a Veterinarian.

### Responsibilities

- Preserve medical reasoning and accountability.
- Connect evidence to plan.
- Distinguish judgment from observation, task, or AI suggestion.

### Lifecycle

Drafted, reviewed, finalized, revised, superseded, or archived.

### Relationships

- Belongs to Patient and often Visit.
- May relate to Diagnosis, Problem, Order, Treatment, Medication Order, Prescription, Estimate, Consent, or Follow-Up.

### Invariants

- AI cannot own a Clinical Decision.
- A clinical decision must remain attributable to a clinician.

### Audit Considerations

Audit creation, revision, signoff, supersession, and accepted AI-generated support.

### AI Interaction Rules

AI may summarize evidence or draft language; veterinarian decides.

### Migration Considerations

Legacy notes may imply decisions without explicit structure.

### Future Extensibility

Specialist consults, second opinions, decision support, care pathways.

## Work Item

### Purpose

Represent work that must happen or has happened.

### Definition

A Work Item is a unit of operational or clinical work tied to a Visit, Patient, Client, or Location process.

### Ownership

Owned by the role or system responsible for completing or tracking the work.

### Responsibilities

- Make work visible.
- Preserve status.
- Connect work to patient context.

### Lifecycle

Created, assigned, started, blocked, completed, deferred, cancelled, or archived.

### Relationships

- Parent category for Tasks, Orders, Follow-Ups, Reminders, and operational queue items.

### Invariants

- Work should have status and context.
- Work that affects care should connect to Patient or Visit.

### Audit Considerations

Audit owner changes, completion, cancellation, and blocking exceptions where consequential.

### AI Interaction Rules

AI may suggest or draft work items; humans or accepted automation own activation.

### Migration Considerations

Legacy reminders, callbacks, tasks, and notes may map to work items.

### Future Extensibility

Care plans, protocols, automation-generated work, multi-step workflows.

## Task

### Purpose

Represent a human-actionable item.

### Definition

A Task is a Work Item with an owner, status, and expected action.

### Ownership

Owned by a User, Role, Queue, or Location team.

### Responsibilities

- Clarify who needs to do what.
- Support handoffs and completion.
- Prevent work from living only in memory.

### Lifecycle

Created, assigned, accepted, in progress, blocked, completed, cancelled, or overdue.

### Relationships

- Belongs to Patient, Visit, Client, Location, Communication, Follow-Up, Exception, or Queue.

### Invariants

- A task should have an owner or owning queue.
- A task should have a clear completion condition.

### Audit Considerations

Audit assignment, completion, cancellation, overdue escalation, and clinically relevant task changes.

### AI Interaction Rules

AI may extract tasks from communication or notes; activation should be reviewable.

### Migration Considerations

Legacy tasks may be incomplete, stale, or ownerless.

### Future Extensibility

Recurring tasks, protocols, team inboxes, workload balancing.

## Order

### Purpose

Represent requested or authorized work.

### Definition

An Order is an instruction to perform diagnostics, treatment, medication, procedure, or other clinical/operational work.

### Ownership

Clinical orders are owned by Veterinarians; delegated operational orders may be owned by authorized staff under policy.

### Responsibilities

- Request work.
- Connect plan to execution.
- Preserve authorization and status.

### Lifecycle

Drafted, ordered, approved, in progress, completed, cancelled, declined, or superseded.

### Relationships

- May produce Diagnostic Orders, Treatments, Procedures, Medication Orders, Tasks, Estimates, and Invoice items.

### Invariants

- Orders should distinguish requested work from completed work.

### Audit Considerations

Audit clinical order creation, cancellation, revision, and completion.

### AI Interaction Rules

AI may suggest likely orders from a plan but cannot place clinical orders without authorized human action.

### Migration Considerations

Legacy plans, invoices, and notes may imply orders.

### Future Extensibility

Protocols, standing orders, order sets, specialty pathways.

## Diagnostic Order

### Purpose

Represent a request for diagnostic testing or imaging.

### Definition

A Diagnostic Order is an Order for lab work, imaging, measurement, or other diagnostic activity.

### Ownership

Owned by Veterinarian or authorized clinical protocol.

### Responsibilities

- Connect diagnostic intent, approval, sample/image status, result, review, and communication.

### Lifecycle

Drafted, ordered, approved, collected/performed, pending result, result ready, reviewed, communicated, cancelled.

### Relationships

- Belongs to Visit and Patient.
- Relates to Diagnostic Results, Integration Events, Clinical Decisions, Invoices, and Follow-Ups.

### Invariants

- Result status and review status are distinct.

### Audit Considerations

Audit order, result receipt, review, communication, and cancellation.

### AI Interaction Rules

AI may summarize result history or flag unreviewed results; clinician interprets.

### Migration Considerations

Legacy lab data may be structured, PDF-only, or externally sourced.

### Future Extensibility

Imaging workflows, reference lab routing, result trend analysis.

## Diagnostic Result

### Purpose

Represent the outcome of diagnostic work.

### Definition

A Diagnostic Result is the result, report, value, image, finding, or attachment returned from diagnostic testing or imaging.

### Ownership

Clinically reviewed by Veterinarian; produced by internal staff, equipment, lab, imaging, or External Integration.

### Responsibilities

- Preserve diagnostic output.
- Track review and communication status.
- Connect results to patient care decisions.

### Lifecycle

Pending, received, matched, reviewed, communicated, corrected, archived.

### Relationships

- Belongs to Patient and often Visit.
- Originates from Diagnostic Order where known.
- Relates to Clinical Decision, Medical Record, Attachment, Communication, Follow-Up, Event, Audit Event, and External Integration.

### Invariants

- Result received, result reviewed, and result communicated are different states.
- Original result source should remain traceable.

### Audit Considerations

Audit result receipt, matching, review, correction, and client communication when clinically relevant.

### AI Interaction Rules

AI may summarize trends, flag unreviewed results, or draft result communication. Veterinarian owns interpretation.

### Migration Considerations

Legacy results may be structured values, PDFs, images, scanned records, or external reports.

### Future Extensibility

Trend views, imaging workflows, external lab result matching, structured result extraction.

## Treatment

### Purpose

Represent care performed for the patient.

### Definition

A Treatment is clinical care that has been performed or is being performed.

### Ownership

Performed by authorized clinical staff; clinically governed by Veterinarian.

### Responsibilities

- Record performed care.
- Track completion, response, and exceptions.

### Lifecycle

Planned, approved, pending, in progress, completed, deferred, declined, or cancelled.

### Relationships

- May originate from Order.
- Relates to Visit, Patient, Clinical Decision, Medication Order, Procedure, Medical Record, Invoice, and Follow-Up.

### Invariants

- Treatment completion should reflect actual work, not only intent.

### Audit Considerations

Audit treatment completion, changes, adverse events, and exceptions.

### AI Interaction Rules

AI may draft treatment notes from completed work; humans validate.

### Migration Considerations

Legacy treatments may be inferred from invoices or notes.

### Future Extensibility

Treatment plans, bundles, hospitalization schedules, protocols.

## Procedure

### Purpose

Represent a defined clinical procedure.

### Definition

A Procedure is a specific clinical service or intervention performed or planned.

### Ownership

Clinically governed by Veterinarian; performed by authorized staff.

### Responsibilities

- Define procedure-specific requirements, documentation, consent, and follow-up.

### Lifecycle

Recommended, estimated, consented, scheduled, in progress, completed, cancelled, or followed up.

### Relationships

- Relates to Visit, Order, Treatment, Consent, Estimate, Invoice, Medical Record, Attachment, and Follow-Up.

### Invariants

- Procedure status should not be confused with payment status.

### Audit Considerations

Audit consent, start/completion, complications, and record finalization.

### AI Interaction Rules

AI may draft discharge instructions and summarize records; humans approve.

### Migration Considerations

Legacy procedure history may exist in invoices, notes, or attachments.

### Future Extensibility

Surgery, dentistry, specialty procedures, anesthesia records.

## Medication Order

### Purpose

Represent medication intent.

### Definition

A Medication Order is the clinical instruction to administer, dispense, or prescribe a medication.

### Ownership

Owned by Veterinarian or authorized protocol where allowed.

### Responsibilities

- Connect medication decision to patient, dose, route, frequency, duration, and fulfillment path.

### Lifecycle

Drafted, ordered, approved, prepared, administered, dispensed, prescribed, cancelled, or completed.

### Relationships

- May produce Prescription, Treatment, Invoice item, Follow-Up, or Reminder.
- Relates to Patient, Visit, Allergies, Medical Record, and Inventory.

### Invariants

- Medication intent must remain distinct from prescription fulfillment.

### Audit Considerations

Audit creation, dosage changes, cancellation, administration, and dispensing.

### AI Interaction Rules

AI may draft instructions but must not authorize medication.

### Migration Considerations

Legacy medication histories may lack structured dose/frequency details.

### Future Extensibility

Controlled substances, refill protocols, online pharmacy.

## Prescription

### Purpose

Represent authorized medication fulfillment.

### Definition

A Prescription is an authorized medication record for dispensing, fulfillment, or external pharmacy use.

### Ownership

Owned by prescribing Veterinarian.

### Responsibilities

- Preserve medication authorization.
- Support fulfillment and refill eligibility.
- Communicate instructions.

### Lifecycle

Drafted, approved, active, fulfilled, refilled, expired, cancelled, or denied.

### Relationships

- Originates from Medication Order.
- Relates to Patient, Client, Inventory, Invoice, Communication, Reminder, Follow-Up, and External Integration where fulfillment is external.

### Invariants

- Prescription authority must be clear.

### Audit Considerations

Audit approval, changes, refills, denial, expiration, and fulfillment.

### AI Interaction Rules

AI may summarize refill context; veterinarian decides.

### Migration Considerations

Legacy prescriptions may lack current eligibility context.

### Future Extensibility

External pharmacy integrations, refill automation, compliance reporting.

## Medical Record

### Purpose

Represent durable clinical history.

### Definition

The Medical Record is the authoritative clinical history for a Patient.

### Ownership

Clinically owned by Veterinarians; maintained through the care team.

### Responsibilities

- Preserve history, findings, decisions, treatment, communication, diagnostics, and attachments relevant to care.

### Lifecycle

Created with Patient; grows over time; corrected through auditable amendment; retained according to policy.

### Relationships

- Contains SOAP Notes, Problems, Diagnoses, Allergies, Vaccinations, Prescriptions, Visit records, Attachments, and relevant Communications.

### Invariants

- The medical record must not silently lose or overwrite clinical history.

### Audit Considerations

Audit amendments, deletions where allowed, signoff, and AI-generated accepted content.

### AI Interaction Rules

AI may summarize and draft but must preserve source visibility and review.

### Migration Considerations

Migrated medical records may be incomplete, scanned, free-text, or ambiguously structured.

### Future Extensibility

Problem-oriented records, specialty modules, longitudinal trends.

## SOAP Note

### Purpose

Represent structured clinical documentation for a visit or clinical interaction.

### Definition

A SOAP Note records subjective, objective, assessment, and plan information.

### Ownership

Owned by Veterinarian, with technician contributions where appropriate.

### Responsibilities

- Preserve clinical reasoning and visit documentation.
- Support continuity and follow-up.

### Lifecycle

Drafted, updated, reviewed, signed, amended, archived.

### Relationships

- Belongs to Medical Record, Patient, and often Visit.
- Relates to Clinical Decisions, Diagnoses, Orders, Treatments, and Follow-Ups.

### Invariants

- Draft and signed states must be distinguishable.

### Audit Considerations

Audit signoff, amendment, late changes, and AI-generated accepted text.

### AI Interaction Rules

AI may draft from visit context; clinician reviews and owns final note.

### Migration Considerations

Legacy notes may not follow SOAP structure.

### Future Extensibility

Specialty note types, templates, dictation, structured problem linking.

## Problem

### Purpose

Represent an ongoing or relevant patient concern.

### Definition

A Problem is a clinical issue, condition, symptom, or concern tracked over time.

### Ownership

Clinically owned by Veterinarian.

### Responsibilities

- Support longitudinal care.
- Connect visits, diagnostics, decisions, treatments, and follow-up.

### Lifecycle

Identified, active, monitored, resolved, inactive, or superseded.

### Relationships

- Belongs to Patient and Medical Record.
- May relate to Diagnoses, Clinical Decisions, Orders, Treatments, and SOAP Notes.

### Invariants

- Problems may exist without confirmed diagnosis.

### Audit Considerations

Audit activation, resolution, and clinically material edits.

### AI Interaction Rules

AI may suggest possible problem linkage; clinician decides.

### Migration Considerations

Legacy problems may be hidden in notes or inconsistent labels.

### Future Extensibility

Problem-oriented medical record, chronic care plans.

## Diagnosis

### Purpose

Represent a clinical conclusion.

### Definition

A Diagnosis is an identified condition or disease documented by clinical authority.

### Ownership

Owned by Veterinarian.

### Responsibilities

- Preserve clinical conclusions.
- Support plans, follow-up, reporting, and history.

### Lifecycle

Suspected, confirmed, active, resolved, ruled out, or superseded.

### Relationships

- Belongs to Patient and Medical Record.
- Relates to Clinical Decision, Problem, SOAP Note, Diagnostic Order, Treatment, and Follow-Up.

### Invariants

- Diagnosis must remain distinct from symptoms, problems, and AI suggestions.

### Audit Considerations

Audit diagnosis creation, status changes, and removal.

### AI Interaction Rules

AI may suggest documentation review areas but must not diagnose.

### Migration Considerations

Legacy diagnosis may be free text, coded, invoice-derived, or absent.

### Future Extensibility

Coding systems, chronic disease management, population health.

## Allergy

### Purpose

Represent known adverse sensitivity or allergy.

### Definition

An Allergy is a clinically relevant adverse reaction or sensitivity associated with a Patient.

### Ownership

Clinically owned by care team; veterinarian governs material changes.

### Responsibilities

- Inform medication, treatment, and safety decisions.

### Lifecycle

Reported, reviewed, active, inactive, corrected, or removed with audit.

### Relationships

- Belongs to Patient and Medical Record.
- Relates to Medication Orders, Prescriptions, Treatments, and Visit alerts.

### Invariants

- Allergy visibility must be preserved in medication and treatment contexts.

### Audit Considerations

Audit creation, changes, and removal.

### AI Interaction Rules

AI may flag possible allergy references in notes; humans verify.

### Migration Considerations

Legacy allergy data may be absent, free-text, or embedded in notes.

### Future Extensibility

Severity, reaction type, verification status.

## Vaccination

### Purpose

Represent immunization history and requirements.

### Definition

A Vaccination is a recorded vaccine event, status, or requirement.

### Ownership

Clinically owned by care team.

### Responsibilities

- Support preventive care, reminders, compliance, and medical history.

### Lifecycle

Recommended, administered, declined, due, overdue, expired, or historical.

### Relationships

- Belongs to Patient and Medical Record.
- Relates to Reminder, Follow-Up, Visit, Invoice, and Certificate/Attachment where applicable.

### Invariants

- Administered vaccination and due reminder are distinct concepts.

### Audit Considerations

Audit administration, corrections, lot-related data where relevant, and due-date changes.

### AI Interaction Rules

AI may identify likely vaccine history from migrated records; humans verify uncertain data.

### Migration Considerations

Legacy vaccination history may be structured, note-based, duplicated, or missing due dates.

### Future Extensibility

Certificates, jurisdiction requirements, inventory lot tracking.

## Estimate

### Purpose

Represent proposed expected cost.

### Definition

An Estimate is a financial proposal for recommended, optional, or planned work.

### Ownership

Prepared by authorized staff; clinically influenced by Veterinarian plan; financially governed by clinic policy.

### Responsibilities

- Translate care recommendations into expected cost.
- Support approval, decline, partial approval, and plan revision.

### Lifecycle

Drafted, presented, approved, partially approved, declined, revised, expired, or converted to invoice.

### Relationships

- Belongs to Visit, Client, Patient.
- Relates to Clinical Decision, Orders, Treatments, Procedures, Consent, Invoice, and Communication.

### Invariants

- Estimate is not an invoice.
- Estimate state should reflect client decision clearly.

### Audit Considerations

Audit presentation, approval, partial approval, decline, and revisions.

### AI Interaction Rules

AI may draft explanations or flag plan/estimate mismatch; humans own pricing and presentation.

### Migration Considerations

Legacy estimates may be absent, expired, or not linked to care plans.

### Future Extensibility

Ranges, financing, bundles, multi-option plans.

## Invoice

### Purpose

Represent actual financial charges.

### Definition

An Invoice is a financial record of services, products, taxes, adjustments, payments, and balance.

### Ownership

Owned by clinic financial operations.

### Responsibilities

- Record charges.
- Support payment, accounting, reporting, and client trust.

### Lifecycle

Drafted, open, finalized, partially paid, paid, adjusted, voided, written off, or archived.

### Relationships

- Belongs to Client and often Visit/Patient.
- Relates to Estimate, Payment, Treatment, Procedure, Medication, Inventory, and Audit Events.

### Invariants

- Invoice should not imply clinical completion unless linked events support it.

### Audit Considerations

Audit financial changes, adjustments, voids, write-offs, and payment application.

### AI Interaction Rules

AI may explain estimate-to-invoice differences; humans own financial decisions.

### Migration Considerations

Legacy invoice history may not map cleanly to modern product/service structure.

### Future Extensibility

Payment plans, insurance, memberships, accounting integrations.

## Payment

### Purpose

Represent money movement or payment commitment.

### Definition

A Payment is a financial transaction, deposit, credit application, refund, or payment-plan activity.

### Ownership

Owned by clinic financial operations.

### Responsibilities

- Resolve invoices or balances.
- Preserve financial accountability.

### Lifecycle

Initiated, pending, authorized, completed, failed, refunded, reversed, disputed, or reconciled.

### Relationships

- Belongs to Client and Invoice.
- May relate to Visit, Estimate, External Integration, and Audit Event.

### Invariants

- Payment state must be distinguishable from invoice state.

### Audit Considerations

Audit completion, failure, refund, reversal, adjustment, and dispute.

### AI Interaction Rules

AI may summarize payment exceptions but cannot authorize adjustments.

### Migration Considerations

Legacy payments may include credits, balances, deposits, and unclear allocations.

### Future Extensibility

Financing, subscriptions, deposits, insurance, payment links.

## Consent

### Purpose

Represent client authorization or acknowledgment.

### Definition

Consent is a recorded approval, acknowledgment, or refusal for care, risk, cost, communication, or policy.

### Ownership

Owned by the clinic; granted by authorized Client or representative.

### Responsibilities

- Preserve authorization.
- Protect clinical, legal, and operational accountability.

### Lifecycle

Requested, pending, granted, declined, revoked, expired, superseded, or archived.

### Relationships

- Belongs to Client, Patient, Visit, Procedure, Estimate, Treatment, Communication, and Attachment.

### Invariants

- Consent must identify what was consented to and by whom.

### Audit Considerations

Always audit consent status, content, actor, timestamp, and related work.

### AI Interaction Rules

AI may summarize consent needs but cannot grant consent or infer authority.

### Migration Considerations

Legacy consents may exist as attachments or notes without structured meaning.

### Future Extensibility

Digital signatures, telemedicine consent, procedure-specific consent.

## Inventory

### Purpose

Represent clinic-managed items that affect care, dispensing, ordering, billing, or operational readiness.

### Definition

Inventory is the set of medications, supplies, products, and controlled items a Location tracks for availability, use, ordering, or sale.

### Ownership

Owned by Location operations and practice management; clinical use is governed by authorized staff.

### Responsibilities

- Preserve item identity and availability.
- Support medication, treatment, procedure, invoice, and ordering workflows.
- Surface shortages and exceptions that affect care.

### Lifecycle

Created, active, counted, adjusted, used, ordered, received, expired, inactive, archived.

### Relationships

- Belongs to Location.
- Relates to Medication Orders, Prescriptions, Treatments, Procedures, Invoices, Payments, Resources, External Integrations, Events, Audit Events, and Migration Records.

### Invariants

- Inventory availability should not be confused with clinical authorization.
- Inventory quantity should not be treated as reliable when the source is uncertain.

### Audit Considerations

Audit controlled items, adjustments, expirations, high-value items, and changes that affect care or billing.

### AI Interaction Rules

AI may flag usage patterns, likely duplicates, stockout risk, or cleanup needs. Humans own ordering, adjustment, and controlled-item decisions.

### Migration Considerations

Legacy inventory often includes duplicates, inactive items, inconsistent units, stale quantities, and pricing mismatches.

### Future Extensibility

Vendor ordering, controlled substance workflows, usage forecasting, lot tracking, expiration management.

## Communication

### Purpose

Represent message content exchanged between people or parties.

### Definition

Communication is a conversation, message, call note, email, SMS, portal message, or other content exchanged around care, operations, or client relationship.

### Ownership

Owned by the clinic relationship; context depends on patient, client, visit, or operational topic.

### Responsibilities

- Preserve what was said.
- Connect communication to care, approval, follow-up, or operational action.

### Lifecycle

Created, sent, received, read, responded, linked, resolved, archived.

### Relationships

- Relates to Client, Patient, Visit, Follow-Up, Consent, Estimate, Invoice, Task, and Attachment.

### Invariants

- Communication that affects care should not be detached from patient context when that context is known.

### Audit Considerations

Audit clinically relevant, approval-related, financial, consent, and instruction communications.

### AI Interaction Rules

AI may draft, summarize, classify, and extract tasks; humans own sent content where policy requires.

### Migration Considerations

Legacy communication may be split across systems and partially linked.

### Future Extensibility

Multi-channel threads, client portal, call transcripts, automated updates.

## Notification

### Purpose

Represent a signal that awareness or action may be needed.

### Definition

A Notification is an alert, prompt, or signal delivered to a user, role, client, or queue.

### Ownership

Owned by the workflow or object that creates the need for awareness.

### Responsibilities

- Surface timely information.
- Avoid unnecessary interruption.
- Point to source context.

### Lifecycle

Created, delivered, seen, acted on, dismissed, expired, escalated.

### Relationships

- May point to Task, Communication, Visit, Exception, Diagnostic Result, Payment, or Follow-Up.

### Invariants

- Notifications should not become the source of truth.
- Notifications should point to the underlying object.

### Audit Considerations

Audit high-risk notifications, escalations, dismissals, and delivery failures where consequential.

### AI Interaction Rules

AI may prioritize or summarize notifications but should not create noisy interruption.

### Migration Considerations

Legacy notifications usually do not migrate as active objects unless they represent unresolved work.

### Future Extensibility

Notification policies, role-based routing, escalation rules.

## Follow-Up

### Purpose

Represent an obligation to close a loop after care or communication.

### Definition

A Follow-Up is a patient, client, clinical, or operational action that must happen after an event, visit, result, or request.

### Ownership

Owned by assigned User, Role, Queue, or clinical owner.

### Responsibilities

- Ensure care continuity.
- Prevent unresolved outcomes from disappearing.

### Lifecycle

Created, scheduled, assigned, due, completed, missed, escalated, cancelled.

### Relationships

- Relates to Patient, Client, Visit, Diagnostic Order, Communication, Reminder, Task, and Medical Record.

### Invariants

- Follow-up should have owner, timing, and completion condition.

### Audit Considerations

Audit creation, assignment, completion, missed status, and escalation.

### AI Interaction Rules

AI may suggest follow-ups from plans, results, or communication; humans/accepted automation activate.

### Migration Considerations

Legacy callbacks and reminders may map to follow-up if they close a care loop.

### Future Extensibility

Care pathways, chronic condition monitoring, automated check-ins.

## Reminder

### Purpose

Represent a future prompt.

### Definition

A Reminder is a scheduled prompt for awareness, prevention, renewal, or action.

### Ownership

Owned by clinic policy, patient care plan, or user-created scheduling.

### Responsibilities

- Prompt future action.
- Support preventive care and operational consistency.

### Lifecycle

Created, scheduled, due, sent, completed, snoozed, cancelled, expired.

### Relationships

- Relates to Patient, Client, Vaccination, Follow-Up, Appointment, Communication, or Task.

### Invariants

- Reminder due status is not the same as follow-up completion.

### Audit Considerations

Audit clinically relevant reminder creation, cancellation, and due-date changes.

### AI Interaction Rules

AI may suggest reminders based on plans or history; policy governs activation.

### Migration Considerations

Legacy reminders may be numerous, stale, duplicated, or generated by old protocols.

### Future Extensibility

Preventive care campaigns, smart recall, client preferences.

## Attachment

### Purpose

Represent a file or document connected to clinic context.

### Definition

An Attachment is a file, image, scan, report, consent, document, or media item.

### Ownership

Owned by the object it supports and the clinic record-retention policy.

### Responsibilities

- Preserve supporting evidence and documents.
- Maintain context and source.

### Lifecycle

Uploaded, imported, classified, linked, reviewed, archived, corrected, or deleted where policy allows.

### Relationships

- May relate to Patient, Client, Visit, Medical Record, Diagnostic Result, Consent, Invoice, Communication, Migration Record.

### Invariants

- Attachments need context or uncertainty labels.

### Audit Considerations

Audit uploads, deletions, reclassification, and clinically relevant attachment changes.

### AI Interaction Rules

AI may classify or extract from attachments; extracted content must preserve source reference.

### Migration Considerations

Legacy attachments are often large, duplicated, poorly named, and inconsistently linked.

### Future Extensibility

Imaging, structured document extraction, consent packages.

## Event

### Purpose

Represent meaningful occurrence.

### Definition

An Event records that something happened in the business workflow.

### Ownership

Owned by the object or workflow that produced it.

### Responsibilities

- Preserve sequence and operational memory.
- Support state transitions.

### Lifecycle

Created, linked, enriched, archived.

### Relationships

- May relate to any domain object.
- Parent concept for Audit Event and Integration Event.

### Invariants

- Events should be attributable to human, system, AI, integration, or migration source.

### Audit Considerations

Not every event is audit-sensitive, but events may support audits.

### AI Interaction Rules

AI may summarize events but should not fabricate event history.

### Migration Considerations

Legacy history may be reconstructed into events only when source meaning is clear.

### Future Extensibility

Timeline, analytics, workflow state machine, operational intelligence.

## Audit Event

### Purpose

Represent accountable sensitive change.

### Definition

An Audit Event is an Event that preserves who changed what, when, why where available, and under what authority.

### Ownership

Owned by compliance, clinical accountability, financial accountability, or operational governance.

### Responsibilities

- Preserve accountability.
- Support review, compliance, dispute resolution, and trust.

### Lifecycle

Created and retained; not casually edited or deleted.

### Relationships

- Relates to User, Patient, Client, Visit, Medical Record, Estimate, Invoice, Payment, Consent, AI Suggestion, and Migration Record.

### Invariants

- Audit events must remain durable and attributable.

### Audit Considerations

This object is itself audit infrastructure.

### AI Interaction Rules

AI may help explain audit history but must not alter it.

### Migration Considerations

Legacy audit trails may be unavailable or incomplete.

### Future Extensibility

Compliance exports, legal review, permission audits.

## AI Suggestion

### Purpose

Represent AI-generated assistance before human acceptance.

### Definition

An AI Suggestion is a draft, classification, summary, mapping, alert, or recommendation generated by AI.

### Ownership

Owned by the AI system until accepted, rejected, edited, or dismissed by a human or governed automation.

### Responsibilities

- Preserve AI provenance.
- Keep suggestions distinct from decisions.
- Support review and learning.

### Lifecycle

Generated, shown, accepted, edited, rejected, dismissed, expired, audited where accepted into sensitive record.

### Relationships

- May relate to Visit, Medical Record, Communication, Migration Record, Task, Follow-Up, Attachment, or Event.

### Invariants

- AI Suggestion is not a human decision.
- Accepted AI content must show human ownership where required.

### Audit Considerations

Audit accepted AI suggestions that affect clinical, financial, consent, identity, migration, or record content.

### AI Interaction Rules

This object governs AI interaction.

### Migration Considerations

AI suggestions may help mapping but must preserve source data and confidence.

### Future Extensibility

Feedback loops, evaluation, model governance, confidence tracking.

## Migration Record

### Purpose

Represent source lineage and migration status.

### Definition

A Migration Record preserves how data from a legacy or external system maps into Sparki.

### Ownership

Owned by migration product and implementation team; reviewed with clinic stakeholders.

### Responsibilities

- Preserve source identity.
- Track mapping confidence.
- Expose uncertainty.
- Support verification and correction.

### Lifecycle

Created during migration, mapped, validated, reviewed, corrected, accepted, archived.

### Relationships

- May relate to any migrated domain object.
- Relates to External Integration, Integration Event, Attachment, Audit Event, and AI Suggestion.

### Invariants

- Migrated data must remain distinguishable from native Sparki data where it matters.

### Audit Considerations

Audit mapping changes, manual corrections, acceptance, and rejected mappings.

### AI Interaction Rules

AI may suggest mappings and classifications; humans verify high-risk mappings.

### Migration Considerations

This object is central to migration.

### Future Extensibility

Source connectors, migration confidence scoring, customer verification portals.

## External Integration

### Purpose

Represent an external system connected to Sparki.

### Definition

An External Integration is a third-party or source system that exchanges data, events, or actions with Sparki.

### Ownership

Owned by Organization/Location administration and integration governance.

### Responsibilities

- Connect external capabilities.
- Preserve source attribution.
- Avoid silent corruption of Sparki state.

### Lifecycle

Configured, authorized, active, degraded, disconnected, retired.

### Relationships

- Produces Integration Events.
- Relates to labs, payments, messaging, pharmacy, inventory, migration, and scheduling.

### Invariants

- Integrations should not silently override human-owned decisions.

### Audit Considerations

Audit connection changes, permission scopes, failed syncs, and consequential updates.

### AI Interaction Rules

AI may summarize integration issues but should not authorize new integrations.

### Migration Considerations

Legacy systems may act as source integrations during migration.

### Future Extensibility

Connector marketplace, webhooks, partner APIs, monitoring.

## Integration Event

### Purpose

Represent an occurrence from an external system.

### Definition

An Integration Event is an Event generated by an External Integration.

### Ownership

Owned by the integration source and Sparki validation process.

### Responsibilities

- Preserve external source activity.
- Trigger review or domain updates where appropriate.

### Lifecycle

Received, validated, mapped, applied, rejected, retried, archived.

### Relationships

- Relates to External Integration and affected domain objects.

### Invariants

- Integration events require source attribution and processing status.

### Audit Considerations

Audit applied events that affect care, money, identity, consent, or records.

### AI Interaction Rules

AI may classify or summarize integration events; system/human rules apply updates.

### Migration Considerations

Migration imports may produce integration-like events but should preserve migration lineage.

### Future Extensibility

Retry policies, partner observability, event replay.

## Queue

### Purpose

Represent organized pending work.

### Definition

A Queue is a collection of tasks, exceptions, messages, results, or work items awaiting action by a role, team, or process.

### Ownership

Owned by Location, Role, or workflow.

### Responsibilities

- Make pending work visible.
- Route work to accountable owners.
- Support prioritization.

### Lifecycle

Created, populated, worked, cleared, escalated, archived.

### Relationships

- Contains Tasks, Exceptions, Communications, Follow-Ups, Diagnostic Results, or Work Items.

### Invariants

- Queue membership should not replace ownership when ownership is required.

### Audit Considerations

Audit escalations, sensitive removals, and ownership-affecting queue changes.

### AI Interaction Rules

AI may prioritize or summarize queue items but should not hide low-confidence work.

### Migration Considerations

Legacy queues may map poorly; unresolved work should be extracted carefully.

### Future Extensibility

Role queues, smart routing, workload balancing.

## Exception

### Purpose

Represent abnormal, blocked, risky, or unresolved state.

### Definition

An Exception is a domain object that requires attention because normal workflow cannot proceed safely, clearly, or completely.

### Ownership

Owned by assigned User, Role, Queue, or manager depending on severity.

### Responsibilities

- Make problems explicit.
- Preserve owner, severity, next action, and resolution.

### Lifecycle

Created, assigned, acknowledged, blocked, resolved, escalated, archived.

### Relationships

- May relate to Visit, Patient, Client, Payment, Consent, Migration Record, Integration Event, Task, or Queue.

### Invariants

- Exceptions should not hide in notes.
- Exceptions should have owner and status.

### Audit Considerations

Audit creation, severity changes, escalation, resolution, and clinically/financially sensitive exceptions.

### AI Interaction Rules

AI may detect or summarize exceptions; humans own resolution for sensitive cases.

### Migration Considerations

Migration should create exceptions for uncertain or blocked mappings.

### Future Extensibility

Exception taxonomy, SLA tracking, operational dashboards.

## Resource

### Purpose

Represent a constrained clinic asset needed for work.

### Definition

A Resource is a room, veterinarian slot, equipment, vehicle, surgical suite, or other capacity-limited asset.

### Ownership

Owned by Location operations.

### Responsibilities

- Support scheduling and capacity planning.
- Prevent resource conflicts.

### Lifecycle

Created, active, reserved, unavailable, retired.

### Relationships

- Belongs to Location.
- Relates to Schedule, Calendar, Appointment, Visit, Procedure, and Queue.

### Invariants

- Resource availability should reflect operational reality.

### Audit Considerations

Audit availability changes and schedule-impacting updates.

### AI Interaction Rules

AI may suggest resource allocation; humans or scheduling rules decide.

### Migration Considerations

Legacy systems may not expose resource concepts cleanly.

### Future Extensibility

Equipment booking, surgery suites, boarding spaces, mobile units.

## Schedule

### Purpose

Represent planned availability and operating time.

### Definition

A Schedule defines availability for users, resources, services, or locations.

### Ownership

Owned by Location operations and practice management.

### Responsibilities

- Coordinate capacity.
- Support appointment creation.
- Reveal constraints.

### Lifecycle

Created, published, modified, blocked, expired, archived.

### Relationships

- Belongs to Location.
- Uses Calendar.
- Relates to Users, Resources, Appointments, and Visit Intents.

### Invariants

- Schedule should distinguish availability from actual visit state.

### Audit Considerations

Audit published schedule changes, veterinarian availability changes, and capacity-affecting blocks.

### AI Interaction Rules

AI may identify schedule risk; humans own policy and final schedule decisions.

### Migration Considerations

Legacy schedules may include future appointments without clean availability rules.

### Future Extensibility

Templates, veterinarian preferences, demand forecasting, waitlists.

## Calendar

### Purpose

Represent time-based view and organization.

### Definition

A Calendar is the time-organized representation of schedules, appointments, blocks, and capacity.

### Ownership

Owned by Location operations.

### Responsibilities

- Present time commitments.
- Support coordination across staff and resources.

### Lifecycle

Created, configured, used, adjusted, archived.

### Relationships

- Contains Appointments, schedule blocks, resource reservations, and operational time markers.

### Invariants

- Calendar view should not be treated as the source of all workflow truth.

### Audit Considerations

Audit changes that alter appointments, resource allocation, or published availability.

### AI Interaction Rules

AI may summarize calendar risk or suggest openings; humans decide scheduling policy.

### Migration Considerations

Legacy calendar data may preserve commitments but not full scheduling logic.

### Future Extensibility

Multi-location calendars, external calendar sync, capacity visualization.

## Domain Governance

### Core Naming

Future documents should use these object names unless a new accepted ADR changes the domain language.

### Introducing New Objects

New objects require:

- Purpose
- Definition
- Ownership
- Lifecycle
- Relationships
- Invariants
- Audit considerations
- Migration considerations

### Changing Existing Objects

Changes to core definitions should be made through ADRs when they affect product architecture, migration, AI, permissions, auditability, or engineering contracts.

### Handling Legacy Terms

Legacy terms should map into core Sparki language. Do not let source-system vocabulary redefine Sparki's domain model without review.

## Open Questions

- Should `Encounter` ever become a first-class Sparki object, or remain an external/legacy synonym?
- Which domain objects require v1 lifecycle state machines?
- Which objects require customer-visible history?
- Which objects require legal retention policies by market?
- Which migrated objects should remain read-only historical context?
- Which objects must support multi-location ownership on day one?
- Which AI suggestions require formal audit events when accepted?

## Notes

This document should be referenced by future specs, ADRs, migration plans, AI prompts, and engineering architecture.

Do not use this document as a schema. Use it to preserve business meaning.

## Related Documents

### References

- [Product Constitution](./00-product-constitution.md)
- [Sparki Thesis](./03-sparki-thesis.md)
- [Veterinary Mental Models](./04-veterinary-mental-models.md)
- [Clinic Workflow Atlas](./05-clinic-workflow-atlas.md)
- [Migration Strategy](./06-migration-strategy.md)
- [Visit Engine v1](./07-visit-engine-v1.md)
- [Information Architecture](../specs/07-information-architecture.md)
- [Technical Architecture](./11-technical-architecture.md)

### Depends On

- [Product Constitution](./00-product-constitution.md)
- [Visit Engine v1](./07-visit-engine-v1.md)
- [Migration Strategy](./06-migration-strategy.md)

### Referenced By

- TODO: Add links as ADRs, specs, migration maps, AI prompts, and engineering contracts depend on this core model.

### Future Work

- TODO: Create ADRs for core object ownership, event/audit distinction, and migrated-data semantics.
- TODO: Create migration mapping tables from source systems into core objects.
- TODO: Create lifecycle diagrams for Visit, Work Item, Order, Estimate, Invoice, Communication, and Follow-Up.
- TODO: Validate terminology with veterinary operators and implementation partners.
