# Booking through visit completion: product notes and backlog

Started October 2, 2026. Working document for founder review; proposals are not approved product policy or implementation instructions. No product changes, migration, deployment, or external messages performed for this document.

## Evidence and scope

Fresh staging booking succeeded: Finley, client Jordan Ellis, Wellness Exam, Anna Carter, October 2, 2026, 4:00–4:30 PM America/Chicago. The confirmation appeared and the appointment persisted on the calendar after reload. [Confirmation screenshot](staging-appointment-confirmed-2026-10-02.jpg). GP types now have 13 distinct saved colors. [Setup and prior findings](staging-gp-scheduling-2026-10-01.md).

No additional appointment was needed to document the observed booking path. Arrival, intake, clinical care, checkout, record signing, and PDF generation have not been exercised in this fresh journey. Requirements below identify what to verify, not claims that those features are absent or broken.

Labels: **Observed** means seen in this session; **prior observation** needs retesting on current staging; **repository gap** comes from current project memory; **proposal** describes desired behavior; **unverified** requires a workflow test. Priorities: P1 prevents reliable daily work or risks misleading staff; P2 reduces repeated effort; P3 polish. Priority is a proposed order, not an implementation commitment.

Desktop/laptop and tablets are the testing scope. Phone-browser sign-in restriction is recorded founder direction, with implementation outside this notes pass. A native mobile app is not current scope. Recommendations inherit the [Product Constitution](../blueprint/00-product-constitution.md); the communication ADR is [proposed, not accepted](../adr/ADR-005-communication-inside-patient-workflow.md).

## What should happen after booking

| Moment | Proposed expected behavior | Verification needed |
| --- | --- | --- |
| Booking saved | Persist exactly one appointment with patient/client, type, duration, provider, location, clinic time zone, source, note, and creator. Show clear success and the saved appointment. | Repeat submission, timeout after save, concurrent slot claims, reload, patient-profile consistency. |
| Client confirmation | Create a linked confirmation job according to clinic policy and client contact preferences. Show its state independently of booking success. | Real provider/channel availability, consent/preferences, invalid/missing contact, delivery receipt, retry. |
| Team awareness | Update Scheduler and Today for relevant staff. Route actionable exceptions to an accountable person or queue. | Cross-session updates, permissions, acknowledgement and ownership. |
| Pre-visit preparation | Make reason for visit, relevant existing alerts, records due, and incomplete forms visible in patient context. Permit requested records/forms without fabricating clinical facts. | Returning vs new patient, multiple caregivers, missing records, form receipt. |
| Reminder due | Send the approved reminder using clinic-local time and a clearly shown scheduled time. Stop obsolete reminders after cancellation/rescheduling. | Timing, quiet hours, duplicates, same-day booking, daylight-saving transitions. |
| Client response | Record confirmed, requested change, cancelled, or needs follow-up as distinct states. Turn a request requiring staff action into a task. | Reply attribution, identity, link expiry, staff response, conflict between reply and later edit. |
| Arrival | Reception finds the appointment quickly, confirms identity and reason, checks in, and passes context to intake. Preserve appointment-to-visit linkage. | Early/late arrival, no-show, wrong patient, duplicate check-in, unscheduled care. |
| Intake and exam | Carry booking context into the visit without requiring retyping. Capture patient-specific history, vitals, concerns, and clinical authorship. Notify the assigned clinician when ready. | Role handoff, durable drafts, reassignment, clinical alerts and unfinished work. |
| Plan and care | Veterinarian/owner orders proceed through the existing authorized care workflow. Make pending work, execution, and exceptions clear to the next staff member. | Medication authority, inventory audit, controlled safeguards, existing discharge gates. Do not reintroduce routine client-decision gates. |
| Discharge and checkout | Prepare clinician-reviewed instructions, reconcile completed services/medications, show invoice and external-payment state honestly, then complete checkout under existing rules. | Incomplete-care blockers, missing charges, nonzero invoice, payment disposition, ready documents. |
| Record completion | Keep SOAP signing separate from checkout. Route unsigned records to responsible clinicians; preserve immutable signed content and attributed amendments. | Signing permissions, concurrent updates, record queue, amendment retrieval. |
| Aftercare | Link instructions, follow-up tasks, recalls and communication to the patient and completed visit. Offer follow-up booking without creating it silently. | Task ownership/due dates, client delivery state, failed follow-up, repeat visit with a different care path. |

## Notification system feature requests

**P1 proposal — visible communication status in appointment/patient context.** “Booked” must describe the appointment; “client confirmed” must describe the client's response. Do not conflate either with a message being delivered. Staff should see channel, intended recipient, scheduled time, latest attempt, and whether action is needed without opening a separate destination.

