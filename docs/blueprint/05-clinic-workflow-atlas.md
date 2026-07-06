# 05 Clinic Workflow Atlas

## Constitutional Authority

This document inherits from the [Product Constitution](./00-product-constitution.md). If it conflicts with the Constitution, the Constitution governs.

## Purpose

Map the operating reality of a veterinary clinic from opening until closing.

This is not a software design document. It does not prescribe screens, navigation, data models, or implementation. Its job is to reverse engineer the work as it happens: actors, goals, inputs, outputs, interruptions, pain, opportunities, and measurable signals.

Future product specs should use this atlas as source material.

## How To Read This Atlas

Each workflow is described as an operational unit. In real clinics, these workflows overlap, loop, and interrupt one another. The day is not linear. The atlas is organized roughly from opening to closing so the clinic can be understood as a whole system.

## Workflow Map

1. Opening the clinic
2. Scheduling
3. Phone calls
4. Check-in
5. Technician intake
6. Doctor exam
7. Diagnostics
8. Lab
9. Estimate
10. Approval
11. Treatment
12. Hospitalization
13. Surgery
14. Medication
15. Checkout
16. Payment
17. Follow-up
18. Prescription refill
19. Emergency arrival
20. Walk-ins
21. Inventory ordering
22. Internal communication
23. Closing procedures

## 1. Opening The Clinic

### Actors

- Receptionist
- Technician
- Veterinarian
- Practice manager
- Kennel or hospital assistant where applicable

### Goals

- Make the clinic operational before the first patient interaction.
- Confirm schedule, staffing, rooms, equipment, inventory, hospitalized patients, and unresolved work.
- Identify risks before clients arrive.

### Inputs

- Today's schedule
- Staff assignments
- Overnight messages
- Hospitalized patient status
- Pending callbacks and follow-ups
- Lab results
- Inventory alerts
- Payment or estimate exceptions

### Outputs

- Ready rooms and work areas
- Confirmed daily schedule
- Known staffing gaps or bottlenecks
- Prioritized callbacks and pending work
- Updated hospitalized patient handoff
- Identified exceptions

### Interruptions

- Early client arrivals
- Emergency calls
- Staff lateness
- Overnight patient changes
- Equipment or system issues
- Pharmacy or inventory shortages

### Current Pain Points

- Important overnight context lives in multiple places.
- Staff rely on verbal handoffs and memory.
- Schedule risk is discovered too late.
- Follow-ups from the previous day can disappear into the morning rush.

### Opportunities

- Make unresolved work visible before the clinic starts moving.
- Separate urgent exceptions from routine awareness.
- Support better handoff discipline between closing and opening.

### Potential AI Opportunities

- Summarize overnight messages, lab results, and unresolved tasks.
- Highlight patients or clients likely to need attention early.
- Identify schedule pressure based on appointment mix and staffing.

### Potential Automation

- Generate an opening checklist.
- Surface stale tasks and overdue follow-ups.
- Prepare hospitalized patient status summaries.

### Potential Integrations

- Lab systems
- Phone and messaging systems
- Calendar or scheduling
- Inventory and pharmacy systems

### Potential Metrics

- Time to ready clinic
- Number of unresolved overnight items
- Late-discovered schedule conflicts
- Missed opening tasks
- First appointment delay

## 2. Scheduling

### Actors

- Receptionist
- Client
- Technician
- Veterinarian
- Practice manager

### Goals

- Match patient need, urgency, appointment type, provider availability, room capacity, and client constraints.
- Protect the schedule from overload while preserving access to care.

### Inputs

- Client request
- Patient identity and history
- Reason for visit
- Urgency signals
- Provider availability
- Appointment type rules
- Room and staffing capacity
- Existing reminders or follow-up needs

### Outputs

- Scheduled appointment
- Updated reason for visit
- Client instructions
- Confirmed patient and client details
- Follow-up or reminder where needed

### Interruptions

- Phone calls
- Emergency requests
- Provider changes
- No-show and cancellation handling
- Client uncertainty about symptoms or timing

### Current Pain Points

- Appointment type selection can depend on staff memory.
- Urgency is hard to judge from incomplete client descriptions.
- Scheduling decisions may lack patient history context.
- Capacity is often managed informally.

### Opportunities

- Support better triage during scheduling.
- Preserve reason-for-visit context for downstream roles.
- Make schedule pressure visible before it becomes unsafe.

### Potential AI Opportunities

- Extract reason for visit from client message.
- Suggest likely appointment type from symptoms and history.
- Flag language that may indicate urgency.
- Draft client preparation instructions.

### Potential Automation

- Appointment confirmations
- Reminder creation
- Pre-visit forms
- Follow-up scheduling prompts

### Potential Integrations

- Online booking
- Calendar
- SMS/email
- Phone system
- Client portal

### Potential Metrics

