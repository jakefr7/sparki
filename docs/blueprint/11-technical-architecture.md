# 11 Technical Architecture

## Constitutional Authority

This document inherits from the [Product Constitution](./00-product-constitution.md). If it conflicts with the Constitution, the Constitution governs.

## Purpose

Capture Sparki's technical architecture principles, system boundaries, and long-term platform direction without prematurely prescribing implementation details.

## Goals

- Align engineering decisions with product philosophy.
- Define the architecture qualities Sparki must preserve as it scales.
- Provide a home for system diagrams, service boundaries, data ownership, integration strategy, and reliability standards.

## Guiding Questions

- What architecture best supports patient-first workflows?
- Where must the system be real-time, resilient, or offline-tolerant?
- What data models are foundational and should be difficult to fragment?
- How should integrations avoid recreating legacy complexity?
- How will the system support safe AI assistance?

## Future Sections

- System context diagram
- Domain model
- Data ownership model
- Event and workflow architecture
- Integration architecture
- Security and compliance model
- Observability standards
- Performance budgets
- TODO: Map future architecture principles to constitutional constraints.

## Known Decisions

- Architecture should be shaped around patient workflow continuity.
- Migration, integrations, and AI assistance are first-class platform concerns.
- Technical decisions with long-term implications should be captured as ADRs.

## Open Questions

- What are the initial bounded contexts?
- Which system capabilities must be real-time on day one?
- What data should be immutable, versioned, or auditable?
- What compliance requirements apply to early target markets?

## Notes

This document should describe architectural intent. Detailed implementation belongs in focused specs and ADRs.
