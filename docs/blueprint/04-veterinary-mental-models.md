# 04 Veterinary Mental Models

## Constitutional Authority

This document inherits from the [Product Constitution](./00-product-constitution.md). If it conflicts with the Constitution, the Constitution governs.

## Purpose

Describe how key veterinary roles think throughout the day.

This is not a workflow map. Workflows describe what happens. Mental models describe what people are trying to hold in their heads while it happens: urgency, context, risk, sequence, memory, confidence, and interruption.

Sparki should be designed around these cognitive realities.

## Receptionist

Receptionists live at the front edge of uncertainty.

They are often the first person to receive a problem, interpret urgency, calm a client, protect the schedule, route information, and keep the clinic moving. Their work is not merely administrative. It is continuous triage under social pressure.

### Primary Responsibilities

- Answer calls, messages, and walk-ins
- Schedule, confirm, reschedule, and route appointments
- Check clients in and out
- Collect client and patient information
- Coordinate handoffs between clients and clinical staff
- Manage reminders, follow-ups, estimates, invoices, and payments
- Protect the clinic's schedule from collapse

### Interruptions

- Phone calls while speaking to in-person clients
- Clients asking for status updates
- Technicians or veterinarians asking for client or patient context
- Urgent appointment requests
- Payment questions
- Prescription, refill, and records requests
- Late arrivals, no-shows, and walk-ins

### Sources Of Stress

- Not knowing whether something is urgent
- Being asked for information hidden elsewhere
- Feeling responsible for client emotion without enough clinical context
- Schedule pressure
- Long hold times or crowded lobbies
- Having to ask the same question twice
- Making a routing mistake that affects care or wait time

### Information They Constantly Need

- Who the client is
- Which patient the conversation is about
- Appointment status and timing
- Reason for visit
- Current location or stage of the patient
- Outstanding balances, estimates, or approvals
- Communication history
- Callback and follow-up status
- Whether a request is routine, urgent, or blocked

### Information They Rarely Need

- Full clinical history by default
- Detailed diagnostic results unless relevant to a client question
- Deep inventory details
- Internal medical reasoning unless needed for routing or explanation
- Advanced configuration or administrative settings

### What Slows Them Down

- Searching across disconnected places
- Duplicate client or patient records
- Separate communication inboxes
- Unclear appointment status
- Missing reason-for-visit context
- Needing a technician or veterinarian to answer basic routing questions
- Systems that require exact search terms
- Too many modal steps during live client interaction

### What Gives Them Confidence

- Clear patient and client identity
- Visible appointment state
- Recent communication in context
- Obvious next actions
- Confidence that messages, payments, and follow-ups are attached to the right patient
- Clear escalation paths
- System language that matches how the clinic talks

### Common Mistakes

- Selecting the wrong patient under pressure
- Missing a prior communication
- Scheduling into the wrong appointment type or time slot
- Failing to capture the real reason for visit
- Forgetting a follow-up after an interruption
- Giving a client an outdated status

### Current Software Frustrations

- Navigation organized around modules instead of client interaction
- Slow search
- Separate screens for communication, schedule, records, and billing
- Too many clicks to answer simple questions
- Poor visibility into where a patient is in the visit
- Inconsistent or duplicated client records

### How Sparki Should Think For Them

Sparki should think like a front-desk memory layer.

It should preserve identity, context, status, and next action so the receptionist can stay present with the client. It should assume interruption is normal and make resuming easy.

### How AI Should Help

- Summarize recent communication before a call is answered
- Suggest the likely patient when client identity is clear
- Draft routine replies
- Extract reason-for-visit details from messages
- Flag missing information before handoff
- Suggest urgency cues without pretending to diagnose
- Prepare callback context

AI should reduce lookup and typing. It should not create a second inbox to manage.

### How Notifications Should Behave

Notifications should be triaged, contextual, and restrained.

Receptionists need to know when something changes that affects a client conversation, schedule, payment, or handoff. They do not need every internal update. Notifications should support timing and routing, not add noise.

### How Navigation Should Behave

Navigation should support rapid return to client, patient, appointment, and communication context.

