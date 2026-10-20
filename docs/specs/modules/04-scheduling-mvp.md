# 04 Scheduling MVP

## Constitutional Authority

This module spec inherits from the [Product Constitution](../../blueprint/00-product-constitution.md). If this spec conflicts with the Constitution, the Constitution governs.

## Purpose

Define the first buildable Scheduling module for Sparki.

Scheduling is the clinic's demand intake system. It captures why care is needed, reserves time and resources, prepares the team, and becomes the main upstream source for Visit Lifecycle.

This spec defines behavior, not screens. It should let engineering plan appointment creation, rescheduling, cancellation, confirmation, readiness checks, day/provider/location views, Visit creation, audit history, migration provenance, and basic blockers without additional product clarification.

The MVP should help the clinic answer:

- Who is expected today?
- Why is the patient coming in?
- Is the appointment ready?
- What still needs to happen before arrival?
- Who or what is reserved?
- Can this appointment create a Visit?

## Primary Users

### Receptionist

Owns phone-call-driven booking, appointment creation, client confirmation, rescheduling, cancellation, no-show marking, and arrival handoff.

### Technician

Views schedule context, preparation needs, appointment type, patient alerts, and readiness blockers before intake.

### Veterinarian

Views appointment demand, assigned appointments, visit reasons, preparation context, and schedule risk.

### Practice Manager

Owns schedule policy, capacity exceptions, resource conflicts, appointment type rules, migrated future appointment review, and operational escalation.

### AI Assistant

May suggest appointment type, readiness gaps, likely duration, patient context, or schedule risk. It does not make final scheduling decisions.

### External Integration

May provide imported appointments, online booking requests, communication confirmations, phone context, or calendar data. Integration content must preserve source.

## Core User Problems

- Scheduling happens under pressure, often while a client is on the phone.
- Search-heavy booking slows receptionists down.
- Appointment type selection depends too much on staff memory.
- Clinics need patient context while booking without losing momentum.
- Future appointments from legacy systems must be trusted after migration.
- Appointment status and Visit status are often blurred.
- Readiness issues are discovered too late.
- Reschedules and cancellations can lose appointment history.
- Schedule views can become the product's center of gravity instead of the patient.

## MVP Scope

The MVP Scheduling module includes:

- Create appointment.
- Reschedule appointment.
- Cancel appointment.
- Mark no-show.
- Confirm appointment.
- Check appointment readiness.
- Link appointment to Patient and Client.
- Create Visit from appointment.
- Preserve appointment history.
- Show schedule by day, provider, and Location.
- Reserve basic provider/resource/time capacity.
- Capture appointment type, reason, source, and preparation needs.
- Show basic blockers and exceptions.
- Preserve source and confidence for migrated future appointments.

## Explicit Non-Goals

This MVP does not include:

- Full online booking.
- Full reminders or notification architecture.
- Full waitlist.
- Full recurring appointment rules.
- Full multi-location capacity optimization.
- Full resource management platform.
- Full provider preference engine.
- Full client portal scheduling.
- Full telemedicine booking workflow.
- Full external calendar sync.
- Full schedule analytics.
- Custom appointment type builder.
- Automated schedule optimization.

The Scheduling module may link to future booking, communication, reminder, and Visit modules. It should not own their full behavior in MVP.

## Scheduling Lifecycle

Scheduling begins when the clinic receives demand for care, service, follow-up, procedure, or consultation.

Demand may come from:

- Phone call.
- In-clinic request.
- Follow-Up.
- Reminder.
- Client Communication.
- Veterinarian recommendation.
- External Integration.
- Migrated future appointment.

High-level lifecycle:

1. Demand is captured as a Visit Intent or appointment request.
2. Receptionist links or creates Patient and Client context.
3. Appointment type, reason, timing, Location, provider/resource, and readiness needs are captured.
4. Appointment is created.
5. Appointment is confirmed, prepared, rescheduled, cancelled, marked no-show, or moved to arrival.
6. Appointment creates or links to a Visit when the patient arrives or the clinic starts the visit workflow.
7. Appointment history remains available after Visit creation.

## Appointment Ownership Model

### Operational Ownership

Appointments are operationally owned by reception and scheduling staff.

Reception owns:

- Creation.
- Time changes.
- Confirmation.
- Cancellation.
- No-show marking.
- Arrival handoff.
- Client-facing scheduling communication.

### Clinical Context Ownership