- Scheduling time
- Reschedule rate
- No-show rate
- Incorrect appointment type rate
- Same-day capacity utilization
- Triage escalation rate

## 3. Phone Calls

### Actors

- Receptionist
- Client
- Technician
- Veterinarian
- Practice manager

### Goals

- Identify the caller, understand the request, route correctly, and preserve the outcome.
- Answer what can be answered without unnecessary handoff.

### Inputs

- Caller identity
- Patient identity
- Call reason
- Recent communication
- Appointment and visit status
- Account or payment status
- Clinical routing rules

### Outputs

- Answered question
- Scheduled appointment
- Routed message
- Callback task
- Updated patient or client context
- Escalation where required

### Interruptions

- In-person clients
- Other calls
- Clinical staff requests
- Urgent client emotion
- Missing patient identity

### Current Pain Points

- Caller context is hard to assemble quickly.
- Notes from calls may not connect to patient care.
- Callback ownership is unclear.
- Staff repeat questions because prior communication is hidden.

### Opportunities

- Make call context immediate.
- Convert calls into structured outcomes.
- Reduce unnecessary clinical interruptions.

### Potential AI Opportunities

- Summarize recent patient/client context at call start.
- Draft call notes.
- Identify action items.
- Suggest routing or urgency category.

### Potential Automation

- Create callback tasks.
- Attach call logs to patient/client context.
- Trigger follow-up reminders from call outcomes.

### Potential Integrations

- VoIP
- SMS
- Email
- Client portal
- Scheduling

### Potential Metrics

- Call handling time
- First-contact resolution
- Callback completion rate
- Missed call rate
- Call-to-appointment conversion
- Repeat contact for same issue

## 4. Check-In

### Actors

- Receptionist
- Client
- Technician
- Patient

### Goals

- Confirm arrival, identity, reason for visit, required forms, contact details, and readiness for clinical intake.

### Inputs

- Scheduled appointment
- Client and patient identity
- Reason for visit
- Forms or consents
- Payment or deposit requirements
- Prior communication
- Alerts or special handling notes

### Outputs

- Patient marked arrived
- Updated client and patient details
- Completed or flagged forms
- Visit ready for technician intake
- Noted concerns or exceptions

### Interruptions

- Lobby congestion
- Late arrivals
- Phone calls
- Multiple pets
- Missing forms
- Payment questions
- Anxious or reactive patients

### Current Pain Points

- Reconfirming information already collected.
- Missing forms discovered too late.
- Arrival status may not be visible to the clinical team.
- Front desk becomes responsible for routing all exceptions manually.

### Opportunities

- Make check-in a clean handoff to clinical care.
- Reduce duplicate intake questions.
- Surface exceptions early.

### Potential AI Opportunities

- Summarize pre-visit forms for technician review.
- Flag mismatches between appointment reason and client notes.
- Extract concerns from free-text intake.

### Potential Automation

- Pre-arrival form reminders
- Arrival notifications to clinical team
- Check-in task generation
- Missing information prompts

### Potential Integrations

- Client portal
- Forms
- Payments
- Messaging
- Scheduling

### Potential Metrics

- Check-in duration
- Missing form rate
- Time from arrival to intake
- Duplicate question rate
- Late arrival impact

## 5. Technician Intake

### Actors

- Technician
- Client
- Patient
- Veterinarian

### Goals

- Gather relevant history, vitals, concerns, constraints, and visit context before the doctor exam.

### Inputs

- Reason for visit
- Patient history
- Client concerns
- Pre-visit forms
- Current medications
- Alerts
- Prior diagnostics or follow-up

### Outputs

- Updated history
- Vitals
- Technician notes
- Initial concerns
- Doctor-ready summary
- Identified estimate or approval needs

### Interruptions

- Other patient needs
- Doctor questions
- Client emotion or uncertainty
- Missing records
- Patient handling challenges
- Urgent walk-ins

### Current Pain Points

- Intake repeats information already provided.
- Technicians must decide what history matters.
- Notes may be fragmented from the doctor plan.
- Important client constraints can be lost.

### Opportunities

- Make intake focused on today's patient problem.
- Preserve client language and technician observations.
- Reduce late discovery of constraints.

### Potential AI Opportunities

- Summarize relevant history for the visit.
- Convert client narrative into draft structured intake.
- Flag missing medication, allergy, or symptom details.

### Potential Automation

- Pre-populate known patient context.
- Generate doctor-ready intake summary.
- Create follow-up questions based on reason for visit.

### Potential Integrations

- Medical records
- Forms
- Diagnostic history
- Medication history

### Potential Metrics

- Intake duration
- Missing information rate
- Duplicate question rate
- Doctor clarification requests
- Time from intake start to doctor-ready

## 6. Doctor Exam

### Actors

- Veterinarian
- Technician
- Client
- Patient

