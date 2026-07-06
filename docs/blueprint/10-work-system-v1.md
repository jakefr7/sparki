# 10 Work System v1

## Constitutional Authority

This document inherits from the [Product Constitution](./00-product-constitution.md). If it conflicts with the Constitution, the Constitution governs.

## Purpose

Define how work exists, moves, and completes inside Sparki.

Work is one of Sparki's core concepts. Every meaningful action performed by a clinic should either create, complete, modify, block, move, or remove work.

The goal is simple: nothing important should depend on memory, sticky notes, verbal handoffs, or inboxes.

This is a business architecture document. It is not a task management specification, database design, API specification, or UI document.

## Objective

Create a shared model for how clinic work is owned, tracked, transferred, blocked, escalated, completed, and reviewed.

## What Work Is

Work is something that needs to happen, is happening, or has happened in support of care, communication, operations, money, migration, or records.

Work should answer:

- What needs to happen?
- Who owns it?
- What is its status?
- What does it belong to?
- What blocks it?
- What happens when it is complete?

## What Work Is Not

Work is not:

- A raw event
- A notification
- A timeline view
- A sticky note
- A chat thread
- A database row
- A screen
- A guarantee that action has happened

Work may create events, trigger notifications, appear on timelines, and relate to messages, but it is not the same thing as those objects.

## Work vs Task

`Work Item` is the broad concept.

`Task` is a human-actionable Work Item with an owner, status, and expected completion.

All Tasks are Work Items. Not all Work Items are Tasks.

Examples of Work Items that may not be simple Tasks:

- Diagnostic Order
- Medication Order
- Follow-Up
- Reminder
- Approval step
- Record completion requirement

## Work vs Event

Work is something that needs action or represents action being performed.

An Event records that something meaningful happened.

Example:

- Work: `Review diagnostic result.`
- Event: `Diagnostic Result reviewed by veterinarian.`

Work moves the clinic forward. Events preserve memory.

## Work vs Visit State

Visit State describes the current condition of the visit.

Work explains what needs to happen within or around that state.

Example:

- Visit State: `Client Approval Pending`
- Work: `Send estimate to client`
- Work: `Answer client question`
- Work: `Record approval`

Not every state should become work. Not every work item should become a state.

## Work vs Reminder

A Reminder is a future prompt.

Work is the thing that needs to happen.

Example:

- Reminder: `Rabies vaccine due next month.`
- Work: `Contact client to schedule vaccine appointment.`

A Reminder may create Work when it becomes actionable.

## Work vs Notification

A Notification alerts someone.

Work is what must be done.

Example:

- Notification: `Lab result ready.`
- Work: `Veterinarian review diagnostic result.`

Notifications should point to Work or source context. They should not become the place where work lives.

## Core Principles

- Work always has an owner.
- Work always has a current status.
- Work should always have context.
- Work may move between people.
- Work should never become orphaned.
- Work should be easy to find.
- Work should reduce interruptions instead of creating them.
- Work should create Events when its state meaningfully changes.
- Work that affects care, money, consent, records, identity, migration, or audit history needs stronger accountability.
- AI may assist work, but humans own work requiring judgment.

## Work Life Cycle

Work life cycle states should be simple and understandable.

## Created

Work exists but may not yet have a specific person actively responsible.

### Who Can Move Work Here

- User
- Sparki system behavior
- External Integration
- AI Assistant as draft only
- Migration process

## Assigned

Work has an owner or owning queue.

### Who Can Move Work Here

- User with responsibility for routing
- Practice Manager
- System rule
- External Integration where routing is trusted
- AI Assistant as suggestion only

## Accepted

The owner has acknowledged the work.

### Who Can Move Work Here

- Assigned User
- User acting on behalf of a Role or Queue

## In Progress

The work is actively being performed.

### Who Can Move Work Here

- Owner
- Authorized teammate
- System rule for work that starts automatically

## Waiting

The work is paused because the next step depends on time or another expected input.

Examples:

- Waiting for client response
- Waiting for result
- Waiting for appointment time
- Waiting for payment confirmation

