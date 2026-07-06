# 01 Patient Workspace MVP

## Constitutional Authority

This module spec inherits from the [Product Constitution](../../blueprint/00-product-constitution.md). If this spec conflicts with the Constitution, the Constitution governs.

## Purpose

Define the first buildable module of Sparki: the Patient Workspace MVP.

The Patient Workspace is the primary user-facing center of the product. It organizes patient context, current visit state, current work, communication, financial context, files, and key actions around the patient.

The MVP should help a clinic team answer quickly:

- Who is this patient?
- Why are they here or why are we looking at them?
- What is happening now?
- What needs to happen next?
- What has recently happened?
- What should not be missed?

## Primary Users

### Receptionist

Needs identity, appointment/visit status, client communication, checkout readiness, payment context, and follow-up visibility.

### Technician

Needs current visit context, intake state, active work, treatment/medication status, communication notes, and handoff context.

### Veterinarian

Needs relevant patient summary, current visit state, history, open work, diagnostic results, communication, and record status.

### Practice Manager

Needs exceptions, unresolved work, payment or consent blockers, communication risk, and audit-sensitive context.

## Core User Problems

- Patient context is split across schedule, record, billing, communication, files, and staff memory.
- Staff lose time answering basic status questions.
- Visit state is often verbal instead of visible.
- Communication is disconnected from patient care.
- Follow-up and unfinished work can disappear after interruptions.
- Financial context is discovered too late in the visit.
- Migrated records may be present but hard to trust or interpret.

## Success Metrics

These metrics should show whether the Patient Workspace improves clinic workflow. MVP should establish baselines first; targets should be set after internal testing and early clinic observation.

- Average time to locate a patient.
- Average time to answer: "What's happening with this patient?"
- Average time to resume work after interruption.
- Average clicks to begin intake from an active or scheduled visit.
- Average clicks to begin checkout when checkout is available.
- User confidence that the current patient state is understood.
- Percentage of workspace sessions where the user opens another module only to answer basic patient status.
- Percentage of active visits with visible owner, state, and next action.

Metrics should be used to improve workflow, not to create vanity reporting.

## MVP Scope

The MVP Patient Workspace includes:

- Patient identity header
- Client relationship summary
- Current visit card
- Current work list
- Recent patient timeline
- Communication panel
- Financial context summary
- Attachments/files summary
- Key patient alerts
- Basic migration/source labels for imported history
- Role-aware actions
- Empty, loading, and unavailable states

## Performance Budgets

These are product speed targets, not fixed implementation requirements. If engineering cannot meet them in MVP, the gap should be visible during planning.

- Workspace initial load: common patient workspace should become usable quickly enough that staff do not abandon it for memory or another screen.
- Patient switching: moving from one patient workspace to another should feel near-immediate for recently accessed patients.
- Background refresh: visit state, open work, communication, and financial blockers should refresh without disorienting the user or resetting their position.
- Action acknowledgement: creating communication, work, follow-up, attachment links, or permitted status changes should acknowledge immediately, even if final confirmation follows.
- Timeline rendering: recent timeline should render before long history is complete.
- Degraded states: delayed integrations, slow migrated history, or unavailable attachments should not block core patient context.

Suggested planning targets:

- Initial usable workspace: under 2 seconds for typical patient records.
- Patient switch with cached summary: under 1 second.
- Patient switch without cached summary: under 2 seconds for typical records.
- Action acknowledgement: under 300 milliseconds.
- First timeline items visible: under 1 second after workspace shell loads.

## Explicit Non-Goals

This MVP does not include:

- Full medical record editor
- Full SOAP note editor
- Full scheduling calendar
- Full billing/invoice editor
- Full estimate builder
- Full inventory management
- Full lab review workflow
- Full notification center
- Full AI assistant experience
- Full migration review portal
- Custom dashboard builder
- Multi-patient visit workspace
- Specialty-specific workspace variants

## Primary Workflows

### Open Patient From Search

