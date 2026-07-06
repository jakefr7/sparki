# 00 Clinic Provisioning v1

## Constitutional Authority

This module spec inherits from the [Product Constitution](../../blueprint/00-product-constitution.md). If this spec conflicts with the Constitution, the Constitution governs.

## Purpose

Define the minimum information required for a brand-new veterinary clinic to begin operating inside Sparki.

This is not a signup flow, authentication flow, billing flow, or marketing onboarding flow.

This document answers one question:

What information must exist before a clinic can begin seeing patients in Sparki?

The standard is practical: a contracted clinic should be operational in under one hour.

## Scope

Clinic provisioning should create only the defaults required to support:

- Login.
- Patient Search.
- Patient Workspace.
- Schedule Appointment.
- Create Visit.
- Update Visit State.
- Create Medical Record.
- Persist clinic-owned data.

If a field is not required before the clinic can see patients, it should not block provisioning.

## Provisioning Principle

Provisioning should create a usable clinic, not a perfectly configured clinic.

Required information should be limited to data that prevents the first clinical day from functioning without unsafe assumptions.

Everything else should have a plain default, be optional, or be deferred.

## Minimum Required Configuration

### 1. Organization

| Field | Required? | Default Value | Why Sparki Needs It |
| --- | --- | --- | --- |
| Organization name | Required | None | Creates the top-level tenant boundary for ownership, permissions, migration, and data isolation. |
| Organization legal name | Optional | Same as Organization name | Useful later for contracts, exports, billing, and enterprise setup, but not required to see patients. |
| Organization status | Required | `Active` | Prevents ambiguous access state. A clinic must be active before users can operate. |

Do not require corporate address, tax ID, billing contact, or legal entity details for MVP operations.

### 2. Locations

| Field | Required? | Default Value | Why Sparki Needs It |
| --- | --- | --- | --- |
| At least one Location | Required | None | Appointments, Visits, Users, and clinic operations need a site boundary. |
| Location name | Required | `Main Location` if not supplied | Users need a human-readable site name. |
| Location status | Required | `Active` | Prevents scheduling or Visit creation into inactive sites. |
| Location address | Optional | None | Useful for reminders, exports, and client-facing communication, but not required for internal operation. |

MVP should support one Location by default. Multi-location setup can happen later.

### 3. Users

| Field | Required? | Default Value | Why Sparki Needs It |
| --- | --- | --- | --- |
| At least one user | Required | None | Someone must administer and use the clinic. |
| User name | Required | None | Needed for attribution, record authorship, and operational clarity. |
| User email | Required | None | Needed for authentication identity and invite mapping. |
| User status | Required | `Active` | Prevents inactive accounts from operating. |
| Location access | Required | First active Location | Users need a Location scope for scheduling, visits, and data access. |

Do not require phone number, title, license number, profile photo, or notification preferences for MVP operations.

### 4. Roles

| Field | Required? | Default Value | Why Sparki Needs It |
| --- | --- | --- | --- |
| Role set | Required | Seed standard roles | Permissions depend on role capabilities. |
| Role assignment per user | Required | First user gets `Practice Manager` and `Hospital Owner`; additional users must have at least one role | Users need operational boundaries. |

Required standard roles:

- Receptionist.
- Technician.
- Veterinarian.
- Practice Manager.
- Hospital Owner.

Do not require custom roles before launch.

### 5. Doctors

Sparki architecture should use `Veterinarian`, but clinics may say "doctor" in setup conversations.

| Field | Required? | Default Value | Why Sparki Needs It |
| --- | --- | --- | --- |
| At least one Veterinarian user | Required before clinical visits | None | Medical Records, Clinical Decisions, prescriptions, and signoff require clinical ownership. |
| Veterinarian display name | Required | User name | Needed for scheduling, Visit ownership, and Medical Record attribution. |
| Veterinarian email | Required | User email | Needed for authentication and identity. |
| License information | Optional for MVP | None | Important later for compliance, prescriptions, and exports, but not required for the first scheduling/visit slice. |

If a clinic has no Veterinarian user, Sparki can support administrative setup but should not treat clinical Visit flow as ready.

### 6. Technicians

