# Sparki Documentation

This directory is the long-term source of truth for Sparki: product philosophy, research, architecture, decisions, specifications, and AI collaboration patterns.

Sparki is the next-generation Veterinary Operating System for modern veterinary medicine. These documents should help a small founding team move quickly without losing coherence, and eventually support a team of 50+ engineers, designers, operators, and clinical partners.

## Highest Authority

The [Product Constitution](blueprint/00-product-constitution.md) is the highest authority in this documentation system.

Every document should inherit from it. If another document conflicts with the Constitution, the Constitution governs until it is deliberately amended.

## Structure

- `blueprint/` - Company and product foundations.
- `research/` - Industry, competitor, persona, and workflow research.
- `specs/` - Product and platform specifications.
- `adr/` - Architecture Decision Records.
- `prompts/` - AI collaboration patterns and reusable prompts.

## How To Use This Directory

Start with the [Product Constitution](blueprint/00-product-constitution.md), then read the vision, philosophy, and patient workspace documents. New specs and ADRs should link back to the constitutional principles and decisions they depend on.

These are living documents. They should stay concise, evidence-based, and current.

TODO: As new document families are added, define how they inherit from the Product Constitution before adding detailed process.
