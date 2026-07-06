# ADR-003 Migration First

## Status

Proposed

## Date

TBD

## Constitutional Reference

This ADR inherits from the [Product Constitution](../blueprint/00-product-constitution.md), especially the commandment that migration is a core product.

TODO: When this ADR is accepted, cite the exact constitutional principle and any principle conflict it resolves.

## Purpose

Record the decision that migration is a first-class product and architecture concern for Sparki.

## Context

Veterinary clinics often depend on years of patient, client, clinical, financial, communication, and inventory data. A superior product can still fail if migration is risky, opaque, or operationally painful.

## Decision

TBD. This ADR will define how migration requirements shape data modeling, onboarding, validation, support tooling, and launch readiness.

## Consequences

TBD. Future versions should document implementation tradeoffs, system constraints, and customer-facing implications.

## Goals

- Make migration predictable and trustworthy.
- Treat data validation as part of the customer experience.
- Support legacy system realities without copying legacy product structure.
- Reduce adoption risk for clinics switching to Sparki.

## Guiding Questions

- Which data domains are required before cutover?
- How should migration confidence be measured and displayed?
- What tooling does the internal team need to inspect and repair migration issues?
- How does migration influence the canonical Sparki data model?

## Future Sections

- Migration readiness criteria
- Source system strategy
- Validation model
- Exception taxonomy
- Customer review flow
- Operational tooling

## Known Decisions

- Migration is part of the product.
- Migration readiness is a launch requirement, not a post-sale task.

## Open Questions

- Which legacy system should be supported first?
- What data quality issues are most common?
- What should the migration rollback or recovery model be?

## Notes

This ADR should stay closely linked to the migration engine spec.
