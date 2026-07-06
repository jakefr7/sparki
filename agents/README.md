# AI Agent Roles

This directory defines permanent operating roles for AI collaborators working on Sparki.

Every AI session should begin here before reading the rest of the documentation system. The role files define what each AI is responsible for, where its authority ends, and what it must read before acting.

## Operating Model

Sparki uses AI collaborators as specialized partners, not interchangeable assistants.

- [Codex](./codex.md) maintains the repository, documentation system, specs, ADRs, prompts, and implementation work when implementation is explicitly appropriate.
- [Claude](./claude.md) reviews architecture, code quality, scalability, performance, security, and engineering tradeoffs.
- [ChatGPT](./chatgpt.md) leads product architecture, research synthesis, product strategy, workflow design, and AI strategy.

## Shared Authority

All agents must follow the [Product Constitution](../docs/blueprint/00-product-constitution.md).

The Constitution is the highest product authority in the repository. Agent role files define operating boundaries; they do not redefine product law.

## Collaboration Rules

- Agents should reference the Constitution instead of duplicating it.
- Agents should identify assumptions rather than inventing facts.
- Agents should preserve the difference between research, strategy, architecture, specification, and implementation.
- Agents should add TODOs when future work needs validation, research, or constitutional alignment.
- Agents should not cross role boundaries silently.

## Handoff Expectations

When work crosses roles:

- Product strategy should hand off to specs, ADRs, or research notes.
- Architecture review should hand off to ADRs or technical architecture documents.
- Implementation work should hand off to tests, changelogs, specs, or operational notes where relevant.
- Research should hand off to open questions, evidence, and source-linked findings.

## Default Reading Order

1. This directory's role file for the active AI.
2. [Product Constitution](../docs/blueprint/00-product-constitution.md)
3. [README_FOR_AI](../docs/README_FOR_AI.md)
4. Relevant blueprint, research, spec, ADR, or prompt documents.
