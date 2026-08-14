# Phase 6 — Clinic Pilot Core Care Completion

Status: **APPROVED / ACTIVE**

Phase type: **PRODUCT WORKFLOW**

Founder-selected and activated: 2026-08-13

## Objective

Make one routine outpatient canine/feline visit executable, clinically documentable, finalizable, and retrievable entirely through Sparki's visible UI.

The core clinical journey is:

**Exam → Plan → Client Decision → Care → Discharge → Record**

Check In and Begin Intake remain the preceding workflow stages and must continue to hand cleanly into this journey. Frontend UX and supporting backend behavior must be implemented together in bounded vertical slices.

## Product boundary

Phase 6 covers routine outpatient canine/feline visits only. It must preserve the Product Constitution, all verified guarantees and closeout evidence from Phases 1–5, Phase 5's honest balance/disposition semantics, and the existing controlled private-storage boundary.

No accepted pilot journey may require direct API calls, database edits, raw IDs, another clinical-record system, or undocumented workarounds.

## UX architecture

The visit workspace becomes one role-aware clinical canvas rather than disconnected forms:

- A persistent patient/visit header keeps patient identity, alerts, reason, room, and assigned team visible.
- A compact clinical journey indicator shows progress without exposing raw lifecycle status controls.
- One active workflow stage occupies the primary canvas; completed stages collapse into readable summaries.
- Care-plan state, blockers, current owner, next handoff, and record state remain understandable.
- Primary actions are contextual and role-specific.
- SOAP is assembled continuously from attributed visit content.
- Medical History presents the clinical record as a chronology.
- Routine paths use progressive disclosure, preserve resume location, support responsive and keyboard use, and avoid excessive cards, tabs, modals, prompts, and full-page navigation.
- Warnings attach to the affected clinical item where possible; exception-heavy controls appear only when required.

Normal users must not select raw visit lifecycle statuses, manipulate generic work-item types, enter patient/client/visit/veterinarian IDs, use inventory administration screens to document medication administration, or understand backend implementation boundaries.

## Founder product decisions

1. Client decisions use staff attestation with actor, timestamp, communication method, decision, and optional note. Signature and consent infrastructure are out of scope.
2. Medication workflow distinguishes **Administered In Clinic** from **Dispensed / Take Home**.
3. Medication execution supports, as applicable: medication, ordered dose, actual dose, concentration, quantity, unit, route, site, frequency, duration, prescriber, administrator/dispenser, administration/dispensing timestamp, and inventory lot/container where required.
4. A non-controlled inventory mapping failure never hides or falsifies the clinical event. It creates **Inventory Reconciliation Required**, does not report reconciliation as complete, and does not automatically block departure unless existing visit policy requires it.
5. Controlled inventory requires valid authorization and lot/container reconciliation. Missing or invalid controlled reconciliation is a hard blocker with no bypass or silent reconciliation.
6. Patient departure and SOAP finalization are distinct. Checkout may occur while SOAP remains open; the visit stays **Record Completion Pending** and cannot archive until required finalization occurs.
7. SOAP assembly preserves source attribution. Technician observations, intake data, exam findings, performed care, and other attributed content must not silently become veterinarian-authored statements.
8. Legal medical-record content includes intake/vitals; exam/SOAP; problems/assessment; ordered care; client decisions; treatments performed; medications administered/dispensed; relevant captured diagnostic information; discharge instructions; clinicians/performers and timestamps; and amendments. Internal messages and generic operational tasks do not automatically become legal-record content.
9. Clinical attachments allow PDF, JPG/JPEG, and PNG up to 25 MB; use the existing controlled private-storage boundary; enforce organization/location authorization; associate to a patient and/or visit; and keep correction or removal of retained finalized clinical-history attachments auditable rather than ordinarily destructively deleting them.
10. Provide a clean printable/saveable discharge summary.
11. External payment remains outside Phase 6. Sparki does not claim to process or verify payment.