1. User searches for patient or client.
2. User opens patient.
3. Workspace shows patient identity, client relationship, current/most recent visit, active work, alerts, recent timeline, communication, financial context, and files.

### Open Patient From Schedule Or Visit

1. User opens patient from appointment, arrival, or active visit.
2. Workspace emphasizes current visit state and visit work.
3. User can move into intake, communication, checkout, or record review based on role.

### Check Current Visit Status

1. User opens workspace.
2. Current visit card shows Visit State, assigned owner where relevant, blockers, and next action.
3. User can see whether the patient is waiting, in intake, ready for veterinarian, pending approval, in treatment, checkout-ready, archived, or archived with exceptions.
4. If more than one active Visit exists, the workspace shows this as an exception and does not attempt to merge visit context.

### Review Active Work

1. Workspace shows open Work Items tied to the patient and current visit.
2. User can filter or visually distinguish assigned, waiting, blocked, overdue, completed, and escalated work.
3. User can open the related object or complete permitted work.

### Review Recent History

1. Workspace shows recent timeline items.
2. Timeline prioritizes Visits, Diagnostic Results, Clinical Decisions, Communications, Prescriptions, Payments, Attachments, Follow-Ups, and migrated history.
3. User can open source context where available.

### Communicate With Client

1. User sees recent Communication attached to patient/client.
2. User can send or log communication if permitted.
3. Communication can create Work, Follow-Up, Consent/approval evidence, or Event where relevant.

### Prepare For Checkout

1. Receptionist opens patient workspace.
2. Workspace shows checkout readiness: Visit State, invoice/payment status, discharge instructions, medications, follow-up, and blockers.
3. User can proceed to relevant module if permitted.

### Review Migrated History

1. User sees migrated Medical Record, Attachments, Diagnostic Results, Appointments, or Invoices with source labels.
2. Low-confidence imported data is visually distinguishable.
3. User can rely on high-confidence data and flag uncertainty where needed.

## Required Patient Data Shown

### Patient Identity

- Patient name
- Species
- Breed where available
- Sex / reproductive status where available
- Age or date of birth where available
- Patient status: active, inactive, deceased, transferred, unknown
- Photo where available
- Patient ID/source label where needed

### Client Context

- Primary client name
- Primary contact method
- Secondary client or authorized contact where available
- Communication preference
- Consent/authority warning where relevant

### Clinical Alerts

- Allergies
- Important medical alerts
- Active medications summary
- Open problems or important diagnoses
- Vaccination due/overdue summary where available

### Current Visit Context

- Current Visit State
- Visit reason
- Appointment time or arrival mode
- Current owner or responsible role where relevant
- Blockers
- Next action
- Open exceptions

### Work Context

- Open Work Items
- Assigned owner
- Status
- Priority
- Due time where relevant
- Related object: Visit, Communication, Diagnostic Result, Estimate, Invoice, Prescription, Follow-Up, Attachment

### Recent Timeline

- Recent Visits
- Diagnostic Results
- Treatments/Procedures
- Prescriptions
- Communications
- Follow-Ups and Reminders
- Payments or financial events relevant to current visit
- Attachments
- Migrated legacy records with source labels

Default timeline should prioritize current Visit activity, recent high-value clinical and communication history, migrated records that affect current care, and recent financial events tied to the current Visit. The workspace should not attempt to show the complete lifetime record in MVP.

### Financial Context

- Open balance
- Current visit invoice status where available
- Estimate approval status where available
- Payment status where available
- Payment exception where relevant

### Files / Attachments

- Recent attachments
- Attachments tied to the current Visit where available
- Attachment type where known
- Source: native, imported, external integration
- Confidence label for migrated attachment links where relevant

## Required Actions

Actions should be role-aware and context-aware.

### Global Workspace Actions

- Open current visit
- Open medical record
- Open communication
- Add note or communication log where permitted
- Create Work Item where permitted
- Create Follow-Up where permitted
- View attachments
- Upload attachment where permitted

### Receptionist Actions