### Goals

- Assess the patient, make clinical decisions, explain options, and create a plan.

### Inputs

- Technician intake
- Patient history
- Exam findings
- Client concerns and constraints
- Diagnostics
- Prior treatments
- Current medications and alerts

### Outputs

- Assessment
- Plan
- Recommended diagnostics or treatment
- Estimate needs
- Medication decisions
- Follow-up instructions
- Medical documentation

### Interruptions

- Urgent patient changes
- Lab results
- Technician questions
- Client questions
- Other appointments running behind
- Callback decisions

### Current Pain Points

- Relevant history is buried in long records.
- Documentation often happens after the exam.
- Clinical plan, estimate, and communication are disconnected.
- Doctors are interrupted without enough context.

### Opportunities

- Surface relevance before the doctor enters the room.
- Keep plan, estimate, communication, and follow-up connected.
- Reduce after-hours documentation.

### Potential AI Opportunities

- Summarize relevant longitudinal history.
- Draft exam note from structured inputs and clinician dictation.
- Identify unresolved problems or missing follow-up.
- Draft client explanation from approved plan.

### Potential Automation

- Create plan-linked tasks.
- Trigger estimate creation from selected plan.
- Generate follow-up reminders from doctor instructions.

### Potential Integrations

- Diagnostics
- Lab
- Pharmacy
- Client messaging
- Dictation or transcription

### Potential Metrics

- Exam documentation completion time
- Time from exam to plan
- Doctor clarification requests
- Follow-up creation rate
- Late note rate

## 7. Diagnostics

### Actors

- Veterinarian
- Technician
- Client
- Lab or imaging staff where applicable

### Goals

- Order, perform, receive, interpret, and communicate diagnostic work.

### Inputs

- Doctor plan
- Patient history
- Diagnostic options
- Estimate or approval status
- Sample or imaging requirements
- Lab or equipment availability

### Outputs

- Diagnostic order
- Completed sample or image
- Result
- Interpretation
- Client communication
- Updated treatment plan

### Interruptions

- Approval delays
- Equipment availability
- Sample collection issues
- Result timing
- Urgent abnormal findings
- Client waiting for updates

### Current Pain Points

- Orders, results, interpretation, and communication may live separately.
- Result status can be unclear.
- Follow-up from abnormal results can be missed.
- Delays are hard to communicate proactively.

### Opportunities

- Track diagnostic state from order through interpretation.
- Tie results to patient timeline and next action.
- Make result communication accountable.

### Potential AI Opportunities

- Summarize result changes over time.
- Draft client-facing result messages for review.
- Flag results without documented follow-up.

### Potential Automation

- Result status tracking
- Follow-up task creation for abnormal or pending results
- Client notification drafts

### Potential Integrations

- Reference labs
- In-house lab machines
- Imaging systems
- Medical record
- Client messaging

### Potential Metrics

- Order-to-result time
- Result review time
- Uncommunicated result count
- Abnormal result follow-up rate
- Diagnostic cancellation rate

## 8. Lab

### Actors

- Technician
- Veterinarian
- Lab vendor
- Client

### Goals

- Collect, submit, track, receive, and act on lab work.

### Inputs

- Lab order
- Sample requirements
- Patient identifiers
- Approval status
- Vendor or in-house lab availability

### Outputs

- Submitted lab
- Result received
- Result reviewed
- Client communication
- Updated plan
- Invoice item where applicable

### Interruptions

- Sample labeling problems
- Insufficient sample
- Machine downtime
- Delayed external results
- Urgent result callbacks

### Current Pain Points

- Lab status may be opaque.
- Manual result entry creates risk.
- Results may arrive outside active visit context.
- Client communication after results is inconsistent.

### Opportunities

- Create a reliable lab state machine.
- Reduce manual entry and reconciliation.
- Make unreviewed and uncommunicated results visible.

### Potential AI Opportunities

- Identify trends across prior lab values.
- Summarize abnormal findings for clinician review.
- Draft non-diagnostic client updates for review.

### Potential Automation

- Import results
- Match results to patient and order
- Notify responsible clinician of new results
- Create follow-up tasks

### Potential Integrations

- IDEXX
- Antech
- In-house analyzers
- Imaging or diagnostic platforms
- Client communication

### Potential Metrics

- Result matching accuracy
- Time to clinician review
- Time to client communication
- Manual entry rate
- Lab exception rate

## 9. Estimate

### Actors

- Veterinarian
- Technician
- Receptionist
- Client

### Goals

- Translate recommended care into expected cost and obtain informed client understanding.

### Inputs

- Doctor plan
- Diagnostic and treatment options
- Pricing
- Inventory or medication availability
- Client constraints
- Prior estimates or balances

### Outputs

- Estimate
- Client explanation
- Approval request
- Revised plan if needed
- Financial or care constraints captured

