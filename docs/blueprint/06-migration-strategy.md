# 06 Migration Strategy

## Constitutional Authority

This document inherits from the [Product Constitution](./00-product-constitution.md). If it conflicts with the Constitution, the Constitution governs.

## Purpose

Define migration as one of Sparki's primary products.

Migration is not importing CSVs. Migration is relocating an entire veterinary hospital from one operating system to another without breaking trust, continuity, care, billing, communication, or memory.

For many clinics, migration will be the first proof that Sparki understands the seriousness of replacement.

## Why Migration Determines Adoption

Clinics do not merely switch software. They move their operational memory.

Legacy systems contain years of patient history, client relationships, appointment habits, invoices, reminders, inventory items, medical templates, lab results, attachments, staff workarounds, and local conventions. Even when a clinic dislikes its current system, it may still trust that system more than the unknown.

Migration determines adoption because:

- A clinic cannot evaluate Sparki honestly if it fears losing history.
- A better product can still lose to a safer transition.
- Staff resistance often begins before go-live, during uncertainty.
- Bad migration creates support debt, trust debt, and product skepticism.
- Owners and managers need confidence before they risk live operations.

Migration is therefore not a back-office function. It is the first product experience of replacement.

## Legacy Software Ecosystem

The veterinary software ecosystem is fragmented across legacy desktop systems, cloud systems, specialty systems, communication tools, lab integrations, payment systems, pharmacy tools, online booking, imaging, inventory, and local exports.

Sparki should assume:

- Source data will be incomplete.
- Field meanings will vary by system and clinic.
- Local workflows will have shaped data in unexpected ways.
- Duplicate clients and patients will exist.
- Attachments may be large, inconsistently named, or poorly categorized.
- Historical invoices may not map cleanly to modern billing models.
- Medical records may include structured data, templates, scanned PDFs, images, and free text.
- Communication history may live outside the practice management system.
- Staff may not know which data is authoritative until asked to verify it.

The migration product must be built for this reality.

## Migration Philosophy

Migration should be designed around trust, not throughput alone.

The goal is not to move the maximum amount of data as quickly as possible. The goal is to move the right data, preserve meaning, reveal uncertainty, and give the clinic confidence that it can operate safely on Sparki.

### Principles

- Preserve clinical continuity before cosmetic completeness.
- Expose uncertainty rather than hiding it.
- Let clinics verify what matters most.
- Make migration progress legible to non-technical users.
- Treat exceptions as a normal workflow, not a failure state.
- Prefer source-of-truth clarity over indiscriminate duplication.
- Keep legacy reality from defining Sparki's future product shape.

## Migration User Experience

Migration must feel guided, visible, and accountable.

The clinic should know:

- What Sparki needs from them
- What has been received
- What has been parsed
- What has been mapped
- What requires review
- What is ready
- What is risky
- What will not migrate
- What will be verified after go-live

The user experience should reduce uncertainty at each step. It should not require a practice owner or manager to interpret raw import logs, spreadsheet errors, or engineering language.

## Migration Trust

Trust comes from three things: transparency, verification, and recoverability.

A clinic can tolerate some imperfection if it understands what happened, what is affected, and what to do next. It cannot tolerate silent uncertainty.

### Trust Requirements

- Show what data domains are included.
- Show what data domains are excluded.
- Show confidence levels for mapped data.
- Show examples before full acceptance.
- Show exceptions in human language.
- Preserve access to source exports where possible.
- Provide post-migration verification workflows.
- Maintain a clear path for correction.

## Migration Architecture

Migration architecture should be treated as product infrastructure.

It should support repeatable ingestion, mapping, validation, review, correction, audit, and post-migration reconciliation. It should not be a one-off script per clinic.

### Core Capabilities

- Source connector framework
- Raw data preservation
- Parsing and normalization
- Field mapping
- Entity resolution
- Duplicate detection
- Confidence scoring
- Exception handling
- Human review
- Validation rules
- Dry runs
- Cutover planning
- Post-go-live reconciliation
- Audit history

### Architectural Constraints

- Imported data must preserve source traceability.
- Uncertain data must be labeled.
- Corrections should be auditable.
- Repeat migrations should be possible during rehearsal.
- Cutover should not depend on hidden manual steps.
- Migration tooling should improve with each source system.