### Who Can Move Work Here

- Owner
- Authorized teammate
- System rule
- External Integration where source is trusted

## Blocked

The work cannot proceed because something is missing, failed, unsafe, unclear, or unresolved.

Blocked work should show blocker, owner, next action, and urgency.

### Who Can Move Work Here

- Owner
- Authorized teammate
- Practice Manager
- System rule
- External Integration when failure affects work

## Delegated

Ownership moved from one person or role to another.

Delegation should preserve context and reason.

### Who Can Move Work Here

- Current owner
- Practice Manager
- Authorized lead
- System rule where policy is clear

## Escalated

Work requires higher authority, faster attention, or a different role.

Escalation should not be a vague status. It should identify who now owns the next decision.

### Who Can Move Work Here

- Owner
- Practice Manager
- Veterinarian where clinical authority is needed
- System rule for overdue or high-risk work

## Completed

The work has met its completion condition.

Completion should create an Event when it matters to workflow history.

### Who Can Move Work Here

- Owner
- Authorized teammate
- System rule for trusted automated work
- External Integration for trusted external completion

AI must not silently complete work requiring human judgment.

## Cancelled

The work should no longer happen.

Cancellation should preserve reason when cancellation affects care, money, consent, records, or follow-up.

### Who Can Move Work Here

- Owner
- Authorized teammate
- Practice Manager
- Veterinarian for clinical work
- System rule where policy is clear

## Work Ownership

Ownership means someone or some accountable role is responsible for the next action.

## Receptionist

Owns work related to scheduling, client communication, arrival, checkout, payments, routine routing, callbacks, and front-desk follow-through.

Receptionists should not own clinical judgment.

## Technician

Owns work related to intake, vitals, treatment execution, medication preparation, diagnostics handling, patient movement, discharge preparation, and clinical handoffs.

Technicians may prepare clinical documentation but should not own veterinarian-only decisions.

## Veterinarian

Owns work related to clinical decisions, diagnosis, treatment plans, prescriptions, diagnostic interpretation, medical record signoff, and high-risk clinical review.

Veterinarian-owned work should not be reassigned to non-clinical roles unless the work itself changes.

## Practice Manager

Owns work related to operational exceptions, escalations, policy decisions, schedule disruption, payment disputes, staffing bottlenecks, and unresolved work that crosses roles.

Practice Managers should not override clinical authority.

## AI Assistant

AI may create draft work, suggest ownership, summarize context, detect forgotten work, and recommend delegation.

AI does not own work requiring human judgment.

## External Integration

External Integrations may create or update work when an external system produces a meaningful business event.

Examples:

- Diagnostic Result received
- Payment completed
- Online booking request received
- Pharmacy fulfillment update received

External Integration ownership should remain traceable.

## Transfer Of Ownership

Work may move between people or roles when responsibility changes.

Transfer should preserve:

- Current owner
- New owner
- Reason for transfer
- Context
- Status
- Due time where relevant
- Event history

Transfer should reduce handoff loss, not hide it.

## Shared Ownership

Some work requires multiple roles.

Shared ownership should still identify the next owner.

Example:

- Technician prepares discharge instructions.
- Veterinarian reviews medical content.
- Receptionist delivers instructions at checkout.

The system should show the current owner, not just the group involved.

## Escalation

Escalation means work needs a different level of authority or urgency.

Examples:

- Payment dispute escalated to Practice Manager.
- Diagnostic review escalated to Veterinarian.
- Missing consent blocks procedure.
- Inventory shortage blocks treatment.

Escalation should create an Event when it affects care, operations, money, or accountability.

## Work Types

Work Types should describe the kind of work without becoming product modules.

## Intake

Collect history, vitals, concerns, constraints, and patient context.

## Client Communication

Call, message, update, explain, request, or respond to client communication.

## Diagnostic Review

Review Diagnostic Result, interpret findings, communicate outcome, or create next work.

## Treatment

Perform or document approved care.

## Medication