### Interruptions

- Client questions
- Price changes
- Doctor plan changes
- Missing items
- Urgent care timing
- Payment concerns

### Current Pain Points

- Estimates are disconnected from the medical plan.
- Staff manually assemble items from memory.
- Plan changes may not update estimates cleanly.
- Client constraints may not flow back into care plan.

### Opportunities

- Keep plan, estimate, approval, and treatment connected.
- Reduce manual estimate assembly.
- Make changes traceable.

### Potential AI Opportunities

- Draft plain-language estimate explanation.
- Identify missing estimate items based on plan.
- Summarize client constraints for doctor review.

### Potential Automation

- Generate estimate from plan templates or selected orders.
- Update tasks after approval.
- Flag estimate-plan mismatch.

### Potential Integrations

- Pricing catalog
- Inventory
- Payment
- Client messaging
- Financing providers

### Potential Metrics

- Time from plan to estimate
- Estimate revision rate
- Approval time
- Estimate-plan mismatch rate
- Declined recommendation rate

## 10. Approval

### Actors

- Client
- Technician
- Veterinarian
- Receptionist

### Goals

- Confirm informed consent for diagnostics, treatment, surgery, hospitalization, medication, or cost.

### Inputs

- Estimate
- Treatment plan
- Client questions
- Consent requirements
- Payment or deposit requirements
- Risk disclosures

### Outputs

- Approval, partial approval, or decline
- Consent record
- Updated care plan
- Updated financial expectation
- Tasks released or blocked

### Interruptions

- Client indecision
- Need for doctor explanation
- Payment constraints
- Urgent treatment timing
- Missing legal or consent information

### Current Pain Points

- Approval status is unclear across roles.
- Partial approvals create plan confusion.
- Consent may be captured separately from the work it authorizes.
- Staff may proceed based on verbal memory.

### Opportunities

- Make approval state visible and authoritative.
- Connect approval directly to tasks and plan changes.
- Reduce ambiguity around partial approvals.

### Potential AI Opportunities

- Summarize approved versus declined items.
- Draft follow-up questions for unclear approvals.
- Flag conflicting plan and approval states.

### Potential Automation

- Block tasks that require approval.
- Capture timestamped approval records.
- Notify relevant staff when approval changes.

### Potential Integrations

- E-signature
- Messaging
- Payments
- Financing
- Medical record

### Potential Metrics

- Approval turnaround time
- Partial approval rate
- Treatment delay due to approval
- Consent completion rate
- Approval-state conflict count

## 11. Treatment

### Actors

- Technician
- Veterinarian
- Patient
- Client where communication is needed

### Goals

- Execute approved care safely, completely, and with accurate documentation.

### Inputs

- Approved plan
- Patient status
- Orders
- Medications
- Diagnostics
- Staff availability
- Safety alerts

### Outputs

- Completed treatments
- Updated patient record
- Medication administration record
- New findings or complications
- Client update where needed
- Follow-up tasks

### Interruptions

- Patient response changes
- Missing medication or supplies
- Doctor questions
- New approvals required
- Emergencies
- Staff reallocation

### Current Pain Points

- Task ownership can be unclear.
- Completed work may be documented late.
- Treatment changes may not propagate.
- Staff rely on verbal status.

### Opportunities

- Make treatment status visible.
- Reduce duplicate documentation.
- Preserve why treatment changed.

### Potential AI Opportunities

- Draft treatment notes from completed tasks.
- Identify incomplete or conflicting treatment steps.
- Summarize patient response for doctor review.

### Potential Automation

- Treatment task lists
- Medication timing reminders
- Completion prompts
- Follow-up generation

### Potential Integrations

- Pharmacy
- Inventory
- Medical record
- Monitoring equipment

### Potential Metrics

- On-time treatment completion
- Missed task rate
- Treatment documentation lag
- Plan deviation rate
- Treatment-related handoff errors

## 12. Hospitalization

### Actors

- Veterinarian
- Technician
- Hospital assistant
- Client
- Practice manager where needed

### Goals

- Manage ongoing inpatient care, monitoring, communication, and handoffs.

### Inputs

- Hospitalization plan
- Monitoring requirements
- Medication schedule
- Diagnostics
- Client communication expectations
- Estimate and approval status

### Outputs

- Ongoing care record
- Patient status updates
- Treatment completion records
- Client updates
- Revised plan
- Discharge or transfer plan

### Interruptions

- Patient deterioration
- Shift changes
- Client update requests
- New diagnostic results
- Medication timing
- Emergency arrivals

### Current Pain Points

- Handoffs rely heavily on verbal summaries.
- Monitoring and treatment schedules may fragment.
- Client updates are inconsistently documented.
- Estimate changes can lag care changes.

### Opportunities

- Make inpatient status and next tasks clear.
- Improve shift handoffs.
- Connect care changes to approvals and communication.