- Confirm/check arrival state where relevant
- Update client contact details where permitted
- Send/log client communication
- View checkout readiness
- Open payment or invoice context
- Create callback/follow-up

### Technician Actions

- Open intake
- Update Work Item status
- Add handoff note
- View treatment/medication work
- Create or complete permitted follow-up
- Upload or attach files

### Veterinarian Actions

- Open clinical record context
- Review current visit
- Review Diagnostic Results
- Open/sign record where module exists
- Create Clinical Decision where module exists
- Review prescription context

### Practice Manager Actions

- View exceptions
- Reassign or escalate work where permitted
- View audit-sensitive events
- Open payment or operational blockers

## Required API Capabilities

These are module-level capabilities, not endpoint designs.

### Read Capabilities

- Fetch patient workspace summary by patient ID.
- Fetch current or most recent Visit summary.
- Fetch exception summary when more than one active Visit exists for a patient.
- Fetch active Work Items for patient/current visit.
- Fetch recent timeline items.
- Fetch recent Communications.
- Fetch financial summary.
- Fetch attachments summary.
- Fetch migration/source labels and confidence where relevant.
- Fetch role-aware permitted actions for current user.
- Fetch unavailable or delayed data status for workspace sections.

### Write Capabilities

- Update permitted patient demographic/contact-adjacent fields.
- Create Communication or communication log.
- Create Work Item.
- Update Work Item status where permitted.
- Create Follow-Up.
- Upload/link Attachment.
- Record workspace-relevant Event when state changes.
- Flag migrated/imported item as questionable where permitted.
- Dismiss or resolve workspace-visible exceptions only when permitted by the owning module.

### Access Capabilities

- Enforce Organization and Location isolation.
- Enforce role capabilities.
- Enforce object sensitivity rules.
- Scope AI context to user permissions.

## Required Database Concepts

This module likely requires persistence or read models for:

- Patient
- Client
- Client-patient relationship
- Visit
- Visit State as property of Visit
- Work Item / Task
- Communication
- Event
- Audit Event
- Attachment
- Medical Record summary
- Diagnostic Result summary
- Prescription summary
- Estimate summary
- Invoice/payment summary
- Follow-Up
- Reminder
- Migration Record/source label
- User/Role/Location/Organization ownership

Recommendation: avoid building a separate `PatientWorkspace` domain object unless engineering needs a read model/cache. The workspace is a composition of existing Core Objects.

The workspace may use read models or caching for speed, but those should not become new business objects unless a later module proves they need ownership, lifecycle, or audit behavior.

## Permissions And Ownership Rules

- Users can only access patients inside permitted Organization/Location scope.
- Patient identity and Medical Record context require role-based access.
- Clinical decisions, diagnoses, prescriptions, and record signoff are veterinarian-owned.
- Receptionists may view clinical context needed for routing but should not modify clinical decisions.
- Technicians may update permitted intake/work/handoff context but should not finalize veterinarian-owned decisions.
- Practice Managers may resolve operational and payment exceptions but should not override clinical authority.
- AI may only use context the current user is allowed to access.
- External Integration data must show source and should not silently overwrite human-owned records.
- Migrated data must show source and confidence when uncertainty matters.

## State Changes / Events Created By This Module

The workspace may create Business Events when users act from it.

Examples:

- Patient workspace opened for audit-sensitive context where required.
- Client communication logged.
- Work Item created.
- Work Item status changed.
- Follow-Up created.
- Attachment uploaded or linked.
- Migrated item flagged as questionable.
- Patient demographic or contact-related field changed.
- Visit State changed only when action is permitted and belongs to Visit Engine behavior.

The workspace should not create technical events in product history.

The workspace should consume Visit State and Work Item status from owning modules. It should not define new Visit States or Work Item states.

## Audit Requirements

Audit Events are required when workspace actions affect:

- Patient identity
- Client identity or authority
- Medical Record content
- Clinical alerts
- Consent/approval evidence
- Prescription context
- Payment or invoice state
- Attachment deletion or sensitive reclassification
- Migration source mapping or confidence correction
- AI-generated content accepted into sensitive records
- Cross-location access where policy requires it

