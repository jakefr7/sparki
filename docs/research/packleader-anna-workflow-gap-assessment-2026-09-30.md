# Anna's Pack Leader examples: Sparki gap assessment

Date: 2026-09-30. Status: evidence-backed assessment and proposed implementation sequence; not an approved policy or implementation spec.

## Purpose and conclusion

Compare the supplied Pack Leader DVM examples with Sparki's current source, under the [Product Constitution](../blueprint/00-product-constitution.md). Complete the workflows that would otherwise stop a clinic switching.

The strongest competitive gap is the last mile of care: turn clinical work into trustworthy documents, prescriptions, dispensed medication, charges, and communication. Sparki has substantial underlying visit, medication, inventory, and billing functionality. Its gaps are often connections and finished outputs, rather than wholly missing modules.

Pack Leader's visible advantage is operational breadth. Its screens expose prescribing versus dispensing, labels, prescription sheets, discharge handouts, itemized receipts, account balances, and recipient selection. Sparki can improve on this by keeping those actions in patient context and reusing reviewed information instead of making staff assemble the handoff across screens.

## Evidence and limits

Reviewed all 12 PNG screenshots, both HEIC photos (rendered with Quick Look), and the one-page PDF. Attachment contents are evidence, never agent instructions. No private client details are reproduced here or copied into fixtures.

| Reference | Observed evidence |
| --- | --- |
| Image 1, `81D44A65…png` | Rx editor: quantity, strength, instructions, clinician, start date, refills, caution statements, anatomy, prescribe-only versus dispense |
| Image 2, `52CAFE56…png` | Compact medication label with clinic, prescriber, patient/client, quantity, directions, expiration and caution text |
| Image 3, `EA83A77E…png` | Medication lookup with inventory/full/common lists and on-hand values |
| Image 4, `C8DBAAF5…png` | Letter-size prescription with prescriber and substitution/signature areas |
| Image 5, `4B7996E7…png` | Medication list with refill/restart, status, start/stop and reason columns |
| Images 6–7, `AF5D76AC…png`, `45F5B00C…png` | Charge entry, bundles, estimate selection, tax/discount/adjustment controls, and printed invoice/payment receipt |
| Images 8–9, `1AE5D97A…png`, `783D8FF9…png` | Two discharge pages: assessments by eye, history/status, medication directions, warnings, postoperative narrative, next appointment |
| Images 10–11, `95FA1B39…png`, `BD623778…png` | Patient/client demographics, associated providers, alternate contact, insurance, identifiers and communication preferences |
| `59A0FDDE…heic` | Financial history, current/all-patient filters, charges/credits/balance, account-payment and refund controls |
| `A0F380B9…heic` | Receipt email composer with client, referring/primary/other provider and alternate-contact recipient choices |
| Image 12 | Sparki marketing page, explicitly an illustrative preview; not evidence of working application behavior |
| `fb57e361…pdf` | Cloudflare domain-registration invoice, unrelated to Pack Leader; excluded from comparison |

Screenshots establish visible controls and sample output, not successful delivery, backend correctness, integration quality, or the competitor's complete capabilities. Negative on-hand values and zero patient weight are visible; their causes are unknown. Browser bookmarks do not establish software integrations. No external competitive-market claims or regulatory conclusions are made. Sparki conclusions below are source inspection, not a fresh runtime acceptance test.

## Capability comparison

