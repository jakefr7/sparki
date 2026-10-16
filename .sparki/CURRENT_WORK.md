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

## SPA-7 follow-up: page-header hydration error — October 5

Founder asked for a review of what remains on SPA-7 and a first fix. The recoverable React #418 is traced to the shared page header: its date and time were rendered on the server in the server's time zone (UTC on staging) and again in the browser's, so a full load of any page with that header (Dashboard, Today, Scheduler, Patients, Inventory, Settings) failed hydration and was re-rendered. The visit workspace has no header, which is why the earlier visit-page check passed. The header now fills the date and time in the browser only; it still shows the browser's time, not the clinic's (SPA-5 is unchanged).

New browser spec `apps/web/e2e/shell-hydration.spec.ts` runs the browser in a different time zone from the server: it failed on `/patients` and `/inventory` before the change and passes after. Web typecheck and focused lint pass (existing image warning remains). Local only: not committed, pushed or deployed, so the staging recheck is still owed.

Still open on SPA-7: the real-login staging journey (SPA-35), the SPA-9 booking retry/draft/duplicate checks, a native PDF download in an ordinary browser (both failed attempts were in the in-app browser; local Chromium downloads the file), and the signed-visit screen design feedback. The dashboard workflow-defaults race is untouched.

## SPA-37: pricing page header — October 5

Founder asked for the pricing page to share the landing page's header row. Cause: `/pricing` carried its own older copy of the header markup and styles, so the landing polish (floating rounded row, paw mark, "How it works", Get Started) never reached it. Both pages now render one component, `apps/web/src/components/landing/public-header.tsx`, with its own stylesheet; each page's duplicate header rules are removed. On `/pricing`, the header's Get Started opens the signup form (same as Start free) instead of linking to the page the visitor is already on — an engineering call, not a founder decision. The signup step's sticky progress bar was restyled to sit behind the floating header, since it was built for the old solid one. The pricing footer is unchanged and still differs from the landing footer (wordmark only, "Product" link).

New spec `apps/web/public-e2e/public-header.spec.ts` measures both pages' headers the same way and requires them to match (desktop, tablet, mobile); it failed before the change and passes after. The landing page is pixel-identical before and after at eight widths. Public suite: 36 pass, and the same 5 fail as before this change (three team/invitation scenarios, two historical landing tests). Web typecheck, focused lint and production build pass. Local only: not committed, pushed or deployed, so staging still shows the old pricing header.

## SPA-39: FAS moved into intake and the exam's general assessment — October 5

Founder asked to place FAS cleanly and fix the Start Exam screen it dominated. The full-width FAS card at the top of every visit is removed. FAS is now one line with the latest score, author, time and handling notes, shown under the intake vitals and inside the exam's General assessment beside pain score and body condition score; "Add score" / "Reassess" opens the 0–5 entry on request. Storage, roles, append-only history, retry recovery and read-only rules are unchanged, and the patient Alerts history card is unchanged. Recording stays optional and is not copied into the SOAP or PDF. Start exam now opens the exam from the top of the workspace; it previously kept the prior screen's scroll offset, which hid the header and step caption.

`apps/web/e2e/patient-fas.spec.ts` was rewritten first and failed on the old layout; it and `spa7-workflow.spec.ts` pass, with web typecheck and source lint. Local only: not committed, pushed or deployed. Outside the intake form and the exam form the visit page no longer shows FAS. The rest of SPA-39 (intake recap size, consistent widths, resume links) is not done.

## Local founder QA follow-ups — October 5

Implemented the remaining recorded requests without replacing Claude’s SPA-39 edits: next-actions queues newest first with matching wording; Medical History placeholder shortened to “Enter relevant history”; intake/exam/treatment placeholders black; new exam body systems default Normal with editable Abnormal/Not examined, preserving saved findings; empty discharge medication directions shown only after Add medication or when saved medication data exists. General home-care/warnings/follow-up remain available. No Linear changes, commit, push or deployment.

Verified web typecheck, focused source lint, diff whitespace checks and isolated Chromium SPA-7 visit-to-discharge/signoff plus FAS reassessment/history (2 passed). Workflow regression covers default Normal, explicit Not examined persistence, medication field gating and saved discharge across role changes. Local UI confirmed black treatment placeholders, queue wording and empty medication fields hidden. Existing dashboard-status initialization unique-constraint race still logged during the passing tests; it remains unresolved.