Simple reads should not be audited by default unless required for sensitive access, support access, or compliance.

## Migration Implications

Patient Workspace must make migrated history usable without pretending all imported data is equally trustworthy.

MVP must support:

- Source labels for migrated patient, client, appointment, medical record, attachment, invoice, diagnostic result, and communication data.
- Confidence labels where mapping is uncertain.
- Clear distinction between native Sparki activity and migrated legacy history.
- Ability to show recent and high-value imported history in the timeline.
- Ability to flag imported data as questionable.

Do not block MVP on full migration review tooling. But do not hide uncertainty.

## Future Integration Points

These are natural attachment points for future integrations. They do not expand MVP scope.

- Weave or other clinic communication platforms: client communication history, message sending, call context, source labels.
- IDEXX and other diagnostic providers: Diagnostic Results, result status, attachments, source confidence.
- Chewy, VetSource, and other pharmacy partners: Prescription context, refill requests, fulfillment status.
- Patterson and other supply or inventory providers: inventory availability, ordering context, product source data.
- ScribbleVet or other clinical documentation tools: draft notes, transcript attachments, Medical Record context.
- Payment providers: payment status, checkout blockers, receipt or transaction Events.
- Messaging providers: SMS/email delivery status, client reply Events, communication consent.
- Migration connectors: legacy Medical Records, Attachments, Invoices, Appointments, Communications, and source confidence.

Integration data shown in the workspace must identify its source and must not silently replace Sparki-owned data.

## AI Opportunities

AI is optional/future unless explicitly marked required.

### Optional / Future

- Summarize patient history for current visit reason.
- Summarize recent communication.
- Suggest missing follow-up.
- Suggest likely work owner.
- Draft client communication.
- Explain migrated record source/uncertainty.
- Highlight unresolved blockers.

### Required For MVP

None.

MVP should be useful without AI.

## UX Principles

These are behavioral review criteria for implementation.

- Never lose patient context.
- Never hide current Visit State when a Visit is active.
- Never require multiple windows to answer one basic patient status question.
- Primary actions should remain visible or quickly reachable.
- Users should understand what happens next before they act.
- Preserve user momentum after interruptions.
- Keep communication attached to patient context.
- Show blockers plainly.
- Show migrated uncertainty without making the workspace feel broken.
- Prefer fewer, higher-value sections over dense dashboards.
- Do not make financial context compete with urgent clinical context.
- Do not require AI for core understanding.

## UX Requirements

- Patient identity must be visible at all times.
- Current Visit State must be easy to find when a visit is active.
- Open Work Items must be visible without searching.
- Communication must appear in patient context.
- Financial blockers must be visible but not dominate clinical work.
- Migrated data must be labeled plainly.
- The workspace should avoid dense dashboard clutter.
- Primary actions should be obvious and role-aware.
- Empty states should explain what is missing without marketing language.
- Loading states should preserve layout and avoid disorientation.
- The user should be able to return to their prior context after opening related modules.

## Edge Cases

- Patient has no active visit.
- Patient has multiple upcoming appointments.
- Patient has multiple clients/owners.
- Client authority is unclear.
- Patient is deceased, inactive, or transferred.
- Patient has duplicate migrated records.
- Migrated history has low confidence.
- Current visit is Archived With Exceptions.
- Patient has more than one active Visit.
- Work exists without owner.
- Work exists without clear context.
- Communication is linked to client but not clearly to patient.
- Financial balance exists but is unrelated to current visit.
- Attachment exists but patient linkage is uncertain.
- User lacks permission for some patient context.
- External Integration data is delayed or unmatched.

MVP should handle edge cases by showing the safest available summary and a clear exception. It should not attempt to resolve duplicate patients, merge visits, repair migration data, or complete missing ownership workflows inside the workspace.

## Implementation Readiness Notes

The following decisions are fixed for MVP:

