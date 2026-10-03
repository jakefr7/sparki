# Client Communication frontend roadmap

October 2, 2026. Design and planning only. Founder assigned backend implementation to Claude and requested a frontend roadmap before implementation. No frontend/backend changes, deployment, account setup or real messages are authorized by this document.

## Implementation update

Founder authorized implementation on October 2 after backend review. The first local increment is recorded in [implementation notes](client-communication-frontend-2026-10-02.md). The planning boundaries below describe the original roadmap; they do not override the later direct authorization.

## Experience goal

A busy receptionist or technician should be able to identify the next conversation needing attention, understand the client and patient context, reply, and hand off responsibility without losing work. Modern appearance should come from readable hierarchy, calm density, immediate feedback and continuity—not decorative dashboards or extra controls.

Desktop/laptop and tablet first. No phone-browser or native-app design expansion. Follow the [Product Constitution](../blueprint/00-product-constitution.md), especially patient context, speed, momentum and plain language. Staff communication here means staff texting clients, not internal employee chat.

## Current frontend findings

Source inspected: `apps/web/src/components/client-communication-workspace.tsx`, communication page and its existing stylesheet rules. These are code-review findings; a fresh visual walkthrough remains pending.

- Existing three-column layout has a useful starting structure: conversations, transcript/composer, client/patient details.
- Many metadata labels use 9–10px text, which makes rapid scanning and tablet use harder.
- The “New” button has no action.
- A single draft is shared across conversations: switching clients carries the same text into a different recipient context.
- Polling refreshes the conversation list but not the selected transcript; incoming replies can remain absent until selection changes.
- Loading and failed requests lack designed recovery; send errors do not produce a clear user-facing outcome.
- Thread requests lack stale-response protection, risking a previous selection replacing a newer one.
- Message-count changes trigger scrolling without respecting someone reading older messages.
- The context panel disappears below 1100px rather than offering access elsewhere.
- Only All, Unread, Open and Closed filters are shown, although WAITING is an existing state.
- The screen currently represents simulated SMS. That distinction must remain until the backend explicitly confirms real capability.

## Proposed screen structure

| Area | Primary job | Visible information | Interaction |
| --- | --- | --- | --- |
| Compact top bar | Establish clinic scope and system readiness | Current location, Communication title, textual texting state | Location changes only through authorized existing navigation; setup details for appropriate users |
| Left conversation queue | Find the next work item | Client name, patient context, latest snippet, timestamp, unread marker, owner and relevant delivery problem | Search, clear filters, select conversation; retain list position |
| Main conversation | Understand and reply | Recipient identity, number/channel, assigned staff, conversation state, chronological messages and automated notices | Reply, approved handoff/status actions, jump to new messages |
| Context area | Answer with confidence | Linked patient, client contacts, appointment context and backend-supported relevant information | Open patient/appointment; collapse or reveal context without losing draft |

Wide desktop: three columns with the transcript receiving most space. Smaller laptop/tablet landscape: queue plus transcript, context available through a labelled toggle. Tablet portrait: queue and conversation are separate navigable views with a clear Back to conversations action; selected conversation and draft remain intact. No essential action depends on hover.

Avoid a permanent KPI dashboard. The useful numbers are counts attached to work queues, not decorative statistics above the inbox.

## Queue and triage design

Start with readable All, Unread and Closed views using current contracts. Add Mine, Unassigned and Waiting for client only when backend identity/assignment and state definitions support them. Do not call OPEN “Needs reply” unless backend semantics actually establish that a reply is owed.

Unread means unseen; unresolved means work remains. Neither should imply clinical urgency. Urgent flags must come from explicit staff/backend state, never keyword inference from a client's text. Delivery failure should be visible independently of conversation status.

Rows should use two or three deliberate lines: client and time; patient/assignment; latest message or delivery exception. Patient context should say “No patient linked” when appropriate. Do not assume the first patient in a household is the subject. A shared number or uncertain client match needs a deliberate matching state from the backend.

Search should support client, patient and phone through the available endpoint, debounce input and cancel stale searches. Keep keyboard focus stable and distinguish no results from a loading failure. If results are limited, disclose the limit and support backend pagination before claiming a complete inbox search.

Keep the selected conversation stable during refresh. Do not reorder rows under a user's pointer while they are choosing an action; evaluate a stable selection plus a new-updates indicator. Queue count and pagination must come from backend truth when the dataset exceeds the loaded page.

## Conversation and reply design

- Keep client name and destination number visible beside the composer context. Patient names are supporting context, not proof of recipient identity.
- Preserve separate in-session drafts per conversation and retain them through filter changes, context toggles and request failures. Cross-navigation/reload recovery requires a deliberate authenticated draft-storage decision; do not silently store client text in browser storage.
- Plain Enter creates a newline. Explicit Send remains primary; Cmd/Ctrl+Enter may be an optional, labelled shortcut after validation. Prevent repeated submission while sending and respect IME composition.
- Quick replies should insert editable drafts, never immediately send. Use clinic-approved administrative wording; no fabricated dosing, clinical advice or unsourced AI response.
- Distinguish human author, automated notice, channel and actual delivery state. Sent, delivered and client-confirmed are separate facts. SMS must not pretend to have read receipts when unsupported.
- Show date separators and useful message times. Long text, URLs and attachments must wrap. Do not force auto-scroll when reading older content; show a New messages button instead.
- Keep failed content available. An ambiguous network outcome should say the send outcome is being checked, rather than inviting a duplicate resend. Safe retries depend on backend idempotency/status lookup.
- Show opt-out, approval-pending, unavailable sender and spending-limit states beside the composer with a clear reason. A disabled button alone is insufficient. Do not silently switch to email when SMS is unavailable.
- Reopening/resolving and staff assignment must reflect saved server state. Handoffs should preserve draft and message history. Concurrent changes require a visible update rather than silently overwriting responsibility.
- A New conversation action should appear only once client search, contact choice and conversation creation are supported. Remove dead controls from the eventual implementation.

