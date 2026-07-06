# ADR-001 Patient-First Architecture

## Status

Proposed

## Date

TBD

## Constitutional Reference

This ADR inherits from the [Product Constitution](../blueprint/00-product-constitution.md), especially the commandment that patients are the center of Sparki.

TODO: When this ADR is accepted, cite the exact constitutional principle and any principle conflict it resolves.

## Purpose

Record the decision to organize Sparki's product and technical architecture around patient-centered workflows rather than legacy software modules.

## Context

Legacy veterinary systems often expose work through modules that mirror software boundaries more than clinical reality. The Product Constitution requires patient context to remain central across clinical, communication, billing, and follow-up workflows.

## Decision

TBD. This ADR will define what patient-first architecture means for navigation, data ownership, workspace design, workflow orchestration, and integrations.

## Consequences

TBD. Future versions should document benefits, tradeoffs, operational impact, and engineering constraints.

## Goals

- Keep patient context available throughout core workflows.
- Reduce context switching between clinical, communication, and operational work.
- Guide domain modeling and product surface design.

## Guiding Questions

- What does patient-first mean at the data model level?
- What does it mean at the user interface level?
- Which workflows require patient context to remain persistent?
- Where might patient-first architecture conflict with clinic-level operations?

## Future Sections

- Domain model implications
- Navigation implications
- Data ownership implications
- Workflow examples
- Superseding decisions

## Known Decisions

- Patient context is a primary organizing principle.
- Module-first architecture is not the desired default.

## Open Questions

- What is the canonical patient object?
- How should visits, clients, invoices, communications, and tasks relate to patients?
- Which non-patient workflows still need first-class treatment?

## Notes

This ADR should link to information architecture, patient workspace, and technical architecture documents as those mature.