## Migration Validation

Validation is the process of proving that migrated data is useful, trustworthy, and operationally safe.

Validation should happen at multiple levels:

- File or export integrity
- Field-level mapping
- Entity-level completeness
- Relationship consistency
- Clinical continuity
- Financial continuity
- Appointment continuity
- Attachment availability
- User-facing verification
- Post-go-live reconciliation

Validation should be both automated and human-reviewed. Automation can find structural problems. Humans are needed to confirm meaning.

## Rollback Strategy

Rollback is not only a technical recovery plan. It is a trust plan.

Clinics need to know what happens if migration reveals serious issues, if cutover is not ready, or if post-go-live data problems threaten operations.

### Rollback Questions

- What conditions prevent go-live?
- What conditions require delaying cutover?
- What data can be corrected after go-live?
- What data must be corrected before go-live?
- How long is the legacy system kept available?
- What is the communication plan if rollback is needed?
- Who has authority to make the rollback decision?

### Rollback Requirements

- Dry-run migrations before cutover
- Clear go/no-go criteria
- Preserved raw source exports
- Ability to rerun transformations
- Post-migration issue triage
- Documented customer communication

## Data Verification

Data verification should be designed for clinic confidence.

Most users cannot verify a migration by reviewing tables. They verify it by asking, "Can I find the patients, histories, appointments, balances, and documents I need to run the hospital?"

### Verification Surfaces

- Patient samples
- Client samples
- High-value or high-risk patients
- Recently active patients
- Upcoming appointments
- Open invoices
- Active medications
- Recent lab results
- Attachments
- Inventory items
- Communication examples

### Verification Questions

- Is the right data present?
- Is it attached to the right entity?
- Is it understandable?
- Is it complete enough for care?
- Is uncertainty visible?
- Does the clinic know what did not migrate?

## Attachment Migration

Attachments may include PDFs, scanned records, images, lab reports, consent forms, estimates, discharge instructions, referral documents, and miscellaneous files.

### Known Challenges

- Large file volume
- Inconsistent naming
- Missing metadata
- Duplicate files
- Attachments linked to the wrong patient or client
- Unsupported formats
- Slow transfer
- Mixed clinical and administrative content

### Strategy

- Preserve source file references.
- Attach files to the most reliable known entity.
- Label uncertain attachment relationships.
- Prioritize clinically important and recent attachments.
- Provide verification samples.

## Medical History Migration

Medical history is the core of clinical continuity.

It may include structured records, free-text notes, templates, problem lists, diagnoses, vaccines, medications, allergies, weights, vitals, procedures, reminders, lab results, images, and scanned files.

### Known Challenges

- Free text mixed with structured data
- Template artifacts
- Inconsistent terminology
- Duplicated or outdated problems
- Missing timestamps
- Provider attribution differences
- Historical data that should be searchable but not over-modeled

### Strategy

- Preserve clinical chronology.
- Prioritize recent and active medical context.
- Avoid over-normalizing ambiguous history.
- Maintain source traceability.
- Use AI assistance only where uncertainty remains visible.

## Invoice Migration

Invoices represent financial history, client trust, reporting, and operational continuity.

### Known Challenges

- Historical pricing changes
- Discounts and adjustments
- Partial payments
- Credits and balances
- Voided or corrected invoices
- Tax handling
- Bundled items
- Links between invoices and medical services

### Strategy

- Preserve financial history clearly.
- Identify open balances and unresolved payments.
- Avoid rewriting historical invoices into a false modern structure.
- Make estimate-to-invoice relationships visible where possible.

## Appointment Migration

Appointments represent immediate operational continuity.

### Known Challenges

- Future appointments may include incomplete reasons.
- Appointment types vary by clinic and source system.
- Recurring appointments and reminders may be inconsistently represented.
- Provider, room, and resource mappings may not match Sparki concepts.
- Cancelled and no-show history may be useful but noisy.

### Strategy

- Prioritize future appointments and active scheduling commitments.
- Preserve reason-for-visit where available.
- Map appointment types carefully and review exceptions.
- Verify upcoming schedule before go-live.