Veterinarians own clinical decisions that influence scheduling, such as urgency, required exam type, procedure recommendation, or medical constraints.

Scheduling staff may record clinical context supplied by the care team but should not invent clinical urgency.

### Capacity Ownership

Practice Managers own schedule policy, appointment type rules, capacity exceptions, resource conflicts, and provider availability.

### AI Ownership

AI owns nothing in Scheduling.

AI may suggest appointment type, likely duration, readiness gaps, or risk. A permitted user decides.

### External Source Ownership

External Integrations and migration may provide appointment data, but Sparki must preserve source and confidence. Imported appointments are not fully trusted until verified where uncertainty matters.

## Required Appointment Types

MVP should support a small, configurable starter set without building a full type-builder.

Required appointment types:

- Wellness / Preventive Care.
- Sick Visit.
- Recheck.
- Technician Appointment.
- Vaccination.
- Surgery / Procedure.
- Drop-Off.
- Emergency / Urgent.
- Telemedicine.
- Euthanasia.
- Boarding / Non-medical Service placeholder where clinics need it.

Appointment type should support:

- Expected duration.
- Expected provider or role.
- Whether veterinarian is required.
- Whether technician-only is allowed.
- Whether pre-visit requirements may apply.
- Whether estimate/consent may be expected.
- Whether appointment can create a Visit.

MVP should allow type selection and basic metadata. It should not require a full appointment type administration module.

## Required Appointment Data

### Identity And Context

- Appointment ID.
- Patient or provisional patient.
- Client or provisional client.
- Location.
- Appointment type.
- Visit reason.
- Source: phone, in-clinic, follow-up, reminder, external integration, migration, other.
- Created by.
- Created timestamp.

### Timing

- Appointment date.
- Start time.
- Expected duration.
- Time zone where relevant.
- Original appointment time when rescheduled.
- Reschedule history.

### Ownership And Capacity

- Assigned provider where applicable.
- Assigned role where provider is not known.
- Resource where applicable.
- Schedule or Calendar reference.
- Capacity exception where relevant.

### Readiness

- Confirmation status.
- Pre-visit requirements.
- Missing information.
- Consent requirement where known.
- Records request where known.
- Deposit/payment expectation where known.
- Client communication preference.
- Appointment blockers.

### Patient Context

- Patient alerts relevant to scheduling.
- Species.
- Visit constraints or handling notes where relevant.
- Recent or upcoming appointment context where relevant.
- Migrated source/confidence where applicable.

### Visit Linkage

- Visit Intent reference where applicable.
- Visit reference once created.
- Arrival status.
- No-show/cancel/reschedule reason where applicable.

## Appointment State Model

MVP Appointment states:

- `Draft`
- `Scheduled`
- `Pre-Visit Pending`
- `Confirmed`
- `Arrived`
- `Visit Created`
- `Completed`
- `Rescheduled`
- `Cancelled`
- `No-Show`

State meaning:

- `Draft`: appointment is being created but not yet committed.
- `Scheduled`: appointment is committed to the schedule.
- `Pre-Visit Pending`: appointment is scheduled but missing preparation.
- `Confirmed`: client or clinic has confirmed the appointment is expected.
- `Arrived`: patient/client has arrived or virtual visit has started, but Visit may not yet exist.
- `Visit Created`: appointment has created or linked to an active Visit.
- `Completed`: appointment obligation is fulfilled by Visit or service completion.
- `Rescheduled`: appointment was moved to a new appointment or new time.
- `Cancelled`: appointment will not happen.
- `No-Show`: patient/client did not arrive according to clinic policy.

Appointment State is separate from Visit State.

Once a Visit exists, Visit Lifecycle owns visit progress. Scheduling should not keep its own duplicate version of Visit status.

## Valid State Transitions

### Creation And Preparation

- `Draft -> Scheduled`
- `Draft -> Cancelled`
- `Scheduled -> Pre-Visit Pending`
- `Scheduled -> Confirmed`
- `Scheduled -> Arrived`
- `Scheduled -> Rescheduled`
- `Scheduled -> Cancelled`
- `Scheduled -> No-Show`
- `Pre-Visit Pending -> Confirmed`
- `Pre-Visit Pending -> Arrived`
- `Pre-Visit Pending -> Rescheduled`
- `Pre-Visit Pending -> Cancelled`

### Confirmation And Arrival