| Field | Required? | Default Value | Why Sparki Needs It |
| --- | --- | --- | --- |
| Technician users | Optional | None | Clinics can begin scheduling and basic Visit flow without technician accounts, especially small clinics. |
| Technician role assignment | Required if technician user exists | `Technician` | Needed for intake, treatment support, and Work ownership. |

Technician setup should not block provisioning.

### 7. Receptionists

| Field | Required? | Default Value | Why Sparki Needs It |
| --- | --- | --- | --- |
| Receptionist users | Optional if Practice Manager can schedule | None | Scheduling needs a permitted user, but a specific receptionist account is not required. |
| Receptionist role assignment | Required if receptionist user exists | `Receptionist` | Needed for appointment creation, confirmation, arrival, and checkout-adjacent routing. |

At least one user must be able to schedule appointments. That user can be a Receptionist, Practice Manager, or Hospital Owner.

### 8. Appointment Types

| Field | Required? | Default Value | Why Sparki Needs It |
| --- | --- | --- | --- |
| Appointment type list | Required | Standard Sparki MVP list | Scheduling cannot operate without appointment categories. |
| Type display name | Required | Standard display names | Receptionists need clear booking options. |
| Default duration per type | Required | Standard duration defaults | Appointment creation must be fast during calls. |
| Veterinarian required flag | Required | Standard defaults | Helps prevent technician-only and doctor-required visits from being confused. |

Standard MVP appointment types:

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
- Boarding / Non-medical Service.

Clinic-specific customization can happen later. MVP should not block on perfect appointment taxonomy.

### 9. Species Supported

| Field | Required? | Default Value | Why Sparki Needs It |
| --- | --- | --- | --- |
| Species list | Required | Dog, Cat | Patient creation requires species. Defaults should match the most common small animal clinic. |
| Species active/inactive | Optional | All defaults active | Useful later for clinic-specific species support. |

Do not require breed lists or species-specific configuration for MVP provisioning.

### 10. Default Visit Durations

| Field | Required? | Default Value | Why Sparki Needs It |
| --- | --- | --- | --- |
| Default duration by appointment type | Required | Standard defaults | Scheduling needs fast time allocation without manual duration entry every time. |
| Clinic-wide fallback duration | Required | 30 minutes | Prevents appointment creation from blocking when type duration is unknown. |

Suggested starter defaults:

- Wellness / Preventive Care: 30 minutes.
- Sick Visit: 30 minutes.
- Recheck: 20 minutes.
- Technician Appointment: 15 minutes.
- Vaccination: 15 minutes.
- Surgery / Procedure: 120 minutes.
- Drop-Off: 30 minutes.
- Emergency / Urgent: 30 minutes.
- Telemedicine: 20 minutes.
- Euthanasia: 45 minutes.
- Boarding / Non-medical Service: 15 minutes.

These are defaults, not scheduling policy.

### 11. Business Hours

| Field | Required? | Default Value | Why Sparki Needs It |
| --- | --- | --- | --- |
| Business hours | Recommended, not required for first operation | Monday-Friday, 8:00 AM-5:00 PM local time | Helps schedule views and default availability, but appointments can still be created without full hours. |
| Closed days | Optional | Saturday and Sunday | Useful for warnings, not required for MVP operation. |
| Holiday schedule | Optional | None | Important later, not needed to begin. |

Business hours should warn, not block, in early MVP.

### 12. Rooms

| Field | Required? | Default Value | Why Sparki Needs It |
| --- | --- | --- | --- |
| Rooms | Optional | None | Room tracking is useful for clinic flow but not required for Patient Search, Scheduling, Visit creation, or Medical Record creation. |

Do not include rooms in required MVP provisioning.

### 13. Providers

| Field | Required? | Default Value | Why Sparki Needs It |
| --- | --- | --- | --- |
| Provider list | Required if provider-based schedule is used | Active Veterinarian users | Scheduling by provider needs provider choices. |
| Provider type | Required if provider exists | Derived from role | Helps scheduling distinguish veterinarian, technician, or resource-like provider. |
| Provider active status | Required if provider exists | Active | Prevents booking inactive providers. |

For MVP, providers should be Users with provider-capable roles. Do not create a separate provider system unless implementation proves User is insufficient.

### 14. Patient ID Strategy

