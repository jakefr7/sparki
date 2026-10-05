'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { VisitDocumentDownload } from './visit-document-download';
import { useVisitStep } from './visit-care-sections';
import type { VisitDetail, DischargeGuidance, DischargeMedication } from '../lib/patient-types';
import { useCurrentUser } from '../lib/use-current-user';

type Draft = { instructions: string; medicationInstructions: string; warningSigns: string; followUpPlan: string; followUpRequired: boolean; clientGuidance: DischargeGuidance };
function savedDraft(discharge: VisitDetail['discharge']): Draft {
  return { instructions: discharge?.instructions ?? '', medicationInstructions: discharge?.medicationInstructions ?? '', warningSigns: discharge?.warningSigns ?? '', followUpPlan: discharge?.followUpPlan ?? '', followUpRequired: discharge?.followUpRequired ?? false, clientGuidance: { ...discharge?.clientGuidance, medications: discharge?.clientGuidance?.medications ?? [] } };
}
const guidanceFields = [['visitSummary', 'Visit summary', 'Reason for the visit, diagnosis, and treatment or tests performed.'], ['diet', 'Diet / feeding', 'Food, amount, and feeding instructions when relevant.'], ['activity', 'Activity / restrictions', 'Activity limits and how long they apply.'], ['urgentSigns', 'Seek urgent veterinary care', 'Signs that require immediate care and what the client should do.'], ['emergencyContact', 'Emergency / after-hours contact', 'Hospital name, phone number, and any access instructions.']] as const;
const medicationFields = [['name', 'Medication'], ['dose', 'Dose'], ['route', 'Route'], ['frequency', 'Frequency'], ['duration', 'Duration'], ['nextDose', 'Next dose'], ['specialInstructions', 'Special instructions']] as const;
const fields = [['instructions', 'Home care'], ['medicationInstructions', 'Medication directions'], ['warningSigns', 'When to call the clinic'], ['followUpPlan', 'Follow-up']] as const;