## Notifications in the conversation

Automated confirmations, reminders, cancellations and follow-ups should appear in the same client history, distinctly labelled. Show delivery state and appointment context when provided; keep scheduled-but-not-yet-sent items visually different from sent messages.

Incoming replies and actionable delivery failures should update the queue without popup noise. Sound/browser notifications are preferences for later design, not a requirement for the first usable inbox. The communication tab and patient context should expose the same underlying history.

Staff notification/queue status must not claim that an external client notification was delivered. Routine updates can be quiet; action-needed failures should be prominent and attributable to an owner or queue.

## Visual direction

Use Sparki's existing design language with restrained surfaces, strong text hierarchy and comfortable line spacing. Prioritize readable content over rounded containers and badges. Use color sparingly for selection and meaningful exceptions, with text labels accompanying it.

Aim for readable normal body text and secondary text around 12–14px, validated at actual laptop/tablet sizes. Effective tablet touch targets should be approximately 44px. Preserve focus rings, semantic controls and contrast in light/dark appearance. Avoid status conveyed only through a colored dot.

The composer should feel anchored and always accessible. The queue should be dense enough for clinic demand without becoming a spreadsheet of tiny text. An optional compact density preference is a later enhancement only if testing demonstrates value.

## Backend coordination contract

These are required data/behavior questions for integration, not instructions to change Claude's implementation from this document.

| Frontend need | Backend support to confirm |
| --- | --- |
| Clinic scope/readiness | Organization/location identity; sender number; simulated/live capability; registration/readiness reason |
| Useful queue | Stable IDs, latest message, unread state, owner ID/name, explicit conversation status; counts/cursor pagination and sort semantics |
| Current transcript | Message pagination, deterministic ordering and incremental refresh or event mechanism; defined read acknowledgement behavior |
| Safe send | Channel, recipient validation, idempotency key, returned persisted message/status, ambiguous-outcome reconciliation |
| Honest delivery | Provider-backed queued/sent/delivered/failed/simulated state, failure reason and supported retry action |
| Context | Client/patient links, appointment reference, automated-vs-human attribution; authorized access paths |
| Compose restrictions | Normalized number, consent/opt-out/send eligibility and actionable reasons |
| Handoff | Eligible staff directory, authorized assignment endpoint, status transitions and concurrency behavior |
| Live refresh | Authenticated polling/events, reconnect semantics and cross-tenant protections; no browser provider credentials |
| New conversation | Search/contact selection, shared-number handling, creation and duplicate-thread rules |
| Attachments | Authorized upload/retrieval, supported types/limits and provider delivery state; no misleading MMS support |

Backend guarantees remain authoritative. The frontend never chooses arbitrary clinic sender IDs, trusts a browser-supplied tenant, bypasses opt-out or exposes provider credentials. No fake live delivery states to fill missing backend fields.

## Roadmap and verification gates

### 1. Design the core workflow

Produce reviewable desktop and tablet layouts showing queue, conversation and context, plus empty, loading, failure and texting-pending states. Walk through reception scheduling replies, technician follow-up and automated reminder replies. Deliver a visual proposal before implementing.

### 2. Align with the backend

Record the actual contract Claude delivers and reconcile the table above. Separate features ready to implement from dependencies. Confirm conversation-status semantics, sending capability and recipient-matching behavior. Do not manufacture unsupported UI actions.

### 3. Build the reliable frontend foundation

Implement stale-request protection, selected-transcript refresh, separate drafts, explicit errors/recovery, stable selection, appropriate scrolling, accessible search and clear simulation/readiness states. Focused checks must cover rapid switching, interrupted requests, incoming messages while reading history and failed sends with drafts preserved.

### 4. Add clinic work management

Connect backend-supported ownership, waiting/resolved states, notification history, safe retry and new-conversation flow. Test two staff using the same conversation and household/multi-patient ambiguity. Add administrative quick replies only with approved wording.

### 5. Pressure-test desktop and tablets

Test a large queue with realistic long messages, burst updates, keyboard-only use, tablet portrait/landscape, failed connectivity and reconnect. Measure time from choosing a conversation to a safe reply; watch for lost position, typing interruption and repeated entry. Verify another clinic's conversation can never appear through cached state or delayed responses.

### 6. Finish visual polish and integration readiness

Inspect hierarchy, contrast, focus, touch targets, long-content wrapping and layout at actual sizes. Run focused frontend tests and typecheck/lint, plus backend integration tests when connected. Report exactly what works in simulation vs real delivery. Deployment remains a separate explicit request.

## First-pass completion criteria

1. Staff can find, read and reply to the correct client without leaving patient context unnecessarily.
2. Switching clients cannot carry another conversation's draft or delayed response into the current one.
3. Incoming updates do not interrupt typing, move focus or pull staff away from older messages.
4. Automated messages and staff replies have clear attribution and truthful delivery states.
5. Failure preserves work and makes recovery understandable; ambiguous sends do not encourage duplicates.
6. Essential context and actions remain accessible on tablets.
7. UI never promises unsupported assignment, live messaging, consent, attachment or notification capability.

Related: [post-booking backlog](post-booking-workflow-backlog-2026-10-02.md). Open product decisions include channels, reminder policies, recipient rules, SMS billing and sensitive message wording. This roadmap proposes UX behavior; it does not settle those policies.
