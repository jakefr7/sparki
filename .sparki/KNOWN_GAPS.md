# Known Gaps

- Server-local calendar days (2026-10-01): staging runs in UTC, so API code that computes "today" with `setHours(0, 0, 0, 0)` rolls over at 7 PM Central. The availability date window is fixed; still affected are `dayBoundsFor` and `assertAppointmentNotHistorical` in `appointments.service.ts` (same-day appointments become read-only and "today" queries shift from 7 PM clinic time), plus day bounds in `visits.service.ts` and `inventory/usage.service.ts`. These need the clinic time zone; not yet changed or tested.

- New Appointment staging pressure test (2026-10-01), Finley profile entry: no configured appointment types prevents booking, but the dropdown gives no setup explanation/action. Closing and reopening silently discards the scheduling note. Selected patient card shows a placeholder although the profile photo renders. Appointment submission/conflict/confirmation tests remain pending staging appointment-type and availability configuration approval; no booking created in this pass.

- Patient profile pressure test (2026-10-01): Medical History uses the workspace's five most recent visits and has no older-history pagination. The local UI now states the limit; a complete history browser remains unfinished. This staging pass used the owner role and did not exercise signed/attachment-heavy records or dispensing.

- Patient-creation review (2026-10-01): Escape discarded a populated New Patient draft without warning; not reverified after the latest staging update. Usability follow-ups: shorten the modal header/optional address area, make unknown age explicit, and format displayed phone numbers. User-facing “Pet” → “Patient” direction is in TERMINOLOGY.md. Photo upload/storage defects from that review passed the staging retest and are no longer open findings for the tested path.

- The Playwright harness works, but the full browser suite has historical product/test drift. Treat failures as real findings and fix them when working in the affected surface; do not preserve them as an active phase exception.
- Phone refills are approved to use a medication-only encounter with linked invoice. Implementation remains pending; the existing medication-profile refill action does not deduct stock.
- Current-information discharge, signed-record/amendment, finalized-receipt and authorized-prescription PDF downloads are implemented locally. Medication label hardware/format, connected dispensing, and medication-only encounter billing remain unfinished; see questions for Anna.
- RDVM intake needs a directory source and licensing decision.
- FAS needs a defined scale and capture workflow.
- Service markup needs a pricing rule before it can calculate a selling price.
- Client SMS is simulated because no delivery provider is connected.
- GitHub PR preparation, deployment, and automated merge are not part of the local workflow.
- Historical closeout and run artifacts may describe older product behavior. Use current code, current tests, [PROJECT_STATE.md](./PROJECT_STATE.md), and [CURRENT_WORK.md](./CURRENT_WORK.md) for present-tense decisions.