### Potential AI Opportunities

- Generate shift handoff summaries.
- Summarize patient status changes.
- Draft client updates for review.
- Flag missed monitoring or overdue treatments.

### Potential Automation

- Medication and monitoring schedules
- Handoff checklist generation
- Client update reminders
- Estimate review triggers

### Potential Integrations

- Monitoring devices
- Pharmacy
- Lab
- Messaging
- Payments

### Potential Metrics

- Missed monitoring rate
- Handoff completeness
- Client update timeliness
- Treatment schedule adherence
- Hospitalization estimate variance

## 13. Surgery

### Actors

- Veterinarian
- Technician
- Surgical assistant
- Receptionist
- Client

### Goals

- Prepare, perform, monitor, document, and discharge surgical care safely.

### Inputs

- Surgical plan
- Consent
- Estimate and payment requirements
- Pre-op diagnostics
- Anesthesia protocol
- Patient alerts
- Surgical checklist

### Outputs

- Completed surgery
- Anesthesia and monitoring record
- Medication and discharge instructions
- Client update
- Follow-up appointment or tasks
- Invoice

### Interruptions

- Consent or payment issues
- Abnormal pre-op findings
- Schedule delays
- Equipment or supply problems
- Patient instability
- Emergency cases

### Current Pain Points

- Checklists, consents, estimates, and records may be disconnected.
- Surgical timing changes affect the whole clinic.
- Discharge instructions can be repetitive and rushed.
- Post-op follow-up can be inconsistently created.

### Opportunities

- Treat surgery as a coordinated episode of care.
- Improve checklist discipline.
- Connect pre-op, intra-op, post-op, discharge, and follow-up.

### Potential AI Opportunities

- Draft discharge instructions from procedure and medication details.
- Summarize surgical episode for record review.
- Flag missing checklist or consent items.

### Potential Automation

- Surgical checklist tracking
- Consent verification
- Post-op follow-up creation
- Medication and discharge task generation

### Potential Integrations

- Anesthesia monitoring
- Lab
- Pharmacy
- Payments
- Client messaging

### Potential Metrics

- Checklist completion rate
- Surgery start delay
- Discharge instruction completion
- Post-op follow-up rate
- Consent exception rate

## 14. Medication

### Actors

- Veterinarian
- Technician
- Receptionist
- Client
- Pharmacy staff where applicable

### Goals

- Prescribe, dispense, administer, refill, and communicate medication safely.

### Inputs

- Doctor order
- Patient weight and history
- Current medications
- Allergies or alerts
- Inventory availability
- Client instructions
- Refill rules

### Outputs

- Prescription
- Dispensed or administered medication
- Client instructions
- Updated medication history
- Invoice item
- Refill eligibility state

### Interruptions

- Out-of-stock medication
- Dosage questions
- Refill requests
- Client affordability questions
- Drug interaction concerns
- Approval or doctor review required

### Current Pain Points

- Medication context can be separated from visit plan.
- Refill rules depend on memory.
- Inventory gaps are discovered late.
- Instructions are manually repeated.

### Opportunities

- Connect medications to patient context, plan, inventory, and communication.
- Make refill eligibility clear.
- Reduce repetitive instruction writing.

### Potential AI Opportunities

- Draft client instructions for review.
- Summarize refill context for doctor approval.
- Flag missing weight, exam, or monitoring context.

### Potential Automation

- Refill review tasks
- Medication instruction templates
- Inventory checks
- Follow-up reminders tied to medication

### Potential Integrations

- Pharmacy
- Inventory
- Online pharmacy
- Payments
- Client messaging

### Potential Metrics

- Prescription turnaround time
- Refill approval time
- Medication instruction error rate
- Out-of-stock delay rate
- Refill denial reason distribution

## 15. Checkout

### Actors

- Receptionist
- Technician
- Client
- Veterinarian where needed

### Goals

- Complete the visit, explain next steps, collect payment, schedule follow-up, and ensure the client leaves with clarity.

### Inputs

- Completed plan
- Invoice
- Discharge instructions
- Medications
- Follow-up needs
- Payment requirements
- Client questions

### Outputs

- Completed invoice
- Payment or payment plan
- Scheduled follow-up
- Client instructions delivered
- Visit closed or pending exceptions documented

### Interruptions

- Invoice questions
- Missing discharge instructions
- Medication not ready
- Doctor needed for clarification
- Front desk congestion
- Payment issues

### Current Pain Points

- Checkout waits on clinical documentation or medication readiness.
- Client questions reveal missing context.
- Follow-up scheduling can be forgotten.
- Payment and care instructions are handled under time pressure.

### Opportunities

- Prepare checkout before the client reaches the desk.
- Make unresolved visit items visible.
- Connect follow-up directly to the visit plan.

### Potential AI Opportunities