### October 5 — discharge page polish
- Required home care now leads the editor; additional summary, diet, activity, and emergency guidance use an expandable section that opens for saved content.
- Medication directions stay with the schedule; empty medication fields still appear only after Add medication. Warnings and follow-up use responsive paired fields; optional/required labels and follow-up checkbox styling clarified.
- Prepared badge only appears complete for clean saved content. No API, permission, clinical content, PDF, or checkout semantics changed.
- Verified local browser rendering, web typecheck, focused ESLint, and isolated spa7-workflow browser test (1 passed), including saved discharge/PDF persistence and checkout handoff. Existing dashboard status initialization race logged without test failure.

- Discharge medication UX follow-up: removed nested fieldset cards/numbered legends; entries show New medication or their entered name, with a compact accessible Remove action and full-width medication name/special instructions. Add remains secondary. Typecheck, ESLint, and isolated SPA-7 regression passed (1 test), covering multiple medication add/remove and saved persistence.

- Discharge required fields: save disabled until trimmed home care, all required medication fields, and conditionally required follow-up are filled; red asterisks and accessible required attributes added.
- Restored teal Add medication; tinted header/guidance/medication sections, subtle depth, stronger field outlines. Local visual check passed. Web typecheck and ESLint passed; isolated SPA-7 test passed after targeting textbox roles for asterisk labels and explicitly clearing the saved textarea before replacement. Regression covers disabled empty/incomplete fields and saved PDF persistence.

- Discharge action ordering: PDF download moved beside saved client preview heading. Save status/errors and the form-associated submit button moved after the preview into a final action bar alongside Back; submission remains attached to the discharge form, with required-field gating. Typecheck, focused ESLint, and isolated SPA-7 workflow regression passed (1 test, including PDF and save/reopen).

- Compact discharge redesign: home instructions lead; medication rows show name/directions with Edit/Done; additional medication directions, follow-up, and optional guidance use disclosures. Preview/PDF is available from the top instead of duplicating the document below the editor. Sticky final action is Save and finish discharge, still advancing to medical record review. Existing saved clinical content retained without copying internal notes.
- Validated desktop visual layout and isolated SPA-7 regression (1 passed), including medication collapse/edit, required fields, saved guidance, and PDF. Typecheck and focused ESLint passed.

- Save status moved inside discharge card. Preview/PDF now renders the generated saved PDF using locally bundled PDF.js with a dedicated worker (native iframe stayed blank in the in-app browser). Includes loading/retry, download/open-tab links, text alternative, and cleanup on close; dirty edits hide the saved PDF viewer. Verified actual page rendering in local browser, TypeScript, ESLint, and isolated SPA-7 regression with rendered-page assertion (1 passed).

- Busy-vet discharge refinement: shortened labels/status, removed redundant helper paragraphs, exposed actual follow-up plan/date in summary, and restored accurate Continue to review action. PDF now opens in a native modal dialog with Download/Close and focus return, preserving a text alternative. Actual PDF visually verified; TypeScript/ESLint and isolated SPA-7 workflow passed, including dialog download/close and closed-visit viewing.

- Medication entry follow-ups: name suggestions from active hospital inventory (manual entry retained); hide Add medication while editing, rename Done to Add. Typecheck/lint and SPA-7 regression passed. Empty additional medication directions now disappear when the last medication is removed; existing entered directions remain accessible.


## Anna follow-up: remove duplicate SOAP review — October 6

Founder confirmed that the veterinarian should use the existing visit review instead of a second SOAP form. The final Review step now presents saved history, readable exam findings, diagnosis, plan, completed care and home-care instructions with one Finalize visit action. Removed unsigned SOAP editing/autosave; signed records, separately attributed amendments, PDFs, underlying draft generation, server validation and signoff authorization remain intact. Existing record/resume URLs still open Review.

Verified web typecheck, focused lint and the isolated SPA-7 Chromium handoff/discharge/checkout/signoff journey. The regression confirms SOAP inputs are absent and the signed record retains history, vitals, assessment and plan. The known dashboard-default initialization upsert race still appears in server logs; it is unchanged. Local only; no commit, push or deployment.

## SPA-40 appointment testing feedback — October 9

