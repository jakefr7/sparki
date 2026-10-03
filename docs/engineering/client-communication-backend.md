# Client communication backend

October 2, 2026. This is the contract the web app builds against, and the record of how clinic-to-client texting works on the server. It inherits the [Product Constitution](../blueprint/00-product-constitution.md), especially communication with the patient, one source of truth, and plain language. The architecture decisions behind it are proposed in [ADR-009](../adr/ADR-009-client-texting-architecture.md).

Code: `apps/api/src/client-communication/`. Frontend plan: [client communication frontend roadmap](../research/client-communication-frontend-roadmap-2026-10-02.md).

## Who this is for

A receptionist or technician at a busy clinic, on a desktop or tablet, who needs to see which client conversation needs attention, know the client and patient, reply, and hand off — and who must be able to trust every state on the screen.

## Founder decisions this implements (2026-10-02)

- **Recorded consent.** The clinic may start texting a number only after a staff member records that the client agreed, or the client texts the clinic first. An opt-out always wins.
- **Two-way texting first, then confirmations and reminders.** Both are built: conversations, sending, receiving, delivery status, opt-out, and assignment; then automated appointment texts.
- **The old simulated scaffolding is replaced.** The migration deletes existing simulated conversations; `pnpm db:seed-demo` recreates examples.
- **Hidden until approved.** A clinic sees no Communication tab until its texting number is registered and approved. Simulation remains only for clinics explicitly marked as demo or test.
- **Automated texts need recorded agreement.** A confirmation or reminder goes only to a client whose agreement a staff member recorded. A client having texted the clinic first allows staff replies, not automated texts.
- **Opt-out always wins.** It withdraws anything still waiting to be sent, and staff cannot lift a client's own STOP.
- **Booking never depends on texting.** The appointments module does not call the texting code at all.
- **No reply-to-confirm.** An appointment's confirmation stays a manual staff action.
- **Each clinic controls its own confirmations and reminders** — which send, when, and the wording — and only an owner or practice manager can change them. Nothing is on until the clinic turns it on.

## What is and is not real

| Mode | When | Tab | What happens to a staff message |
| --- | --- | --- | --- |
| `NOT_SET_UP` | Nothing is registered for the location | Hidden | Refused (`TEXTING_NOT_SET_UP`). |
| `SIMULATED` | The location is marked as a demo or test clinic | Shown | Saved with status `SIMULATED`. Never sent. No sent or delivered time. |
| `UNAVAILABLE` | A real number exists but is `PENDING`, `SUSPENDED`, or credentials are missing | Hidden | Refused with a reason. Never quietly simulated. |
| `LIVE` | The location has an `ACTIVE` number and Telnyx credentials are set | Shown | Sent through Telnyx; status follows the provider. |

`readiness.visible` is the one thing the frontend needs: show the Communication tab only when it is true.

The migration marks every location that exists today as simulated, because all of them are demo or test clinics. A clinic created afterwards starts `NOT_SET_UP`. No location is `LIVE` anywhere: no Telnyx account exists. The Telnyx adapter and webhook are written from Telnyx's published API reference and covered by tests built from its documented payloads. **They have not been run against a live Telnyx account.**

## Rules the model keeps true

1. **One conversation per phone number per location.** A text goes to a phone, not a person. A reply therefore has exactly one place to land, and Sparki never guesses which of two clients sharing a number sent it.
2. **Patient and appointment are on the message, not the conversation.** A client can have several patients.
3. **An inbound text is routed by the clinic number that was texted**, then matched to clients only inside that clinic. The sender's number never chooses the clinic.
4. **A message is saved before it is sent.** A crash between the two loses nothing.
5. **An unknown outcome is never retried.** If the provider did not answer, the message may have gone out, so it is labelled `OUTCOME_UNKNOWN` for a person to decide. Only an explicit "did not take it" from the provider is retried (three attempts).
6. **Delivery status only moves forward.** A late "sent" can never overwrite "delivered".
7. **Loading a conversation never marks it read.** Reading is an explicit call.
8. **Everything is checked again immediately before every send attempt**, the first and each retry: opt-out, the recipient, and for an automated text the whole appointment check. A message that should no longer go is withdrawn (`CANCELLED`) and never reaches the provider.
9. **Simulation never sends.** A message saved while a location is simulated stays simulated forever; a real message queued at a location that has since become simulated or unavailable is withdrawn, not simulated.

## Message status

| Status | Meaning | Direction |
| --- | --- | --- |
| `QUEUED` | Saved; waiting for the first attempt or a retry (`nextAttemptAt` says when) | Outbound |
| `SENDING` | A provider request is in flight | Outbound |
| `SENT` | The provider accepted it. Not proof the phone received it | Outbound |
| `DELIVERED` | The carrier confirmed delivery to the phone | Outbound |
| `DELIVERY_UNCONFIRMED` | The provider finished without a carrier receipt | Outbound |
| `FAILED` | The provider or carrier refused it; `failure` says why | Outbound |
| `OUTCOME_UNKNOWN` | Sparki could not confirm whether it was sent | Outbound |
| `CANCELLED` | Withdrawn by Sparki before it reached the provider; `failure` says why. Never sent | Outbound |
| `RECEIVED` | A real text from the client | Inbound |
| `SIMULATED` | Saved for workflow testing; never left or entered Sparki | Both |