| Field | Required? | Default Value | Why Sparki Needs It |
| --- | --- | --- | --- |
| Internal patient ID | Required | System-generated ID | Needed for stable references and relationships. |
| Human-readable patient number | Optional | None | Helpful for migrated clinics and phone workflows, but not required if search works. |
| Legacy patient ID preservation | Required when migrated | Source ID stored as migration provenance | Clinics need to reconcile old records without making legacy IDs the native key. |

Recommendation: use system IDs for native identity and preserve legacy IDs as provenance.

### 15. Medical Record Numbering

| Field | Required? | Default Value | Why Sparki Needs It |
| --- | --- | --- | --- |
| Internal Medical Record ID | Required | System-generated ID | Needed for durable clinical record identity. |
| Human-readable medical record number | Optional | None | Some clinics may expect this, but MVP can operate without it. |
| Legacy medical record number | Required when migrated | Source ID stored as migration provenance | Preserves trust without forcing legacy numbering into native records. |

Do not block provisioning on custom numbering rules.

### 16. Time Zone

| Field | Required? | Default Value | Why Sparki Needs It |
| --- | --- | --- | --- |
| Location time zone | Required | Browser-detected or contract-provided value; fallback requires confirmation | Appointment times, business hours, audit readability, and Visit chronology depend on correct time zone. |

Time zone is one of the few setup fields that should not be guessed silently.

### 17. Communication Defaults

| Field | Required? | Default Value | Why Sparki Needs It |
| --- | --- | --- | --- |
| Default communication method | Optional | Phone | Helpful for client communication but not required for current vertical slice. |
| Clinic phone number | Optional | None | Useful for future messaging/calls; not required for MVP internal operation. |
| SMS/email sending identity | Out of MVP | None | Belongs to communication and notification implementation. |

Do not block provisioning on messaging setup.

### 18. Migration Assumptions

| Field | Required? | Default Value | Why Sparki Needs It |
| --- | --- | --- | --- |
| Migration mode | Required | `Native start` | Sparki must know whether clinic is starting empty or with imported data. |
| Legacy source system | Required if migration mode is import | None | Source provenance is required for trust. |
| Migration confidence policy | Required if imported data exists | Show source and confidence where uncertain | Prevents migrated data from appearing cleaner than it is. |
| Future appointment verification status | Required if future appointments are imported | `Unverified` | Future appointments directly affect Monday morning operations. |

Migration setup should not require full migration tooling before MVP, but imported data must preserve source and uncertainty.

### 19. Required Defaults

The following defaults should exist before a clinic operates:

| Default | Required? | Default Value | Why Sparki Needs It |
| --- | --- | --- | --- |
| Standard roles | Required | Receptionist, Technician, Veterinarian, Practice Manager, Hospital Owner | Permissions need known capability groups. |
| Appointment types | Required | Standard MVP list | Scheduling needs fast booking categories. |
| Appointment durations | Required | Standard type defaults plus 30-minute fallback | Receptionists need speed during calls. |
| Species list | Required | Dog, Cat | Patient creation needs species. |
| Patient status | Required | Active | Patient Workspace and search need patient state. |
| Appointment source | Required | Phone | MVP scheduling is phone-call-driven by default. |
| Appointment state | Required | Draft or Scheduled depending on creation path | Scheduling lifecycle needs state. |
| Visit state | Required when Visit is created | Intent Created or Scheduled depending on source | Visit Lifecycle needs state. |
| Medical Record | Required when Patient is created or first clinical Visit begins | Create automatically | Medical Records are the clinical source of truth. |

### 20. Optional Configuration

These fields may improve clinic fit but should not block go-live:

- Location address.
- Clinic phone number.
- Business hours refinements.
- Closed days.
- Room list.
- Custom appointment durations.
- Additional appointment type labels.
- Additional species.
- User phone numbers.
- Provider display order.
- Communication preferences.
- Human-readable patient numbers.
- Human-readable medical record numbers.

### 21. Future Enterprise Configuration

Out of MVP:

- Multi-location hierarchy.
- Department/service lines.
- Custom permission matrices.
- Custom appointment type builder.
- Provider templates and preferences.
- Advanced resource booking.
- Rooms and equipment scheduling.
- Holiday calendars.
- SSO policy.
- Audit export policies.
- Legal entity and billing setup.
- Region-specific compliance configuration.
- External communication channel provisioning.
- Enterprise migration review workflows.

