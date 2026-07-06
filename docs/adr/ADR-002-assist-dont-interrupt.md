# ADR-002 Assist Don't Interrupt

## Status

Proposed

## Date

TBD

## Constitutional Reference

This ADR inherits from the [Product Constitution](../blueprint/00-product-constitution.md), especially the commandment to assist without interrupting.

TODO: When this ADR is accepted, cite the exact constitutional principle and any principle conflict it resolves.

## Purpose

Record the product and architecture decision that Sparki should assist users inside their workflow rather than interrupting them with unnecessary prompts, modals, alerts, or disconnected AI experiences.

## Context

Veterinary teams work under time pressure. Assistance that demands attention at the wrong moment can become another form of work. Sparki must distinguish helpful intervention from interruption.

## Decision

TBD. This ADR will define how Sparki evaluates interruptions, suggestions, confirmations, alerts, and AI-generated assistance.

## Consequences

TBD. Future versions should describe interaction standards, notification constraints, safety exceptions, and measurement strategy.

## Goals

- Reduce avoidable interruptions.
- Make assistance contextual and timely.
- Preserve user trust by making system behavior predictable.
- Support safety-critical exceptions where interruption is justified.

## Guiding Questions

- When is interruption clinically or operationally necessary?
- What assistance can be passive, prefilled, or deferred?
- How should users dismiss, accept, edit, or audit suggestions?
- How will Sparki measure interruption cost?

## Future Sections

- Interaction standards
- Notification hierarchy
- AI assistance patterns
- Safety exception policy
- Measurement framework

## Known Decisions

- Assistance should happen in workflow context.
- AI should not create extra review burden without clear value.

## Open Questions

- What alert types deserve immediate interruption?
- What is the standard pattern for AI suggestions?
- How should the product handle repeated ignored suggestions?

## Notes

This ADR should influence product review, design systems, AI strategy, and workflow specs.
