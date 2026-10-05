# SPA-7 discharge strengthening

Implemented locally after the founder approved the discharge comparison recommendations.

- Staff-authored visit summary, diet and activity directions, urgent signs, and emergency/after-hours contact.
- Medication schedule with medication, dose, route, frequency, duration, optional next dose and special directions. Partial medication entries are rejected in the editor and API. This records client guidance; it neither authorizes prescriptions nor dispenses medication.
- Date-only recheck field, preserving the entered calendar date. It does not book an appointment; the existing reception follow-up task remains explicitly selected.
- Responsible veterinarian from the visit assignment and preparer from the actual authenticated save actor. Neither label claims that the discharge has been signed or reviewed by that veterinarian.
- Saved editor, client preview, and PDF use the same recorded fields. Internal care and exam notes are not automatically copied.
- Urgent-care guidance is near the top of the PDF. Short medication schedules stay together. Empty optional sections are omitted with a single explanation about unrecorded guidance.
- Existing discharges are not backfilled or rewritten. Older API clients that omit the new guidance preserve it on update. Checkout and closed-visit locks remain intact.

## Verification

19 focused unit tests and 58 isolated visit integration tests passed. Both API and web typechecks and focused lint passed. The Chromium journey passed with distinct development employee sessions: technician updates discharge, a different veterinarian reopens it, receptionist completes checkout, and the assigned owner/clinician signs the record. These are local test sessions, not password-based production or staging logins. A native two-page PDF download contains saved guidance and no internal-note markers. Synthetic two-page example was rendered and visually inspected; medication instructions remain together and text fits page margins.

The browser test still logs the previously documented, separate dashboard workflow-defaults initialization unique-constraint race. This is not a clean server-log verification. Full staging booking and real-login employee acceptance remain pending.

## Release state

Uncommitted and undeployed. New nullable `VisitDischarge.clientGuidance` migration was replayed successfully in disposable test databases only; the developer and staging databases were not migrated. Deployment must apply that migration before the new API runs. Clinical wording in the example is synthetic, not treatment advice.
