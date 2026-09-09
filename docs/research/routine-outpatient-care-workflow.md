# Routine Outpatient Veterinary Care Workflow

## Executive finding

The routine outpatient workflow should keep four different clinical facts separate: the veterinarian's assessment, the veterinarian's order, the team's record of performance, and any later diagnostic result or interpretation. A required generic outcome field immediately after an order is created is not an appropriate bridge between those facts. It encourages premature or duplicative documentation and places execution work in the veterinarian's planning step.

The recommended Sparki workflow is:

1. **Exam and assessment — veterinarian:** establish the problem or working diagnosis and clinical rationale.
2. **Care plan and orders — veterinarian:** specify the diagnostic, treatment, medication, monitoring, and follow-up orders needed for this patient.
3. **Care execution — credentialed technician, assistant where legally permitted, or veterinarian:** record that the ordered task was performed, who performed it, and when. Capture structured medication administration details. Require additional prose only for a variance, complication, failed attempt, or material handoff fact.
4. **Results and interpretation — system/team then veterinarian:** attach or enter the diagnostic result separately; preserve the veterinarian's interpretation separately from specimen collection or test performance.
5. **Discharge — veterinary team:** assemble performed care, medication directions, monitoring instructions, and follow-up from the authoritative information already recorded.

This is a product workflow recommendation, not legal advice. Veterinary technician scope and required supervision vary by jurisdiction and clinic policy.

## Evidence

AAHA's standardized outpatient workflow assigns the veterinarian the working diagnosis, therapeutic plan, recommendations, prescriptions, and planned case-management check-ins. It assigns the credentialed veterinary technician and team the nursing plan, execution of diagnostics and therapeutic care, discharge information, and follow-up.^1 AAHA also recommends using credentialed technicians for diagnostics ordered by the veterinarian and for treatment administration so veterinarians can focus on diagnosis, prognosis, prescribing, and surgery.^2

The AAVSB's 2025 model medical-record regulations list intended treatment plans separately from information and images obtained by diagnostic testing, medication-prescription details, and documentation of procedures performed.^3 This separation supports distinct order, performance, result, and interpretation records instead of a single generic outcome field.

The RCVS's current clinical-record guidance likewise requires a complete and relevant history containing examinations, treatments given, test results, proposed or ongoing investigation plans, the people providing care, and client advice. It says entries should be objective, factual, and made contemporaneously or as soon as reasonably practicable after the event.^4 Although this is UK guidance rather than U.S. law, it provides a clear record-design principle: document each fact when it occurs and do not represent an intended plan as a completed event.

The AAVSB model scope-of-practice regulation permits veterinary technicians to perform animal-health tasks under a veterinarian's direction, supervision, and responsibility within an established VCPR, while actual scope remains jurisdiction-specific.^5 This supports role-aware execution without turning the veterinarian's order-entry screen into a mandatory completion form.

## Product requirements

### Veterinarian care-plan step

Keep:

- care type;
- concise order name;
- indication or instructions when the title alone is insufficient;
- medication dose, route, frequency, duration, and disposition when applicable;
- monitoring or escalation instructions when applicable;
- ordering veterinarian and timestamp, captured automatically.

Remove:

- client-decision gating from the routine order-entry flow;
- execution or outcome fields;
- warnings that describe a newly created valid order as an unresolved plan problem;
- repeated performer/time entry that Sparki can attribute automatically;
- prose fields whose only purpose is to restate structured data.

### Care-execution step

For a routine diagnostic, use **Mark test performed**. This records performance, not the result. Result data and veterinarian interpretation belong to later, separate events.

For a routine treatment, use **Mark treatment performed**. A prose note is optional and should be used only for a variance, complication, failed attempt, patient response that matters immediately, or handoff detail.

For medication, use **Record administration** or **Record dispensing**, depending on the order. Capture the actual dose/quantity, unit, route, site when relevant, performer, timestamp, and inventory trace where required. Do not ask for a second narrative when administration matched the order.

For every execution type, provide an exception path rather than forcing an invented successful outcome. Examples include not performed, partially performed, failed attempt, order clarification needed, and patient/client constraint. The reason becomes required only on that exception path.

### Role behavior

- Veterinarians can view execution and perform care when clinically appropriate, but planning should remain their primary action.
- Credentialed technicians should receive ordered care as an actionable queue and document delegated execution within applicable law and clinic policy.
- Assistants should see only tasks the clinic and jurisdiction permit them to perform.
- Receptionists should not receive clinical execution controls.

## Implemented correction

Sparki now removes the required generic outcome field. Routine diagnostics and treatments can be marked performed with one action; an optional note remains for exceptions or meaningful handoff information. Medication retains structured administration fields. Performer and recording time continue to be captured automatically. Diagnostic performance is labeled as performance rather than a diagnostic result.

## Remaining bounded follow-up

The data model should eventually provide dedicated diagnostic-result and veterinarian-interpretation events, plus explicit exception statuses for not performed, partially performed, failed attempt, and clarification required. Those additions should be implemented as a separate clinical-integrity slice because they affect lifecycle rules, discharge blockers, record assembly, and reporting.

## Sources

1. American Animal Hospital Association. “[Standardized Workflow for Optimal Utilization](https://www.aaha.org/resources/2023-aaha-technician-utilization-guidelines/standardized-workflow-for-optimal-utilization-table-5-2/).” 2023 AAHA Technician Utilization Guidelines, September 30, 2023.
2. American Animal Hospital Association. “[From the Guidelines: 3 Ways to Improve Technician Utilization](https://www.aaha.org/trends-magazine/publications/from-the-guidelines-3-ways-to-improve-technician-utilization/).” 2025.
3. American Association of Veterinary State Boards. “[Model Regulations: Medical Recordkeeping](https://www.aavsb.org/wp-content/uploads/2025/08/2025-Model-Regulations-Medical-Recordkeeping_-1.pdf).” 2025.
4. Royal College of Veterinary Surgeons. “[Clinical and Client Records](https://www.rcvs.org.uk/veterinary-professionals/conduct-and-guidance/supporting-guidance/13-clinical-and-client-records).” Updated April 24, 2026.
5. American Association of Veterinary State Boards. “[Model Regulations: Scope of Practice for Veterinary Technicians and Technologists](https://www.aavsb.org/wp-content/uploads/2026/03/2_Scope-of-Practice_Model-Documents_2026.pdf).” 2026.
