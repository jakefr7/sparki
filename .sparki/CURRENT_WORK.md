# Current Work

Last updated: 2026-10-04

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

- Client communication (2026-10-02): founder assigned the backend to Claude and the frontend to Codex. Local backend rebuild complete: new `client-communication` API module replaces the simulated client-thread code in staff messaging; contract in `docs/engineering/client-communication-backend.md`, decisions proposed in `docs/adr/ADR-009-client-texting-architecture.md`. Every location is still in simulation (no Telnyx account, no registered numbers); the Telnyx adapter is untested against a live account. The Communication frontend now uses the new contract locally; see the frontend increment below. Migration `20261002120000_client_communication_core` deletes old simulated conversations. Second increment the same day, per founder answers: a clinic with no approved number sees no Communication tab (`readiness.visible`; existing demo/test locations are marked simulated by migration `20261002130000_appointment_notifications`), and automated appointment texts (confirmation, reminders, rescheduled, cancelled) are built — each clinic's own rules, timing, sending hours and wording, changed only by owner or practice manager, off by default, sent only to clients with staff-recorded agreement. They are triggered from `AppointmentChange`, so the appointments module is unchanged. Both migrations are applied to the local development database only. The Communication tab, notification settings screen and appointment status display are now implemented locally; broader acceptance coverage and live-provider validation remain. Pre-frontend items 2026-10-02: the appointment notification-status endpoint is now read-only (reports `planning.upToDate` instead of planning or sending); a read-only-history visibility proposal is written in the backend contract and awaits founder approval (not implemented); START still restores replies only, pending founder decision. No push/deployment.

- Backend test safety, SPA-12 (2026-10-03, Claude leads, Codex checks): two causes found and fixed locally. (1) The isolated test runner passed a developer's `.env` through, so tests used real sign-in (the eight 401 failures, and real WorkOS sandbox users on every run), the staging attachment bucket, and whatever texting/email keys were present; the runner now blanks all of them, gives each run its own attachment folder (`ATTACHMENT_LOCAL_DIRECTORY`), and the integration config refuses to start otherwise. (2) The first signed-in request in a process bound its clinic to all untracked work in that process — in tests, the test's own fixture writes (the twelve cross-clinic failures); on a Node 20 server, a public request already in flight at that moment. Staging runs Node 24; the same leak was not reproduced there. Fixed in `packages/db/src/tenant-context.ts`. Verified: integration 358/358 (was 20 failing), unit 368, runner 13, typecheck; three browser scenarios pass on the new runner. No test was weakened. Committed as `221acc1`, pushed and deployed to staging at the founder's request on 2026-10-03; integration also passes 358/358 on Node 24. Remaining items are in KNOWN_GAPS.

- Founder follow-up: fixed workflow appearance-only settings and dated clinic/provider booking closures implemented locally; pending release migration. Existing appointments remain scheduled; removed exceptions restore weekly availability. No push/deployment.

- Admin visual refinement requested 2026-10-01: locally implemented four focused groups, inline workflow appearance editing with visible Edit actions, preserved inter-group drafts, booking setup guidance, responsive controls and safer failure handling for settings saves. Official SaaS reference review and verification scope are in `docs/research/admin-settings-audit-2026-10-01.md`. No push/deployment; full role/persistence matrix remains outside this pass.

- Patient profile UI refinement requested 2026-10-01: local changes remove the walk-in form, simplify all five tabs, retain drafts across tab switches, and improve keyboard/mobile navigation. Appointment creation is outside this pass; no staging deployment requested.
- Follow-up pressure test: use staging for testing and implement locally only; no push or deployment. Fixes cover editor focus/draft retention and partial-save messages, preserved address metadata, alert validation, prescription recovery/save controls, photo failure handling, medication autocomplete, mobile tab visibility, catalog failures, and concurrent first-invoice creation. Staging fixtures are recorded in STAGING_TESTING.md.
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

## Client communication frontend increment — October 2

October 3 navigation fix: Communication readiness now lives in the persistent authenticated layout instead of resetting on each page change. Temporary readiness errors preserve the last confirmed visibility; confirmed unavailability or denied access hides the link. Focused navigation browser regression, web typecheck and focused lint passed (existing image/CSS warnings remain). Committed and pushed at the founder's request; not deployed to staging.

