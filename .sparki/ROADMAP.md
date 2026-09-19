# Product Roadmap

Sparki uses a rolling product roadmap rather than development phases. Prior phase closeouts are historical evidence, not active planning gates.

## Now

- Review and stabilize the Anna-workflow implementation: patient-profile medications and invoices, exam closeout, Hospital Services, and patient-first intake.
- Keep the loop small: build the requested behavior, run focused tests, fix failures, then run broader checks proportional to risk.
- Keep clinical authorship, permissions, audit trails, tenant isolation, controlled inventory, and honest payment semantics intact.

## Next, after product input

- Medical-record, visit-summary, discharge, medication-label, and prescription print outputs.
- Searchable RDVM intake directory.
- Visitless phone-refill billing.
- Recorded FAS score and behavioral-note workflow.
- Automatic markup calculation, if desired.

## Inputs needed

- Example PDF and Packleader medication/invoice screenshots.
- Phone-refill invoice policy.
- Markup calculation behavior.
- RDVM directory source/licensing.
- FAS scale and capture workflow.

## Ongoing engineering work

- Fix product/test drift when working in the affected surface instead of carrying a permanent phase exception.
- Use full integration, build, and browser suites for cross-cutting changes and release readiness; use focused checks for small local changes.
- Preserve historical closeouts and run artifacts as reference-only evidence.
