# SPA-7 local remediation — October 4, 2026

Issue: [SPA-7](https://linear.app/sparki/issue/SPA-7/bug-ux-fix-visit-handoffs-discharge-content-and-pdf-layout).

Scope: supplied SPA-7 audit findings. No staging deployment, real communication, payment processing, clinical advice, migration, or change to role/signoff policy.

## Changes

- The visit workspace exposes Start Exam for existing authorized OWNER/VETERINARIAN roles after intake. Starting does not change the assigned signing clinician. Other roles receive a handoff explanation.
- Discharge has explicit Home care, Medication directions, Warning signs, and Follow-up authoring. It never assembles client guidance from internal exam narratives, diagnostic orders or execution notes. Staff review and save the client fields before generating the document.
- Saved discharge hydrates every field on reopen. Refreshes retain unsaved edits; the saved preview and PDF link reflect canonical saved content. Checkout/closed visits are read-only. Missing fields remain “Not recorded,” not “None needed.” Existing saved or signed content is not silently rewritten.
- Required reception follow-up remains explicit. Removing that requirement only cancels the discharge-owned reception task, preserving independent clinical follow-up work.
- Untouched exam systems start Not examined with documented=false; Normal requires a deliberate selection. Historical explicit findings remain intact. Exam numbering agrees with the five-step workflow.
- Care-completion and signature displays use the clinic time zone with an explicit locale, fixing the reproduced server/browser hydration mismatch.
- Checkout catalog search aborts superseded requests and ignores stale responses.
- Record resume opens SOAP before and after checkout; unavailable signoff has an explanation. New SOAP drafts carry recorded intake history and attributed vitals. Existing drafts are preserved.
- Checkout exposes persisted contact confirmation and the current client phone/email being reviewed.
- PDF metadata separates patient/client/date, keeps the technical reference small, uses clinic-local dates, increases type size and spacing, and preserves headings/short paragraphs across page breaks. Continuation pages carry patient/document references and page numbers. Black-and-white layout verified.

## Verification

Both API/web typechecks and focused lint pass. Twenty-four focused unit tests pass. All 86 visit/billing integration tests pass after the final timestamp contract change. One real Chromium UI regression passes with a UTC server and America/Chicago browser, including an intentionally delayed catalog response, desktop/tablet checks, native discharge download, role change, reopened checkout, one $1 charge/payment, zero balance, archived visit and locked SOAP. Native downloaded PDF text contains the four saved client fields and excludes internal markers. Short/missing examples render in one page, long directions in five pages; all pages inspected, with numbering, continuation references and text bounds checked.

## Limits

- Changes remain local, uncommitted and undeployed. Complete staging booking-to-signoff acceptance remains pending deployment.
- Synthetic browser setup uses API-created patient/client/visit and a disposable $1 catalog fixture. All visit actions after setup are through the UI. This does not verify booking retries, booking drafts, or a fresh booking UI.
- Old prepared discharges may contain earlier internal notes. No bulk cleanup or automatic clinical rewrite; staff must review existing instructions.
- No prescription, dispensing, real messages/payments, full staff-role/breakpoint matrix, or physical-label testing in this increment.

The browser server log also reports a dashboard workflow-defaults upsert race on first navigation (unique location/status). The visit regression passes, but this separate initialization error remains unresolved outside the supplied findings. It must not be described as a clean server-log pass.