Prepare, administer, dispense, or document medication work.

## Prescription

Create, approve, refill, deny, or route prescription work.

## Inventory

Resolve stock, ordering, item availability, expiration, or shortage work.

## Estimate

Prepare, revise, present, or explain expected cost.

## Approval

Request, capture, clarify, or record client approval or decline.

## Payment

Collect, reconcile, dispute, refund, or resolve payment work.

## Record Completion

Finish required documentation, review, signoff, or archive readiness.

## Follow-Up

Close the loop after care, results, communication, or unresolved concerns.

## Reminder

Turn a scheduled prompt into action when it becomes relevant.

## Administrative

Support operational work that does not belong directly to clinical care but still affects the clinic.

## Work Context

Work should always know what it belongs to.

Context prevents orphaned work and reduces interruptions.

Work may belong to:

- Visit
- Patient
- Client
- Medical Record
- Diagnostic Result
- Invoice
- Estimate
- Communication
- Consent
- Prescription
- Inventory
- External Integration
- Migration Record
- Exception

Work without context should be treated as incomplete until context is attached or uncertainty is made explicit.

## Blocking Work

Blocked work cannot move forward until another condition changes.

Blocked work should show:

- What is blocked
- Who owns it
- Why it is blocked
- What it is waiting for
- Who can unblock it
- When it should be checked again
- Whether it affects care, money, consent, records, migration, or operations

## Waiting For Client

Examples:

- Approval
- History clarification
- Payment
- Callback response
- Pickup timing

## Waiting For Veterinarian

Examples:

- Diagnostic review
- Prescription approval
- Clinical decision
- Record signoff

## Waiting For Technician

Examples:

- Intake completion
- Treatment completion
- Medication preparation
- Patient handoff

## Waiting For Diagnostic Result

Examples:

- Lab result
- Imaging result
- In-house test

## Waiting For Payment

Examples:

- Deposit
- Balance payment
- Financing approval
- Payment exception resolution

## Waiting For External Integration

Examples:

- Lab sync
- Payment processor result
- Pharmacy update
- Online booking confirmation

## Waiting For Inventory

Examples:

- Medication availability
- Supply restock
- Substitute item decision

## How Blocked Work Should Behave

- Blocked work should stay visible.
- Blocked work should have an owner.
- Blocked work should have a next check time when timing matters.
- Blocked work should not block unrelated work.
- High-risk blocked work should escalate.
- Blocking and unblocking should create Events when they affect workflow history.

## Priorities

Priorities should be simple.

## Urgent

Needs attention now because delay may affect patient safety, client trust, clinic flow, money, or compliance.

## Today

Should be completed before the end of the current day or shift.

## Scheduled

Has a planned time or due date.

## Routine

Should be completed, but does not require immediate attention.

## Waiting

Cannot move until another condition changes.

Priority should help teams decide what to do next. It should not become a complicated scoring system.

## AI Support

AI may help work move, but should not become a hidden worker.

AI may:

- Create draft work
- Summarize work
- Suggest ownership
- Detect forgotten work
- Identify bottlenecks
- Recommend delegation
- Suggest priority
- Extract work from communication
- Draft completion notes

AI must never silently complete work requiring human judgment.

AI-created work should remain draft or suggested until accepted by a human or trusted system rule.

AI should show uncertainty when ownership, priority, or context is unclear.

## Metrics

Metrics should improve workflow, not encourage micromanagement.

Useful metrics:

- Open work
- Overdue work
- Blocked work
- Average completion time
- Reassigned work
- Escalated work
- Forgotten work
- Interrupted work
- Work without owner
- Work without context
- Work completed after visit archive

Metric review should ask:

- Where is work getting stuck?
- What work is being created unnecessarily?
- Which handoffs are failing?
- Which roles are overloaded?
- What work should be automated or removed?

## Examples

## Client Calls Requesting Refill