Founder authorized implementation. The local inbox now uses the rebuilt API: readiness-based navigation, queue/search/paging, transcript polling, separate recipient drafts, idempotent send recovery, explicit read/unread, concurrent-safe assignment/status, consent and patient context. Added owner/practice-manager appointment text settings and read-only status on booking success/appointment details. Desktop/tablet sizing verified. Eight focused simulated browser scenarios, web typecheck, focused lint and production build passed; existing warnings remain. Backend and product policies are unchanged. No push/deployment. Details and remaining acceptance coverage: [frontend implementation notes](../docs/research/client-communication-frontend-2026-10-02.md).

## SPA-7 local remediation — October 4

Implemented visit Start Exam handoff with existing role authorization; explicit client-facing discharge fields, saved hydration/preview and closed-visit read-only behavior; honest unexamined defaults; record resume/signoff explanations; intake history/vitals in new SOAP drafts; persisted checkout contact confirmation; clinic-local care/signature timestamps; stale checkout catalog response cancellation; and readable paginated PDFs. Existing signed records and prepared discharges were not rewritten.

Both typechecks, focused lint, 24 unit tests, 86 isolated visit/billing integration tests, and the real Chromium UI regression pass. Native discharge download, saved-field/internal-marker checks, desktop/tablet previews, UTC-server/Central-browser hydration checks, and short/missing/long PDF renders verified. No commit, push or deployment. Full staging booking-to-signoff acceptance and booking retry/draft coverage remain pending. The passing UI run still logged a separate dashboard workflow-defaults initialization upsert race; this remains unresolved. Details: [SPA-7 implementation and limits](../docs/research/spa7-local-remediation-2026-10-04.md).

## SPA-7 discharge strengthening — October 4

Founder approved the comparison recommendations. Added staff-authored visit summary, diet/activity, urgent-care guidance and emergency contact, structured medication schedules, date-only recheck, and separate responsible-veterinarian/preparer attribution in the editor, saved preview, and PDF. Old discharges remain unchanged; old API updates preserve new guidance. Short medication schedules stay together; empty optional sections are omitted.

19 focused unit tests, 58 isolated visit integration tests, API/web typechecks, focused lint, and the Chromium journey passed. Browser role handoff includes technician discharge updates, another veterinarian reopening, receptionist checkout, and assigned owner/clinician signoff using development test sessions. Native download and synthetic two-page layout verified. Uncommitted/undeployed; nullable guidance migration tested in disposable databases only. The known dashboard initialization race still appears in browser server logs; real-login staging acceptance remains pending. Details: [discharge strengthening](../docs/research/spa7-discharge-strengthening-2026-10-04.md).

## Real-login staging employee handoff audit — October 4–5

User requested employee handoff testing with billing treated as unfinished. Five password logins verified in the existing test clinic. Assistant intake → technician resume/completion passes; assigned-clinician discovery/Start Exam fails on deployed staging. Arrival-to-intake queue discoverability, clinic/browser/server day consistency, profile appointment type/time, and owner clinical actions need follow-up. Audit stops before care/discharge/checkout; no bypass or deployment. Billing has partial ledger foundations but its complete review/invoice/payment/receipt workflow is not accepted. Retained fixture and full evidence: [staging handoff audit](../docs/research/staging-employee-handoff-audit-2026-10-04.md).


## Anna responses: first FAS increment — October 5

Founder asked to begin implementation from Anna's SPA-24 responses. Added staff-recorded 0–5 FAS assessments during active visits, optional handling notes, server-derived author/name/role and timestamps, append-only reassessment history, and read-only history under patient Alerts. No invented score descriptors or default score. History is scoped to the authenticated organization/location and paginated. Retry IDs recover successful saves after a lost response; optimistic Visit.version updates serialize against record signoff/closure. Existing clinical intake roles may record; receptionist/manager roles do not gain clinical capture authority. Signed/closed/checked-out visits reject new entries.

Verified: 11 focused unit checks, 3 isolated database/API scenarios (migration replay, persistence, pagination, clinic/location isolation and closure), Chromium UI capture/reassessment/reload/profile-history and lost-response retry recovery, API/web typechecks and focused lint. Tablet profile screenshot inspected. Migration applied only to disposable test databases; local development migration and staging rollout remain pending. No commit, push or deployment.

This is the first increment, not completion of SPA-30 or all Anna workflows. Discharge work already exists in the current tree; it was preserved. Pricing calculation, medication permission/reporting policy and export access remain in SPA-36; booking/reminder/refill/label improvements remain separate work. FAS observations are attached to visits and patient history; automatic inclusion in SOAP/PDF and cross-location history are outside this increment.
