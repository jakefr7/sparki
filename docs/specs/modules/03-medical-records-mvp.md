# 03 Medical Records MVP

## Constitutional Authority

This module spec inherits from the [Product Constitution](../../blueprint/00-product-constitution.md). If this spec conflicts with the Constitution, the Constitution governs.

## Purpose

Define the first buildable Medical Records module for Sparki.

The Medical Record is the legal and clinical source of truth for patient care. It preserves what was observed, decided, communicated, performed, prescribed, attached, signed, corrected, and carried forward.

This spec defines behavior, not screens. It should let engineering plan record creation, draft handling, clinical ownership, signoff, locking, amendments, audit history, migration provenance, and links to Visit Lifecycle without additional product clarification.

The MVP should help the care team answer:

- What is clinically true about this patient?
- What happened during this Visit?
- What did the veterinarian decide?
- What was communicated or prescribed?
- Has the record been completed and signed where required?
- If something changed later, what changed, who changed it, and why?

## Primary Users

### Veterinarian

Owns clinical decisions, diagnoses, assessments, plans, prescriptions, record signoff, and clinically material amendments.

### Technician

Contributes intake, vitals, history, treatment notes, medication administration context, handoff notes, and draft documentation where permitted.

### Receptionist

Views limited clinical context needed for routing, client communication, checkout, follow-up, and record completion awareness. Does not own clinical content.

### Practice Manager

Reviews record completion exceptions, ownership problems, audit history, compliance-sensitive issues, and operational blockers. Does not override clinical ownership.

### AI Assistant

May summarize, structure, draft, check completeness, and surface source context. It never independently creates, signs, locks, amends, or finalizes a Medical Record.

### External Integration

May contribute diagnostic reports, attachments, prescriptions, transcripts, migrated notes, or other source-labeled record context. Integration content must preserve provenance.

## Core User Problems

- Clinical documentation is often scattered across notes, invoices, lab systems, attachments, communications, and memory.
- Draft notes and signed records are not always clearly separated.
- Operational completion can be confused with clinical signoff.
- Late edits can obscure what was known at the time of care.
- Technicians and veterinarians both contribute to documentation, but clinical ownership must remain clear.
- AI-generated drafts can become risky if source, review, and ownership are unclear.
- Migrated records may be incomplete, scanned, free-text, duplicated, or ambiguously tied to Visits.
- Staff need fast access to history without weakening legal integrity.

## MVP Scope

The MVP Medical Records module includes:

- Medical Record creation for each Patient.
- Visit-linked clinical record entries.
- SOAP Note drafting, review, signoff, lock, and amendment.
- Problem, Diagnosis, Allergy, Vaccination, Prescription, Attachment, Communication, Diagnostic Result, Treatment, and Procedure references where relevant.
- Clear distinction between draft, signed, locked, amended, and migrated content.
- Clinical ownership attribution.
- Technician contributions with veterinarian review where required.
- Record completion support for Visit Lifecycle.
- Record signoff support for veterinarian-owned documentation.
- Audit Events for sensitive record actions.
- Amendment workflow instead of destructive edits after signoff or lock.
- Migration provenance and confidence labels for imported records.
- AI-assisted drafts and summaries as optional support only.

## Explicit Non-Goals

This MVP does not include:

- Full specialty-specific record templates.
- Full problem-oriented medical record system.
- Advanced flowsheets.
- Full surgery/anesthesia record.
- Full hospitalization treatment sheet.
- Full dental charting.
- Full imaging viewer.
- Full lab result interpretation module.
- Full pharmacy fulfillment.
- Full client portal record sharing.
- Regulatory compliance automation for every jurisdiction.
- Custom template builder.
- AI autonomous charting.
- Automatic diagnosis generation.
- Destructive post-signoff editing.

The Medical Records module may link to these future modules. It should not own their full behavior in MVP.

## Medical Record Lifecycle

### Patient Medical Record

A Patient has one longitudinal Medical Record.

The Medical Record is created with the Patient or during migration. It grows over time through Visits, SOAP Notes, Problems, Diagnoses, Allergies, Vaccinations, Prescriptions, Attachments, Diagnostic Results, Communications, and amendments.