## Vertical implementation slices

### Slice 1 — Unified visit shell and action projection

- Add persistent context, the new journey model, current owner, blockers, record state, and allowed contextual actions.
- Preserve current intake and exam behavior.

### Slice 2 — Exam to Care Plan

- Retain and refine `ExamFindingsPanel`.
- Add an inline Care Plan Composer with structured treatments, medications, and follow-up recommendations.
- Add abnormal-findings review and veterinarian-owned plan creation.

### Slice 3 — Client Decision and Technician Handoff

- Add item-level **Authorized**, **Declined**, and **Decide Later** decisions with actor/time/method attribution.
- Support partial approval.
- Project only authorized executable care into the technician queue.

### Slice 4 — Treatment and Medication Execution

- Add compact Care Execution rows/drawers with performer, time, and outcome capture.
- Support in-clinic administration and take-home dispensing.
- Drive inventory usage from clinical completion.
- Enforce controlled-inventory behavior and surface mapping, stock, lot, and reversal exceptions.

### Slice 5 — Discharge and Reception Handoff

- Assemble a discharge summary with performed care, medication instructions, watch-for signs, follow-up owner/timing, and pending-results ownership.
- Keep clinical **Ready for Checkout** distinct from receptionist checkout.

### Slice 6 — SOAP Composition and Finalization

- Mount and integrate existing `VisitRecordPanel` behavior.
- Support attributed SOAP assembly, draft, review, finalize, delegate, lock, and amend.
- Add a **Records to Finish** operational queue.

### Slice 7 — Medical History

- Replace the patient Records placeholder with a Medical History chronology.
- Include finalized SOAP, findings, performed care, medications, discharge, follow-up, amendments, attachments, and provenance where relevant.
- Merge the separate Visits/Records presentation into the chronology.

### Slice 8 — Role and Workflow Polish

- Complete veterinarian, technician/assistant, receptionist, and manager workflows and permissions.
- Add resume-location behavior, responsive and keyboard UX, and full clinic-pilot journeys.

## Component direction

Reuse or extend `PatientContextBar`, `VisitIntakeWorkspace`, `ExamFindingsPanel`, `PostExamReview` summary behavior, `PatientMedicationsPanel`, `RoleOperationsDashboard`, and `VisitRecordPanel` behavior.

Replace or substantially redesign `VisitWorkflowProgress` stage model, `VisitWorkItemsPanel` as the routine treatment UI, generic work-item status controls, `VisitDischargePanel` presentation, the patient Records placeholder, and the separate Visits/Records presentation.

Retain Inventory Usage, controlled inventory event tooling, and low-level work-item mechanics only as administrative, recovery, or internal implementation tools where required.

The new primary UI surfaces are:

1. Care Plan Composer
2. Client Decision Sheet
3. Care Execution Row/Drawer
4. Medical History Chronology

## Out of scope

- Invoices, payment processing, financial ledger, refunds, deposits, taxes, discounts, and full estimates.
- Signature platform.
- Lab/imaging integrations, analyzer interfaces, and external pharmacy/refill portal.
- Real SMS/email provider.
- Surgery, hospitalization, boarding, euthanasia, and complex emergency workflow.
- Migration engine.
- Broad inventory redesign.
- Unrelated Playwright cleanup.
- Infrastructure, tooling, CI, PR, deployment, or merge work.
- Phase 4 optional hardening.
- Production-data changes.

## Acceptance criteria

Phase acceptance requires visible-UI coverage of:

- A scheduled outpatient visit and a walk-in outpatient visit completed end to end.
- Structured care planning and abnormal-findings review.
- Partial client approval, declined care, and deferred care with required attestation.
- Technician execution of authorized care only and a treatment execution audit trail.
- In-clinic medication administration and take-home dispensing.
- Mapped inventory consumption and valid controlled medication use.
- Honest non-controlled missing-mapping reconciliation and hard-blocking invalid controlled reconciliation.
- Discharge preparation, printable/saveable discharge, follow-up ownership, and pending-results ownership.
- Checkout before SOAP signoff and SOAP signoff before checkout.
- Finalized and locked records, auditable amendment, Medical History visibility, and attachment authorization/retention behavior.
- Correct receptionist, technician/assistant, veterinarian, and manager permissions and handoffs.
- Clean handoff from Check In and Begin Intake into the Phase 6 journey.

