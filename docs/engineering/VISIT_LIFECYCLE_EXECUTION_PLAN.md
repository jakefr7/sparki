# Visit Lifecycle Execution Plan

## Outcome

Deliver one reliable clinic-day path in which a scheduled or walk-in patient can
arrive, complete intake, receive a veterinarian exam and plan, complete or defer
the resulting work, receive discharge instructions, and leave with the clinical
record either signed or visibly assigned for completion.

The lifecycle is complete only when the Command Center, Visit Workspace,
Patient Workspace, Appointment, Medical Record, event history, and audit history
agree about what happened and what must happen next.

## Research basis

The proposed workflow follows these external principles:

- AAHA's standardized workflow assigns initial information collection to client
  service staff, history/triage/data collection to technicians and assistants,
  diagnosis and treatment planning to veterinarians, and discharge preparation
  and follow-up coordination to the care team. This supports explicit handoffs
  instead of a generic status dropdown. See [AAHA Standardized Workflow for
  Optimal Utilization](https://www.aaha.org/resources/2023-aaha-technician-utilization-guidelines/standardized-workflow-for-optimal-utilization-table-5-2/).
- AAHA describes the ordinary visit as check-in, technician intake and vitals,
  veterinarian examination, diagnostic/treatment assistance, prescriptions,
  and payment. See [AAHA veterinary care team roles](https://www.aaha.org/resources/get-to-know-your-vet-care-team-different-jobs-at-a-veterinary-office/).
- AAHA's VCPR guidance requires complete, legible assessment and treatment-plan
  records that permit continuity of care by another veterinarian. See [AAHA
  VCPR guidance](https://www.aaha.org/vcpr/).
- AAVSB's 2026 model recordkeeping rules identify the author, entry time,
  clinicians, visit reason/history, findings, diagnostics, interpretation,
  treatment plan, and medication details as durable record elements. See
  [AAVSB Medical Recordkeeping Model Regulations](https://www.aavsb.org/wp-content/uploads/2026/03/9_Medical-Recordkeeping_Model-Documents_2026.pdf).
- AAHA treats pain assessment as a routine part of examination and recognizes a
  pain score as a vital sign. See [AAHA pain assessment guidance](https://www.aaha.org/resources/2022-aaha-pain-management-guidelines-for-dogs-and-cats/guiding-principles-of-pain-assessment/).
- AAHA discharge guidance calls for consistent written/verbal instructions,
  medication and home-care information, responsible staff, and follow-up plans.
  See [AAHA patient discharge protocol](https://eval.aaha.org/View_Protocol.aspx?key=411d742c-2afc-49eb-b735-1e25388a294f&type=outline).

This is product and engineering research, not jurisdiction-specific legal
advice. Record retention, prescribing, consent, technician scope, and signature
rules must be configurable or validated for each launch jurisdiction.

## Product decision: phase spine plus owned work

The existing 47-value `VisitState` enum attempts to represent the visit's
location in the clinic and every piece of parallel work. That produces false
choices: diagnostics can be pending while treatment is underway, client
communication is due, and the record remains unsigned.

Use eight mutually exclusive operational phases for the visible lifecycle:

1. `Arrived`
2. `Intake`
3. `Exam`
4. `PlanAndApproval`
5. `CareInProgress`
6. `Discharge`
7. `RecordClosure`
8. `Closed`

Represent diagnostics, estimates, consent, treatment, medication, communication,
follow-up, payment, and record signoff as owned work items. Represent abnormal
blockers as exceptions. Existing detailed enum values may remain temporarily as
storage compatibility values, but all transitions and UI derive from one phase
policy. Do not introduce another user-editable status mapping over this policy.

## Required invariants

1. One patient may have at most one active visit per location unless a manager
   records an explicit override reason.
2. A scheduled appointment creates at most one visit and changes to
   `VisitCreated` in the same transaction.
3. Every state or phase change records actor, role, source, previous value, new
   value, timestamp, and reason when required.
4. Every mutation is organization- and location-scoped.
5. A transition cannot bypass incomplete required work merely because a user
   changes a dashboard label.
6. Current owner and next action are derived by policy and may be reassigned only
   through an audited handoff.
7. Clinical decisions, diagnosis, plan, prescription, and record signature are
   veterinarian-owned actions.
8. Signed content is immutable. Corrections use an amendment linked to the
   original content.
9. Closing with unresolved work requires an exception with owner, reason, next
   action, and due time.
10. UI permissions are convenience only; the API enforces every rule.

## Phase 0 — Confirm pilot policy

Time box: 1–2 working sessions with one veterinarian, one technician, and one
receptionist.

Decide and record:

- Required intake fields by visit type.
- Pain scoring tools and species applicability.
- Who may mark routine treatment complete.
- What constitutes recorded client approval for the pilot.
- Whether payment is a hard blocker or an exception at close.
- Required SOAP sections and who may prepare drafts.
- Veterinarian signature deadline and late-signoff escalation.
- Cancellation-after-arrival and no-show policy.
- Launch jurisdiction and applicable retention/scope requirements.

Deliverable: an approved `VisitLifecyclePolicy` fixture for the demo clinic.

### Pilot policy confirmed with Anna

- Reception check-in confirms the patient and client identity. Contact details
  and missing account information are confirmed during checkout.
- Intake is required for every visit except immediate life-saving care. During
  an emergency, staff may gather history from the owner while the crash team
  stabilizes the patient; the structured intake must be completed afterward.
- Intake captures vitals, typed medical history, vaccines, recent travel,
  special diet, supplements, weight, respiration, capillary refill time, gum
  color, attitude/mentation, heart rate, temperature, appearance, allergies,
  prior sedation problems, past surgeries, current medications, sneezing,
  vomiting, and relevant systemic concerns.
- Default ownership is reception at check-in, technician/assistant during
  intake, veterinarian for exam/diagnosis/plan, technician/assistant for
  discharge, and reception for checkout. Technician appointments may omit the
  veterinarian step when clinic policy and scope of practice allow it.
- A patient may depart before the veterinarian finalizes the record. The record
  stays open and appears in the responsible veterinarian's dashboard queue.
- The assigned veterinarian normally signs. A different authorized user may be
  explicitly delegated signoff permission; the record stores both the assigned
  veterinarian and the actual signer.
- Checkout may complete with an outstanding balance when the location permits
  it. The invoice remains open and visible.
- Reversing completed medication or inventory work requires a reason, including
  returning medication to stock.
- Admin workflow steps remain configurable inside protected lifecycle phases.
  A step containing active visits cannot be deleted. Disabling or remapping a
  used step requires an impact preview and explicit reassignment.

## Phase 1 — Lifecycle kernel and data integrity

### Schema

Add:

- `VisitTransition`: visit, from/to phase and state, actor, source, reason,
  occurred time, request ID, and metadata.
- `VisitWorkItem`: type, status, owner user/role, due time, prerequisite IDs,
  completion actor/time, and structured result reference.
- `VisitException`: type, severity, owner, reason, next action, due time,
  resolved actor/time, and resolution.
- `VisitHandoff`: from/to owner or role, summary, acknowledged time, and actor.
- Visit timestamps: `arrivedAt`, `intakeStartedAt`, `examStartedAt`,
  `dischargeReadyAt`, `departedAt`, `closedAt`.
- Concurrency version on Visit.
- A database constraint or transaction-safe lock preventing duplicate active
  visits for the same patient/location.

### Service

Create one `VisitLifecycleService.transition()` entry point. It must:

1. Load the visit by organization and location.
2. Lock or version-check it.
3. Evaluate the transition policy and required work.
4. Apply phase/state, owner, next action, and timestamps atomically.
5. Create transition and audit records.
6. Create/complete policy-driven work items.
7. Return the updated visit projection.

Remove direct `prisma.visit.update({ state })` calls from controllers and feature
services. The dashboard must call the same lifecycle action endpoints as the
Visit Workspace; it must not maintain a parallel transition map.

### Acceptance tests

- Two concurrent arrival/create requests yield one visit.
- Cross-location IDs return not found.
- A stale version returns conflict without overwriting newer work.
- Every successful transition has exactly one transition record.
- Invalid transitions leave visit, work, and audit tables unchanged.

## Phase 2 — Arrival, triage, and intake

### Workflow

- Reception confirms patient/client identity, arrival time, contact authority,
  appointment linkage, visit reason, and arrival mode.
- Emergency/walk-in entry supports provisional identity and immediate triage.
- Technician accepts the handoff, records history, medication/allergy review,
  weight/unit, temperature, pulse, respiration, CRT, mucous membranes, and an
  applicable pain score.
- Required-field policy varies by visit type; absence is an explicit exception,
  not silently valid data.
- Completing intake assigns the veterinarian or queues the visit as exam-ready.

### UI

- Replace generic status changes with primary actions: `Check in`, `Begin
  intake`, `Complete intake`, `Send to veterinarian`.
- Keep autosaved drafts separate from completion.
- Show owner, elapsed time, next action, blockers, and handoff summary in the
  Command Center and Visit Workspace.
- Provide clear emergency and isolation indicators without encoding them as a
  new lifecycle state.

### Acceptance tests

- Scheduled, walk-in, emergency, drop-off, technician, and surgery-admission
  entry paths.
- Required intake varies correctly by visit type.
- Only permitted roles can complete intake.
- Past or closed visits cannot be edited.
- Reloading during intake preserves a draft without marking it complete.

## Phase 3 — Examination, plan, consent, and care

### Clinical record

- Create the patient's Medical Record automatically if absent.
- Create one visit-linked SOAP draft with explicit author and veterinarian.
- Intake history may seed subjective context but remains attributable and is not
  silently copied into a signed veterinarian statement.
- Veterinarian records findings, assessment/problem list, plan, prognosis where
  appropriate, and whether approval is required.

### Work orchestration

Implement a small initial work-item set:

- `Diagnostic`
- `Estimate`
- `ClientApproval`
- `Treatment`
- `Medication`
- `ClientCommunication`
- `FollowUp`
- `Payment`
- `RecordSignoff`

The visit phase advances based on prerequisite completion, while work items may
run in parallel. Partial approval records approved, declined, and deferred
items individually rather than setting only a visit-wide label.

### Acceptance tests

- A technician may draft permitted content but cannot diagnose, prescribe, or
  sign.
- Completing an exam does not automatically claim treatment occurred.
- A declined item remains in history and changes downstream prerequisites.
- Pending diagnostics can close only through an owned exception.
- Every order/result/approval/treatment is attributable and timestamped.

## Phase 4 — Discharge, follow-up, and record closure

### Discharge readiness gate

The `Ready for discharge` action evaluates:

- Required care items complete, declined, deferred, or excepted.
- Medication reconciliation and instructions complete.
- Client communication recorded.
- Written discharge instructions present when required.
- Follow-up/recheck scheduled or explicitly unnecessary.
- Payment complete or covered by an owned exception.
- Patient departure and responsible staff recorded.

### Record closure

- SOAP progresses through Draft → Ready for Review → Signed → Locked.
- Signature stores signer, time, and content checksum/version.
- Signed content cannot be edited or deleted.
- Amendment appends corrected content and rationale without replacing the
  signed version.
- Operational departure and record closure are distinct. A patient may leave
  while record signoff remains owned and due.
- Clean close requires no unresolved exceptions. Otherwise close as `Closed
  with exceptions` and retain the work in responsible queues.

### Acceptance tests

- Routine discharge, payment exception, pending lab, missing signature, client
  unreachable, referral, cancellation after arrival, and euthanasia-sensitive
  closure paths.
- Closing never hides open work.
- Signed SOAP content survives amendment unchanged.
- Follow-up appears in both the patient timeline and responsible user's queue.

## Phase 5 — Unified product surfaces

Use one server projection for all surfaces:

- `phase`
- `state`
- `owner`
- `nextAction`
- `waitingSince`
- `openWorkSummary`
- `blockingExceptions`
- `recordStatus`
- `dischargeReadiness`
- `allowedActions` for the current user

Apply it to:

- Command Center
- Visit Workspace
- Patient Workspace
- Appointment detail
- Work queues

The API computes `allowedActions`; clients render them and may explain why an
action is unavailable. Clients do not reconstruct policy from raw state.

## Phase 6 — Release gate

### Automated clinic-day scenarios

Build Playwright/API scenarios for:

1. Routine wellness visit.
2. Sick visit with diagnostics and treatment.
3. Technician-only appointment.
4. Walk-in emergency with provisional identity.
5. Surgery admission and discharge.
6. Client declines part of the plan.
7. Patient leaves with pending lab and follow-up exception.
8. Cancellation after arrival.
9. Late record signoff and amendment.
10. Two locations attempting to access the same visit.

### Operational verification

- Dedicated test PostgreSQL service in CI.
- Migration-from-current-schema test using representative data.
- Structured transition logs with request IDs.
- Metrics for arrival-to-intake, intake-to-exam, exam duration,
  discharge-ready-to-departure, and departure-to-signoff.
- Performance budgets for Command Center load, transition response, Visit
  Workspace load, and autosave.
- One simulated clinic day with a receptionist, technician, and veterinarian;
  record every workaround and ambiguous handoff.

## Suggested implementation sequence

| Order | Work package | Dependency | Completion signal |
|---:|---|---|---|
| 1 | Pilot policy decisions | None | Policy fixture approved |
| 2 | Transition/work/exception schema | Policy | Migration and backfill verified |
| 3 | Lifecycle policy/service | Schema | Direct state updates eliminated |
| 4 | Arrival and visit creation | Lifecycle service | All entry-path tests pass |
| 5 | Intake and handoff | Arrival | Intake policy tests pass |
| 6 | Exam and SOAP draft | Intake | Authorship and permissions pass |
| 7 | Work items and approval | Exam | Parallel-work scenarios pass |
| 8 | Discharge gate and follow-up | Work items | Closure exceptions remain visible |
| 9 | Sign, lock, amend | SOAP draft | Immutability tests pass |
| 10 | Unified read model/UI | All above | Surfaces show identical truth |
| 11 | Full clinic-day CI suite | Unified UI | Ten scenarios pass repeatedly |
| 12 | Staff simulation and refinement | CI suite | Pilot blockers triaged |

## Definition of complete

The visit lifecycle is complete for pilot when:

- Every supported entry path reaches a safe terminal outcome.
- Staff always see current owner, next action, elapsed time, and blockers.
- No UI can bypass required clinical or operational work.
- All sensitive changes are attributable and auditable.
- A patient can leave before record signoff without that obligation disappearing.
- Signed records are immutable and amendable.
- Location and role isolation are enforced server-side.
- The ten clinic-day scenarios pass in CI against a real PostgreSQL database.
- A simulated clinic day produces no undocumented workaround on the core path.
