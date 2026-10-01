# Current Work

Last updated: 2026-09-30

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

- Prioritize scheduler and inventory design/use per the 2026-09-30 user request. Start with navigation, search speed and preserved context; see [today's work plan](../docs/research/scheduler-inventory-work-plan-2026-09-30.md).
- Stabilize and review the patient-profile medication, invoice, exam-closeout, Hospital Services, and new-patient intake changes from the Anna workflow discussion.
- Implement Anna workflow gaps per the founder request: inventory usability, current-information PDFs, authorized prescriptions, medication-only refill encounters, dispensing/labels, and referral handoff. Follow a small build/test/fix loop. FAS, pricing calculations, label hardware, specialty fields, and migration remain dependent on clinic input.

## Open inputs

- Pack Leader medication/invoice and discharge screenshots received and assessed on 2026-09-30; an actual clinical PDF remains useful (the supplied PDF was a domain invoice). See the [gap assessment](../docs/research/packleader-anna-workflow-gap-assessment-2026-09-30.md).
- Approved: phone refills use a medication-only encounter and linked invoice; no fabricated exam appointment.
- Markup calculation, FAS scale, ophthalmology fields and physical label format: see [questions for Anna](../docs/research/questions-for-anna-2026-09-30.md).
- RDVM directory source and licensing.
- FAS scale and the workflow where staff record or update it.

## Safety boundaries

- Preserve clinical authorship, medication auditability, controlled-inventory safeguards, tenant isolation, and honest external-payment semantics.
- Do not deploy, merge, modify production data, expose secrets, or perform destructive repository operations without explicit authority.
- Historical phase closeouts and run artifacts are evidence only. They do not define current scope or authorize continuation work.

## September 30 implementation decisions

- PDFs regenerate from current information at download, rather than retaining issued snapshots. Locked SOAP remains immutable and amendments are separately attributed.
- Veterinarians and owners authorize prescriptions; technicians and medication clerks prepare drafts and dispense authorized orders.
- Claude is working on the landing-page frontend; preserve those concurrent changes.

## Implemented increment: patient documents and prescription authoring

- Inventory item drawer now opens the existing adjustment form with the selected item. Preview follows the selected stock location and lot, and shows the stock unit; available-stock meaning is explicit.
- Discharge, signed medical-record/amendment, and finalized-receipt PDF downloads use current saved information, preserve source readiness and access boundaries, and cause no clinical/inventory/financial mutation.
- Prescription preparation, owner/veterinarian authorization, audited cancellation and PDF download are available in the patient medication area. Authorization uses optimistic version checks and preserves the named prescribing identity. This is paper-prescription authoring, not external e-prescribing or dispensing.
- The new prescription migration was verified against disposable test databases and applied only to the verified localhost development database.
- Next unfinished work: medication-only refill encounters and linked invoices; prescription-aware dispensing using existing inventory/controlled services; physical labels after printer details; referral contacts and handoff; clinic-specific FAS/markup/ophthalmology details and migration validation.
- Anna's unanswered clinic questions are in [questions for Anna](../docs/research/questions-for-anna-2026-09-30.md). Do not infer dosing, financial calculation rules, or clinical measurement scales from the screenshots.

Verification: API/web typechecks and focused lint passed; six document unit tests, 29 document/billing/prescription integration tests, and both focused inventory/prescription browser scenarios passed. Four-page synthetic document layout inspected. Existing unrelated CSS/Next warnings remain. Claude landing-page edits were preserved.