## Communication Migration

Communication may live in the practice management system, phone systems, SMS tools, email, portals, or external platforms.

### Known Challenges

- Multiple communication sources
- Incomplete message history
- Missing patient association
- Shared family or multi-pet conversations
- Attachments inside conversations
- Consent and opt-in status
- Channel-specific metadata

### Strategy

- Preserve clinically relevant communication where possible.
- Identify communication that cannot be confidently attached to a patient.
- Maintain client identity and channel metadata.
- Do not imply completeness when communication history is partial.

## Lab Migration

Lab migration affects clinical continuity, trend analysis, and follow-up.

### Known Challenges

- External vendor result formats
- In-house analyzer data
- PDF-only reports
- Structured values mixed with images or attachments
- Reference range differences
- Patient matching
- Missing review or communication status

### Strategy

- Preserve lab chronology.
- Preserve original reports.
- Normalize structured values only where confidence is high.
- Flag results that cannot be mapped cleanly.
- Verify recent and clinically relevant results.

## Inventory Migration

Inventory affects medications, procedures, billing, ordering, and operational readiness.

### Known Challenges

- Duplicate item names
- Inconsistent units
- Old inactive items
- Vendor-specific SKUs
- Pricing mismatches
- Quantity inaccuracies
- Expiration data gaps
- Treatment items mixed with retail items

### Strategy

- Separate active from historical inventory.
- Preserve item history without importing unnecessary clutter.
- Review medication and high-use items first.
- Map units and pricing with human verification.
- Expect inventory cleanup to be part of migration.

## AI-Assisted Field Mapping

AI can help migration by reducing manual mapping effort and surfacing likely relationships.

### Potential Uses

- Suggest source-to-target field mappings
- Detect likely duplicate clients or patients
- Classify attachments
- Extract structured details from notes or PDFs
- Identify appointment type patterns
- Summarize mapping uncertainty
- Generate human-readable exception explanations

### Guardrails

- AI suggestions must be reviewable.
- Confidence must be visible.
- Source data must remain traceable.
- AI should not silently transform clinical or financial meaning.
- Human approval is required for high-risk mappings.

## Migration Progress UX

Migration progress should be understandable to a practice owner, manager, and implementation lead.

Progress should not be a percentage alone. A clinic needs to understand readiness by domain and risk.

### Progress Dimensions

- Source exports received
- Data parsed
- Data mapped
- Validation complete
- Exceptions open
- Customer review pending
- Dry run complete
- Go-live readiness
- Post-go-live verification pending

### UX Requirements

- Show domain-level readiness.
- Show blockers separately from warnings.
- Show examples of migrated data.
- Show what is waiting on Sparki versus the clinic.
- Show the expected next step.
- Show confidence and uncertainty without panic.

## Post-Migration Verification

The migration product does not end at go-live.

Post-migration verification is where confidence becomes durable. The clinic should have a structured way to report issues, validate critical data, and close the migration chapter.

### Verification Areas

- Recently active patients
- Upcoming appointments
- Open invoices and balances
- Active medications
- Lab results
- Attachments
- Inventory items
- Communication threads
- Follow-up tasks

### Post-Go-Live Questions

- Can staff find what they need during live work?
- Are migrated records understandable?
- Are missing or uncertain items visible?
- Are issues being triaged quickly?
- Is the clinic gaining confidence each day?

## Future Connector Architecture

Sparki should build toward reusable source connectors rather than one-off migration scripts.

### Connector Goals

- Encode knowledge of source system data shapes.
- Support repeatable dry runs.
- Preserve raw export lineage.
- Improve with each migration.
- Support domain-specific validation.
- Separate source parsing from Sparki domain modeling.

### Future Capabilities

- Source-specific export guides
- Automated export completeness checks
- Field mapping libraries
- Transformation versioning
- Connector quality scores
- Migration rehearsal environments
- Customer-facing verification portals

## Known Migration Challenges