- `Confirmed -> Arrived`
- `Confirmed -> Rescheduled`
- `Confirmed -> Cancelled`
- `Confirmed -> No-Show`
- `Arrived -> Visit Created`
- `Arrived -> Cancelled`
- `Arrived -> No-Show`

### Visit Linkage And Completion

- `Visit Created -> Completed`
- `Visit Created -> Cancelled`
- `Visit Created -> Rescheduled`

### Terminal States

The following states do not normally transition further:

- `Completed`
- `Rescheduled`
- `Cancelled`
- `No-Show`

Corrections to terminal states require audited amendment. Do not silently rewrite history.

## Business Rules

- An Appointment is planned time; it is not the Visit.
- A Visit may be created from an Appointment.
- An Appointment can link to one active Visit in MVP.
- A Patient may have multiple future Appointments.
- Appointment history must be preserved after reschedule, cancellation, no-show, or Visit creation.
- Rescheduling should preserve the original appointment reference or history.
- Cancelling should preserve cancellation reason where available.
- No-show marking should preserve actor, timestamp, and policy context where available.
- Confirmation should preserve source: phone, SMS, email, in-person, External Integration, or manual.
- Appointment readiness should reflect missing preparation, not create new Visit States.
- Readiness blockers that need ownership should become Work Items or Exceptions.
- Migrated future appointments must show source and confidence where uncertainty matters.
- Scheduling should not silently overwrite Visit Lifecycle state.
- Provider/resource conflicts should be visible before appointment creation when possible.
- Appointment creation should be possible with provisional Patient or Client when phone-call reality requires it, but readiness should reflect missing identity.

## Permission Rules

### Receptionist

- Can create, reschedule, cancel, confirm, mark no-show, and mark arrived where permitted.
- Can link Patient and Client.
- Can record phone-call booking context.
- Can create Visit from appointment where policy allows.
- Cannot create clinical urgency, diagnosis, or Clinical Decision.

### Technician

- Can view schedule context and readiness.
- Can update preparation needs or clinical handoff context where permitted.
- Can create or update Work Items tied to appointment readiness where permitted.
- Cannot change provider capacity policy unless delegated.

### Veterinarian

- Can create, reschedule, confirm, and cancel appointments (founder-approved SPA-44 policy, October 19, 2026).
- Can view assigned schedule and patient context.
- Can request appointment timing, type, urgency, or follow-up where clinically relevant.
- Can update clinical preparation notes where permitted.
- Can manage appointments when needed; routine scheduling ownership remains with front-desk staff. This does not grant scheduler configuration or Admin settings access.

### Practice Manager

- Can manage capacity exceptions, schedule policy, provider availability, conflict resolution, migrated future appointment review, and audit-sensitive corrections.
- Can override operational conflicts where clinic policy allows.

### AI Assistant

- Can suggest appointment type, duration, readiness gaps, and schedule risk.
- Cannot create, confirm, cancel, reschedule, mark no-show, or create Visit without permitted human or trusted system action.
- Cannot infer clinical urgency without review.

### External Integration

- Can create draft requests or source-labeled appointment updates only where trusted.
- Must preserve source attribution.
- Must not overwrite human-owned appointment decisions silently.

## Required API Capabilities

These are module-level capabilities, not endpoint designs.

### Read Capabilities

- Fetch appointment by appointment ID.
- Fetch schedule by day, provider, and Location.
- Fetch appointments for Patient or Client.
- Fetch appointment readiness.
- Fetch valid next appointment state transitions for current user.
- Fetch provider/resource availability for booking context.
- Fetch appointment history.
- Fetch appointment-linked Visit Intent or Visit.
- Fetch migrated source and confidence for future appointments.
- Fetch role-aware permitted scheduling actions.

### Write Capabilities

- Create draft appointment.
- Commit appointment to Scheduled.
- Update appointment time, duration, type, reason, provider, resource, Location, Patient, or Client where permitted.
- Confirm appointment.
- Mark pre-visit pending.
- Reschedule appointment.
- Cancel appointment.
- Mark no-show.
- Mark arrived.
- Create Visit from appointment.
- Link appointment to Patient, Client, Visit Intent, or Visit.
- Create appointment readiness Work Item or Exception where needed.
- Record source/confidence correction for migrated appointment where permitted.
- Amend incorrect terminal appointment state through audited correction.

### Access Capabilities

- Enforce Organization and Location isolation.
- Enforce role capabilities.
- Enforce schedule policy for provider/resource changes.
- Enforce sensitive patient context access.
- Scope AI context to current user permissions.