- Summarize visit and next steps in client-friendly language.
- Flag missing discharge or follow-up items.
- Draft post-visit message.

### Potential Automation

- Generate checkout readiness state.
- Create follow-up appointments or reminders.
- Prepare invoice from completed plan.
- Send discharge instructions after review.

### Potential Integrations

- Payments
- Pharmacy
- Scheduling
- Messaging
- Medical record

### Potential Metrics

- Checkout duration
- Time from doctor plan to checkout-ready
- Missing checkout item rate
- Follow-up scheduling rate
- Payment completion rate

## 16. Payment

### Actors

- Receptionist
- Client
- Practice manager
- Hospital owner where escalated

### Goals

- Collect payment accurately and with minimal friction while preserving client trust.

### Inputs

- Invoice
- Estimate
- Deposits
- Payment method
- Financing options
- Account balance
- Discounts or adjustments

### Outputs

- Payment record
- Receipt
- Updated balance
- Financing or payment plan record
- Exception or dispute where applicable

### Interruptions

- Declined card
- Price disputes
- Estimate mismatch
- Financing questions
- Client inability to pay
- Adjustment approval needed

### Current Pain Points

- Financial conversations happen when clients are stressed.
- Estimate-to-invoice differences require explanation.
- Payment exceptions may not connect to visit context.
- Manual reconciliation creates downstream work.

### Opportunities

- Make expected cost and actual invoice easier to explain.
- Reduce payment friction.
- Surface exceptions without embarrassing clients.

### Potential AI Opportunities

- Summarize estimate-to-invoice differences.
- Draft internal notes for payment exceptions.
- Identify recurring adjustment patterns.

### Potential Automation

- Payment links
- Deposits
- Receipts
- Balance reminders
- Reconciliation alerts

### Potential Integrations

- Payment processor
- Financing provider
- Accounting
- Client messaging

### Potential Metrics

- Payment completion time
- Decline rate
- Outstanding balance rate
- Estimate variance
- Payment dispute rate

## 17. Follow-Up

### Actors

- Technician
- Veterinarian
- Receptionist
- Client
- Practice manager

### Goals

- Ensure the patient receives appropriate post-visit care, monitoring, communication, and recheck scheduling.

### Inputs

- Doctor plan
- Discharge instructions
- Diagnostics
- Medication plan
- Client communication preferences
- Follow-up timing

### Outputs

- Completed callback or message
- Recheck appointment
- Updated patient status
- Escalation if patient is not improving
- Closed follow-up task

### Interruptions

- Busy phones
- Client non-response
- New urgent cases
- Missing owner
- Unclear follow-up criteria
- Lab results arriving later

### Current Pain Points

- Follow-up tasks are easy to create but hard to complete reliably.
- Responsibility may be unclear.
- Client responses may not return to patient context.
- Follow-up outcomes are inconsistently documented.

### Opportunities

- Make follow-up accountable and contextual.
- Close the loop between care plan and patient outcome.
- Detect when follow-up should escalate.

### Potential AI Opportunities

- Draft follow-up messages.
- Summarize patient status from client response.
- Flag concerning client language.
- Identify overdue follow-up.

### Potential Automation

- Follow-up task creation from plan
- Scheduled messages
- Escalation rules for non-response
- Recheck reminders

### Potential Integrations

- SMS/email
- Client portal
- Scheduling
- Medical record

### Potential Metrics

- Follow-up completion rate
- Time to follow-up
- Client response rate
- Recheck conversion
- Escalation rate

## 18. Prescription Refill

### Actors

- Client
- Receptionist
- Technician
- Veterinarian
- Pharmacy staff where applicable

### Goals

- Determine refill eligibility, approve or decline safely, prepare medication, and communicate outcome.

### Inputs

- Refill request
- Patient medication history
- Last exam date
- Lab monitoring requirements
- Doctor authorization
- Inventory availability
- Client pickup or shipping preference

### Outputs

- Approved refill
- Declined refill with explanation
- Doctor review task
- Filled medication
- Client notification
- Invoice or payment

### Interruptions

- Missing exam or lab requirement
- Doctor unavailable
- Medication out of stock
- Client urgency
- Conflicting medication history

### Current Pain Points

- Eligibility rules are often remembered manually.
- Refill requests arrive through many channels.
- Clients may not understand why a refill is blocked.
- Staff repeatedly check the same context.

### Opportunities

- Make refill eligibility visible.
- Route only true exceptions to doctors.
- Communicate requirements clearly.

### Potential AI Opportunities

- Summarize refill context for doctor review.
- Draft client explanation for blocked refills.
- Identify missing monitoring or overdue exam.

### Potential Automation

- Refill intake
- Eligibility checks
- Doctor approval routing
- Client pickup notifications
- Payment link generation

### Potential Integrations

- Pharmacy
- Inventory
- Online pharmacy
- Messaging
- Payments