- Clinics may not have full access to their source data.
- Vendors may make exports difficult, incomplete, slow, or expensive.
- Export formats may vary by version, configuration, or clinic usage.
- Data may be technically present but operationally misleading.
- Local workarounds may encode meaning that is invisible in the schema.
- Duplicate records may be common and sensitive to merge.
- Historical data may be too messy to normalize safely.
- Staff may disagree on what "correct" means.
- Owners may want completeness while users need relevance.
- Go-live timelines may create pressure to accept unresolved risk.
- Attachments and scans may be large, disorganized, or poorly linked.
- Communication data may be split across multiple tools.
- Financial history may not map cleanly to new accounting concepts.
- Inventory may require cleanup before it becomes useful.
- AI can accelerate review but can also create false confidence if not governed.

## Future Research: PackLeader

TODO: Document export capabilities, data model shape, attachment handling, appointment data, invoice history, medical history structure, communication availability, common migration risks, and customer verification needs.

## Future Research: Cornerstone

TODO: Document export capabilities, data model shape, attachment handling, appointment data, invoice history, medical history structure, communication availability, common migration risks, and customer verification needs.

## Future Research: Avimark

TODO: Document export capabilities, data model shape, attachment handling, appointment data, invoice history, medical history structure, communication availability, common migration risks, and customer verification needs.

## Future Research: ezyVet

TODO: Document export capabilities, data model shape, attachment handling, appointment data, invoice history, medical history structure, communication availability, common migration risks, and customer verification needs.

## Future Research: Neo

TODO: Document export capabilities, data model shape, attachment handling, appointment data, invoice history, medical history structure, communication availability, common migration risks, and customer verification needs.

## Future Research: Vetspire

TODO: Document export capabilities, data model shape, attachment handling, appointment data, invoice history, medical history structure, communication availability, common migration risks, and customer verification needs.

## Future Research: Covetrus

TODO: Document export capabilities, data model shape, attachment handling, appointment data, invoice history, medical history structure, communication availability, common migration risks, and customer verification needs.

## Future Research: Digitail

TODO: Document export capabilities, data model shape, attachment handling, appointment data, invoice history, medical history structure, communication availability, common migration risks, and customer verification needs.

## Future Research: Shepherd

TODO: Document export capabilities, data model shape, attachment handling, appointment data, invoice history, medical history structure, communication availability, common migration risks, and customer verification needs.

## The Perfect Migration Experience

The perfect migration experience feels like being guided through a serious move by a team that has done it before.

From the first upload, the clinic owner should feel that Sparki understands the weight of what is being moved. The experience should not feel casual, mysterious, or technical for its own sake. It should feel calm, explicit, and controlled.

The owner should know what Sparki has received, what Sparki is doing, what still needs attention, and what risks remain. They should see progress by the parts of the hospital they care about: patients, clients, medical history, appointments, invoices, attachments, labs, inventory, communication, and follow-up.

When data is uncertain, Sparki should say so plainly. When data is ready, Sparki should show examples. When the clinic needs to review something, Sparki should make the review finite and understandable. When there is a blocker, Sparki should identify the owner, the consequence, and the path forward.

The owner should not feel that they are managing an import. They should feel that the hospital is being carefully relocated.

By go-live, the clinic should feel three things:

- We know what moved.
- We know what did not move.
- We trust that we can operate tomorrow.

The best migration does not end with surprise relief that nothing broke. It ends with confidence before the first appointment begins.

## Related Documents

### References

- [Product Constitution](./00-product-constitution.md)
- [Sparki Thesis](./03-sparki-thesis.md)
- [Veterinary Mental Models](./04-veterinary-mental-models.md)
- [Clinic Workflow Atlas](./05-clinic-workflow-atlas.md)
- [Migration Engine](../specs/10-migration-engine.md)
- [ADR-003 Migration First](../adr/ADR-003-migration-first.md)

### Depends On

- [Product Constitution](./00-product-constitution.md)
- [Sparki Thesis](./03-sparki-thesis.md)
- [Clinic Workflow Atlas](./05-clinic-workflow-atlas.md)

### Referenced By

- TODO: Add links as migration specs, connector ADRs, onboarding docs, and implementation playbooks reference this strategy.

### Future Work

- TODO: Conduct source-system research for each named platform.
- TODO: Define migration readiness criteria by data domain.
- TODO: Create a migration validation matrix.
- TODO: Define customer-facing migration progress states.
- TODO: Draft connector architecture ADRs.