The receptionist should not have to choose between answering the phone and preserving their place. Search, recents, active visits, and pending tasks should feel immediate.

### How This Role Defines A Good Day

A good day is one where clients feel answered, the schedule stays intact, handoffs are clean, callbacks do not disappear, and the front desk does not become the place where missing context accumulates.

## Technician

Technicians live in the space between medical care and operational execution.

They translate plans into action, collect patient information, support the veterinarian, communicate with clients, update records, manage treatments, and keep rooms moving. Their mental model is task-dense, patient-aware, and interruption-heavy.

### Primary Responsibilities

- Prepare rooms, patients, and records
- Collect histories and vitals
- Assist exams and procedures
- Execute treatments, diagnostics, and medication plans
- Communicate estimates, instructions, and updates
- Document care
- Coordinate handoffs between veterinarian, client, and front desk
- Track what still needs to happen

### Interruptions

- Veterinarian requests
- Patient status changes
- Client questions
- Lab or diagnostic updates
- Medication or treatment questions
- Room turnover needs
- Emergencies or urgent add-ons
- Other technicians needing help

### Sources Of Stress

- Too many active patients
- Unclear priorities
- Missing patient context
- Needing to document after the fact
- Waiting for approvals or decisions
- Being unsure whether a task was completed
- Conflicting verbal instructions
- Feeling behind before the day is over

### Information They Constantly Need

- Patient identity and current visit reason
- Current stage of visit
- Assigned veterinarian
- Orders, tasks, and treatment plan
- Estimate and approval status
- Medication and allergy context
- Recent vitals and history
- Client communication status
- What has been done and what remains

### Information They Rarely Need

- Full financial account history
- Global clinic reporting
- Administrative configuration
- Long historical records unless relevant to today's care
- Inventory management details outside immediate availability

### What Slows Them Down

- Hunting for orders or next steps
- Re-entering information already collected
- Documenting after memory has gone cold
- Switching between schedule, record, invoice, and communication screens
- Unclear ownership of tasks
- Waiting for someone else to confirm status
- Too many required fields during active care

### What Gives Them Confidence

- A clear patient snapshot
- A visible task list tied to the visit
- Status that updates reliably
- Documentation that can be captured in the moment
- Clear approval and estimate state
- Obvious handoff notes
- Trust that completed work is recorded once

### Common Mistakes

- Forgetting to mark a completed task
- Missing an instruction after an interruption
- Documenting in the wrong patient or visit
- Losing track of approval status
- Repeating history questions
- Omitting context from a handoff

### Current Software Frustrations

- Patient records that do not show today's work clearly
- Task lists separated from clinical context
- Estimate, invoice, and treatment plan fragmentation
- Slow documentation paths
- Poor support for in-progress work
- Lack of shared status across roles

### How Sparki Should Think For Them

Sparki should think like an active visit memory.

It should know what is happening now, what has already happened, what is waiting, what is blocked, and who needs to know. It should help the technician move without forcing them to become the system's project manager.

### How AI Should Help

- Convert notes and conversation into structured draft documentation
- Summarize relevant patient history for today's reason
- Suggest missing fields before handoff
- Draft discharge instructions from approved plan details
- Identify incomplete tasks or unresolved follow-up
- Reduce duplicate typing across record, estimate, and communication

AI should help capture and reconcile. It should not obscure responsibility for care.

### How Notifications Should Behave

Notifications should distinguish urgency from awareness.

Technicians need immediate signals for blocked care, approvals, patient status changes, and veterinarian decisions. Routine updates should be visible in context without stealing attention.

### How Navigation Should Behave

Navigation should prioritize active patients, current tasks, and fast return.

Technicians should be able to move from patient summary to task, order, estimate, communication, and documentation without losing the visit thread.

### How This Role Defines A Good Day

A good day is one where patients move safely, tasks are clear, documentation keeps up with care, handoffs are trusted, and the technician is not carrying the entire visit state in their head.

## Veterinarian

Veterinarians think in diagnosis, risk, judgment, communication, and time.

They must synthesize incomplete information, make decisions, explain tradeoffs, maintain medical quality, and keep appointments moving. Their cognitive load is high because their work combines clinical reasoning with client trust and operational pace.

