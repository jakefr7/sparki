# SPA-44 testing feedback

Source: [SPA-44](https://linear.app/sparki/issue/SPA-44/feat-update-bugs-1018), Anna's October 18 screenshots. Founder requested phases and local implementation on October 19. Local work only; no staging deployment or ticket updates authorized.

## Phase 1 — failed saves and address selection

- Explain booking API errors without discarding entered details. Founder approved veterinarian creation, rescheduling, confirmation and cancellation on October 19; implement this bounded permission change and retain separate settings permissions.
- Reproduce selected-address suggestions reopening; suppress searches caused by selection, cancel stale lookups, and show a recoverable details-lookup error instead of silently leaving structured fields empty.
- Accept ordinary retail-price entry such as `.50` and `$1,234.50`, normalize to an exact decimal string, and identify invalid input beside the field. Existing server precision and authorization remain authoritative. Screenshot proves retail-price validation failure, but does not reveal the entered value.

## Phase 2 — provider editor and phone display

- Put Add hospital beneath the search that opened it, close the results while editing, and style selected contacts and editor actions consistently.
- Use the existing phone formatter on directory cards instead of displaying raw stored values.

## Phase 3 — medication workflow

- Offer active clinic doctors in Prescribed by while retaining existing historical/external names; selecting a name does not authorize a prescription.
- Review refill details before recording a refill. Current endpoint increments a counter/date/event and may charge an active visit, but does not dispense inventory. Avoid representing that as completed dispensing.
- Complete medication-only encounter/linked billing and physical labels only against established clinical, inventory, authorization and printer requirements. These are existing gaps; do not invent dosing, authorization or hardware policy.

## Verification and findings

- Initial review: appointment controller tests and address service tests passed (9 tests); existing controller test confirms veterinarian booking rejection.
- Browser regression and implementation results will be recorded below. Tests use the isolated runner, never staging or the development database.

## Implemented locally

- Phase 1: booking displays actionable validation/permission errors and keeps the draft. The founder subsequently approved veterinarian appointment management; that follow-up changes the appointment controller permission check. Exact price normalization handles `.50`, `4.` and `$1,234.50`, rejects malformed grouping/precision, and focuses the price field on invalid entry. Real veterinarian inventory creation/persistence passes locally. Address search now follows typing rather than selected/autofilled values, cancels obsolete requests, supports keyboard selection and exposes retry/manual recovery for failed or empty details.
- Phase 2: Add hospital is anchored beneath the initiating search, results close while editing, the hospital name receives focus, and selection chips/actions use existing app styling. Directory/profile phone display shares one formatter; stored values and search remain unchanged.
- Phase 3 increment: Prescribed by offers active local veterinarians and clinically eligible Owners, with a manual path for historical/outside names or a failed staff lookup. It remains medication-history attribution, not prescription authorization. Refill opens a review with Cancel, Edit medication and Record refill. Saved edits return to review using the saved API response; opening/cancelling review does not mutate the refill count.

## Remaining scope and inputs

- Founder approved veterinarian create/reschedule/confirm/cancel access, including new-patient booking and confirmation-status updates. Other appointment actions and scheduler/Admin configuration retain their previous checks. Broader role/Admin redesign is outside this increment.
- Full refill completion is **not done**: medication-only encounter, prescription-aware dispensing, exact quantities, linked billing, repeat-request recovery and physical labels remain unfinished. The existing refill endpoint is unchanged and may charge an active visit; the new review states that behavior explicitly. Do not represent a recorded profile refill as inventory dispensing or a printed prescription label.
- Founder explicitly deferred physical medication labels: printer/model, label size and required fields are unavailable and will be revisited later. No label layout, clinical instruction, dosing or supply quantity was invented.
- Address details are controlled in browser tests. The reopening defect reproduced locally; the cause of Anna's live provider returning no structured fields is not established by these tests. The original retail-price keystrokes were not visible in the screenshot, so normalization is a verified correction for plausible input forms, not proof of her exact input.

## Local evidence

- Before address fix: isolated Chromium `SPA-44 successful address selection does not reopen suggestions` fails with one suggestion remaining after selection/debounce (expected zero).
- Final combined isolated Chromium run: **10 passed**, covering all six SPA-44 scenarios, the expanded booking validation/permission/draft regression, and three existing provider/breed/records-task regressions. Initial test-selector failures were corrected against actual control names/roles; persistence and counter assertions were retained.
- Price/phone checks: 18 focused assertions passed, including malformed grouping, excessive precision, exact small decimals, international numbers and extensions.
- Web typecheck and focused ESLint passed. Tablet care-connections and desktop medication screenshots inspected.

## Founder-approved appointment permission follow-up

Veterinarians now pass the appointment permission check for creating appointments (existing/new patients), rescheduling, confirmation and cancellation. Linking an existing appointment to another patient, marking no-shows, scheduler configuration and Admin grants retain their previous role checks. The scheduling specification and DECISIONS record the founder's approval; physical medication labels are explicitly deferred at the founder's request.

Local verification: 23 focused authorization checks and all 67 isolated appointment integration tests pass; API typecheck and focused ESLint pass. The isolated Chromium regression also passes: a veterinarian books through the real patient UI, confirms, updates confirmation status, reschedules and cancels through the authenticated API, with their own audit identity; new-patient booking succeeds and scheduler settings writes remain denied.

An initial browser attempt clicked Next Available before the availability response arrived and ended on a date outside the loaded week with no visible slots, while other dates showed availability. The bounded permission regression now waits for an actual available date. This timing behavior is not remediated by the permission change.
