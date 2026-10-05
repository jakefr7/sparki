# Employee handoff audit — staging, October 4–5, 2026

## Result

The deployed workflow does not pass an end-to-end employee handoff test. Normal UI progress stops at the intake-to-clinician handoff, before care, discharge, or checkout. The local SPA-7 fixes and strengthened discharge have not been deployed, so this is not acceptance of those changes.

All five existing Willow Creek staff accounts were used through password sign-in: Hannah Brooks (receptionist), Marcus Lee (assistant), Olivia Reed (technician), Miles Bennett (veterinarian), and Anna Carter (owner and the assigned clinician for the configured exam). No test-session cookie substitution was used.

## Retained fixture

- Patient: Handoff QA Oct04, `cmuuq4l8b003jfz3wi6h6oq4j`.
- Client: Handoff QA Oct04, synthetic phone 312-555-0197; no messages sent.
- Appointment: New Patient Exam, Monday October 5, 8:30–9:15 AM America/Chicago, Anna Carter.
- Visit: `cmuuqq5gi003wfz3w0opu0mgj`, retained at completed intake / ready for veterinarian.
- Medical history explicitly labels the assistant's intake and all vital values as synthetic testing. No actual examination, treatment, dispensing, charge, payment, discharge preparation, or record signature occurred.
- Existing Finley and Flow QA Oct04 records were preserved. No deployment, staff access changes, clinical policy changes, or destructive cleanup performed.

## Observed handoffs

| Step | Observation | Assessment |
| --- | --- | --- |
| Reception creates patient | Synthetic client and patient saved and appear in directory | Pass |
| Reception books exam | “Any available provider” initially produced “We couldn’t load the Scheduler.” Selecting Anna explicitly exposed valid times and booking succeeded | Recovery works; default-provider path needs investigation |
| Appointment context | Confirmation and Scheduler show New Patient Exam at 8:30 AM; profile shows Wellness / Preventive Care at 1:30 PM | Fail: inconsistent type and time |
| Check In | Today permits appointment → Check In, while visit count and currently-in-clinic count remain zero; assistant dashboard initially says clear | Fail as a discoverable reception-to-intake handoff; a separate Begin Intake action is needed before a work item appears |
| Assistant begins intake | Assistant finds checked-in appointment through Today, chooses Move to Begin Intake; a visit is created; Dashboard then has Continue intake | Functional, but indirect and not obvious |
| Assistant → technician | Marcus records synthetic vitals/history. Olivia password-signs in, sees in-progress intake, opens it; all values and history persist, technician becomes Olivia | Pass |
| Technician → assigned clinician | Olivia completes intake. Summary correctly preserves clinical context and names Anna as veterinarian, Olivia as technician | Saved handoff context passes |
| Clinician discovery | Anna dashboard reports one active visit but an empty attention queue; Today shows no matching patient and zero in clinic. Miles has no assigned action, consistent with Anna's assignment | Fail for assigned owner/clinician; no clear exam action |
| Full visit | Both Miles and Anna see completed intake and its summary but no Start Exam button or clinical continuation | Blocking failure, already addressed by local SPA-7 Start Exam change but not staging-verified |
| Care → discharge → reception → signoff | Not reached through the normal staging UI | Not tested in this audit; earlier isolated local test is separate evidence |
| Billing and receipt | No invoice charge, payment, or receipt transaction was attempted | Not accepted / not tested |

Testing was performed late Sunday in clinic time. Monday's appointment appeared under Today while the header still said Sunday; the synthetic appointment was checked in early solely for the authorized staging test. This boundary condition is part of the evidence, not a normal daytime acceptance pass.

## Code findings supporting the observed behavior

- The check-in status action calls appointment arrival; visit creation occurs only in the subsequent Begin Intake action. Clinical role queues operate on active visits, so a checked-in appointment alone does not enter those queues.
- Today uses server-local “today” appointment/visit queries and a separate browser-local date filter on visit rows. Linked appointments are removed before visit-row date filtering. At a time-zone boundary this can leave neither appointment nor visit visible. A clinic time-zone definition must be shared across these views; an active patient should not disappear because an appointment is dated another day.
- Owners map to the manager dashboard, whose attention queue includes delayed/unowned/exception visits. A promptly assigned exam-ready visit can therefore be absent even when the owner is its responsible clinician.
- The local full-visit Start Exam component uses the existing OWNER/VETERINARIAN permission and does not reassign signoff responsibility. It needs deployment and real-login acceptance before this blocker is considered resolved.

## Recommended completion contract

1. Reception records arrival; the patient becomes visible as physically present and ready for support intake.
2. Support staff see the intake queue, claim work, preserve drafts, and make a named clinician handoff.
3. The assigned clinician—including an owner acting clinically—sees the pending exam and can review intake and start it directly.
4. Clinical decisions become assigned care tasks; performed/deferred work is explicit and preserved across employees.
5. Reviewed client guidance transfers to reception alongside the remaining follow-up tasks.
6. Reception reviews charges and a proper invoice, records payment/balance state, supplies a receipt and discharge, and records departure.
7. The responsible clinician retains any unsigned record in their closure queue until signoff. Departure and clinical record closure are distinct facts.

The billing code already contains invoice/payment ledger foundations and a limited receipt export, but this is not acceptance of a complete billing system. The next billing increment needs clinical work-to-charge reconciliation, review/finalization, balances and recorded payments, client-readable invoices/receipts, correction/refund behavior, and employee permissions. In particular, missing or unreviewed charges must not silently become “nothing owed.” Financial policies should be agreed before implementation.

## Next verification

Deploy the authorized local fixes only when the founder explicitly requests staging deployment; address queue/date/arrival gaps locally; then repeat all five password logins in a clinic daytime scenario and across midnight. Continue through care, discharge, reception checkout, and clinician closure once the clinical handoff works. The retained fixture and screenshots support the retest.