### Primary Responsibilities

- Diagnose and treat patients
- Review history, exam findings, diagnostics, and response to treatment
- Make medical decisions under uncertainty
- Communicate recommendations and tradeoffs
- Create or approve treatment plans, estimates, medications, and follow-up
- Document medical reasoning and care
- Supervise technicians and coordinate clinical direction

### Interruptions

- Technician questions
- Lab or imaging results
- Client callbacks
- Urgent patient changes
- Prescription and refill reviews
- Estimate or approval questions
- Documentation catch-up
- Other doctors or managers asking for decisions

### Sources Of Stress

- Missing or fragmented patient history
- Running behind
- Making decisions without complete context
- Repeating explanations
- Documentation burden
- Fear that something important was missed
- Client communication pressure
- Balancing medical quality with clinic pace

### Information They Constantly Need

- Reason for visit
- Relevant history and prior problems
- Current medications, allergies, and alerts
- Recent diagnostics and trends
- Exam findings and technician notes
- Client concerns and constraints
- Estimate and approval status
- Treatment plan state
- Follow-up obligations

### Information They Rarely Need

- Full account billing history unless it affects care discussion
- Routine administrative settings
- Irrelevant historical details
- Full communication archives unless clinically relevant
- Operational reports during active care

### What Slows Them Down

- Searching through long records for relevant history
- Reconstructing what happened before entering the room
- Writing the same explanation multiple times
- Separating clinical plan from estimate and communication
- Documentation tools that do not match reasoning
- Unclear handoffs from technician to doctor
- Interruptions that lack enough context to answer quickly

### What Gives Them Confidence

- Relevant history surfaced clearly
- Trends and abnormal findings visible without digging
- Clear current visit state
- Technician-collected context in one place
- Easy review of previous plan and outcome
- Confidence that medical decisions, client communication, and follow-up are connected
- Documentation support that preserves clinical intent

### Common Mistakes

- Missing relevant prior history
- Forgetting a follow-up instruction
- Documenting late and losing detail
- Approving a plan without seeing a changed constraint
- Repeating work already done by staff
- Answering a question without full patient context

### Current Software Frustrations

- Bloated records that make relevance hard to find
- Slow documentation
- Disconnected estimates, medical notes, and communication
- Poor handoff visibility
- Weak support for longitudinal patient understanding
- Alerts that are noisy or poorly timed

### How Sparki Should Think For Them

Sparki should think like a clinical context engine.

It should reduce the time between opening a patient and understanding what matters. It should support judgment by surfacing relevance, preserving reasoning, and connecting decisions to the work they create.

### How AI Should Help

- Summarize relevant history for the current complaint
- Draft medical notes from structured visit activity and clinician input
- Highlight trends, unresolved problems, and missing follow-up
- Draft client-facing explanations from approved medical plans
- Reduce repetitive documentation while keeping clinician review clear
- Support record review before callbacks or rechecks

AI should support clinical reasoning. It should not replace it, conceal uncertainty, or make decisions without the veterinarian.

### How Notifications Should Behave

Notifications should be rare, contextual, and clinically meaningful.

Veterinarians should be interrupted for decisions, risks, urgent changes, and blocked workflows that require their authority. Everything else should be available when they enter the patient or task context.

### How Navigation Should Behave

Navigation should prioritize relevance.

The veterinarian should be able to move from today's problem to relevant history, diagnostics, plan, communication, and documentation without scanning the entire record.

### How This Role Defines A Good Day

A good day is one where medical decisions are well-supported, documentation does not consume the evening, clients understand the plan, staff have direction, and the veterinarian does not feel the system made them less present.

## Practice Manager

Practice managers think in throughput, staffing, service quality, financial health, and exception handling.

They are responsible for making the clinic function as an organization. Their work depends on seeing patterns without losing the human details behind them.

### Primary Responsibilities

- Coordinate staffing, scheduling, and operational coverage
- Monitor clinic flow and bottlenecks
- Support client service and team performance
- Handle escalations
- Track revenue, payments, inventory, compliance, and follow-up
- Improve processes
- Train staff and enforce standards
- Evaluate software, vendor, and operational issues