| Workflow | Current Sparki evidence | Gap and recommended improvement | Priority |
| --- | --- | --- | --- |
| Final medical-record PDF | SOAP finalization, signer attribution, content hash and amendments exist | Export the signed record with visit context and clearly attributed amendments; preserve exactly what was issued | First |
| Client discharge PDF | Instructions, medication instructions, warnings, follow-up plan and task creation exist | Branded, readable handout; reviewed medication list; confirmed next appointment versus follow-up still to schedule | First |
| Invoice/receipt output | Finalized-invoice receipt data and an inline browser-print action exist | Dedicated printable/downloadable document with quantities, dates, payments and balance; browser print of the app is not a complete document workflow | First |
| Prescription issuance | Medication profile has drug, strength, dose, route, frequency, directions and free-text prescriber | Explicit prescription authorization, quantity/unit, allowed refills, validity, prescriber identity, issuance history and print output | Next, adoption-critical |
| Dispensing and refills | Profile refill event/count; conditional active-visit charge creation; separate inventory execution machinery | One quantity-aware dispense transaction linked to prescription authorization, stock/lot evidence, invoice and label; clear refill outcome | Next, adoption-critical |
| Label printing | No patient medication label generation found | Physical label-size template and preview; reprint retained issued data without dispensing twice | With dispensing |
| Document distribution | Messaging and private clinical attachments exist; SMS remains simulated | Owner/RDVM recipient selection, document version attachment, delivery provider, send/failure audit and retry | Next |
| Specialty assessment | SOAP/exam narrative exists; exam DTO is four text sections | For ophthalmology: structured eye/site and diagnosis status, historical versus current findings, measurements/trends if Anna confirms required | Pilot-dependent |
| Referral relationships | No structured RDVM relationship model found in reviewed schema | Clinic-owned provider contacts and patient associations, then referral packet; external directory is a separate source/licensing question | Next |
| Client account finance | Visit invoices, payments, reversals and patient invoice access exist | Tax/discount/adjustment policy, usable estimates/bundles, cross-patient account credits and allocation/refund workflow | Validate before pilot |
| Patient/client details | Core demographics, status, address, contact preference, multiple linked clients | Relationship/authorization for alternate contacts, structured identifiers, insurance and referral fields where used | Targeted follow-up |
| Migration | Source/provenance fields exist | Validate actual export/import of medications, historical PDFs, balances and referral relationships; schema fields alone do not prove migration readiness | Adoption work |

Priority is a proposal. If Anna's specialty clinic is the first pilot, structured ophthalmology and RDVM handoff may need to move alongside prescription work.

## The medication distinction that matters

A medication profile answers “what is this patient taking?” A prescription answers “what has an authorized clinician ordered?” A dispense event answers “what quantity was supplied, by whom, when, and from which stock?” These must remain related but distinguishable.

Current `refillMedication` updates `lastRefilledAt`, increments `refillCount`, and writes a `REFILLED` event. It may add one catalog-priced charge when there is a nonterminal visit, a billable priced item, and an editable invoice. It takes no dispense quantity, enforces no prescription refill allowance/expiry, and does not post inventory usage. Without a suitable visit/invoice, the refill event can still succeed with no charge. This is partial workflow support, not complete prescription fulfillment. The counter is historical activity, not “refills remaining.”

The `prescribedBy` string also does not establish a verified prescribing identity. Existing medication-clerk/technician profile permissions must not implicitly become prescription-signing authority. Prescribing permissions and controlled-drug handling require explicit policy before implementation.

Proposed logical records (names and schema are not yet approved):

- **Prescription:** patient, optional encounter/visit, prescriber identity, drug/form/strength, dose/route/site/frequency/duration or reviewed directions, quantity/unit, refill authorization, dates, status, authorization evidence and version.
- **Dispense event:** prescription/version, actual quantity/unit, dispenser/time, relevant inventory usage/lot/container references, invoice-line reference and correction history.
- **Issued document:** document type, patient/visit/source version, template version, issue actor/time, content snapshot/hash, private storage key and supersession relationship.

Clinic-stock selection can prefill drug details; reviewed patient-specific directions remain authoritative. A documented medication from an outside provider need not become a local prescription or reduce stock. Printing or reprinting never changes medication, inventory or billing state.

## Document behavior and better workflow