## Activation constraints

This change only documents and activates Phase 6. It does not implement Phase 6, run `sparki:execute`, run verification, modify product code or tests, alter production data, deploy, merge, or change historical run artifacts or Phase 1–5 closeout evidence.

## Implementation-blocking ambiguity

None identified at activation. The founder decisions above resolve the material workflow and safety boundaries needed to begin bounded planning and implementation. Any later conflict with existing visit policy, controlled-substance policy, legal-record requirements, or tenant/storage authorization must stop and be escalated rather than inferred.

## Phase configuration

<!-- sparki-phase-config
{
  "id": "phase-6-clinic-pilot-core-care-completion",
  "branch": "codex/phase-6-clinic-pilot-core-care-completion",
  "status": "APPROVED",
  "verification": [
    "pnpm lint",
    "pnpm typecheck",
    "pnpm test",
    "pnpm build",
    "pnpm test:integration",
    {
      "command": "pnpm test:e2e",
      "expectedExitCodes": [0, 1],
      "classification": "KNOWN_CROSS_PHASE_PLAYWRIGHT_PRODUCT_TEST_DEBT",
      "requiredFailureSummary": {
        "failed": 24,
        "passed": 5,
        "didNotRun": 1
      },
      "requiredFailureIdentities": [
        "scheduler appointment detail shows records-prep summary and honest confirmation status, and confirmation status can be updated",
        "edits an existing item and opens duplication as an unpersisted copy",
        "uses focused primary and purchasing navigation",
        "creates a clinical usage mapping and exposes review queue destinations",
        "scheduler visible copy says \"New Patient,\" not \"New Client / New Patient\"",
        "\"New Patient\" form captures owner, address, patient, appointment, and records-request fields; saves via the combined endpoint; warns on a possible duplicate client",
        "failed \"New Patient\" save shows friendly, clinic-facing error copy",
        "existing-patient scheduling from the scheduler still works",
        "creating a patient, then choosing New Appointment, opens the shared popup with the patient already selected",
        "search with no match offers patient creation; new client + new patient walk-in opens the workspace and is searchable after refresh",
        "existing client search collapses the new-client fields; existing client + new patient appointment opens the workspace",
        "requires the MVP client fields before creating a new client",
        "New Appointment on the patient profile opens the modal with the patient already selected",
        "search input is focused on load (keyboard-first landing)",
        "typing a patient name, navigating with arrow keys, and opening with Enter reaches the workspace",
        "search result shows operational context and next actions",
        "tolerates a typo via fuzzy search",
        "shows an explicit empty state when nothing matches",
        "refocuses search after focus moves away (keyboard-first shortcut)",
        "search results render within the action-acknowledgement performance budget",
        "appointment -> begin intake -> visit workspace",
        "patient workspace -> start walk-in visit -> visit workspace",
        "active visit is shown instead of duplicate visit actions",
        "tech/assistant can record weight in either unit and gum color during intake, and both persist on reload"
      ]
    }
  ]
}
-->

For Playwright, a clean exit is `COMPLETE`. The documented nonzero baseline is
`COMPLETE_WITH_KNOWN_DEBT` only when it matches the preserved identity-based
policy above. Historical failures may pass, but no new, substituted, or
materially changed failure is accepted. All Phase 6 journey and permission
coverage must pass normally and cannot be hidden by this classification.

Broad remediation of the historical Playwright debt remains outside Phase 6.
The configuration carries the prior approved policy forward without modifying
tests, closeout evidence, or historical run artifacts.
