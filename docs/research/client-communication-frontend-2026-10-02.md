# Client communication: first frontend implementation

October 2, 2026. Founder authorized frontend implementation after reviewing Claude’s backend report. Local changes only; no commit, push, deployment, provider configuration or real client text. Uses the [backend contract](../engineering/client-communication-backend.md) and [frontend roadmap](client-communication-frontend-roadmap-2026-10-02.md), following the [Product Constitution](../blueprint/00-product-constitution.md).

## What works locally

- Communication workspace replaces calls to the removed messaging endpoints with authenticated, same-origin client-communication proxies. The attachment proxy preserves the backend’s sandbox, nosniff and private-cache headers.
- Navigation and direct access follow current backend readiness. Simulation is prominent and never represented as external delivery. Unavailable direct links explain the state.
- Search, eight queue filters, database counts, cursor pagination, stable selection and queue polling. Loaded pages refresh; opening a thread does not mark it read. Explicit read/unread, assignment and status actions use backend state.
- Thread detail and transcript refresh independently of the queue, including message status updates. Stale selection responses are cancelled/ignored. Earlier messages can be loaded; reading older content does not force scrolling to new messages.
- Separate in-memory drafts per conversation, visible recipient number, optional patient context, explicit Send and Ctrl/Cmd+Enter. No client text is stored in local/session storage. Drafts last for this mounted workspace, not across browser reloads or navigating away.
- A failed connection keeps the original message and idempotency key. “Check send safely” retrieves or saves that exact message once; it never silently generates a second key. A stored message’s status is shown even if it failed, was withdrawn, or is still queued. Re-sending failed staff messages requires copying into a new draft and an explicit send; unknown outcomes warn staff to check with the client.
- New conversation searches real client records and chooses a primary phone. It sends nothing and grants no consent. Shared/unmatched-number warnings, backend-supported client matching, linked patient profiles and consent recording live in Client details.
- Staff reply permission and automated-text agreement are shown separately. Agreement requires a method and an explicit staff attestation; opt-out cannot be overridden when the backend forbids it. START remains staff-reply-only. Test reply tools appear only in simulation.
- Desktop has queue, transcript and context. Smaller laptop/tablet layouts expose context through a toggle; portrait tablets have a Back to conversations action. The composer remains within the usable viewport after navigation moves above the workspace.
- Settings → Appointment texts is available only to owner/practice manager roles. Controls cover message enablement, wording/preview, up to five reminders, sending hours and appointment-type exclusions. Common reminder timings use plain language. Unsaved settings survive switching settings tabs and warn on browser unload. The backend’s defaults remain unchanged.
- Booking success and scheduler appointment details show read-only notification status. Pending planning says “Preparing messages…”; scheduled, skipped and actual message delivery states are distinct. Text failures do not change booking success. Conversation links open the relevant thread.

## Verification

- Eight focused Chromium browser scenarios passed using a disposable local database and the real API, with a simulated clinic: per-client drafts and incoming polling; consent/STOP/START; lost-response idempotency; new conversation; settings preview/persistence; concurrent handoff conflict; unavailable tab/direct link; pending appointment status; delayed-response recipient isolation. Several checks share one workflow scenario.
- The lost-response test lets the real API persist a message, drops the browser response, repeats with the original key, and asserts exactly one message exists.
- The delayed-response test holds an earlier thread response while switching recipients, then verifies the reply persisted only in the newly selected thread.
- Web typecheck passed. Focused lint passed with no errors and five existing warnings in dashboard-shell/scheduler-page. Production web build passed with explicit `NODE_ENV=production`; existing CSS/lint warnings remain.
- Inspected desktop, portrait tablet, settings and appointment-panel screenshots. Tablet Send visibility is also asserted in the browser test.
- During tooling setup, the globally installed pnpm 12 unexpectedly initiated dependency installation. Stopped those processes and restored the unchanged lockfile’s dependencies offline with cached pnpm 10.34.3. No dependency manifest or lockfile change. Next-generated test config additions were restored to their pre-run state.

## Boundaries and next verification

- No backend policy change. The proposed inbox access during a texting outage is still unimplemented; current readiness hides the tab. START policy is unchanged.
- Real Telnyx/carrier behavior remains unverified. These tests cannot establish live delivery, carrier compliance, or production readiness.
- Full role matrix, large-queue pagination/load testing, shared-number matching, inbound attachment downloads, all notification kinds after booking/reschedule/cancellation, and keyboard/screen-reader workflows need broader acceptance coverage. The appointment panel’s pending case is deliberately injected over the real read endpoint to test honest UI wording.
- Client search currently returns primary phone only; choosing alternate numbers in the New conversation search needs additional contact data. No dead alternate-number control is shown.
- Quick replies, browser notifications, real-time push, patient-profile embedded history, usage reporting and automatic reply-to-confirm remain outside this increment. No file sending, manual automation resend or invented urgency controls.
- Phone-browser sign-in policy and native apps are outside this work. Desktop/laptop/tablet are the tested targets.

## Visual evidence

Synthetic test clients only:

- [Desktop inbox](client-communication-frontend-2026-10-02/desktop.png)
- [Portrait tablet](client-communication-frontend-2026-10-02/tablet.png)
- [Appointment text settings](client-communication-frontend-2026-10-02/settings.png)
- [Appointment text status](client-communication-frontend-2026-10-02/appointment.png)
