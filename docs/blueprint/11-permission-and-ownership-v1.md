# 11 Permission And Ownership v1

## Constitutional Authority

This document inherits from the [Product Constitution](./00-product-constitution.md). If it conflicts with the Constitution, the Constitution governs.

## Purpose

Define the minimum global rules for ownership, authentication, authorization, role capabilities, API access, clinic isolation, and audit responsibility.

This is the final global architecture document before module specifications.

This document does not design UI, workflows, database schema, API endpoints, or implementation details.

## Objective

Give engineering enough shared language to build modules without guessing who can see, change, own, or audit core business objects.

## Core Rule

Every sensitive object must answer five questions:

- Who owns it?
- Who can view it?
- Who can change it?
- Who is responsible for the next action?
- Who is accountable if the change matters later?

## Authentication

Authentication answers: who is this actor?

Actors may include:

- User
- AI Assistant
- External Integration
- Migration process
- System behavior

Authentication must preserve identity well enough to support audit responsibility.

## Authorization

Authorization answers: what is this actor allowed to do?

Authorization should depend on:

- Organization
- Location
- Role
- Object ownership
- Object sensitivity
- Current workflow context
- Audit requirements

Authorization should be strictest for actions affecting care, money, consent, identity, migration, medical records, and permissions.

## Ownership

Ownership means responsibility for an object or next action.

Ownership is not the same as permission.

A user may be allowed to view an object without owning it. A user may own a task without owning the patient record. A location may own operational work while a veterinarian owns the clinical decision inside that work.

## Ownership Types

### Business Ownership

The Organization or Location responsible for the object.

Examples:

- Organization owns Locations.
- Location owns Schedules, Calendars, Resources, and local Inventory.

### Clinical Ownership

The veterinarian or clinical team responsible for clinical meaning.

Examples:

- Veterinarian owns Clinical Decisions.
- Veterinarian owns Prescription authority.
- Medical Record content requires clinical accountability.

### Operational Ownership

The user, role, queue, or team responsible for next action.

Examples:

- Receptionist owns checkout work.
- Technician owns intake work.
- Practice Manager owns payment escalation.

### Source Ownership

The actor or system that produced the information.

Examples:

- External Integration produced a Diagnostic Result.
- Migration process imported a legacy attachment.
- AI Assistant drafted a note.

Source ownership must not replace human accountability where judgment is required.

## Role Capabilities

Role capabilities define default authority. Module specs may narrow these further.

### Receptionist

Can manage scheduling, arrival, client communication, checkout, payment collection, routine routing, and front-desk work.

Should not own clinical decisions, prescriptions, diagnosis, medical record signoff, or clinical interpretation.

### Technician

Can manage intake, vitals, treatment tasks, medication preparation, diagnostic handling, patient handoffs, and draft documentation.

Should not finalize veterinarian-owned decisions unless a module spec defines delegation rules.

### Veterinarian

Can own clinical decisions, diagnoses, treatment plans, prescriptions, diagnostic interpretation, medical record signoff, and clinical record amendments.

Veterinarian authority should be explicit where a decision affects patient care.

### Practice Manager

Can manage operational exceptions, staff routing, payment disputes, schedule issues, configuration-sensitive operations, and non-clinical escalations.

Should not override clinical authority.

### Hospital Owner

Can manage organization-level access, business oversight, reporting, and high-level operational authority.

Should not casually bypass clinical or audit responsibility.

### AI Assistant

Can draft, summarize, classify, suggest, detect, and prepare.

Cannot own clinical decisions, consent, payment adjustments, prescriptions, record signoff, identity merges, migration acceptance, or permission changes.

### External Integration

Can create or update information only within its authorized scope.

Must preserve source attribution.

Should not silently overwrite human-owned decisions.

## Cross-Clinic Isolation

Clinic data must be isolated by Organization and Location boundaries.

Default rule: users should only access data for Organizations and Locations where they have explicit permission.

Cross-clinic access requires a clear business reason, role permission, and audit trail.

Examples that may require cross-clinic access:

- Multi-location owner reporting
- Regional operations
- Shared client or patient transfer
- Centralized migration review
- Support or implementation access

## Object Sensitivity

Some objects require stricter access and audit responsibility.

High-sensitivity objects include:

- Patient identity
- Client identity and authority
- Medical Record
- Clinical Decision
- Diagnosis
- Prescription
- Consent
- Estimate approval
- Invoice
- Payment
- Audit Event
- Migration Record
- Permission and role changes
- Accepted AI content in clinical, financial, identity, consent, or migration records

## API Access Principles

API access should follow the same ownership and authorization rules as user access.

APIs should not expose cross-clinic data by default.

External Integration access should be scoped to the minimum objects and actions needed.

AI access should be scoped to the user's role, object context, and product purpose.

Migration access should be scoped to source import, mapping, validation, correction, and review.

## Audit Responsibility

Audit responsibility answers: who is accountable later?

Audit responsibility is required when actions affect:

- Patient care
- Medical record content
- Consent
- Estimate approval
- Invoice or payment
- Identity
- Prescription
- Migration mapping or acceptance
- Permissions
- Cross-clinic access
- AI-generated content accepted into sensitive records

Audit records should preserve:

- Actor
- Role
- Organization
- Location
- Object
- Action
- Timestamp
- Source
- Previous state where relevant
- New state where relevant
- AI or integration involvement where relevant

## Delegation

Delegation allows work to move between people or roles.

Delegation does not automatically transfer clinical, financial, or audit authority.

Examples:

- Veterinarian may delegate medication preparation to Technician.
- Practice Manager may delegate payment follow-up to Receptionist.
- AI may suggest a new owner but cannot delegate sensitive work by itself.

## Temporary Access

Temporary access should be explicit, limited, and auditable.

Examples:

- Relief veterinarian
- Implementation support
- Migration review
- Emergency coverage
- Multi-location temporary staffing

Temporary access should expire or require review.

## Permission Changes

Permission changes are high-sensitivity actions.

They should always create Audit Events.

Permission changes should identify:

- Who changed access
- Whose access changed
- What changed
- Why it changed where available
- Organization and Location scope
- Effective time

## Open Questions

- Which roles are required for v1 launch?
- What temporary access cases must be supported on day one?
- Which objects require location-level versus organization-level ownership?
- What support access model is acceptable for early customer onboarding?
- Which permission changes require owner approval?

## Future Work

- Define module-specific permissions inside module specs.
- Define v1 role matrix only when implementation requires it.
- Define support and implementation access policy before first customer migration.
- Define AI access rules per module.

## Related Documents

### References

- [Product Constitution](./00-product-constitution.md)
- [Core Domain Model v1](./08-core-domain-model-v1.md)
- [Visit Engine v1](./07-visit-engine-v1.md)
- [Event Architecture v1](./09-event-architecture-v1.md)
- [Work System v1](./10-work-system-v1.md)
- [Migration Strategy](./06-migration-strategy.md)

### Depends On

- [Product Constitution](./00-product-constitution.md)
- [Core Domain Model v1](./08-core-domain-model-v1.md)
- [Event Architecture v1](./09-event-architecture-v1.md)

### Referenced By

- TODO: Add links as module specs define concrete permission requirements.

## Version Notes

- v1 defines global ownership and permission concepts only.
- v1 intentionally avoids UI, database schema, API endpoint, and implementation details.
- Future permissions should emerge from concrete module specifications.