- The workspace composes existing Core Objects; it is not a new business object.
- The workspace may use read models or caching for speed if engineering needs them.
- The workspace shows one active/current Visit as primary context.
- Multiple active Visits are an exception, not a supported multi-visit experience.
- The workspace can start actions in owning modules, but it does not own full editors for records, billing, scheduling, labs, or migration review.
- Financial context means current blockers, open balance, current visit invoice/payment status, estimate approval status, and payment exceptions.
- Timeline defaults to current Visit activity plus recent high-value history; full lifetime history belongs to Medical Record.
- Attachments default to current Visit attachments plus recent patient attachments.
- Work Item status and Visit State are owned by their source modules.
- Future integrations may attach to workspace summaries, but integration buildout is outside MVP.

## Acceptance Criteria

Engineering can consider MVP ready when:

- A permitted user can open a patient workspace by patient ID.
- Patient identity and client context render clearly.
- Active or most recent Visit summary renders.
- Current Visit State is visible when present.
- Open Work Items render with owner, status, and context.
- Recent timeline renders mixed native and migrated items.
- Communication summary renders in patient context.
- Financial summary renders current blockers without becoming full billing.
- Attachments summary renders source labels where available.
- Role-aware actions are enforced.
- Organization/Location access is enforced.
- Workspace actions create required Business Events.
- Audit Events are created for sensitive changes.
- Migrated items show source and uncertainty where relevant.
- Workspace remains useful when no active visit exists.
- AI is not required for core workflow.
- Success metrics can be observed during internal testing or pilot use.
- Performance budget gaps are known before implementation starts.
- Future integration points are identified without being built into MVP.

## Open Questions

- Which patient fields can Receptionists update in MVP?
- How should duplicate migrated patient records appear before merge tooling exists?

Resolved for MVP:

- Current visit should be shown above timeline for all roles when active.
- Multiple active Visits should appear as an exception, not as a supported multi-visit workspace.
- Timeline defaults to current Visit activity plus recent high-value history; full lifetime history belongs to Medical Record.
- Attachments default to current Visit attachments plus recent patient attachments.
- Work Item status is owned by the Work System; this module only displays and updates permitted status changes.

## What Engineering Can Start Building After This Spec

Engineering can start:

- Patient workspace read model/API capability.
- Patient identity and client context retrieval.
- Current Visit summary retrieval.
- Work Item summary retrieval.
- Recent timeline retrieval.
- Communication summary retrieval.
- Financial summary retrieval.
- Attachment summary retrieval.
- Role-aware action gating.
- Migration source/confidence display support.
- Business Event creation for workspace actions.
- Audit Event creation for sensitive workspace actions.

Do not start broad platform infrastructure beyond what these capabilities require.

## Related Documents

### References

- [Product Constitution](../../blueprint/00-product-constitution.md)
- [Patient Workspace Blueprint](../08-patient-workspace.md)
- [Visit Engine v1](../../blueprint/07-visit-engine-v1.md)
- [Core Domain Model v1](../../blueprint/08-core-domain-model-v1.md)
- [Event Architecture v1](../../blueprint/09-event-architecture-v1.md)
- [Work System v1](../../blueprint/10-work-system-v1.md)
- [Permission And Ownership v1](../../blueprint/11-permission-and-ownership-v1.md)
- [Migration Strategy](../../blueprint/06-migration-strategy.md)

### Depends On

- [Product Constitution](../../blueprint/00-product-constitution.md)
- [Core Domain Model v1](../../blueprint/08-core-domain-model-v1.md)
- [Visit Engine v1](../../blueprint/07-visit-engine-v1.md)
- [Permission And Ownership v1](../../blueprint/11-permission-and-ownership-v1.md)

### Referenced By

- TODO: Add implementation tickets, ADRs, API notes, and test plans once engineering planning begins.

### Future Work

- TODO: Split follow-on specs for Medical Record editor, Communication module, Visit Engine actions, Estimate/Invoice context, and Migration review only when implementation needs them.