Use explicit states appropriate to the channel: not scheduled, scheduled, queued, sending, sent/provider accepted, delivered when supported, failed, cancelled, and simulated. Delivery is not proof that the client read or confirmed. Keep the client's acknowledgement separate. Current project memory says SMS is simulated; until a delivery provider is connected, label it simulated and do not suggest a real message reached the client.

| Event | Client communication proposal | Internal notification/task proposal |
| --- | --- | --- |
| New booking | Appointment details and a clear way to contact the clinic or request a change. | Calendar update; task only if preparation or contact follow-up is needed. |
| Rescheduled/provider changed | Updated details with the old appointment time clearly superseded; distinguish material changes from note edits. | Inform affected staff; invalidate old reminder jobs; flag unresolved resource conflicts. |
| Cancelled | Clear cancellation acknowledgement where enabled. | Update queues and availability; stop reminders; preserve history and cancellation reason. |
| Reminder | Approved timing and content; avoid redundant immediate reminders after a same-day confirmation. | Task for actionable failed delivery or unconfirmed appointment under clinic policy. |
| Client requests change/replies | Acknowledge receipt without promising the request is already booked. | Assigned task linked to appointment, with owner and resolution status. |
| Arrival/intake ready | Client messaging optional; do not assume it is needed. | Notify assigned care team in context, avoiding a clinic-wide alert for every transition. |
| Urgent triage concern | Do not give automated reassurance or infer urgency from free text. | Route an explicit staff triage task; clinic decides escalation policy. |
| Documents ready | Optional delivery/link after document readiness and authorized review. | Show readiness, latest generation/download failure, and any required follow-up. |
| Aftercare/follow-up due | Clinic-approved follow-up or recall, with an appropriate contact route. | Assigned task, due time, outcome, and escalation if still unresolved. |

**P1 proposal — reliable delivery and recovery.** A failed message must not undo a saved booking. Durable jobs, duplicate prevention, bounded retries, visible failure reasons, and staff-controlled resend should make retries safe. Rescheduling must cancel stale jobs and prevent an old queued message from being sent with outdated details. An audit trail should identify event, appointment version, actor, recipient/channel, attempts and outcomes; avoid putting sensitive content in diagnostic logs.

**P2 proposal — staff notifications with ownership.** Provide a compact in-app indicator and actionable queue with direct links to the relevant patient/appointment. Read/unread is not the same as resolved. Staff should be able to assign, acknowledge and resolve work without duplicating it. Use role/provider routing and urgency; quiet routine calendar updates should not become popup noise. Browser permission prompts and push delivery are optional future choices, not prerequisites for in-app visibility.

**P1 proposal — appropriate recipients and content.** Establish the designated client/contact for this appointment rather than messaging every linked caregiver. Respect channel preferences and opt-outs, prevent duplicate household messages, and handle missing contact details through a staff task. Default appointment notices should contain only necessary scheduling details; clinical content and sensitive appointment types need founder/clinic-approved handling.

**Decisions still needed:** initial delivery channels/provider; confirmation and reminder timings; consent/preference handling; quiet hours; no-response/no-show policy; which provider changes warrant messages; recipient selection with multiple caregivers; manual vs automatic initial send; clinic phone/address/instructions; sensitive-visit message wording; internal task escalation/ownership. Suggested defaults are not saved settings. Notification scope must not imply clinical advice or payment processing.

## Observed bugs and UI/UX backlog