1. Communication received from client.
2. Work created: `Review refill request`.
3. Owner suggested: Receptionist for intake, Veterinarian for approval.
4. Status: Assigned.
5. Blocker checked: exam date, lab requirement, medication history, inventory.
6. Veterinarian approves or denies.
7. Prescription work is completed or client communication work is created.
8. Events record request, decision, prescription, and client communication.

## Lab Result Arrives

1. External Integration creates Event: `Diagnostic Result received`.
2. Work created: `Veterinarian review diagnostic result`.
3. Owner: Veterinarian or clinical queue.
4. Status: Assigned or Waiting depending on policy.
5. Veterinarian reviews result.
6. Work completed.
7. Follow-Up or Client Communication work may be created.
8. Events record result receipt, review, and communication.

## Estimate Approved

1. Client approves estimate.
2. Event created: `Estimate approved`.
3. Approval work completes.
4. Treatment, Diagnostic Order, Medication, or Procedure work may move from Waiting to Assigned.
5. Consent-related Audit Event is created where required.

## Patient Discharged

1. Treatment and medication work complete.
2. Discharge instruction work is created or completed.
3. Client Communication work may be created.
4. Checkout work begins.
5. Follow-Up work is created where needed.
6. Events record discharge instructions, communication, and follow-up creation.

## Veterinarian Signs Record

1. Record Completion work is assigned to Veterinarian.
2. Veterinarian reviews and signs required documentation.
3. Work completes.
4. Event created: `Record signed off`.
5. Audit Event created because clinical record finalization affects the Medical Record.

## Follow-Up Created

1. Visit plan or result creates Follow-Up work.
2. Owner assigned to user, role, or queue.
3. Status set to Scheduled, Assigned, or Waiting.
4. Reminder may be created if timing is future.
5. Event records follow-up creation.

## Inventory Shortage

1. Treatment or Medication work checks Inventory.
2. Inventory shortage blocks work.
3. Exception created if care or checkout is affected.
4. Work status moves to Blocked.
5. Owner assigned to Technician, Practice Manager, or inventory owner.
6. Substitute, order, or plan revision resolves blocker.
7. Events record shortage, escalation, and resolution.

## Work Principles

- Work should always have an owner.
- Work should always have a status.
- Work should always have context.
- Work should never depend on memory.
- Work should move with its history.
- Work should create Events when meaningful state changes happen.
- Work should reduce interruptions.
- Blocked work should remain visible.
- Escalated work should identify the new owner.
- AI may assist work but should not silently complete judgment-based work.

## Open Questions

- Which Work Types are required for v1?
- Which Work Types require Audit Events when completed?
- What work can trusted system rules complete without human action?
- How should work behave across multi-day hospitalization?
- Which work should survive Visit archival?
- Which work should be visible to clients?
- What does "forgotten work" mean in measurable terms?

## Future Work

- Map Visit Engine states to default Work Types.
- Define Work Type readiness for v1.
- Create ADR for Work Item ownership and lifecycle.
- Define blocked-work escalation rules.
- Define AI rules for draft work and suggested ownership.
- Create migration mapping for legacy tasks, reminders, callbacks, and unresolved notes.

## Related Documents

### References

- [Product Constitution](./00-product-constitution.md)
- [Visit Engine v1](./07-visit-engine-v1.md)
- [Core Domain Model v1](./08-core-domain-model-v1.md)
- [Event Architecture v1](./09-event-architecture-v1.md)
- [Migration Strategy](./06-migration-strategy.md)
- [AI Strategy](../specs/09-ai-strategy.md)

### Depends On

- [Product Constitution](./00-product-constitution.md)
- [Visit Engine v1](./07-visit-engine-v1.md)
- [Core Domain Model v1](./08-core-domain-model-v1.md)
- [Event Architecture v1](./09-event-architecture-v1.md)

### Referenced By

- TODO: Add links as visit specs, task specs, notification rules, AI prompts, and migration maps depend on this work system.

## Version Notes

- v1 defines work as business architecture only.
- v1 intentionally avoids UI, database, API, queue, and task-management implementation details.
- v1 uses `Work Item` as the broad Core Model concept and `Task` as a human-actionable Work Item.