### Visit Record Entry

Each Visit may contribute one or more record entries to the Patient Medical Record.

The Visit Record Entry captures the durable clinical portion of a Visit. It is not the same thing as Visit State, billing state, or operational workflow.

### SOAP Note Lifecycle

MVP SOAP Note states:

- `Draft`
- `Ready For Review`
- `Signed`
- `Locked`
- `Amended`
- `Voided`

State meaning:

- `Draft`: editable clinical documentation not yet clinically final.
- `Ready For Review`: prepared content awaiting veterinarian review or signoff.
- `Signed`: veterinarian has accepted clinical responsibility for the note.
- `Locked`: signed content is protected from direct editing.
- `Amended`: signed or locked content has a later correction or addition attached.
- `Voided`: content is invalidated but preserved for audit history.

### Record Completion vs Record Signoff

Record Completion means required clinical, operational, communication, and attachment context for the Visit has been captured or explicitly marked incomplete.

Record Signoff means the responsible veterinarian has accepted clinical ownership of required clinical documentation.

Completion may be operationally visible. Signoff is clinically owned.

### Archive Relationship

A Visit may archive cleanly only when required Medical Record work is complete or explicitly marked not required.

A Visit may archive with exceptions when Medical Record work remains incomplete, unsigned, pending results, or otherwise unresolved.

## Record Ownership Model

### Clinical Ownership

Clinical ownership belongs to the responsible Veterinarian.

Clinical ownership covers:

- Assessment.
- Diagnosis.
- Clinical Decision.
- Plan.
- Prescription.
- Diagnostic interpretation.
- Medical Record signoff.
- Clinically material amendments.

### Contribution Ownership

Technicians and other permitted staff may contribute facts, observations, intake notes, vitals, treatment notes, medication administration details, and handoff context.

Contributions must preserve author attribution. A contribution does not transfer clinical ownership unless reviewed and signed by a Veterinarian where required.

### Operational Ownership

Receptionists and Practice Managers may own record completion Work Items, communication follow-up, missing attachment resolution, or administrative exceptions.

Operational ownership does not grant clinical authority.

### AI Ownership

AI owns nothing in the Medical Record.

AI output is either draft support or summarized context until a permitted human accepts it. Accepted AI-assisted content must record source, reviewer, timestamp, and whether it was edited.

## Required Record Sections

MVP should support the following sections where applicable:

- Visit summary.
- SOAP Note.
- Presenting concern / reason for visit.
- History.
- Vitals and objective findings.
- Assessment.
- Plan.
- Clinical Decisions.
- Problems.
- Diagnoses.
- Allergies.
- Vaccinations.
- Diagnostic Orders and Diagnostic Results.
- Treatments and Procedures.
- Medication Orders.
- Prescriptions.
- Client Communications relevant to care.
- Consents relevant to care.
- Attachments.
- Follow-Up instructions.
- Discharge instructions.
- Record completion status.
- Signoff status.
- Amendments.
- Migration/source provenance.

MVP does not require every Visit to use every section.

## Required Data Captured

### Medical Record Header

- Patient.
- Location where care was delivered or managed.
- Record source: native, migrated, External Integration.
- Current clinical alerts summary where available.
- Migrated source and confidence where relevant.

### Visit Record Entry

- Visit.
- Patient.
- Client where relevant.
- Responsible Veterinarian.
- Contributing users.
- Visit date/time.
- Visit reason.
- Visit type.
- Record status.
- Signoff requirement.
- Completion requirement.

### SOAP Note

- Subjective.
- Objective.
- Assessment.
- Plan.
- Author.
- Responsible Veterinarian.
- Draft status.
- Signed status.
- Signed timestamp where applicable.
- Source references where content came from Visit data, Communication, Diagnostic Result, Attachment, AI draft, or migration.

### Problems And Diagnoses

- Problem or Diagnosis name.
- Status.
- Date identified.
- Responsible Veterinarian.
- Related Visit or SOAP Note.
- Supporting context.
- Resolution or supersession where relevant.

### Allergies And Alerts