| ID | Priority / kind / evidence | Finding and requested outcome |
| --- | --- | --- |
| BOOK-01 | P1 notification feature; observed | Success screen says “Confirmation messages are managed separately” but offers no visible queued/sent/failed status or next action. Show appointment-linked communication status, or explicitly say no confirmation has been sent and offer the appropriate next step. No claim that a background message did or did not send. |
| BOOK-02 | P1 reliability; historical failure, now passes staging | Earlier availability failure showed “We couldn't load the Scheduler,” disabled booking, and labelled dates “No times.” October 2 retry loads slots and books successfully. Recheck failure handling: unknown availability must not look fully booked. Preserve draft and offer recovery without hiding the cause. |
| BOOK-03 | P1 environment issue; local cause confirmed October 1 | Local availability returned HTTP 500 because `SchedulerDateException` table was missing. Migration reconciliation and retest required. Local status has not been rechecked October 2; do not assume staging shares this cause. |
| BOOK-04 | P1 time handling; repository gap | Known API server-local date calculations can treat the clinic day as finished at 7 PM Central on a UTC server. Reconcile day bounds for appointment editability/Today queries, visits and inventory usage with clinic time zone; verify midnight and DST boundaries. See `.sparki/KNOWN_GAPS.md`. |
| BOOK-05 | P2 draft retention; prior observation | Closing/reopening booking silently discarded scheduling notes. Preserve draft or warn appropriately on discard. Retest Escape, close, cancel, navigation and failure recovery with a populated form. |
| BOOK-06 | P2 identity UI; prior observation | Selected patient card used a photo placeholder although profile photo rendered. Show consistent patient identity/photo and owner context. Retest current staging. |
| BOOK-07 | P2 terminology; observed October 2 | Booking still says “Pet not found? Use New Patient.” Use Patient consistently with founder terminology. |
| BOOK-08 | P2 contact UI; prior observation | Owner phone was unformatted in directory/booking but formatted on profile. Format consistently and distinguish absent/invalid contact information from usable contact. |
| BOOK-09 | P2 setup clarity; prior observation | Type cards say “Weekly availability required” despite saved matching generic blocks. Explain the requirement without implying configuration is missing; show actionable warnings only when verified. |
| BOOK-10 | P2 scheduling selection; observed, needs focused test | The 4 PM slot entry carried a 4–4:30 PM footer, but its time control did not visibly show selected in the accessibility state. Auto-selection also changed “Any available provider” to Anna. Verify visual selection agrees with the saved choice and make automatic provider choice obvious before submit. Not yet a confirmed visual bug. |
| BOOK-11 | P2 navigation; observed | Calendar reload returned from Day to Week. Consider preserving view/date/provider filters so staff keep their place; verify deliberate preference behavior before implementation. |
| BOOK-12 | P2 confirmation follow-through; observed | Success dialog offers Edit and Done. Consider View appointment, Open patient and communication status as contextual follow-through, without an extra modal or automatically checking in a future appointment. |
| BOOK-13 | P2 scan speed; proposal | Long GP dropdown should remain easy to scan on tablets: readable names/durations, sensible grouping/search if volume warrants it, keyboard access, and supplementary color swatches. Do not rely on color alone. |
| BOOK-14 | P2 schedule color; configuration complete, appointment rendering pending visual QA | All 13 types now have distinct saved colors; Wellness booking created successfully. Verify actual cards, contrast, focus/selection and status indicators at desktop/tablet sizes. Keep appointment-type color separate from clinical urgency/workflow status. |
| BOOK-15 | P2 visit preparation; proposal/unverified | Carry the scheduling reason/source into patient/visit context, with creator/time attribution. Do not force staff to retype it or treat booking notes as clinician-authored findings. |
| BOOK-16 | P2 incoming records/history; repository gap/unverified | Older history needs retrieval beyond the five recent visits. Preparation should surface missing requested records rather than imply the patient's history is complete. |

## End-to-end test checklist still outstanding

- Returning patient and new patient; technician, sick, recheck, senior, urgent, procedure admission and sensitive visits with appropriately different workflows. No universal default clinical plan.
- Assigned vs any available provider; active-but-ineligible employee; provider reassignment; changes to duration/type; room/resource conflicts; double submission and simultaneous booking; successful-save/network-timeout recovery.
- Reschedule, cancel, reminder cancellation, duplicate reminder prevention, failed/simulated delivery, missing contact, multiple caregivers, client acknowledgement and staff follow-up ownership.
- Today's appointment after clinic-local evening rollover, midnight, DST, weekly closed days, date exceptions, overlapping visits and remaining partial slots.
- Reception arrival through intake, exam, orders, care, discharge, checkout, separate SOAP signing and patient history retrieval. Test roles without expanding permissions for convenience.
- Desktop/laptop and tablet: readability, touch targets, keyboard/focus, persistent drafts, scrolling, selected-time clarity, appointment-type/status colors and loading/error states.
- Generate and inspect actual discharge, signed-record/amendment, receipt and authorized-prescription PDFs when those sources are ready. Check patient/client/provider identity, current saved content, attribution, dates/time zone, page breaks, long text, missing data, filename, repeat download and permissions. PDF download must not mutate clinical/inventory/financial state; locked SOAP stays immutable. Nonzero receipt must reflect actual test charges and honest external-payment state. These PDFs remain untested in this booking journey.

## Proposed order for review

1. Confirm availability and clinic-day reliability on current environments; close historical blockers with evidence.
2. Define confirmation/reminder recipients, channels, policies and delivery truth, then specify appointment-linked status and failure tasks.
3. Tighten booking drafts, selected-time/provider clarity, terminology and contextual follow-through.
4. Run the complete clinical/checkout/PDF journey and role handoffs; append reproduced findings rather than assume failures.
5. Verify alternate GP visit types, tablet use and recovery/concurrency cases.

This document starts the backlog. It does not authorize implementation or claim the remainder of the visit workflow has passed.