### Interruptions

- Staff escalations
- Client complaints
- Schedule breakdowns
- Payment or estimate disputes
- Inventory or medication issues
- System problems
- Hiring, training, and personnel questions
- Owner or leadership requests

### Sources Of Stress

- Problems becoming visible too late
- Lack of reliable operational state
- Staff workarounds that hide process failures
- Inconsistent data entry
- Client dissatisfaction
- Revenue leakage
- Unclear accountability
- Having to reconcile reports manually

### Information They Constantly Need

- Current clinic flow
- Appointment status and backlog
- Staff workload
- Open tasks and unresolved follow-up
- Estimate, payment, and invoice exceptions
- Client communication issues
- Inventory or fulfillment exceptions
- Patterns in delays, rework, and missed steps

### Information They Rarely Need

- Every clinical detail by default
- Full individual record context unless investigating an issue
- Low-level system configuration during daily operations
- Raw data exports when actionable summaries are available

### What Slows Them Down

- Reports that require manual interpretation
- Inconsistent staff usage of the system
- No visibility into bottlenecks until clients complain
- Separate systems for communication, billing, schedule, and records
- Needing to ask multiple people for the state of one issue
- Data that exists but is not operationally trustworthy

### What Gives Them Confidence

- Reliable operational state
- Clear exception queues
- Shared definitions of done
- Visibility into bottlenecks before they become failures
- Reports that connect to action
- Audit trails for important decisions and handoffs
- Staff consistency without excessive policing

### Common Mistakes

- Solving symptoms instead of process problems
- Trusting incomplete reports
- Missing recurring bottlenecks
- Overcorrecting with policy when software is the real problem
- Letting configuration grow without governance
- Failing to see staff workload until burnout appears

### Current Software Frustrations

- Reporting disconnected from daily action
- Weak visibility into active clinic flow
- Too much dependence on staff memory
- Hard-to-audit communication and handoffs
- Configuration complexity
- Manual reconciliation across systems

### How Sparki Should Think For Them

Sparki should think like an operational clarity layer.

It should reveal state, exceptions, patterns, and unresolved work without requiring the manager to interrogate the clinic. It should make process problems visible early.

### How AI Should Help

- Summarize operational exceptions
- Identify recurring bottlenecks
- Surface incomplete follow-up or documentation patterns
- Draft internal summaries for incidents or escalations
- Help analyze migration, data quality, and usage issues
- Turn reports into likely actions and questions

AI should help managers see patterns. It should not replace judgment, personnel context, or accountability.

### How Notifications Should Behave

Notifications should be exception-based.

Practice managers do not need every update. They need to know when a pattern, delay, dispute, compliance issue, or unresolved task requires attention.

### How Navigation Should Behave

Navigation should move from overview to exception to source-of-truth detail.

The manager should be able to start with clinic state, identify a problem, inspect the underlying patient, client, staff, communication, or financial context, and return to the operational view.

### How This Role Defines A Good Day

A good day is one where the clinic stays ahead of problems, staff know what to do, clients do not fall through cracks, reports match reality, and the manager spends more time improving the system than repairing it.

## Hospital Owner

Hospital owners think in durability.

They care about patient care, team retention, client trust, financial performance, growth, risk, and the long-term value of the hospital. Their view is less about individual clicks and more about whether the operating system makes the business healthier.

### Primary Responsibilities

- Set clinical and operational standards
- Protect quality of care
- Maintain financial health
- Recruit, retain, and support staff
- Make investment and vendor decisions
- Manage risk
- Shape culture
- Plan growth, succession, or expansion

### Interruptions

- Major client escalations
- Staffing issues
- Financial concerns
- System outages or vendor problems
- Compliance or medical risk
- Leadership decisions
- High-impact operational failures

### Sources Of Stress

- Staff burnout
- Declining client experience
- Poor visibility into business health
- Dependence on fragile systems or workarounds
- Data they cannot trust
- Migration risk
- Technology decisions that disrupt care
- Growth making operations harder instead of easier

### Information They Constantly Need