- Allergy or alert description.
- Severity where known.
- Source.
- Date recorded.
- Recorder.
- Clinical owner where required.
- Active/inactive status.

### Vaccinations

- Vaccine.
- Date administered or historical date.
- Due date where available.
- Source.
- Lot/manufacturer where available.
- Related Visit.

### Diagnostics

- Diagnostic Order reference.
- Diagnostic Result reference.
- Result status.
- Result source.
- Veterinarian review status.
- Communication status where client notification is required.

### Treatments, Procedures, Medication Orders, And Prescriptions

- Related Visit.
- Ordered/performed/prescribed item.
- Owner.
- Status.
- Completion or prescription date.
- Exceptions where relevant.
- Inventory or External Integration source where relevant.

### Communication And Consent

- Care-relevant Communication reference.
- Consent reference where relevant.
- Client approval/decline/defer evidence where relevant.
- Source.
- Timestamp.

### Attachments

- Attachment reference.
- Type.
- Source.
- Related Visit or record section where known.
- Confidence label for migrated attachment linkage where relevant.

### Amendment

- Original record reference.
- Amendment author.
- Responsible clinical owner where clinically material.
- Timestamp.
- Reason.
- Correction or addition.
- Whether amendment changes care interpretation.
- Related Audit Event.

## Clinical Decision Ownership

Clinical Decisions must be owned by a Veterinarian.

Technicians, AI, External Integrations, and migrated data may suggest, draft, or provide context for a Clinical Decision. They do not own the decision.

Clinical Decision ownership applies to:

- Assessment.
- Diagnosis.
- Treatment plan.
- Diagnostic interpretation.
- Prescription decision.
- Change to care plan.
- Record signoff.
- Clinically material amendment.

If ownership is unclear, the record should remain incomplete or exceptioned rather than silently assigning responsibility.

## Record Amendment Rules

- Signed or locked record content must not be destructively edited.
- Corrections after signoff must be made as amendments.
- Amendments must preserve the original content.
- Amendments must record author, timestamp, reason, and source.
- Clinically material amendments require Veterinarian ownership.
- Non-clinical corrections may be made by permitted staff when policy allows, but must still be audited.
- Amendments should be visible in context, not hidden in audit logs only.
- Voiding a record entry must preserve the original content and reason.
- AI may draft an amendment summary, but a permitted human must create and own the amendment.
- Migrated records should be corrected through source-labeled notes or verification status, not silent rewrite.

Examples:

- Correcting a typo before signoff may update the draft directly.
- Adding omitted exam findings after signoff requires an amendment.
- Correcting the wrong patient linkage requires audit-sensitive correction and may require Practice Manager review.
- Reclassifying a migrated attachment requires provenance and confidence update.

## Record Locking And Sign-Off

### Signoff

Signoff means the responsible Veterinarian accepts clinical responsibility for required clinical documentation.

Signoff requires:

- Responsible Veterinarian.
- Record content ready for review.
- Required sections complete or explicitly marked not applicable.
- Required diagnostic review completed or exceptioned.
- Required prescriptions and Clinical Decisions represented.
- AI-assisted content reviewed if present.

### Locking

Locking protects signed record content from direct editing.

MVP should support locking at minimum for signed SOAP Notes and signed Visit Record Entries.

Locked content can still be:

- Viewed by permitted users.
- Referenced by future Visits.
- Amended.
- Exported where permitted.
- Flagged for review where policy allows.

Locked content must not be overwritten.

### Late Signoff

Late signoff is allowed but must be visible and audited.

If a Visit is otherwise ready to close but record signoff remains incomplete, Visit Lifecycle should move through `Record Completion Pending` or `Visit Closing With Exceptions` rather than treating the Visit as cleanly archived.

## Business Rules

- A Patient has one longitudinal Medical Record.
- A Medical Record may contain many Visit Record Entries.
- A Visit Record Entry belongs to one Visit and one Patient.
- A SOAP Note belongs to a Medical Record and usually a Visit.
- Draft and signed content must be distinguishable.
- Signed and locked content cannot be destructively edited.
- Amendments preserve the original record.
- Clinical ownership and contribution authorship must both be visible.
- AI-assisted content must be traceable after acceptance.
- Migrated record content must show source and confidence where uncertainty matters.
- Record completion and record signoff are separate.
- The Medical Record should not store operational Visit State as clinical truth.
- Events may support the Medical Record, but not every Event belongs in the Medical Record.
- Attachments should not be treated as clinically reviewed unless review is recorded.
- A record should not appear complete if required content is missing, unsigned, pending review, or source-uncertain in a clinically meaningful way.