### Potential Metrics

- Refill turnaround time
- Doctor review rate
- Blocked refill reason distribution
- Client repeat contact rate
- Out-of-stock refill delay

## 19. Emergency Arrival

### Actors

- Receptionist
- Technician
- Veterinarian
- Client
- Practice manager where needed

### Goals

- Rapidly assess urgency, stabilize the patient, gather critical context, and adjust clinic flow.

### Inputs

- Presenting emergency
- Patient identity if known
- Client description
- Vital signs
- Prior medical history if available
- Staff and room availability

### Outputs

- Triage status
- Stabilization actions
- Emergency record
- Estimate or consent where appropriate
- Adjusted schedule and staffing
- Client communication

### Interruptions

- The emergency itself
- Other appointments
- Missing patient history
- Client distress
- Need for immediate consent
- Staff reallocation

### Current Pain Points

- Speed and documentation are in tension.
- Patient identity or history may be unavailable.
- Schedule impact is hard to manage.
- Communication with waiting clients becomes reactive.

### Opportunities

- Support fast triage without losing record integrity.
- Make emergency impact visible to the rest of the clinic.
- Preserve essential context during chaos.

### Potential AI Opportunities

- Summarize available history quickly.
- Draft stabilization timeline from captured events.
- Suggest missing triage information for staff review.

### Potential Automation

- Emergency triage record creation
- Staff alerting
- Schedule impact flags
- Critical task checklist

### Potential Integrations

- Medical record
- Monitoring equipment
- Payments
- Messaging
- Referral or emergency hospital systems

### Potential Metrics

- Arrival-to-triage time
- Arrival-to-doctor time
- Critical documentation completeness
- Schedule disruption impact
- Emergency consent time

## 20. Walk-Ins

### Actors

- Receptionist
- Client
- Technician
- Veterinarian
- Practice manager where needed

### Goals

- Determine whether and how the clinic can serve an unscheduled patient without compromising existing care.

### Inputs

- Client request
- Patient identity and status
- Presenting concern
- Current schedule
- Staff capacity
- Clinic policy

### Outputs

- Accepted walk-in
- Scheduled future appointment
- Referral or emergency recommendation
- Triage note
- Client communication

### Interruptions

- Lobby pressure
- Client urgency
- Unclear severity
- Full schedule
- Staff disagreement about capacity

### Current Pain Points

- Capacity decisions are informal.
- Front desk bears emotional burden.
- Clinical urgency can be hard to judge.
- Accepted walk-ins can destabilize the day.

### Opportunities

- Make capacity and triage criteria clearer.
- Protect staff from unsupported decisions.
- Preserve walk-in context even if not seen.

### Potential AI Opportunities

- Extract urgency signals from client description.
- Draft routing or referral message.
- Summarize walk-in context for technician review.

### Potential Automation

- Walk-in triage record
- Capacity check
- Referral instructions
- Follow-up scheduling

### Potential Integrations

- Scheduling
- Messaging
- Referral hospitals
- Medical record

### Potential Metrics

- Walk-in acceptance rate
- Walk-in wait time
- Schedule impact
- Referral rate
- Triage escalation rate

## 21. Inventory Ordering

### Actors

- Practice manager
- Technician
- Receptionist where pharmacy is involved
- Vendor
- Hospital owner where spending is escalated

### Goals

- Maintain adequate supplies and medications without overstock, stockouts, or waste.

### Inputs

- Current inventory
- Usage patterns
- Upcoming appointments or surgeries
- Reorder points
- Expiration dates
- Vendor availability and pricing
- Purchase approvals

### Outputs

- Purchase order
- Updated inventory
- Stockout or substitution plan
- Receiving record
- Cost visibility

### Interruptions

- Urgent medication need
- Vendor backorder
- Incorrect counts
- Expiring inventory
- Budget constraints
- Staff using supplies without recording usage

### Current Pain Points

- Inventory accuracy is difficult to maintain.
- Stockouts are discovered during care.
- Ordering depends on one person's memory.
- Usage does not always connect to billing or treatment.

### Opportunities

- Connect inventory to actual clinical usage.
- Surface ordering risk before it affects care.
- Reduce manual count and reconciliation.

### Potential AI Opportunities

- Identify unusual usage patterns.
- Forecast reorder needs.
- Summarize stockout risk.
- Suggest cleanup of inconsistent item naming.

### Potential Automation

- Reorder alerts
- Purchase order drafts
- Expiration warnings
- Usage-based decrementing

### Potential Integrations

- Vendors and distributors
- Pharmacy
- Invoicing
- Treatment records
- Accounting

### Potential Metrics

- Stockout rate
- Inventory variance
- Expired inventory cost
- Order cycle time
- Usage-to-billing mismatch

## 22. Internal Communication

### Actors

