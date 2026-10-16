# SPA-42: Anna's appointment, Admin and form feedback

Scope: [SPA-42](https://linear.app/sparki/issue/SPA-42/feat-appointment-admin-flow-bugs), seven findings and seven screenshots, inspected October 16, 2026. No issue comments were present. These are task-specific implementation groups requested by the founder; they do not restore historical repository development phases.

## Phase 1 — Scheduling setup (findings 1, 4, 5)

- Date exceptions support separate dates or chosen weekdays within a start/end date range, including a weekends preset. The latter generates individual dated closures, bounded to 366 calendar days; it does not create an unending recurrence or change weekly availability. Existing appointments stay scheduled.
- New weekly availability can be created for multiple weekdays, with weekdays/weekends/every-day shortcuts. Each saved weekday remains an independently editable recurring weekly block. Editing an existing block affects that block only.
- Bulk endpoints validate all inputs and save all records and audit entries in a transaction. Existing clinic/provider/type authorization remains enforced. Sequential retries of an identical closure recover the saved closure.
- Removed fixed 7 AM–7 PM and grid-alignment rejection from block saves. Availability already generates slots from each block's start, so the visual calendar grid should not reject valid clinic-local times. Same-day time ordering and future-appointment edit protection remain enforced; overnight blocks remain unsupported.

## Phase 2 — Calendar readability (findings 5, 7)

- Calendar expands its default 7 AM–7 PM range to include active weekly blocks and appointments. Ruler, grid, block overlays, appointment positions and current-time indicator share the displayed range.
- Configuration refreshes with schedule polling/focus refresh, so changes from Settings are picked up.
- Cards prioritize patient, appointment time and visit reason on separate lines. Full summary is available through accessible name and hover title. Secondary details remain in the appointment dialog.
- Week columns retain a readable minimum width; tablet week view can scroll horizontally rather than squeeze the text.

## Phase 3 — Forms and dialogs (findings 2, 3, 6)

- Patient header uses separate muted Age and DOB/Estimated DOB labels, keeping uncertainty visible.
- Inventory marks required name/type and conditionally required duplicate SKU, explains unit pairs, retains entries on save failure and displays structured validation errors.
- Inventory, block and scheduler filter dropdowns use flat white surfaces with a quiet chevron.
- Block dialog renders above the page's stacking contexts; block and inventory popups use the shared root scroll lock. Dialog retains existing clinic palette and typography.

## Verification

Passed:

- 22 focused API unit tests (scheduling schemas and appointment availability).
- 76 isolated integration tests (appointments and tenant isolation), including bulk rollback, saved edits, sequential closure retries, audit attribution, cross-clinic references and denied clinical-role writes.
- Six dedicated Chromium SPA-42 scenarios, plus five existing Admin/scheduler/inventory browser regressions. The final dedicated run also verifies expanded hours with a 45-minute grid and a shorter last slot. Required-field/validation-failure testing is followed by a real successful inventory save.
- API and web TypeScript checks; focused source/test/proxy lint (zero errors; four pre-existing unused scheduler warnings).
- Web production build and diff whitespace checks. Existing image/CSS/lint warnings remain.
- Screenshots inspected at 1440px desktop and 1024px tablet for the weekly dialog, calendar cards, dated closures, inventory and separate patient Age/DOB details.

The first browser run had three fixture/selector failures; all were corrected and the complete dedicated set passes. Visual inspection additionally caught compressed tablet cards and an inherited grid style in the weekday picker, both corrected before the final run. There are no unresolved failures in the selected checks. Live staging acceptance and Safari-specific native rendering were not run. All database/browser work uses disposable local test databases; no staging data changes or deployment are part of this request. The pre-existing `apps/web/next-env.d.ts` edit is preserved.