## Permission Rules

### Receptionist

- Can view limited record context needed for routing, communication, checkout, and follow-up where permitted.
- Can upload or link administrative attachments where permitted.
- Can create record completion Work Items where permitted.
- Cannot create, edit, sign, amend, or void clinical content.
- Cannot accept AI-generated clinical content into the Medical Record.

### Technician

- Can create and edit permitted draft contributions before signoff.
- Can record intake, vitals, treatment notes, medication administration details, and handoff context.
- Can prepare draft SOAP content where policy allows.
- Cannot own Clinical Decisions.
- Cannot sign veterinarian-owned record sections.
- Cannot amend clinically material signed content unless policy explicitly allows and a Veterinarian owns the amendment.

### Veterinarian

- Can create, edit, review, sign, lock, and amend clinical record content.
- Owns Clinical Decisions, Diagnoses, Prescriptions, diagnostic interpretation, and record signoff.
- Can accept, reject, or edit AI-assisted drafts.
- Can mark clinical sections not applicable where appropriate.

### Practice Manager

- Can review completion status, audit history, late signoff, ownership exceptions, and compliance-sensitive record issues.
- Can manage operational exceptions and escalation.
- Cannot override clinical content or clinical signoff without appropriate clinical authority.

### AI Assistant

- Can draft, summarize, structure, and check completeness.
- Cannot create final record content independently.
- Cannot sign, lock, amend, void, or finalize records.
- Cannot infer Clinical Decisions without human review.
- Cannot hide uncertainty or source gaps.

### External Integration

- Can add source-labeled content where trusted.
- Can attach diagnostic reports, images, pharmacy updates, transcription drafts, or migrated records.
- Must preserve source, timestamp, confidence, and original reference where available.
- Must not overwrite human-owned clinical content.

## Required API Capabilities

These are module-level capabilities, not endpoint designs.

### Read Capabilities

- Fetch Medical Record by Patient ID.
- Fetch Visit Record Entry by Visit ID.
- Fetch SOAP Notes for Patient or Visit.
- Fetch draft, signed, locked, amended, and migrated record status.
- Fetch required record sections and completion status for a Visit.
- Fetch signoff status and responsible Veterinarian.
- Fetch Problems, Diagnoses, Allergies, Vaccinations, Prescriptions, Diagnostic Results, Treatments, Procedures, Attachments, Communications, and Consents linked to the record.
- Fetch amendments for a record entry.
- Fetch source labels and confidence for migrated content.
- Fetch role-aware permitted record actions.

### Write Capabilities

- Create Medical Record when Patient is created or migrated.
- Create Visit Record Entry from Visit context.
- Create or update draft SOAP Note.
- Add technician contribution where permitted.
- Link Diagnostic Result, Attachment, Communication, Consent, Prescription, Treatment, Procedure, Problem, Diagnosis, Allergy, or Vaccination to record context.
- Mark record section complete, incomplete, or not applicable where permitted.
- Submit record content for review.
- Sign record content where permitted.
- Lock signed content.
- Create amendment.
- Void record entry where permitted.
- Accept, edit, or reject AI-assisted draft content.
- Update migration confidence or verification status where permitted.

### Access Capabilities

- Enforce Organization and Location isolation.
- Enforce role capabilities.
- Enforce clinical authority for clinical content.
- Enforce sensitive access rules for Medical Records.
- Enforce amendment and voiding permissions.
- Scope AI context to current user permissions.

## Required Database Concepts

This module likely requires persistence or read models for:

- Medical Record.
- Visit Record Entry.
- SOAP Note.
- Record status.
- Record section completion.
- Record signoff.
- Record lock.
- Record amendment.
- Patient.
- Visit.
- User.
- Role.
- Location.
- Clinical Decision reference.
- Problem.
- Diagnosis.
- Allergy.
- Vaccination.
- Diagnostic Order reference.
- Diagnostic Result reference.
- Treatment reference.
- Procedure reference.
- Medication Order reference.
- Prescription reference.
- Communication reference.
- Consent reference.
- Attachment reference.
- Follow-Up reference.
- Event.
- Audit Event.
- AI Suggestion.
- Migration Record/source label.
- External Integration source.

Recommendation: do not create separate platform-wide document infrastructure beyond what Medical Records needs. Let shared document behavior emerge only after another real module requires it.

## Audit Requirements

Audit Events are required when Medical Record actions affect:

- Medical Record creation.
- Visit Record Entry creation.
- SOAP Note creation, review, signoff, lock, amendment, or void.
- Clinical Decision, Diagnosis, Problem, Allergy, Vaccination, Prescription, Treatment, Procedure, or Diagnostic Result linkage.
- Record section marked complete, incomplete, or not applicable.
- Responsible Veterinarian assignment or change.
- Technician contribution accepted into signed content.
- AI-assisted content accepted, edited, or rejected where retained.
- Attachment added, deleted, reclassified, or linked to clinical context.
- Migrated record confidence or source mapping changed.
- Record export or sensitive access where policy requires it.
- Amendment or voiding of signed/locked content.

Audit Events should preserve:

- Actor.
- Timestamp.
- Patient.
- Visit where applicable.
- Previous value where relevant.
- New value where relevant.
- Reason where required.
- Source.
- AI involvement where applicable.
- External Integration source where applicable.

Simple record viewing should not be audited by default unless required for sensitive access, support access, cross-location policy, or compliance.

## Migration Implications

Migration must preserve historical clinical truth without pretending legacy data is cleaner than it is.

MVP must support:

- Source labels for migrated notes, scanned records, attachments, diagnoses, problems, prescriptions, vaccinations, lab results, and communications.
- Confidence labels where patient, Visit, date, author, or attachment linkage is uncertain.
- Original legacy identifiers where available.
- Distinction between native Sparki records and migrated historical records.
- Distinction between structured migrated data and free-text/scanned migrated data.
- Ability to flag migrated records as questionable.
- Ability to mark migrated records as verified where permitted.
- Preventing uncertain migrated records from becoming signed native records.

Do not block MVP on full migration review tooling. But do not hide provenance or uncertainty.

## AI Opportunities

AI is optional/future unless explicitly marked required.

### Optional / Future

- Draft SOAP Note from Visit context, technician notes, communication, and Diagnostic Results.
- Summarize prior Medical Record history for current Visit reason.
- Suggest missing sections before signoff.
- Highlight contradictions between Visit data and draft note.
- Summarize migrated records with source confidence.
- Draft amendment text from a human-provided correction reason.
- Suggest Problem or Diagnosis linkage for veterinarian review.
- Prepare discharge instruction drafts from signed plan.

### Required For MVP

None.

MVP must be fully usable without AI.

## UX Principles

These are behavioral review criteria for implementation.

- Never blur draft and signed content.
- Never hide who owns clinical decisions.
- Never allow destructive edits after signoff.
- Always preserve the original record when amending.
- Always show source and confidence for migrated content where uncertainty matters.
- Always make AI involvement visible after acceptance.
- Keep record completion separate from Visit State.
- Keep record signoff separate from operational completion.
- Make incomplete or unsigned records easy to find.
- Do not make fast documentation less trustworthy.
- Do not require multiple modules to understand whether the record is complete.

## Success Metrics

MVP should establish baselines first. Targets should be set after internal testing and early clinic observation.

- Average time to begin a Visit record from active Visit context.
- Average time to identify whether a Visit record is complete.
- Average time to identify responsible Veterinarian and signoff status.
- Average time from Visit checkout-ready to record completion.
- Percentage of Visits closed with record completion Exceptions.
- Percentage of signed records later amended.
- Number of unsigned records older than clinic policy threshold.
- Number of records with accepted AI-assisted content and visible reviewer.
- User confidence that signed content is final and amended content is traceable.