Founder requested a reply to Anna and immediate implementation. Posted the explanation on SPA-40: missing clinic appointment configuration blocked booking; records fields save appointment context and have a preparation checklist, but create no CSR task or email; address suggestions require provider configuration; estimated DOB must retain uncertainty.

First local increment: formatted/capped ten-digit phone entry with incomplete-number validation, reused address autocomplete and retained selection metadata (cleared on manual structured-address edits), removed booking-source input, and required Visit Notes for new appointments without silently substituting the appointment type. Removed records-source and last-seen inputs and clarified that referral information is saved with the appointment without requesting records. Editing historical appointments remains compatible. Focused lint and Chromium UI contract regression passed. The browser test controls address, availability and booking responses; live-provider and successful database booking acceptance remain separate. Web typecheck passed after the browser run (an earlier concurrent attempt raced with Next generated types).

Remaining SPA-40 work: searchable/admin-managed breed choices, age-derived estimated DOB with durable estimated status, proper referring/additional-provider contacts and directory/add-hospital support, and explicit patient-linked records-request tasks/editable email drafts. Clinic appointment-type/provider/availability configuration and staging retesting remain outstanding. No staging mutation or deployment.

## Owner Admin settings signup fix — October 9

Founder reported that staging account `aclairew22@gmail.com` was active with Owner role but Admin settings grant false after paid signup. Invitation acceptance omitted that grant. Local fix sets it for new Owner accounts and shares the effective Owner-or-explicit-grant rule between the Admin API checks, configuration capability responses and `/auth/me`. Existing Owners with false stored flags receive access through their authenticated membership role once this code is deployed; no database backfill needed. Other roles still require an explicit grant. Subscription, tenant/location and role restrictions are preserved.

Verified: 25 focused unit tests, 10 isolated invitation integration tests, API typecheck and focused lint pass. Coverage includes stored Owner grants, authenticated Admin capability responses for new and legacy Owners, and non-owner grant isolation. No commit, push, deployment or staging account change.

## Appointment setup popup — October 9

Founder requested a friendly popup when a clinic has no appointment types. The shared booking modal now explains that an active type is required, points to Settings → Admin → Scheduling, and offers authorized users a direct Open Admin settings link. Other users are directed to their clinic owner/Admin manager. The shortcut opens the Admin tab with its default Scheduling group. Clinics with only inactive types also need setup. Scheduler now tracks setup loading/failure separately rather than treating failed configuration reads as empty setup, with a retry action; the shared patient/dashboard hook already does so.

Verified: four focused Chromium scenarios cover the Admin shortcut, restricted-user help/close, failed setup request and retry recovery, plus the existing booking form contract. Popup screenshot inspected; focused lint passes with four pre-existing Scheduler warnings. Web typecheck passes. No commit, push or deployment.

## SPA-40 estimated date of birth — October 16

Anna confirmed (SPA-40 comments, October 10/15) that prescriptions need a real MM/DD/YYYY date of birth even when the age is estimated, and agreed with the proposal: an estimated age calculates a date from today, staff can adjust it, and the record keeps it marked as estimated.

Local change: new `Patient.dateOfBirthEstimated` flag (migration `20261016120000_patient_estimated_date_of_birth`). One shared date-of-birth field (Known DOB / Estimated age in years and months, calendar arithmetic, editable estimated date) replaces the separate inputs in New Patient, New Appointment, Edit Profile and the `/patients/new` intake form; switching modes clears the date so an estimate never becomes a known DOB. The intake form previously saved age-derived dates as exact. Review rejected a timestamp-based backfill: time of day cannot establish provenance, so the migration leaves historical DOB classifications unchanged. The API rejects future dates and estimates without a date; an edit that omits the flag keeps the stored one, and clearing the date clears it. Profile and visit headers read "About N years old · Estimated DOB …"; `formatAge` now counts calendar birthdays and DOBs display as UTC calendar dates. Prescriptions print `DOB: MM/DD/YYYY`; authorizing or downloading requires a DOB (409 with guidance), and the Prescriptions panel offers inline date/age entry. Booking never requires a DOB. Legacy free-text `estimatedAge` values are shown as a hint until a date is saved, which clears them.