Nothing here means "the client read it" or "the client confirmed". SMS has no read receipts, and confirmation is a separate fact that belongs to the appointment.

## Conversation status

- `OPEN` — needs the clinic's attention.
- `WAITING` — the clinic replied and is waiting on the client.
- `CLOSED` — resolved.

A staff message moves the conversation to `WAITING`. A client message moves it to `OPEN`, including from `CLOSED`. A STOP or START keyword changes neither status nor unread.

`unread` is shared by the team: it means nobody has opened the client's message yet, not that one person hasn't.

## Who a number belongs to (`matchState`)

| State | Meaning | Texting |
| --- | --- | --- |
| `MATCHED` | Linked to the one client whose record has this number | Allowed |
| `SHARED` | Linked, but another client record has the same number | Allowed; show both |
| `NEEDS_LINK` | Not linked; at least one client record has the number | Allowed if the client texted first |
| `UNMATCHED` | Not linked; no client record has the number | Allowed if the client texted first |
| `NUMBER_NOT_ON_CLIENT` | Linked to a client whose record no longer has the number | Blocked |

The client record is the source of truth for whose number it is. A conversation can only be linked to a client whose record has the number.

## Consent

Stored per clinic organization and phone number, with a full history.

| `consent.status` | Meaning |
| --- | --- |
| `UNKNOWN` | Nothing recorded. The clinic may not start texting. |
| `GRANTED` | Staff recorded agreement (`STAFF_RECORDED`), the client texted first (`CLIENT_INITIATED`), or the client texted START (`KEYWORD`). |
| `OPTED_OUT` | Staff recorded it (`STAFF_RECORDED`), the client texted STOP (`KEYWORD`), or the carrier's block list refused a send (`PROVIDER_BLOCK`). |

- Opt-out words: STOP, STOPALL, STOP ALL, UNSUBSCRIBE, CANCEL, END, QUIT, REVOKE, OPT OUT. Opt-in words: START, UNSTOP. Only a message that is nothing but the keyword counts — "please stop by at 3" does not opt anyone out.
- A client who opts out in their own words must be recorded by staff.
- `consent.staffMayGrant` is false when the client opted out themselves (`KEYWORD` or `PROVIDER_BLOCK`). Staff cannot undo that; the client must text START.
- Staff recording an opt-out on a number that is already opted out changes nothing except the history: a client's own STOP stays the client's, so staff can never turn it into something staff can lift.
- When the carrier refuses a send because of its own STOP list, that replaces a staff-recorded opt-out with `PROVIDER_BLOCK` (client-owned), never the reverse.
- START restores `GRANTED` with basis `KEYWORD`: staff may text again, but automated texts wait until staff record agreement again. **This is the current behavior pending a founder decision** (open question 1 below); it will not change without one.
- Recording agreement requires how the client agreed (`method`) and a linked client.
- Every consent change for a number is serialized: agreement recorded at the same moment as a client's STOP cannot overwrite the STOP.
- Recording an opt-out (any basis) immediately withdraws every message still waiting to go to that number, staff and automated.

## Two different permissions

The UI must not treat "may we reply" and "may Sparki send automated texts" as the same thing.

| Question | Where to read it | True when |
| --- | --- | --- |
| May staff send a text in this conversation? | `thread.sendEligibility.canSend` (with `code` and `message` when not) | Texting is available, the number is not opted out, it is still on the linked client's record, and consent is `GRANTED` on any basis — including the client having texted first |
| May automated appointment texts go to this number? | `thread.consent.automatedTextsAllowed`; for an appointment, `recipient.canReceiveAutomatedTexts` (with `reason`) | Consent is `GRANTED` with basis `STAFF_RECORDED` |

By consent record:

| Consent | Staff may reply / text | Automated appointment texts |
| --- | --- | --- |
| None recorded | No (`CONSENT_REQUIRED`) | No (`NO_RECORDED_AGREEMENT`) |
| `GRANTED`, `CLIENT_INITIATED` (the client texted first) | Yes | No (`NO_RECORDED_AGREEMENT`) |
| `GRANTED`, `KEYWORD` (the client texted START) | Yes | No (`NO_RECORDED_AGREEMENT`) — pending founder decision |
| `GRANTED`, `STAFF_RECORDED` | Yes | Yes |
| `OPTED_OUT`, any basis | No (`OPTED_OUT`) | No (`OPTED_OUT`) |