Metrics should improve clinical documentation quality and workflow. They should not encourage rushed signoff.

## Performance Budgets

These are product speed targets, not fixed implementation requirements.

- Medical Record summary load should be fast enough to support care during an active Visit.
- Visit Record Entry should open quickly from Visit Lifecycle and Patient Workspace.
- Draft save acknowledgement should be immediate enough that users trust documentation capture.
- Signoff and lock acknowledgement should be quick but must not skip validation.
- Amendment history should load without blocking the current note.
- Migrated history should degrade gracefully when large attachments or scanned records are slow.

Suggested planning targets:

- Medical Record summary usable: under 2 seconds for typical patients.
- Visit Record Entry usable from active Visit: under 1 second after Visit context is available.
- Draft save acknowledgement: under 300 milliseconds.
- Signoff validation and acknowledgement: under 1 second for typical records.
- Amendment list visible: under 1 second after record entry loads.
- Recent migrated record references visible: under 2 seconds; large attachments may load separately.

## Edge Cases

- Patient has no prior Medical Record.
- Patient has migrated history only.
- Migrated record has uncertain patient linkage.
- Migrated attachment has no clear date or Visit.
- Visit has multiple contributing technicians.
- Responsible Veterinarian changes during the Visit.
- Record is started before patient identity is fully confirmed.
- Emergency care documentation trails clinical action.
- Technician draft contains clinical interpretation that requires veterinarian review.
- Diagnostic Result arrives after record signoff.
- Client Communication changes clinical plan after initial signoff.
- Prescription is created after Visit checkout.
- Visit is ready to archive but record signoff is missing.
- Signed record contains an error.
- Record was linked to the wrong Visit.
- User attempts to edit locked content.
- AI draft includes unsupported or source-unclear content.
- External Integration sends duplicate or revised diagnostic report.
- Patient is transferred or deceased.
- User lacks permission for sensitive record section.

MVP should handle edge cases by preserving the record, showing ownership and source, and requiring amendments or Exceptions instead of silent correction.

## Acceptance Criteria

Engineering can consider MVP ready when:

- A Patient has one Medical Record.
- A Visit can create or link to a Visit Record Entry.
- SOAP Notes can be drafted, reviewed, signed, locked, amended, and voided where permitted.
- Draft, signed, locked, amended, voided, native, AI-assisted, and migrated content are distinguishable.
- Clinical ownership and contribution authorship are recorded.
- Record completion and record signoff are separate.
- Signed or locked content cannot be destructively edited.
- Amendments preserve original content and audit history.
- Role permissions are enforced.
- Audit Events are created for sensitive record actions.
- Migrated records show source and confidence where relevant.
- AI is not required for core Medical Record workflow.
- AI cannot independently create, sign, lock, amend, void, or finalize records.
- Visit Lifecycle can determine record completion and signoff status.
- Patient Workspace can display Medical Record summary and current record status.
- Performance budget gaps are known before implementation starts.

## Open Questions

- Which SOAP sections are mandatory for the first pilot by Visit type?
- What is the pilot policy for late signoff timing?
- Which non-clinical record corrections can staff make without Veterinarian approval?
- Which record exports are needed for MVP, if any?
- Which migrated record confidence labels are enough for launch?
- Which external sources are trusted to add record content in MVP?
- What minimum legal retention policy is required for the first launch market?

## Engineering Starting Point

Engineering can start:

- Medical Record creation tied to Patient.
- Visit Record Entry creation tied to Visit.
- SOAP Note draft/review/sign/lock/amend/void behavior.
- Clinical ownership and contribution attribution.
- Record completion and signoff status for Visit Lifecycle.
- Role-aware record action gating.
- Business Event and Audit Event creation for sensitive record actions.
- Migration source/confidence display support for historical records.
- AI-assisted draft acceptance tracking, without requiring AI for MVP.

Do not start broad document infrastructure beyond what this module requires.

Medical Records MVP Specification Approved for engineering planning.

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

- TODO: Split follow-on specs for advanced SOAP templates, problem-oriented records, surgery/anesthesia records, hospitalization records, dental charting, diagnostics review, prescriptions, and record export only when implementation needs them.