## Minimum Go-Live Checklist

A clinic can begin operating in Sparki when:

- Organization exists.
- At least one active Location exists.
- Time zone is confirmed.
- Standard roles exist.
- At least one active user exists.
- At least one user can schedule appointments.
- At least one Veterinarian user exists before clinical Visit workflow begins.
- Standard appointment types exist.
- Default appointment durations exist.
- Species defaults exist.
- Patient and Client creation works.
- Appointment creation works.
- Visit creation from Appointment works.
- Medical Record creation works.
- Migration mode is known.
- Imported future appointments, if any, show source and verification/confidence.

## Schema Changes Required

Current schema appears sufficient for the active vertical slice:

- Organization.
- Location.
- User.
- Role.
- Patient.
- Client.
- Appointment.
- Visit.
- MedicalRecord.
- SoapNote.
- Migration provenance fields.

Minor additions recommended before real clinic provisioning:

1. Add `Location.timeZone`.
2. Add clinic-level or Location-level provisioning defaults for:
   - appointment duration fallback,
   - active species list,
   - migration mode.
3. Add a lightweight way to store appointment type defaults if hard-coded enum defaults become insufficient.
4. Add optional `Location.status` or equivalent active/inactive marker before multi-location operation.

Not required now:

- Rooms.
- Custom medical record numbering.
- Custom patient numbering.
- Full provider model separate from User.
- Full communication settings.
- Full enterprise configuration.

## Product Risks

- If time zone is missing or guessed incorrectly, appointment times and audit readability become untrustworthy.
- If no Veterinarian user exists, clinical ownership is impossible.
- If appointment durations are not defaulted, phone booking slows down.
- If imported future appointments are not visibly sourced and verified, clinics may lose trust on day one.
- If setup asks for too much configuration, provisioning becomes a sales/onboarding project instead of a product capability.
- If rooms, custom roles, custom appointment types, and communication settings are required too early, MVP scope will expand without improving Monday morning operations.

## Engineering Impact

Immediate impact is small.

Engineering should not pause the vertical slice for a provisioning redesign.

Recommended near-term tasks:

- Add `Location.timeZone`.
- Seed or expose standard roles and appointment type defaults.
- Decide whether species defaults are code constants or stored per Organization/Location for MVP.
- Add a provisioning seed path that creates one Organization, one Location, standard roles, one admin user, appointment defaults, species defaults, and migration mode.
- Add tests proving a newly provisioned clinic can create Patient, Client, Appointment, Visit, and Medical Record.

Do not build a full onboarding UI yet.

## Recommendation

Minor additions recommended.

Existing schema is sufficient for the current vertical slice and should not be redesigned.

Before a real clinic is provisioned, add the minimum missing operational defaults: Location time zone, species defaults, appointment duration defaults, and migration mode/verification handling.

Clinic Provisioning v1 Specification Approved for engineering planning.

## Related Documents

### References

- [Product Constitution](../../blueprint/00-product-constitution.md)
- [Core Domain Model v1](../../blueprint/08-core-domain-model-v1.md)
- [Permission And Ownership v1](../../blueprint/11-permission-and-ownership-v1.md)
- [Migration Strategy](../../blueprint/06-migration-strategy.md)
- [Engineering Plan](../../engineering/00-engineering-plan.md)
- [Patient Workspace MVP](./01-patient-workspace-mvp.md)
- [Visit Lifecycle MVP](./02-visit-lifecycle-mvp.md)
- [Medical Records MVP](./03-medical-records-mvp.md)
- [Scheduling MVP](./04-scheduling-mvp.md)

### Depends On

- [Product Constitution](../../blueprint/00-product-constitution.md)
- [Core Domain Model v1](../../blueprint/08-core-domain-model-v1.md)
- [Permission And Ownership v1](../../blueprint/11-permission-and-ownership-v1.md)

### Referenced By

- TODO: Link Sprint 1 provisioning implementation tickets once created.

### Future Work

- TODO: Revisit enterprise configuration only after first clinic provisioning exposes real operational needs.