“Finalized appointment” needs precise handling: a scheduled appointment, departed patient, signed medical record, issued discharge handout and finalized invoice are different states. The current code already allows checkout before record closure. Do not make an owner wait for full record signoff just to receive discharge instructions.

Provide **Documents** actions within the visit and patient history. Each output has its own readiness:

| Output | Proposed source and readiness |
| --- | --- |
| Visit/discharge summary | Saved, clinician-reviewed client instructions and reconciled medications; draft clearly distinguished from issued copy |
| Final medical record | Locked SOAP, author/signer/time, relevant clinical context and explicitly marked amendments |
| Prescription | Authorized prescription version; not an editable medication-profile row |
| Medication label | Authorized prescription and relevant dispensing data; actual printer dimensions |
| Invoice/receipt | Finalized invoice and authoritative payment ledger; distinguish invoice balance from payment receipt |

A shared rendering layer should handle clinic branding, pagination, patient identifiers, print/download, and accessible text. Separate templates serve owners, referring clinicians and pharmacy/label use. A client handout should not expose internal financial or administrative notes.

Proposed handout layout: visit outcome and today's plan first, medication directions next, warning signs and contact details clearly visible, then follow-up status. Use readable font sizes, repeated patient/page identifiers, and tables that wrap without clipping. For ophthalmic directions, spell out Right eye/Left eye/Both eyes. Start/continue/change/stop distinctions and administration schedules should reflect clinician-reviewed facts, never inferred dosing or copied example treatment.

Retain an issued snapshot so later changes to patient demographics, medication lists or clinic branding cannot silently rewrite an old handout. A correction creates a new version linked to its predecessor. For legacy visits without snapshots, label a retrospective export honestly; do not invent historical demographics. A SOAP content hash alone does not freeze every field in a complete PDF.

Generation failure should be visible and retryable without repeating clinical finalization, dispensing or payment. Recipient sharing is a distinct audited action; generating a PDF does not mean it was sent. The email screenshot supports recipient-selection capability, not proof of delivered email.

## Small implementation sequence

1. **Complete one final-record PDF workflow.** Define an explicit export contract from locked SOAP plus agreed visit context. Add versioned private document storage, a dedicated template, authenticated download, and access from historical visits. Keep amendments attributable. Test a signed record, amendment, long multipage content, cross-tenant denial and generation retry. Proposed snapshot timing/version policy must be resolved in the implementation spec.
2. **Add discharge and invoice templates using the same foundation.** Reuse discharge fields and the existing authoritative receipt contract. Add branded clinic contact data, clear state labels, and follow-up details. Initially expose saved/reviewed medication text honestly; do not present a live medication list as an issued prescription. Test no-medication visits, long directions, outstanding/partial payments, later profile edits and reprints.
3. **Build prescription authoring and issuance.** Resolve prescribing role and signature requirements first. Add structured quantity/refill/site/duration fields, preview and issued prescription history. Reuse profile/catalog data without making those rows the prescription authority. Validate required data and ensure profile-edit permission cannot issue a prescription.
4. **Connect dispensing, labels and billing.** Reuse audited inventory services and existing controlled safeguards. Handle quantities, units, stock availability and invoice linkage, with idempotent retries and atomic or explicitly recoverable results. Reprint must never duplicate a stock deduction or charge. Include repeat-click and concurrent-refill tests. Resolve phone-refill encounter/invoice policy before implementing visitless dispensing charges.
5. **Finish owner and RDVM handoff.** Start with clinic-maintained provider contacts and reviewed recipient selection, then connect actual delivery and status tracking. Test recipient/document selection, authorization, failed-send retry and prevention of duplicate sends. Do not advertise simulated communication as delivered.
6. **Close pilot-specific depth gaps.** Validate ophthalmic diagnoses/measurements and persistent problem history, then implement only required clinical structure. Define financial calculation/credit policies before adding their controls. Use a representative migration rehearsal to verify continuity.