Other conditions still apply to both columns (texting available, a textable number, the number still on the client's record). A conversation the client started therefore shows "you can reply" and, separately, "automated reminders need recorded agreement". Recording agreement (`PUT /threads/:id/consent` with `GRANTED`) is what turns on the second.

## API

Base path `/client-communication`. Every route requires a signed-in clinic staff role (owner, practice manager, receptionist, veterinarian, technician, assistant). Every route is scoped to the caller's organization and location; another clinic's or location's conversation returns 404.

The web app needs its own proxy routes under `apps/web/src/app/api/client-communication/` (copy `api/messaging/[...path]/route.ts`, plus a binary route for attachments like `api/messaging/attachments/[id]/route.ts`). Paths below are the API's.

| Method and path | Purpose |
| --- | --- |
| `GET /readiness` | Mode, sender number, capabilities |
| `GET /assignees` | Staff a conversation can be handed to |
| `GET /threads` | The queue |
| `POST /threads` | Find or start the conversation with a client's number |
| `GET /threads/:id` | One conversation with context |
| `PATCH /threads/:id` | Change status, owner, or linked client |
| `POST /threads/:id/read` | Mark read |
| `POST /threads/:id/unread` | Mark unread |
| `GET /threads/:id/messages` | A page of messages, or changes since last poll |
| `POST /threads/:id/messages` | Send a message |
| `PUT /threads/:id/consent` | Record agreement or opt-out |
| `POST /threads/:id/simulated-replies` | Simulation only: add a client reply for testing |
| `GET /attachments/:id` | A file a client sent |
| `GET /notification-settings` | The clinic's automated appointment texts (owner, practice manager) |
| `PUT /notification-settings` | Save them (owner, practice manager) |
| `POST /notification-settings/preview` | What a client would receive (owner, practice manager) |
| `GET /appointments/:appointmentId/notifications` | What was, will be, or was not sent for one appointment |

### Readiness

```json
{
  "mode": "SIMULATED",
  "visible": true,
  "reasonCode": null,
  "reason": null,
  "senderPhone": null,
  "senderPhoneDisplay": null,
  "location": { "id": "…", "name": "…" },
  "organization": { "id": "…", "name": "…" },
  "capabilities": { "receiveFiles": false, "sendFiles": false, "simulateClientReply": true },
  "limits": { "maxMessageLength": 1600 }
}
```

`reasonCode` when unavailable: `REGISTRATION_PENDING`, `SENDER_SUSPENDED`, `PROVIDER_NOT_CONFIGURED`.

### The queue: `GET /threads`

Query: `view` (`all`, `unread`, `open`, `waiting`, `closed`, `mine`, `unassigned`, `problems`; default `all`), `search`, `clientId`, `patientId`, `cursor`, `limit` (1–100, default 30).

- Sorted by latest message, newest first. `nextCursor` is null on the last page.
- `search` matches client first or last name, patient name, or phone digits (three or more). Every word must match something.
- `counts` are database totals for the whole queue, not the loaded page. They are returned on the first page only (null when `cursor` is sent).
- `mine` and `unassigned` exclude closed conversations. `problems` is conversations whose newest outbound message failed or has an unknown outcome.
- A conversation that was opened but never used is left out of the queue. It appears when filtering by `clientId` or `patientId`.
- `patientId` returns conversations with any of that patient's clients, plus any conversation holding a message about that patient. This is the patient-context view.

```json
{
  "threads": [ThreadSummary],
  "nextCursor": "…",
  "counts": { "unread": 2, "open": 3, "waiting": 5, "mine": 1, "unassigned": 4, "problems": 0 }
}
```

`ThreadSummary`:

```json
{
  "id": "…",
  "version": 3,
  "status": "OPEN",
  "contactPhone": "+13125550142",
  "contactPhoneDisplay": "(312) 555-0142",
  "client": { "id": "…", "firstName": "Jordan", "lastName": "Ellis" },
  "matchState": "MATCHED",
  "assignedTo": { "id": "…", "name": "Maria Alvarez" },
  "unreadCount": 1,
  "unread": true,
  "consentStatus": "GRANTED",
  "deliveryProblemSince": null,
  "lastMessageAt": "2026-10-02T21:00:00.000Z",
  "lastInboundAt": "2026-10-02T21:00:00.000Z",
  "lastMessage": Message,
  "createdAt": "…"
}
```

`client` and `assignedTo` can be null. `unread` is true when `unreadCount > 0` or someone marked it unread.

### One conversation: `GET /threads/:id`

`ThreadSummary` plus:

```json
{
  "contact": { "phone": "(312) 555-0142", "alternatePhone": null, "email": "…", "preferredContactMethod": "Phone" },
  "clientCandidates": [{ "id": "…", "firstName": "Jordan", "lastName": "Ellis" }],
  "patients": [{ "id": "…", "name": "Finley", "species": "Canine", "breed": null, "status": "Active" }],
  "consent": {
    "status": "GRANTED", "basis": "STAFF_RECORDED", "method": "VERBAL", "note": null,
    "recordedAt": "…", "recordedById": "…", "recordedBy": { "id": "…", "name": "…" },
    "staffMayGrant": true
  },
  "sendEligibility": { "canSend": true, "code": null, "message": null },
  "events": [{ "id": "…", "type": "STATUS_CHANGED", "actor": null, "before": { "status": "WAITING" }, "after": { "status": "OPEN" }, "createdAt": "…" }]
}
```

- `clientCandidates` is every client record that has this number: who the conversation may be linked to.
- `patients` are the linked client's patients. Do not assume the first is the subject.
- `sendEligibility.message` is written for staff and can be shown beside the composer. Codes: `CONSENT_REQUIRED`, `OPTED_OUT`, `NUMBER_NOT_ON_CLIENT`, `TEXTING_NOT_SET_UP`, `REGISTRATION_PENDING`, `SENDER_SUSPENDED`, `PROVIDER_NOT_CONFIGURED`.
- `events` is the last 50 changes to status, owner, or linked client, newest first. `actor` is null when the system made the change (a client message reopened it).

### Start a conversation: `POST /threads`

Body: `{ "clientId": "…", "phone": "PRIMARY" | "ALTERNATE" }` (`phone` defaults to `PRIMARY`).

Returns `{ "thread": <detail>, "created": true|false }` with 201 when new and 200 when it already existed. If the number already has a conversation linked to another client, that conversation is returned unchanged with `matchState: "SHARED"`.

Errors: 404 client not found; 422 `NUMBER_NOT_TEXTABLE` when the number is missing or not a complete US or Canada number.

### Messages: `GET /threads/:id/messages`

- No parameters: the newest `limit` messages (1–200, default 50), oldest first within the page.
- `before=<olderCursor>`: the page before a previous response.
- `changedSince=<asOf>`: every message created **or updated** since a previous response's `asOf`. This is the polling call. It returns delivery-status changes to messages already on screen, not only new messages. It is inclusive, so merge by `id`.

```json
{ "messages": [Message], "olderCursor": "…", "asOf": "2026-10-02T21:00:05.000Z" }
```

`Message`:

```json
{
  "id": "…", "threadId": "…",
  "direction": "OUTBOUND", "source": "STAFF", "status": "SENT", "simulated": false,
  "body": "Finley is ready to go home.",
  "sender": { "id": "…", "name": "Maria Alvarez" },
  "clientId": "…", "patientId": null, "appointmentId": null,
  "segments": 1,
  "createdAt": "…", "updatedAt": "…", "sentAt": "…", "deliveredAt": null, "failedAt": null,
  "nextAttemptAt": null,
  "failure": null,
  "canResend": false,
  "attachments": [{ "id": "…", "status": "STORED", "mimeType": "image/jpeg", "sizeBytes": 20480, "href": "/client-communication/attachments/…" }]
}
```

- `source` is `STAFF`, `CLIENT`, or `AUTOMATED` (an appointment confirmation, reminder, or change notice; `sender` is null and `appointmentId` is set).
- `failure` is `{ code, message, detail }` for `FAILED`, `OUTCOME_UNKNOWN`, and `CANCELLED`. `message` is written for staff; `detail` is the provider's wording or Sparki's reason.
- `canResend` is true for a `FAILED` or `OUTCOME_UNKNOWN` outbound message. Resending is a **new** `POST` with a **new** `idempotencyKey` — a deliberate staff action, and it goes through every check again. A `CANCELLED` message is not offered for resend: it was withheld on purpose.
- Attachment `status`: `PENDING` (being copied into storage, `href` null), `STORED`, or `FAILED`.

There is no push channel. Poll the queue and the open conversation; a few seconds is fine.

### Send: `POST /threads/:id/messages`

Body: `{ "body": "…", "idempotencyKey": "…", "patientId"?: "…", "appointmentId"?: "…" }`.

- `idempotencyKey` (8–120 characters): generate once per message the user composes and reuse it on every retry of that message. A repeat returns the saved message with `created: false` and 200; it never sends twice. This is what makes an ambiguous network failure safe to retry.
- The first delivery attempt happens before the response, so the response carries the real status.
- `patientId` must be one of the linked client's patients. `appointmentId` must belong to the linked client.
- Sending moves the conversation to `WAITING` and marks it read.

Returns `{ "message": Message, "created": true }` with 201.

Errors: 409 with `{ code, message }` using the `sendEligibility` codes; 409 `IDEMPOTENCY_KEY_REUSED` when the key was already used for different text; 400 `PATIENT_NOT_FOR_CLIENT` or `APPOINTMENT_NOT_FOR_CLIENT`.

A 201 response can still carry a message that did not go: the first attempt runs before the response, so the message may already be `CANCELLED` (for example, the client opted out a moment earlier) or `QUEUED` for a retry. Show the status the response carries.

### Change a conversation: `PATCH /threads/:id`

Body: `{ "expectedVersion": 3, "status"?: "OPEN"|"WAITING"|"CLOSED", "assignedToId"?: "…"|null, "clientId"?: "…"|null }`.

`expectedVersion` is the `version` last shown to the user. If anyone changed the conversation since — including a client message reopening it — the call returns 409 `THREAD_CHANGED` and changes nothing. Reload and let the user decide.

Other errors: 400 `ASSIGNEE_UNAVAILABLE`; 422 `NUMBER_NOT_ON_CLIENT` when linking a client whose record does not have the number.

### Consent: `PUT /threads/:id/consent`

Body: `{ "status": "GRANTED"|"OPTED_OUT", "method"?: "VERBAL"|"WRITTEN_FORM"|"ONLINE_FORM"|"OTHER", "note"?: "…" }`. `method` is required for `GRANTED`.

Errors: 422 `CLIENT_LINK_REQUIRED` when granting on an unlinked conversation; 409 `CLIENT_MUST_OPT_IN` when the client opted out themselves.

### Simulated client reply: `POST /threads/:id/simulated-replies`

Body: `{ "body": "…" }`. Only where `readiness.capabilities.simulateClientReply` is true; otherwise 409 `NOT_SIMULATED`. It runs the same rules as a real inbound text (unread, reopen, STOP and START) and is stored as `SIMULATED`. Use it to test incoming messages; label it clearly as a test action.

## Automated appointment texts

### How they behave

- Four kinds: `CONFIRMATION` (at booking), `REMINDER` (a clinic-chosen time before; up to five), `RESCHEDULED` (when the time changes), `CANCELLED`.
- They are triggered by the appointment change log, which the appointments module writes in the same transaction as every booking, move, and cancellation. A failure here can never undo a booking.
- Only a changed **time** produces a `RESCHEDULED` notice. A changed provider, room, or note does not.
- Everything is checked when a text comes due, and again immediately before every attempt to send it, including retries. If the appointment has moved, been cancelled, or passed, the rule or appointment type was turned off, the client or their number changed, or the client is no longer eligible, the text is not sent and the reason is recorded.
- A reminder whose time had already passed when the appointment was booked is skipped, so a client is not reminded seconds after booking.
- Texts are held for the clinic's sending hours (clinic-local time). If the hours open after the appointment, the text is skipped.
- Euthanasia appointments never get automated texts unless the clinic turns that on for the type.
- A booking, move, or cancellation older than 24 hours is never announced.
- An automated text appears in the client's conversation. It does not mark the conversation unread or change its status; a conversation it starts is created `CLOSED`. A reply from the client reopens it.
- Sparki always includes the clinic's name and an opt-out line, whatever the clinic wrote, because carriers require both.
- Changing the rules re-plans reminders for appointments already booked, within a few seconds.

### Settings: `GET` and `PUT /notification-settings`

```json
{
  "saved": true,
  "updatedAt": "…", "updatedBy": { "id": "…", "name": "…" },
  "timeZone": "America/Chicago",
  "sendWindow": { "startMinute": 480, "endMinute": 1200 },
  "rules": [
    { "id": "…", "kind": "CONFIRMATION", "enabled": true, "offsetMinutes": null, "template": "{clinic_name}: …" },
    { "id": "…", "kind": "REMINDER", "enabled": true, "offsetMinutes": 1440, "template": "…" },
    { "id": null, "kind": "RESCHEDULED", "enabled": false, "offsetMinutes": null, "template": "…" },
    { "id": null, "kind": "CANCELLED", "enabled": false, "offsetMinutes": null, "template": "…" }
  ],
  "appointmentTypes": [{ "id": "…", "name": "Wellness Exam", "isActive": true, "automatedMessages": true }],
  "clinic": { "name": "…", "phone": "…" },
  "texting": { "mode": "SIMULATED", "visible": true },
  "placeholders": { "CONFIRMATION": ["clinic_name", "clinic_phone", "client_first_name", "patient_name", "appointment_date", "appointment_time"], "…": [] },
  "limits": { "maxTemplateLength": 480, "maxReminders": 5, "minReminderOffsetMinutes": 15, "maxReminderOffsetMinutes": 43200 }
}
```

- `rules` always has the four kinds in the same order. A rule with `id: null` is suggested wording that has never been saved. `saved: false` means the clinic has saved nothing yet.
- `sendWindow` is minutes after midnight, clinic-local.
- `RESCHEDULED` also allows `{previous_date}` and `{previous_time}`. There is deliberately no placeholder for the appointment type or reason.

`PUT` body: `{ "sendWindow": {…}, "rules": [{ "id"?, "kind", "enabled", "offsetMinutes"?, "template" }], "appointmentTypes"?: [{ "id", "automatedMessages" }] }`.

- It replaces the whole set: a saved rule that is left out is removed. Send `id` to keep editing a saved rule.
- One each of `CONFIRMATION`, `RESCHEDULED`, `CANCELLED`; up to five `REMINDER` with distinct `offsetMinutes`.
- Errors: 400 `TEMPLATE_INVALID` with `rules: [{ index, kind, problems: ["…"] }]` (problems are written for a manager); 422 `CLINIC_PHONE_MISSING` when an enabled message uses `{clinic_phone}` and the clinic has none; 400 `RULE_NOT_FOUND`; 400 `APPOINTMENT_TYPE_NOT_FOUND`.

`POST /notification-settings/preview` with `{ "kind", "template" }` returns `{ "text", "segments", "problems" }` using example details, before anything is saved.

### One appointment: `GET /appointments/:appointmentId/notifications`

Any staff role. **Read-only:** it never plans, creates, or sends anything; the background pass (every few seconds) owns delivery. Straight after a booking, move, or cancellation, `planning.upToDate` is `false` until that pass has processed the change — show "Preparing messages…" and poll (every 2–5 seconds is enough) rather than treating an empty list as "nothing will be sent".

```json
{
  "appointmentId": "…",
  "planning": { "upToDate": true, "pendingSince": null },
  "automatedTexts": { "anyEnabled": true, "allowedForAppointmentType": true },
  "recipient": {
    "clientId": "…", "phoneDisplay": "(312) 555-0142", "threadId": "…",
    "canReceiveAutomatedTexts": false,
    "reason": { "code": "NO_RECORDED_AGREEMENT", "message": "No one has recorded that this client agreed to receive texts." }
  },
  "notifications": [
    {
      "id": "…", "kind": "REMINDER", "status": "SCHEDULED", "offsetMinutes": 1440,
      "dueAt": "…", "expectedSendAt": "…", "plannedForStart": "…",
      "skipped": null, "message": null, "createdAt": "…", "updatedAt": "…"
    }
  ]
}
```

- `planning`: `upToDate: false` with `pendingSince` (when the oldest unprocessed change happened) means the list does not yet reflect the latest booking change. `recipient` is always current, because it is computed on the spot.
- `status`: `SCHEDULED`, `DISPATCHED`, `SKIPPED`, `CANCELLED`.
- A `DISPATCHED` notification whose `message.status` is `QUEUED` is created but not yet sent; that is normal for a few seconds.
- **`DISPATCHED` is not "delivered".** It means a message was created; `message.status` says what happened to it.
- `expectedSendAt` allows for sending hours and is set only while `SCHEDULED`.
- `skipped` is `{ code, message }`. Codes: `NO_RECORDED_AGREEMENT`, `OPTED_OUT`, `NO_TEXTABLE_NUMBER`, `NO_CLIENT`, `RECIPIENT_CHANGED`, `TEXTING_NOT_AVAILABLE`, `APPOINTMENT_CHANGED`, `APPOINTMENT_PASSED`, `APPOINTMENT_TYPE_EXCLUDED`, `RULE_DISABLED`, `REMINDER_TIME_PASSED`, `OUTSIDE_SEND_HOURS`, `TEMPLATE_INCOMPLETE`, `CLINIC_TIME_ZONE_INVALID`.
- A notification can be `SKIPPED` **with** a `message`: its message was created, then withdrawn before sending (`message.status` is `CANCELLED`, `message.failure.code` is the same reason).
- `recipient` says today whether this client can receive automated texts, before anything is due. To record agreement, open the client's conversation (`recipient.threadId`, or `POST /threads` with the client) and use `PUT /threads/:id/consent`.
- The appointment's existing `confirmationStatus` field is unchanged and still manual. Nothing here sets it.

## Messages waiting to be sent when something changes

A message waits between being saved and reaching the provider: normally for well under a second, longer when the provider asks Sparki to retry (after 20 seconds, then 90), when the dispatcher was down, or when an automated text is held for sending hours.

| What changed | What happens to a waiting message |
| --- | --- |
| The client opted out (STOP, carrier block, or staff) | Withdrawn at once, staff and automated: `CANCELLED`, `OPTED_OUT` |
| The appointment was moved or cancelled through the app | Its waiting automated texts are withdrawn when the planner processes the change (within seconds): `APPOINTMENT_CHANGED` |
| The appointment changed some other way, the clinic turned the rule off or excluded the type, the client or their number changed, or the appointment time passed | Withdrawn at the next send attempt, before the provider is contacted: `APPOINTMENT_CHANGED`, `RULE_DISABLED`, `APPOINTMENT_TYPE_EXCLUDED`, `RECIPIENT_CHANGED`, `APPOINTMENT_PASSED`. Rule and type changes also withdraw during the re-plan that follows saving settings |
| A staff message's number left the client's record | Withdrawn at the next send attempt: `RECIPIENT_CHANGED` |
| A retry comes due outside sending hours | Held (stays `QUEUED`, `nextAttemptAt` set to the opening time) — or withdrawn as `OUTSIDE_SEND_HOURS` if that is after the appointment |
| Texting became unavailable or the location became simulated | Withdrawn at the next attempt: `TEXTING_NOT_AVAILABLE`. Never sent as simulation |

What cannot be recalled: a message already handed to the provider (`SENDING`, `SENT`). The checks run immediately before the provider request, so the exposure is that request itself; a STOP the carrier already holds is also enforced by the carrier.

## When texting becomes unavailable (current behavior)

This is how the backend behaves today. A change is proposed below and waits for founder approval; build against this until it is approved.

- `GET /readiness` → `visible: false`: hide the Communication tab. Poll it (for example with the queue) so the tab disappears or appears without a reload.
- If a conversation is open when that happens, sends answer 409 with `TEXTING_NOT_SET_UP`, `REGISTRATION_PENDING`, `SENDER_SUSPENDED`, or `PROVIDER_NOT_CONFIGURED`. Show `message` beside the composer, keep the draft, and refresh readiness.
- Messages already waiting are withdrawn as `TEXTING_NOT_AVAILABLE` at their next attempt, and automated texts that come due are skipped with the same code.
- Inbound texts to a pending or suspended number are still saved. While the tab is hidden, nobody sees them (an open product question below).

## Proposal: read-only history when texting is unavailable (not implemented — needs founder approval)

**Problem with today's rule.** "Hidden until approved" is right for a clinic that never had texting. But a clinic whose number becomes pending, suspended, or disconnected after use loses every past conversation from view, and texts clients send in that period are saved where nobody can see them, so those clients get no answer.

**Proposed rule.**

| Clinic situation | Communication tab | Sending |
| --- | --- | --- |
| Never configured, no conversations | Hidden | — |
| Simulated (demo or test clinic) | Full | Simulated |
| Live | Full | Allowed |
| Pending, suspended, or not connected, **with** any conversation (including texts received while unavailable) | Read-only, with the reason | Blocked |
| Pending with no conversation yet | Hidden | — |

**Readiness fields to add** (alongside the existing `mode`, `reasonCode`, `reason`):

- `access`: `HIDDEN` | `READ_ONLY` | `FULL` — replaces `visible` as the one value navigation reads (`visible` stays as `access !== 'HIDDEN'` for compatibility).
- `canSend`: boolean, with the existing `reasonCode`/`reason` explaining why not.
- `hasConversations`: boolean, so the frontend can explain why a read-only tab exists.
- `unreadWhileUnavailable`: count of inbound messages not yet opened, so a banner can say "3 client texts arrived while texting was unavailable".

**What "read-only" allows.** The line is drawn at "contacts the client": nothing that reaches a client, everything that helps staff follow up by phone.

| Action | Read-only | Why |
| --- | --- | --- |
| Read conversations, messages, attachments; search; filter | Allowed | Staff need the history and any new texts |
| Mark read / unread | Allowed | Lets the team track who has seen texts that arrived while unavailable |
| Assign, change status (open / waiting / closed) | Allowed | So someone owns calling the client back |
| Link or relink a client | Allowed | Internal record-keeping; matches texts that arrived from unknown numbers |
| Record an opt-out | Allowed | An opt-out must be recordable at any time |
| Record agreement | Allowed | Internal record; takes effect only when sending resumes |
| Send a message, simulate a reply | Blocked | Contacts (or pretends to contact) a client |
| Start a new conversation | Blocked | Implies a text is about to be sent |
| Automated appointment texts | Skipped (`TEXTING_NOT_AVAILABLE`) | As today |
| Notification settings (owner, practice manager) | Allowed, from Settings | So the clinic is ready when sending resumes |

**Permissions.** The same six staff roles as today; read-only adds no new role rules. Notification settings stay owner and practice manager only.

**Backend changes if approved.** Compute `access`, `canSend`, `hasConversations`, `unreadWhileUnavailable` in readiness; refuse `POST /threads` and simulated replies with a `TEXTING_READ_ONLY` code when read-only (sending is already refused); everything else is already permitted. Tests for each row above.

**Frontend behavior if approved.** Show the tab when `access` is not `HIDDEN`. When `READ_ONLY`: a persistent banner with `reason` and, if any, the count of texts received while unavailable ("Reply by phone"); replace the composer with that explanation; hide "New conversation"; keep assignment, status, read/unread, linking, and consent recording. Poll readiness so the view switches when sending resumes or stops.

**Decisions this needs.** Approve or change the table above; confirm that a suspended clinic should see its history; confirm that recording agreement while unavailable is acceptable.

## Recovery actions that exist

| Situation | Action |
| --- | --- |
| A staff message `FAILED` or `OUTCOME_UNKNOWN` | Send it again as a new message with a new key (`canResend`). For `OUTCOME_UNKNOWN`, check with the client first: it may have arrived |
| A send request timed out in the browser | Repeat the same request with the same key: it returns the saved message and never sends twice |
| `NO_RECORDED_AGREEMENT` | Record agreement (`PUT /threads/:id/consent`). Future automated texts for that client then go; the one already skipped does not |
| A conversation linked to the wrong client, or `NUMBER_NOT_ON_CLIENT` | Fix the client record, then `PATCH /threads/:id` with `clientId` |
| An unknown or shared number | Link it (`PATCH` with `clientId`, from `clientCandidates`) |
| A client's own STOP | None for staff. The client texts START |
| Two people changed the same conversation | `THREAD_CHANGED`: reload and decide |

Not available: resending a skipped or withdrawn automated text, a "send now" for one appointment, re-trying a message by hand with its original key after `FAILED`, recalling a sent message.

## Who can do what

| Action | Roles |
| --- | --- |
| Read and send client conversations, assign, change status, record consent, simulate a reply, see an appointment's automated texts | Owner, practice manager, receptionist, veterinarian, technician, assistant |
| Read, change, or preview the clinic's automated-text settings (messages, timing, wording, sending hours, appointment types) | Owner and practice manager only |
| Anything here | Never a client (pet owner) account |

## What the frontend must not do

- Show the Communication tab when `readiness.visible` is false.
- Show "may reply" as "may send automated texts", or the reverse.
- Offer resend for a `CANCELLED` message.
- Treat an empty notification list as "nothing will be sent" while `planning.upToDate` is false, or call the status endpoint to make something happen — it only reads.
- Show `SIMULATED` as sent, or `SENT` as delivered, or a `DISPATCHED` notification as delivered.
- Mark a conversation read just because it was opened.
- Reuse an `idempotencyKey` for a different message, or resend automatically.
- Offer to send files (`capabilities.sendFiles` is false).
- Treat `OPEN` as urgent. Urgency is not modelled.

## Answers to the frontend coordination table

| Frontend need | Backend answer |
| --- | --- |
| Clinic scope and readiness | `GET /readiness` |
| Useful queue | `GET /threads` with views, counts, cursor paging; stable ids and sort |
| Current transcript | `GET /threads/:id/messages` with `before` and `changedSince`; explicit `POST …/read` |
| Safe send | `idempotencyKey`; persisted message and status in the response; `OUTCOME_UNKNOWN` for ambiguity |
| Honest delivery | Message status table above; `failure`; `canResend` |
| Context | `client`, `patients`, `clientCandidates`; `patientId`/`appointmentId` on messages; `source` |
| Compose restrictions | `sendEligibility` and `consent` on the conversation |
| Handoff | `GET /assignees`; `PATCH` with `expectedVersion`; `events` |
| Live refresh | Polling. No provider credentials reach the browser |
| New conversation | `POST /threads`; `matchState` for shared numbers |
| Attachments | Inbound only; `attachments` on messages; `GET /attachments/:id` |

## Going live for a clinic (not done)

1. Create a Telnyx account; set `TELNYX_API_KEY` and `TELNYX_PUBLIC_KEY` in that environment.
2. Register the clinic's brand and campaign with the carriers, and host or buy its number. This is manual today.
3. Point the Telnyx messaging profile's webhook at `POST <public API origin>/client-communication/webhooks/telnyx`. How the API is exposed publicly on staging needs confirming.
4. Register the number: `dotenv -e .env -- node scripts/set-client-texting-number.mjs --location <id> --number "+1…" --profile <profile id>` (starts `PENDING`, tab still hidden), then `--status ACTIVE` once approved. `--simulate` marks a demo or test clinic instead.
5. Send a real test text both ways before any clinic relies on it.

## Not built yet

- Letting a client confirm by replying (for example "C"). A reply to a reminder is an ordinary message for staff; the appointment's `confirmationStatus` stays manual.
- A "send now" action for one appointment, and resending a skipped notice after recording agreement.
- A history of who changed the clinic's automated-text settings (only the last editor is kept).
- A bulk "already agreed" import for a clinic migrating its clients.
- Email as a notification channel.
- Sending files to clients.
- Turning a client message into a task.
- Automated clinic onboarding with the carriers.
- Usage and cost reporting per clinic (segment counts are stored per message).
- A HELP auto-reply. Telnyx's messaging profile can answer HELP and STOP itself; configure it there.
- Push updates (the web app polls).

## Known limits

- Phone normalization is US and Canada only.
- `Client.phoneE164` is written by the API. A client row created outside the API (a seed, a future importer) has no normalized copy until a conversation is started with it, so an inbound text from that number shows as `UNMATCHED` until then. It fails safe, never to the wrong client.
- Consent follows the phone number. If a number is reassigned to a different person, the old consent still stands until someone changes it.
- Consent is organization-wide per number; Telnyx's own STOP list is per messaging profile (location). For a future multi-location clinic, a START at one location could clear Sparki's opt-out while another location's profile still blocks the number; the next send from there would record the block again.
- Reminder offsets are durations: "1 day before" across a daylight-saving change is 23 or 25 clock hours. Sending hours are always clinic-local.
- A reminder that comes due late (for example after an outage) still sends if the appointment has not started.
- Files clients send are fetched only from public HTTPS addresses: every DNS answer and every redirect (at most three) is checked against private, loopback, link-local, carrier-NAT and other reserved ranges, and the download stops the moment it passes 10 MB. Only images and PDFs are kept, and they are served with a sandbox policy.
- There are no per-clinic usage limits or spend caps in Sparki. Telnyx can cap spend per messaging profile; that is not modelled or shown.
- A delivery update for a send with an unknown outcome is matched by clinic number, client number, and exact text. If the provider altered the text, it stays `OUTCOME_UNKNOWN`.

## Tests

- Unit: `apps/api/src/client-communication/**/*.spec.ts`, `apps/api/src/common/phone.spec.ts`.
- Unit: also `inbound-media-downloader.spec.ts` (address rules and downloads against a local server).
- Integration: `apps/api/test/client-communication.e2e-spec.ts` (against a real database with genuine webhook signatures; the network, file downloads, and file storage are stubbed) and `apps/api/test/appointment-notifications.e2e-spec.ts` (real bookings, moves, and cancellations through the appointments API, and a stubbed live number for retries).
- Nothing has been run against a live Telnyx account, a real carrier, or a real phone.

## Readiness

**Ready for frontend integration in simulation.** Every endpoint in this document works against the development clinic, which is simulated: messages are saved and labelled, never sent. The Communication tab, queue, conversation, consent recording, notification settings, and appointment status panel can all be built and tested end to end.

**Not ready for a live launch.** Before any clinic texts real clients:

- **Real Telnyx and carrier testing.** Nothing has run against a live Telnyx account, a real carrier, or a real phone: sending, delivery and inbound webhooks, STOP/START handling, MMS media links, and the webhook route's public exposure are all unverified.
- **Multiple-process verification.** Sends, planning, and consent changes are guarded by conditional updates and database advisory locks, reasoned to be safe with more than one API process, but never run that way.
- **Usage controls.** No per-clinic usage limits, spend caps, or usage reporting; billing for texting is undecided.
- **Reassigned-number consent.** Consent follows a phone number, so a number that changes hands keeps the previous person's consent until staff change it.
- **Carrier registration and onboarding** for each clinic is manual.
- **Unrelated failing tests.** 20 integration tests in six other suites (`patients`, `team`, `clients`, `invitations`, `clinic`, `staff`) fail on unmodified `main` (e771ad1); several are cross-clinic isolation tests that a test-harness problem stops from proving anything. The `patient-photo` and `clinical-attachments` suites were not run because they upload to the staging bucket configured in the local `.env`.

## Open product questions

These are not settled by the code; the current behavior is the conservative choice.

1. **Does texting START restore automated texts?** Today it restores staff replies only; automated texts wait for staff to record agreement again.
2. **Does a client texting first allow staff to start new conversations later**, or only to reply for a while? Today the permission has no time limit.
3. **Should a clinic whose number is pending approval or suspended see its inbound texts?** Today they are saved but the tab is hidden, so clients who text the clinic get no answer. See the read-only proposal above.
4. **Should a suspended clinic lose access to its conversation history**, or see it read-only? Today the whole tab is hidden. See the read-only proposal above.
5. **Per-clinic usage limits and billing** for texting are undecided.