export function VisitDischargePanel({ visit }: { visit: VisitDetail }) {
  const router = useRouter();
  const step = useVisitStep();
  const { user } = useCurrentUser();
  const [draft, setDraft] = useState(() => savedDraft(visit.discharge));
  const [saved, setSaved] = useState(visit.discharge);
  const lastSource = useRef(visit.discharge);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const readOnly = Boolean(visit.checkout) || ['Archived', 'ArchivedWithExceptions', 'Cancelled', 'NoShow'].includes(visit.state);
  const canDischarge = !readOnly && ['OWNER', 'VETERINARIAN', 'TECHNICIAN', 'ASSISTANT'].includes(user?.role ?? '');
  const canCheckout = ['OWNER', 'PRACTICE_MANAGER', 'RECEPTIONIST'].includes(user?.role ?? '');
  // Refreshes hydrate canonical content without erasing an in-progress edit.
  useEffect(() => {
    if (!dirty && lastSource.current !== visit.discharge) { lastSource.current = visit.discharge; setDraft(savedDraft(visit.discharge)); setSaved(visit.discharge); }
  }, [visit.discharge, dirty]);

  async function saveDischarge(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft.instructions.trim()) { setError('Add reviewed home-care instructions before continuing.'); return; }
    if (draft.followUpRequired && !draft.followUpPlan.trim()) { setError('Describe the required follow-up plan.'); return; }
    for (const [index, medication] of draft.clientGuidance.medications.entries()) {
      if (['name', 'dose', 'route', 'frequency', 'duration'].some((key) => !medication[key as keyof DischargeMedication]?.trim())) {
        setError(`Complete medication ${index + 1}: medication, dose, route, frequency, and duration are required.`); return;
      }
    }
    setSaving(true); setError(null);
    try {
      const response = await fetch(`/api/visits/${visit.id}/discharge`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ instructions: draft.instructions.trim(), clientGuidance: { ...draft.clientGuidance, recheckDate: draft.clientGuidance.recheckDate || null }, medicationInstructions: draft.medicationInstructions.trim() || null, warningSigns: draft.warningSigns.trim() || null, followUpPlan: draft.followUpPlan.trim() || null, followUpRequired: draft.followUpRequired }),
      });
      const body = await response.json() as NonNullable<VisitDetail['discharge']> & { message?: string };
      if (!response.ok) throw new Error(body.message ?? 'Could not save discharge.');
      setSaved(body); setDraft(savedDraft(body)); setDirty(false);
      router.refresh();
      if (step) step.next();
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not save discharge.'); }
    finally { setSaving(false); }
  }

  function updateGuidance(key: keyof DischargeGuidance, value: string) {
    setDraft((current) => ({ ...current, clientGuidance: { ...current.clientGuidance, [key]: value } })); setDirty(true);
  }
  function updateMedication(index: number, key: keyof DischargeMedication, value: string) {
    setDraft((current) => ({ ...current, clientGuidance: { ...current.clientGuidance, medications: current.clientGuidance.medications.map((medication, i) => i === index ? { ...medication, [key]: value } : medication) } })); setDirty(true);
  }
  const clinician = visit.primaryVeterinarian;
  const clinicianName = clinician ? clinician.displayName || `${clinician.firstName} ${clinician.lastName}` : 'Not assigned';
  const savedSections: Array<{ title: string; text: string; urgent?: boolean }> = [];
  function preview(title: string, text: string | null | undefined, urgent = false) { if (text) savedSections.push({ title, text, urgent }); }
  if (saved) {
    const guidance = saved.clientGuidance;
    preview('Visit summary', guidance?.visitSummary);
    preview('Seek urgent veterinary care', guidance?.urgentSigns, true);
    preview('Emergency / after-hours contact', guidance?.emergencyContact, true);
    preview('Home care', saved.instructions);
    preview('Diet / feeding', guidance?.diet);
    preview('Activity / restrictions', guidance?.activity);
    for (const medication of guidance?.medications ?? []) preview(`Medication: ${medication.name}`, [
      `Dose: ${medication.dose}`, `Route: ${medication.route}`, `Frequency: ${medication.frequency}`, `Duration: ${medication.duration}`,
      `Next dose: ${medication.nextDose || 'Not recorded'}`, medication.specialInstructions && `Special instructions: ${medication.specialInstructions}`,
    ].filter(Boolean).join('\n'));
    preview('Medication directions', saved.medicationInstructions);
    preview('When to call the clinic', saved.warningSigns);
    const recheck = guidance?.recheckDate ? `Recheck date: ${new Date(`${guidance.recheckDate}T12:00:00Z`).toLocaleDateString('en-US', { timeZone: 'UTC', dateStyle: 'medium' })}` : '';
    preview('Follow-up', [recheck, saved.followUpPlan].filter(Boolean).join('\n'));
  }
  return <>
    <section id="visit-discharge" className="visit-discharge-panel" aria-labelledby="visit-discharge-heading">
      <div className="visit-discharge-panel__header"><div><h2 id="visit-discharge-heading">Discharge</h2><p>Write and review instructions for the client. Internal exam and care notes are not copied into this document.</p></div><span className={saved ? 'is-complete' : ''}>{dirty ? 'Unsaved changes' : saved ? 'Prepared' : 'Draft'}</span></div>
      {canDischarge ? <form id={`discharge-form-${visit.id}`} onSubmit={saveDischarge} className="visit-discharge-form" noValidate>
        <fieldset disabled={saving} className="visit-discharge-editor">
          <p>Responsible veterinarian: <strong>{clinicianName}</strong></p>
          {guidanceFields.map(([key, label, hint]) => <label className={`visit-discharge-field${key === 'urgentSigns' || key === 'emergencyContact' ? ' visit-discharge-field--urgent' : ''}`} key={key}><span className="visit-discharge-field__label">{label} <small>Optional</small></span><span className="visit-discharge-hint">{hint}</span><textarea name={key} rows={key === 'visitSummary' ? 3 : 2} maxLength={key === 'emergencyContact' ? 1000 : 10000} value={draft.clientGuidance[key] ?? ''} onChange={(event) => updateGuidance(key, event.target.value)} /></label>)}
          <section className="visit-discharge-medications" aria-labelledby="discharge-medications-heading">
            <h3 id="discharge-medications-heading">Medication schedule</h3><p>Enter the prescribed directions. This schedule does not authorize or dispense medication.</p>
            {draft.clientGuidance.medications.map((medication, index) => <fieldset key={index} className="visit-discharge-medication"><legend>Medication {index + 1}</legend><div className="visit-discharge-medication-grid">
              {medicationFields.map(([key, label]) => <label key={key}><span className="visit-discharge-field__label">{label}{key === 'nextDose' || key === 'specialInstructions' ? ' (optional)' : ''}</span><input name={`medications.${index}.${key}`} value={medication[key] ?? ''} maxLength={key === 'specialInstructions' ? 10000 : 1000} onChange={(event) => updateMedication(index, key, event.target.value)} /></label>)}
            </div><button type="button" className="button-secondary" onClick={() => { setDraft((current) => ({ ...current, clientGuidance: { ...current.clientGuidance, medications: current.clientGuidance.medications.filter((_, i) => i !== index) } })); setDirty(true); }}>Remove medication {index + 1}</button></fieldset>)}
            <button type="button" className="button-secondary" disabled={draft.clientGuidance.medications.length >= 30} onClick={() => { setDraft((current) => ({ ...current, clientGuidance: { ...current.clientGuidance, medications: [...current.clientGuidance.medications, { name: '', dose: '', route: '', frequency: '', duration: '', nextDose: '', specialInstructions: '' }] } })); setDirty(true); }}>Add medication</button>
          </section>
          {fields.map(([key, label]) => <label className="visit-discharge-field visit-discharge-field--wide" key={key}><span className="visit-discharge-field__label">{label}{key !== 'instructions' ? <small>Optional</small> : null}</span><textarea name={key} rows={key === 'instructions' ? 5 : 3} maxLength={10000} value={draft[key]} onChange={(event) => { setDraft((current) => ({ ...current, [key]: event.target.value })); setDirty(true); }} /></label>)}
          <label className="visit-discharge-field"><span className="visit-discharge-field__label">Recheck date (optional)</span><span className="visit-discharge-hint">Requested date; saving this does not book an appointment.</span><input type="date" name="recheckDate" value={draft.clientGuidance.recheckDate ?? ''} onChange={(event) => updateGuidance('recheckDate', event.target.value)} /></label>
          <label><input type="checkbox" checked={draft.followUpRequired} onChange={(event) => { setDraft((current) => ({ ...current, followUpRequired: event.target.checked })); setDirty(true); }} /> Reception must arrange follow-up</label>
        </fieldset>
        {draft.followUpRequired ? <p>A front-desk follow-up task will be created when saved.</p> : null}
        <p role="status">{saving ? 'Saving…' : error ? 'Changes not saved' : dirty ? 'Unsaved changes — save to update the client preview and PDF.' : saved ? 'All changes saved' : 'Draft — instructions have not been prepared.'}</p>
        {error ? <p className="visit-discharge-validation" role="alert">{error}</p> : null}
        <div className="visit-discharge-form__footer"><button type="submit" className="button-primary" disabled={saving}>{saving ? 'Saving…' : step ? 'Save and continue to review →' : saved ? 'Update discharge' : 'Prepare discharge'}</button></div>
      </form> : null}
      {saved ? <div className="visit-discharge-form">
        <h3>Saved client preview</h3><p>Responsible veterinarian: {clinicianName}<br />Prepared by: {saved.completedBy ? saved.completedBy.displayName || `${saved.completedBy.firstName} ${saved.completedBy.lastName}` : 'Not recorded'}</p><p>This is the saved content used in the discharge PDF.{dirty ? ' Your edits are not included until saved.' : ''}</p>
        <div className="visit-discharge-summary" aria-label="Saved client discharge summary">{savedSections.map((section, index) => <section className={section.urgent ? "visit-discharge-summary__urgent" : ""} key={index}><h3>{section.title}</h3><p>{section.text}</p></section>)}</div>
        <p>These instructions contain only recorded client guidance. An omitted section does not mean no instructions are needed. Contact the clinic if any direction is unclear.</p>
        {!dirty ? <VisitDocumentDownload visitId={visit.id} kind="discharge">Download discharge PDF</VisitDocumentDownload> : null}
      </div> : <p>No saved client instructions yet. Review and save the discharge before generating a PDF.</p>}
      {readOnly ? <p>{visit.checkout ? 'Checkout is complete.' : 'This visit is closed.'} Saved discharge instructions are read-only.</p> : null}
      {canCheckout && saved && !readOnly && !dirty ? <div className="visit-discharge-form visit-discharge-reception-handoff"><div><h3>Ready for reception</h3><p>Discharge is prepared. Review charges, collect payment, and finish the visit in Checkout.</p></div><Link className="button-primary" href={`/visits/${encodeURIComponent(visit.id)}?view=checkout`}>Open checkout</Link></div> : null}
    </section>
    {step ? <footer className="visit-step-actions"><button type="button" className="visit-stage-navigation__link" disabled={saving} onClick={step.back}>← Back to care plan</button>{!canDischarge ? <button type="button" className="button-primary" onClick={step.next}>Continue to review →</button> : null}</footer> : null}
  </>;
}
