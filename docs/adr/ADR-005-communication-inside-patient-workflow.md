# ADR-005 Communication Inside Patient Workflow

## Status

Proposed

## Date

TBD

## Constitutional Reference

This ADR inherits from the [Product Constitution](../blueprint/00-product-constitution.md), especially the commandment that communication belongs with the patient.

TODO: When this ADR is accepted, cite the exact constitutional principle and any principle conflict it resolves.

## Purpose

Record the decision that client and clinic communication should live inside the patient workflow rather than as a detached inbox or external tool.

## Context

Communication often carries clinical context, approvals, follow-ups, medication questions, estimates, and care instructions. When communication is separated from patient records, teams lose time and context.

## Decision

TBD. This ADR will define how communication relates to patients, clients, visits, tasks, and records.

## Consequences

TBD. Future versions should document data model implications, privacy considerations, notification behavior, and workflow tradeoffs.

## Goals

- Preserve communication context.
- Reduce duplicate documentation.
- Make follow-up work visible inside patient workflows.

## Guiding Questions

- What communication belongs on the patient timeline?
- How should multi-pet and multi-owner communication work?
- What communication needs to become a task, note, approval, or record?

## Future Sections

- Communication object model
- Timeline behavior
- Notification rules
- Client identity and permissions
- Auditability

## Known Decisions

- Communication belongs inside patient workflow.
- Communication should not force users to leave patient context.

## Open Questions

- What channels should be supported first?
- How should conversations map to one or many patients?
- What communication events require clinical review?

## Notes

This ADR should link to patient workspace and information architecture.
