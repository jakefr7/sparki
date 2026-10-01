# Terminology

- **Patient:** use “Patient” instead of “Pet” throughout user-facing product language, including labels, search placeholders, hints, and validation messages (founder direction, 2026-10-01). Outstanding occurrences are recorded in the patient-creation review; this direction does not require renaming internal identifiers during a copy change.

- **Current work:** the live, user-directed work list in `CURRENT_WORK.md`.
- **Build → test → fix:** implement the smallest cohesive change, run the most relevant checks, repair failures, and broaden verification according to risk.
- **Focused test:** the smallest test set that directly exercises the changed behavior.
- **Broader verification:** typecheck, lint, integration, production build, or browser tests selected according to the change's reach and release risk.
- **Historical evidence:** prior closeouts and immutable run artifacts retained for provenance, not as active scope or approval gates.
- **Review:** an evidence-based assessment of the current change and surrounding system.
- **Founder decision:** an immediate stop when policy, destructive action, secrets, deployment, architecture, or material scope requires human authority.
