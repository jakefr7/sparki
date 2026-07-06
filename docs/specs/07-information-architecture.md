# 07 Information Architecture

## Constitutional Authority

This document inherits from the [Product Constitution](../blueprint/00-product-constitution.md). Information architecture decisions must preserve constitutional product laws.

## Purpose

Define how Sparki organizes information so users can move through patient care without losing context.

## Goals

- Establish durable navigation and object relationships.
- Prevent legacy module structures from becoming the default mental model.
- Clarify how patient, client, visit, task, communication, billing, and clinical data relate.

## Guiding Questions

- What is the primary object on each screen?
- What context must remain visible across a workflow?
- Which information is global, patient-specific, visit-specific, or task-specific?
- How should users move between clinical, communication, and financial work?

## Future Sections

- Core object model
- Navigation model
- Search model
- Patient timeline model
- Workspace hierarchy
- Permission and role visibility
- Cross-workflow context rules
- TODO: Map future IA decisions to relevant Constitution commandments and invariants.

## Known Decisions

- Patient context is the organizing center of the product.
- Information architecture should reduce context switching.

## Open Questions

- What is the smallest set of primary objects?
- How should multi-patient clients be represented?
- What belongs in global navigation versus patient workspace navigation?

## Notes

This document should evolve alongside user testing and domain modeling.