## Required Database Concepts

This module likely requires persistence or read models for:

- Appointment.
- Appointment State.
- Appointment history.
- Visit Intent reference.
- Visit reference.
- Patient.
- Client.
- Location.
- Schedule.
- Calendar.
- Resource.
- User.
- Role.
- Provider assignment.
- Appointment type.
- Readiness blocker.
- Work Item.
- Exception.
- Communication reference.
- Event.
- Audit Event.
- Migration Record/source label.
- External Integration source.

Recommendation: do not create broad calendar platform infrastructure beyond what Scheduling MVP needs. Calendar and Schedule should support appointment booking and day/provider/location views first.

## Integration Implications

Scheduling naturally touches integrations, but MVP should not design full integration systems.

Future attachment points:

- Phone systems: caller context, booking source, call notes.
- Messaging providers: confirmation status, cancellation requests, client replies.
- Online booking: request intake and appointment candidates.
- External calendars: provider availability or calendar export.
- Client portals: booking requests and pre-visit forms.
- Telemedicine tools: virtual appointment channel and arrival.
- Reminder systems: confirmation and no-show support.

Integration data shown in Scheduling must identify its source and must not silently replace Sparki-owned appointment decisions.

## Migration Implications

Future appointments are operationally critical. Migration failure here directly damages clinic trust.

MVP must support:

- Source labels for migrated appointments.
- Confidence labels for Patient, Client, provider, appointment type, time, duration, Location, and status mapping where uncertain.
- Original legacy appointment identifiers where available.
- Verification status for future appointments.
- Preservation of legacy appointment notes where available.
- Preservation of legacy status such as confirmed, cancelled, no-show, checked-in, completed, or unknown.
- Flagging duplicate or conflicting future appointments.
- Preventing low-confidence migrated appointments from silently creating Visits.

Do not block MVP on full migration review tooling. But future appointments must not hide uncertainty.

## AI Opportunities

AI is optional/future unless explicitly marked required.

### Optional / Future

- Suggest appointment type from call notes or client message.
- Suggest likely duration from reason, patient history, and appointment type.
- Surface recent patient context while booking.
- Identify missing readiness requirements.
- Flag schedule risk or overbooking risk.
- Suggest provider/resource candidates.
- Summarize migrated appointment uncertainty.
- Draft confirmation message.

### Required For MVP

None.

MVP must support fast phone booking without AI.

## UX Principles

These are behavioral review criteria for implementation.

- Do not make search the center of scheduling.
- Appointment creation must stay fast during a phone call.
- Preserve user momentum when linking Patient or Client.
- Keep Patient context available without turning booking into record review.
- Show readiness blockers before the day breaks.
- Never blur Appointment State and Visit State.
- Do not require multiple windows to answer whether an appointment is ready.
- Make reschedule, cancellation, and no-show history visible.
- Show source and confidence for migrated future appointments.
- Prefer simple, predictable appointment types over configuration sprawl.
- Do not require AI for booking.

## Success Metrics

MVP should establish baselines first. Targets should be set after internal testing and early clinic observation.

- Average time to create appointment during a phone call.
- Average clicks to create appointment from known Patient/Client context.
- Average time to reschedule appointment.
- Average time to confirm appointment readiness.
- Percentage of future appointments with Patient and Client linked.
- Percentage of appointments with clear type, reason, time, Location, and owner/resource.
- Percentage of migrated future appointments verified before go-live.
- Number of duplicate or conflicting future appointments discovered after migration.
- Number of appointments that cannot create Visit because required data is missing.
- User confidence that today's schedule is trustworthy.

Metrics should improve scheduling flow and trust. They should not reward overbooking.

## Performance Budgets

These are product speed targets, not fixed implementation requirements.

- Day schedule should load fast enough for front desk use during active calls.
- Appointment creation should acknowledge immediately after required fields are present.
- Patient/client linking should not interrupt booking flow.
- Provider/day switching should feel fast enough for phone scheduling.
- Appointment readiness should update without forcing manual refresh.
- Migrated future appointment labels should not slow the normal schedule.

Suggested planning targets:

- Day schedule usable: under 2 seconds.
- Provider/day switch: under 1 second for typical schedules.
- Appointment create acknowledgement: under 300 milliseconds after submit.
- Appointment update acknowledgement: under 300 milliseconds.
- Readiness refresh after appointment change: under 1 second.
- Create Visit from appointment acknowledgement: under 500 milliseconds after validation.