- Clinic health indicators
- Revenue and payment trends
- Appointment demand and capacity
- Staff workload and retention signals
- Client experience patterns
- Quality, compliance, and follow-up risks
- Operational bottlenecks
- Technology reliability and adoption

### Information They Rarely Need

- Every active patient detail
- Individual task-level noise unless escalated
- Raw configuration details
- Low-value reports without interpretation
- Routine notifications that managers can handle

### What Slows Them Down

- Lack of trust in system data
- Decisions based on anecdotes instead of patterns
- Vendor lock-in
- Migration fear
- Reports that do not explain what action to take
- Tools that improve one role while burdening another
- Operational complexity that grows with the business

### What Gives Them Confidence

- Trustworthy source-of-truth data
- Evidence that staff can move faster with less frustration
- Clear migration and adoption path
- Operational visibility without micromanagement
- Product reliability
- Better client communication and follow-up
- Systems that scale with the hospital

### Common Mistakes

- Underestimating workflow friction because staff have adapted to it
- Overvaluing feature parity during software evaluation
- Delaying change because migration feels risky
- Treating staff frustration as training failure
- Accepting manual reconciliation as normal
- Choosing software for reporting while ignoring daily use

### Current Software Frustrations

- High switching costs
- Poor visibility into actual workflow friction
- Reports that lag reality
- Systems that require constant workarounds
- Limited confidence in data quality
- Staff resistance caused by past software pain

### How Sparki Should Think For Them

Sparki should think like durable operating infrastructure.

It should make the hospital easier to run, easier to understand, and easier to improve. It should protect continuity while creating a path away from legacy constraints.

### How AI Should Help

- Summarize clinic health and operational trends
- Explain anomalies in plain language
- Identify risks in follow-up, communication, revenue, or workload
- Support migration confidence and data validation
- Help evaluate whether Sparki is reducing friction over time
- Prepare strategic summaries without hiding source data

AI should help owners understand the business. It should not create false certainty.

### How Notifications Should Behave

Notifications should be rare and high-signal.

Owners should receive signals about risks, trends, exceptions, and decisions that require leadership attention. Daily operational noise should remain with the team closest to the work.

### How Navigation Should Behave

Navigation should support summary, drill-down, and trust.

Owners should be able to see business state, understand why it changed, inspect source details when needed, and return to strategic context without getting trapped in operational screens.

### How This Role Defines A Good Day

A good day is one where the hospital provides excellent care, the team is not burning down, clients trust the clinic, the numbers make sense, and the owner feels the business is becoming more resilient.

## Cross-Role Cognitive Principles

Across roles, Sparki should respect several cognitive truths:

- People need different levels of detail at different moments.
- The same information can be helpful or distracting depending on role and timing.
- Interruption is expensive even when the information is correct.
- Confidence comes from context, not volume.
- Search is often a symptom of missing structure.
- A good system remembers what humans should not have to.
- Software should reduce the amount of clinic state carried in people's heads.

## Open Questions

- Which role should define the first complete product wedge?
- Which information needs vary most by clinic type?
- Which interruptions are unavoidable and should be designed as first-class moments?
- What cognitive burden can AI safely remove first?
- How should Sparki measure confidence, not only speed?

## Notes

This document should inform personas, product specs, navigation, notification design, AI strategy, and user research.

It should not become a workflow document. If a section starts describing process sequence more than cognition, move that material to a workflow map.

## Related Documents

### References

- [Product Constitution](./00-product-constitution.md)
- [Sparki Thesis](./03-sparki-thesis.md)
- [User Personas](../research/05-user-personas.md)
- [Clinic Workflows](../research/06-clinic-workflows.md)

### Depends On

- [Product Constitution](./00-product-constitution.md)
- [Sparki Thesis](./03-sparki-thesis.md)

### Referenced By

- TODO: Add links as product specs, AI strategy, notification standards, and navigation documents reference these mental models.

### Future Work

- TODO: Validate each role model through customer discovery.
- TODO: Map role-specific cognitive burdens to Sparki's notification, AI, and navigation principles.
- TODO: Identify measurable signals for confidence, interruption cost, and cognitive load.
