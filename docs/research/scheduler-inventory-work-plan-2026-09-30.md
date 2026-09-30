# Scheduler and inventory work plan

2026-09-30. User priority: spend most effort on scheduler and inventory design and use. This plan follows the Product Constitution and the small build → test → fix working method.

## Today's order

1. **Scheduler navigation and clarity:** direct date selection, automatic updates, zoom, visible filtered counts and easy reset. Then evaluate day/week density, appointment readability, booking from open time, and rescheduling while preserving patient context and existing conflict rules.
2. **Inventory lookup and context:** immediate item search without reloading unrelated operations; preserve the selected view across tabs; show results and clear filters. Then evaluate medication details, available versus on-hand stock, low-stock/expiry review, receiving and adjustment flows.
3. **Connected care outputs:** use the [competitor assessment](packleader-anna-workflow-gap-assessment-2026-09-30.md) to specify final-record/discharge/receipt PDFs, then authorized prescriptions, dispensing and labels. These remain subsequent work, not changes to medication policy in today's navigation pass.

## First implementation slice

- Scheduler: Go to date, automatic updates every 15 seconds while visible and on returning to the tab, range result count, zoom through 15-minute detail, and Clear filters. The status shows the last successful update.
- Inventory: use the already fully loaded, permission-scoped catalog for local name/SKU/barcode matching. Previously each search re-requested 20 endpoints and replaced the catalog used by attention review and stock forms. Keep the full catalog intact, preserve the item view, and add a count/reset.
- Keep existing CSS edits and all clinical, financial, scheduling-capacity and controlled-inventory policies intact.

## Verification

Run web typecheck, focused lint, and focused browser scenarios for date navigation/automatic update/zoom/filter reset and inventory search/view persistence. Browser tests use the existing isolated-database harness. Inspect layout at desktop and narrower widths where the local runtime is available. Report any runtime or environment limits explicitly.

## Next review checkpoints

- Can reception get to a requested date and book/reschedule without losing context?
- Can a staff member find a medication and distinguish available stock from total stock?
- Can a low-stock/expiry item lead directly into the correct existing action?
- Do quantity, units, stock location and lot remain clear before a mutation?
- Which layout changes measurably reduce scrolling and repeated entry?

No deployment, migration, production-data change or new prescription authority is part of this slice.

## First-slice result

Implemented the first navigation/search slice and refined the scheduler after founder feedback: automatic refresh, time zoom and a reorganized toolbar. Web typecheck passed. Focused lint passed with four pre-existing scheduler unused-symbol warnings and no errors. Both focused Playwright scenarios passed against a disposable database; the scheduler provider option is an explicit UI test fixture, while inventory uses the seeded API catalog. Inspected 1024px screenshots. Inventory table density/width remains a follow-up design issue. Existing CSS autoprefixer warnings remain unchanged. No deployment was performed.

## Scheduler refinement after visual feedback

The toolbar now uses compact inline filters, quieter day/week selection, a persistent Today action, and a continuous 100–250% zoom control with minus/plus buttons. Pinch or Ctrl/Command + wheel zooms over the calendar; plain wheel scrolling over the zoom control also zooms. Plain scrolling over the calendar, including its time ruler, moves through the day. Zoom preserves the time under the pointer where scroll bounds allow. Higher zoom reveals finer booking slots, down to 15 minutes. The ruler emphasizes full hours and uses lighter grid lines for smaller divisions. The current-time label sits inside today's column.

Follow-up visual refinement: at wide desktop widths the navigation, filters, zoom and view switch fit on one compact row; at narrower desktop widths they wrap into two rows. Half-hour labels appear at intermediate zoom and quarter-hour labels at 150% and above, with reduced visual weight. Hovering an open slot exposes its exact start time.

Focused Chromium checks passed for button, ruler-wheel and pinch-style wheel events, ordinary scrolling preserving zoom, automatic appointment updates, and inventory navigation. The 1024px layout was visually inspected. Physical trackpad hardware was not exercised by the automated test.