## Edge Cases

- Caller is new Client with new Patient.
- Existing Client has multiple Patients.
- Patient has duplicate migrated records.
- Appointment is created before Patient identity is complete.
- Client authority is unclear.
- Appointment type is uncertain.
- Provider is not known at booking time.
- Appointment needs technician only but later requires veterinarian.
- Client requests same-day urgent visit.
- Schedule is full but clinic accepts drop-off.
- Appointment is rescheduled multiple times.
- Appointment is cancelled after confirmation.
- Patient arrives early or late.
- Patient arrives for wrong appointment type.
- Appointment is marked no-show incorrectly.
- Migrated future appointment has uncertain provider mapping.
- Migrated appointment duplicates native appointment.
- External Integration sends delayed cancellation or confirmation.
- Appointment has no linked Client after migration.
- Appointment creates Visit, then Visit is cancelled after arrival.
- User lacks permission to see patient context while scheduling.

MVP should handle edge cases by preserving appointment history, showing blockers, and using audited correction for terminal state mistakes.

## Acceptance Criteria

Engineering can consider MVP ready when:

- A permitted user can create an appointment.
- A permitted user can reschedule, cancel, confirm, mark no-show, and mark arrived.
- Appointment state transitions are enforced.
- Appointment State remains separate from Visit State.
- Appointment can link to Patient and Client.
- Appointment can create or link to Visit.
- Schedule can be fetched by day, provider, and Location.
- Appointment readiness can be represented.
- Appointment history is preserved.
- Basic provider/resource conflicts can be represented.
- Role permissions are enforced.
- Business Events are created for appointment lifecycle changes.
- Audit Events are created for sensitive scheduling changes.
- Migrated future appointments show source and confidence where relevant.
- AI is not required for core scheduling workflow.
- Performance budget gaps are known before implementation starts.

## Open Questions

- Which appointment types are enabled for the first pilot clinic?
- Which fields are required to commit an appointment versus keep it as Draft?
- Which schedule conflicts are warnings versus hard blocks in MVP?
- Which users can create Visit from appointment?
- What is the pilot policy for marking no-show?
- Which confirmation sources are supported in MVP: manual only, or message/call integrations too?
- What minimum verification workflow is required for migrated future appointments before go-live?

## Engineering Starting Point

Engineering can start:

- Appointment creation and state model.
- Appointment transition validation.
- Day/provider/Location schedule read capability.
- Patient and Client linkage.
- Reschedule, cancellation, confirmation, no-show, and arrival actions.
- Appointment readiness representation.
- Appointment history.
- Create Visit from appointment.
- Role-aware scheduling action gating.
- Business Event and Audit Event creation for scheduling changes.
- Migration source/confidence display support for future appointments.

Do not start broad calendar, reminder, online booking, or scheduling optimization infrastructure beyond what this module requires.

Scheduling MVP Specification Approved for engineering planning.

## Related Documents

### References

- [Product Constitution](../../blueprint/00-product-constitution.md)
- [Core Domain Model v1](../../blueprint/08-core-domain-model-v1.md)
- [Visit Engine v1](../../blueprint/07-visit-engine-v1.md)
- [Event Architecture v1](../../blueprint/09-event-architecture-v1.md)
- [Work System v1](../../blueprint/10-work-system-v1.md)
- [Permission And Ownership v1](../../blueprint/11-permission-and-ownership-v1.md)
- [Migration Strategy](../../blueprint/06-migration-strategy.md)
- [Patient Workspace MVP](./01-patient-workspace-mvp.md)
- [Visit Lifecycle MVP](./02-visit-lifecycle-mvp.md)

### Depends On

- [Product Constitution](../../blueprint/00-product-constitution.md)
- [Core Domain Model v1](../../blueprint/08-core-domain-model-v1.md)
- [Visit Lifecycle MVP](./02-visit-lifecycle-mvp.md)
- [Event Architecture v1](../../blueprint/09-event-architecture-v1.md)
- [Permission And Ownership v1](../../blueprint/11-permission-and-ownership-v1.md)

### Referenced By

- TODO: Add implementation tickets, ADRs, API notes, and test plans once engineering planning begins.

### Future Work

- TODO: Split follow-on specs for online booking, reminders, waitlist, recurring appointments, schedule templates, provider preferences, external calendar sync, and capacity analytics only when implementation needs them.
