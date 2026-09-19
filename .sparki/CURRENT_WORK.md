# Current Work

Last updated: 2026-09-16

Sparki no longer uses active development phases. Work is driven by the user's current request, the Product Constitution, and the live product state.

## Working method

1. Inspect the relevant current code and product rules.
2. Build the smallest cohesive change that completes the requested workflow.
3. Run focused tests while implementing.
4. Fix regressions immediately instead of accumulating them behind a phase gate.
5. Run broader typecheck, lint, integration, or production-build checks when the change's risk and reach justify them.
6. Report what changed, what passed, and what remains unresolved.

Full-repository and browser suites are release-readiness tools, not a mandatory ceremony for every small change. Tests must never be weakened to obtain a green result.

## Active product work

- Stabilize and review the patient-profile medication, invoice, exam-closeout, Hospital Services, and new-patient intake changes from the Anna workflow discussion.
- Continue with print outputs, RDVM intake, visitless phone-refill billing, and FAS capture only after the open product inputs below are resolved.

## Open inputs

- Example discharge/medical-record PDF and Packleader medication/invoice screenshots.
- Whether a phone refill without an active visit creates a standalone encounter/invoice.
- Whether markup is informational or calculates selling price.
- RDVM directory source and licensing.
- FAS scale and the workflow where staff record or update it.

## Safety boundaries

- Preserve clinical authorship, medication auditability, controlled-inventory safeguards, tenant isolation, and honest external-payment semantics.
- Do not deploy, merge, modify production data, expose secrets, or perform destructive repository operations without explicit authority.
- Historical phase closeouts and run artifacts are evidence only. They do not define current scope or authorize continuation work.
