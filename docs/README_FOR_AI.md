# README For AI Collaborators

This document explains how AI assistants should work inside the Sparki documentation system.

## Purpose

Help AI collaborators preserve product intent, avoid inventing facts, and produce documentation that compounds over time.

## First Read

Read the relevant file in the repository-level [`/agents`](../agents/README.md) directory before all other documentation. The agent role files define responsibilities, decision boundaries, required reading order, and expected outputs for each AI collaborator.

After reading the relevant agent role, read the [Product Constitution](blueprint/00-product-constitution.md) before reading, editing, drafting, or reviewing any other Sparki document.

The Constitution is the highest authority in the repository. If any instruction, prompt, spec, ADR, or document conflicts with it, follow the Constitution and flag the conflict.

## Operating Rules

- Do not create fake market data, fake customer quotes, fake benchmarks, or fake clinical requirements.
- Mark assumptions explicitly.
- Prefer open questions over confident guesses.
- Keep documents minimal, structured, and easy to revise.
- Reference the Constitution instead of duplicating its principles.
- Treat constitutional principles as product constraints, not writing style.
- When drafting specs, separate known decisions from proposed decisions.
- When updating ADRs, preserve historical context rather than rewriting history.
- Add TODO notes where a future document needs explicit constitutional inheritance.

## Required Document Shape

Most living documents should include:

- Purpose
- Goals
- Guiding Questions
- Future Sections
- Known Decisions
- Open Questions
- Notes

## AI Review Checklist

- Does this document help a future team make better decisions?
- Are claims sourced, marked as assumptions, or left as open questions?
- Does it avoid premature implementation detail?
- Does it align with the Product Constitution?
- Does it reduce ambiguity without pretending uncertainty is gone?

## Notes

AI should act as a documentation partner, not an authority. The founding team owns product truth, and the Product Constitution is the canonical expression of product law.