- Receptionist
- Technician
- Veterinarian
- Practice manager
- Hospital owner where escalated

### Goals

- Coordinate work, transfer context, resolve questions, and keep patient care moving.

### Inputs

- Patient status
- Client requests
- Task ownership
- Visit stage
- Doctor decisions
- Operational exceptions
- Staff availability

### Outputs

- Answered questions
- Updated tasks
- Clear handoffs
- Escalations
- Shared understanding of patient or clinic state

### Interruptions

- Everything in the clinic competes with internal communication.
- Verbal questions happen while staff are mid-task.
- Messages arrive without enough context.
- Urgent and non-urgent communication mix together.

### Current Pain Points

- Verbal communication is fast but lossy.
- Written communication can become another inbox.
- Context is often missing from the question.
- Task ownership is implied rather than explicit.

### Opportunities

- Attach internal communication to patient, visit, task, or operational context.
- Preserve handoffs without making every message formal.
- Separate urgent interruption from asynchronous awareness.

### Potential AI Opportunities

- Summarize patient-specific internal threads.
- Extract tasks from messages.
- Identify unresolved questions.
- Draft handoff notes.

### Potential Automation

- Task creation from messages
- Context attachment
- Escalation timers
- Handoff summaries

### Potential Integrations

- Messaging
- Task management
- Medical record
- Scheduling
- Notifications

### Potential Metrics

- Unresolved internal message count
- Task creation from communication
- Handoff completeness
- Repeat question rate
- Time to answer blocking questions

## 23. Closing Procedures

### Actors

- Receptionist
- Technician
- Veterinarian
- Practice manager
- Hospital owner where needed

### Goals

- Close the clinic without losing unresolved patient, client, financial, inventory, or operational work.

### Inputs

- Today's visits
- Open invoices or payments
- Pending callbacks
- Unreviewed lab results
- Hospitalized patient status
- Incomplete notes
- Inventory exceptions
- Tomorrow's schedule

### Outputs

- Completed closing checklist
- Known unresolved work
- Handoff for next day
- Balanced payments where applicable
- Completed or assigned follow-ups
- Ready state for opening

### Interruptions

- Late appointments
- Emergency arrivals
- Client calls near close
- Incomplete doctor notes
- Payment reconciliation issues
- Hospitalized patient changes

### Current Pain Points

- Staff are tired and time-compressed.
- Unfinished work is easy to defer vaguely.
- Next-day risk is often discovered in the morning.
- Closing depends on memory and local habits.

### Opportunities

- Convert the day into a clean handoff.
- Make unresolved work explicit.
- Reduce next-day surprise.

### Potential AI Opportunities

- Summarize unresolved work.
- Draft next-day handoff.
- Identify incomplete records, callbacks, and lab follow-ups.
- Highlight tomorrow's schedule risks.

### Potential Automation

- Closing checklist
- Payment reconciliation flags
- Incomplete documentation reminders
- Next-day preparation summary

### Potential Integrations

- Payments
- Scheduling
- Lab
- Messaging
- Inventory
- Medical record

### Potential Metrics

- Closing duration
- Unresolved task count
- Incomplete note count
- Payment reconciliation exceptions
- Next-day surprise issues

## Cross-Workflow Observations

Most clinic friction appears at boundaries:

- Between client communication and patient record
- Between plan and estimate
- Between approval and treatment
- Between diagnostic result and follow-up
- Between completed work and documentation
- Between checkout and future care
- Between closing and opening

The highest-value product opportunities are likely to live where context changes hands.

## Open Questions

- Which workflows are universal across the first target clinic segment?
- Which workflow boundaries create the most measurable friction?
- Which workflows must be excellent before a clinic can safely replace its incumbent system?
- Which workflows expose the most important migration requirements?
- Which AI opportunities remove work without creating review burden?

## Notes

This atlas should be revised through observation, customer interviews, implementation learnings, and support feedback.

Do not turn this into a feature list. The job of this document is to preserve operational reality.

## Related Documents

### References

- [Product Constitution](./00-product-constitution.md)
- [Sparki Thesis](./03-sparki-thesis.md)
- [Veterinary Mental Models](./04-veterinary-mental-models.md)
- [Clinic Workflows](../research/06-clinic-workflows.md)

### Depends On

- [Product Constitution](./00-product-constitution.md)
- [Sparki Thesis](./03-sparki-thesis.md)
- [Veterinary Mental Models](./04-veterinary-mental-models.md)

### Referenced By

- TODO: Add links as workflow specs, patient workspace specs, AI strategy, migration strategy, and ADRs reference this atlas.

### Future Work

- TODO: Validate each workflow through direct clinic observation.
- TODO: Add sequence diagrams only after real workflow evidence is collected.
- TODO: Identify workflow-specific source-of-truth ownership.
- TODO: Map each workflow to first-release product readiness criteria.