Verified: API/web typecheck, focused lint, 355 API unit tests, 95 isolated integration tests (patients, prescriptions, appointments), and isolated Chromium runs of `estimated-date-of-birth`, `appointment-feedback` and `patient-profile-pressure` (7 passed). `patient-intake`, `new-patient-appointment`, `new-patient-new-appointment-flow` and `patient-profile-appointment` fail before reaching the changed fields (stale "Name" label, home search, and the known double "Sign in" helper); `patient-intake`'s age label was updated for the new field. Migration applied to the local dev database only. No commit, push or deployment.

Still open from SPA-40: searchable/admin-managed breed choices, referring/additional-provider contacts with directory/add-hospital support, and explicit records-request tasks/email drafts.

## SPA-40 completion and review remediation — October 16

Founder authorized completing SPA-40 and pushing/deploying staging. Includes the previously uncommitted estimated-DOB increment plus the remaining booking feedback.

- Fractional years (for example 1.5) calculate calendar months correctly. API future-DOB checks use the authenticated clinic location's date, including around UTC midnight. The revised, previously uncommitted DOB migration adds the flag without guessing historical uncertainty from timestamps. The earlier version was applied only to the local development database; this revision does not attempt to undo local classifications without provenance.
- Breed suggestions are shared across New Appointment, New Patient, front-desk intake, and Edit Profile. Defaults contain the 297 names published in AKC's selector (including Foundation Stock Service) and 45 CFA cat breeds, plus mixed/domestic/unknown choices. Admin → Patient details supports clinic-owned additions, renames, hiding and restoring choices without rewriting patient records. Names sourced from https://www.akc.org/dog-breeds/ and https://cfa.org/breeds/ on October 16; no registry descriptions/images copied.
- New Appointment now offers Referring vet and Additional providers searches against the clinic's own hospital directory, with inline Add new hospital. Booking saves validated contacts to the patient in the booking transaction. Patient Overview supports viewing and updating contacts. This is a clinic-entered directory; no external directory provider or license is assumed.
- Request records is explicit in patient context. It creates a patient-linked, location-scoped staff task and a saved editable email draft containing patient/client details. Active reception/CSR staff appear first in assignment choices. Retrying a lost response recovers the same task. Only the creator/assignee can edit the draft or complete/reopen the task. Reception dashboard tasks link back to the patient; completion is also available from patient context. Email opens in the staff member's email application only after draft edits are saved. Nothing is sent automatically and opening the email does not imply delivery/completion.
- Browser testing caught and fixed the nested hospital-save race: parent provider-save/booking actions wait until a new hospital is saved and selected. Desktop/tablet patient layout was inspected; the record-request editor uses the wider patient column.

Verification before release: API unit suite 357 passed; 111 focused isolated integration checks passed on Node 24 (staging runtime), covering patients, prescriptions, appointments, operations, breeds/providers, tenant/location boundaries, retry recovery, draft editing and DOB arithmetic. A further focused API run verifies tomorrow is rejected at all three DOB write endpoints. Browser checks cover phone/address/required notes, estimated DOB and prescription capture, Admin breed edits, and the owner-to-receptionist records-task handoff. Production build and deployment results are recorded in the completion response.

## SPA-42 appointment/Admin feedback — October 16

Founder requested grouping Anna's seven SPA-42 findings into phases and implementing each with focused tests and Sparki's existing UI language. Task-specific groups: (1) bulk dated closures, multi-weekday availability and saved time edits; (2) calendar hours/card readability; (3) separate Age/DOB, inventory required fields/dropdowns and popup scrolling/stacking. Implementation and verification: [SPA-42 work record](../docs/research/spa42-appointment-admin-flow-2026-10-16.md). Local only; no deployment requested.

SPA-42 verification: 22 focused unit tests, 76 isolated integration tests, six dedicated Chromium scenarios plus five existing browser regressions passed. API/web typechecks, focused lint and production web build passed; existing warnings remain. Desktop/tablet screenshots inspected. No commit, push or deployment.

## Staging release authorization — October 16

Founder requested committing all current changes, including Claude's work already in main, pushing main, and updating staging. Main matched origin/main before this release; no additional worktrees were present. The release includes SPA-42 implementation/tests/notes, comment-writing preferences and the generated default Next.js type reference. Full unit/infrastructure tests and all workspace typechecks passed; the focused integration/browser checks and web production build recorded above also passed. Deployment follows `agents/README.md`; deployed SHA and final health are reported in the release response.