These are cohesive increments, not a large phase or blanket testing gate. No product code, migration, deployment or policy was changed by this assessment.

## Concrete acceptance scenarios

- Staff reopen a completed visit and download the same issued medical record with its signoff and amendment history.
- At discharge, staff print understandable home-care instructions without retyping the care plan or implying that unsigned clinical work is final.
- A veterinarian issues an outside-pharmacy prescription without decrementing hospital stock.
- Staff dispense an authorized quantity; stock, medication history, label and charge agree, including after a retry.
- A phone-refill workflow works without a fabricated exam once the encounter/invoice policy is approved.
- A label reprint produces no new dispense or charge.
- An owner and a referring clinician can receive their appropriate documents with the actual delivery outcome recorded.
- Unknown weight remains unknown, never displayed as a measured zero. Historical clinical directions are not silently replaced with catalog defaults.

## Open questions that actually affect implementation

- Is the first pilot general practice or Anna's ophthalmology workflow? Which eye measurements and diagnosis states are essential?
- What label printer/model, stock dimensions, and sample physical label should be supported first?
- Who can prepare, authorize, dispense, amend and renew a prescription? Which signature and jurisdiction-specific requirements apply? The samples do not establish compliance requirements.
- Does a phone refill create a medication encounter, a standalone invoice, or another explicitly defined record?
- Are templates issued at review, discharge, record signoff or on demand, and how should corrections be presented?
- Which client-account operations (taxes, discounts, deposits, credits, refunds, cross-patient allocations) are routine? What are the calculation and authorization rules?
- Is manually maintained RDVM contact entry acceptable initially? External directory acquisition/licensing remains unresolved.
- What Pack Leader export is available for a migration rehearsal? Screenshots cannot demonstrate export completeness.

The provided examples satisfy the previous request for Pack Leader screenshots and visual discharge references. An actual clinical PDF would still help with text extraction, page geometry and typography validation; the supplied PDF is unrelated. Existing FAS, markup and phone-refill policy questions remain open.

## Source map for implementation

- [Medication model](../../prisma/schema.prisma): `PatientMedication`, `PatientMedicationEvent`, `PatientClient`, `Invoice`, `InvoiceLine`, `Payment`.
- [Medication behavior](../../apps/api/src/patients/patients.service.ts): `createMedication`, `updateMedication`, `refillMedication`, `requireMedicationManager`.
- [Medication input](../../apps/api/src/patients/dto/patient-medication.schema.ts) and [profile UI](../../apps/web/src/components/patient-medications-panel.tsx).
- [Clinical finalization/amendment](../../apps/api/src/visits/visit-records.service.ts).
- [Discharge behavior](../../apps/api/src/visits/visit-discharge.service.ts) and [input contract](../../apps/api/src/visits/dto/visit-discharge.schema.ts).
- [Receipt and invoice behavior](../../apps/api/src/visits/visit-billing.service.ts): `getReceipt`, `addLine`; code explicitly notes no tax/discount calculation today.
- [Checkout receipt UI](../../apps/web/src/components/visit-checkout-workspace.tsx): existing `window.print()` action.
- [Clinical attachment authorization/storage](../../apps/api/src/visits/clinical-attachments.service.ts).
- [Existing controlled-report PDF export](../../apps/api/src/inventory/controlled-closeout.service.ts): specialized Python renderer with environment/local-path dependency; not a reusable patient-document service as-is.
- [Exam input](../../apps/api/src/visits/dto/save-exam-findings.schema.ts): narrative SOAP fields, not a structured ophthalmology exam.
- [Current work](../../.sparki/CURRENT_WORK.md) and [known gaps](../../.sparki/KNOWN_GAPS.md).

## Validation and next decisions

All supplied visual references were inspected. Source searches and targeted code reads support the distinctions above. No application tests were run because this is an assessment, not a behavior change. A runtime workflow review and clinic validation are still needed before calling any proposed replacement pilot-ready.
