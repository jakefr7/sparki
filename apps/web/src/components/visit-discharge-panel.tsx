'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { DischargeMedicationName } from './discharge-medication-name';
import { VisitDocumentPreview } from './visit-document-preview';
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
const fields = [['warningSigns', 'When to call the clinic']] as const;

export function VisitDischargePanel({ visit }: { visit: VisitDetail }) {
  const router = useRouter();
  const step = useVisitStep();
  const { user } = useCurrentUser();
  const [draft, setDraft] = useState(() => savedDraft(visit.discharge));
  const [saved, setSaved] = useState(visit.discharge);
  const [editingMedication, setEditingMedication] = useState<number | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const previewDialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (previewOpen) previewDialog.current?.showModal();
    else previewDialog.current?.close();
  }, [previewOpen]);
  const showMedicationDirections = draft.clientGuidance.medications.length > 0 || Boolean(draft.medicationInstructions.trim());
  const requiredFieldsComplete = Boolean(draft.instructions.trim()) && (!draft.followUpRequired || Boolean(draft.followUpPlan.trim())) && draft.clientGuidance.medications.every((medication) => ['name', 'dose', 'route', 'frequency', 'duration'].every((key) => Boolean(medication[key as keyof DischargeMedication]?.trim())));
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
  return <>
    <section id="visit-discharge" className="visit-discharge-panel" aria-labelledby="visit-discharge-heading">
      <div className="visit-discharge-panel__header"><div><h2 id="visit-discharge-heading">Discharge</h2></div><button type="button" className="button-secondary" aria-haspopup="dialog" aria-expanded={previewOpen} aria-controls="discharge-document-preview" onClick={() => setPreviewOpen(!previewOpen)}>Preview / PDF</button></div>
      <dialog ref={previewDialog} id="discharge-document-preview" className="discharge-pdf-dialog" aria-label="Discharge PDF" onCancel={() => setPreviewOpen(false)} onClose={() => setPreviewOpen(false)} onClick={(event) => {
        if (event.target !== event.currentTarget) return;
        const bounds = event.currentTarget.getBoundingClientRect();
        if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) setPreviewOpen(false);
      }}>
        <div className="discharge-pdf-toolbar"><strong>Discharge PDF</strong><div>{saved && !dirty ? <VisitDocumentDownload visitId={visit.id} kind="discharge">Download PDF</VisitDocumentDownload> : null}<button type="button" className="discharge-pdf-close" aria-label="Close" title="Close" onClick={() => setPreviewOpen(false)}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg></button></div></div>
        {previewOpen ? saved && !dirty ? <>
          <VisitDocumentPreview visitId={visit.id} />
        </> : <p className="discharge-pdf-notice">{dirty ? 'Save your changes to preview the updated PDF.' : 'Save discharge instructions to preview the PDF.'}</p> : null}
      </dialog>
      {canDischarge ? <form id={`discharge-form-${visit.id}`} onSubmit={saveDischarge} className="visit-discharge-form" noValidate>
        <fieldset disabled={saving} className="visit-discharge-editor">
          <label className="visit-discharge-field visit-discharge-field--wide"><span className="visit-discharge-field__label">Home care <em aria-hidden="true">*</em></span><textarea name="instructions" required aria-required="true" rows={4} maxLength={10000} value={draft.instructions} onChange={(event) => { setDraft((current) => ({ ...current, instructions: event.target.value })); setDirty(true); }} /></label>
          <details className="visit-discharge-followup-panel">
            <summary>Follow-up <span>{[draft.clientGuidance.recheckDate ? new Date(`${draft.clientGuidance.recheckDate}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }) : '', draft.followUpPlan.trim()].filter(Boolean).join(' · ') || 'Add follow-up'}</span></summary>
            <div className="visit-discharge-guidance-grid">
            <label className="visit-discharge-field"><span className="visit-discharge-field__label">Follow-up plan {draft.followUpRequired ? <em aria-hidden="true">*</em> : <small>Optional</small>}</span><textarea name="followUpPlan" rows={2} required={draft.followUpRequired} aria-required={draft.followUpRequired} value={draft.followUpPlan} maxLength={10000} onChange={(event) => { setDraft((current) => ({ ...current, followUpPlan: event.target.value })); setDirty(true); }} /></label>
          <label className="visit-discharge-field"><span className="visit-discharge-field__label">Recheck date (optional)</span><input type="date" name="recheckDate" value={draft.clientGuidance.recheckDate ?? ''} onChange={(event) => updateGuidance('recheckDate', event.target.value)} /><span className="visit-discharge-hint">Requested date · not booked</span></label>
          <label className="visit-discharge-follow-up"><input type="checkbox" checked={draft.followUpRequired} onChange={(event) => { setDraft((current) => ({ ...current, followUpRequired: event.target.checked })); setDirty(true); }} /> Ask reception to schedule</label>
            </div>
          </details>
          <details className="visit-discharge-guidance">
            <summary>More instructions</summary>
            <div className="visit-discharge-guidance-grid">
          {guidanceFields.map(([key, label, hint]) => <label className={`visit-discharge-field${key === 'urgentSigns' || key === 'emergencyContact' ? ' visit-discharge-field--urgent' : ''}`} key={key}><span className="visit-discharge-field__label">{label} <small>Optional</small></span><span className="visit-discharge-hint">{hint}</span><textarea name={key} rows={key === 'visitSummary' ? 3 : 2} maxLength={key === 'emergencyContact' ? 1000 : 10000} value={draft.clientGuidance[key] ?? ''} onChange={(event) => updateGuidance(key, event.target.value)} /></label>)}
              {fields.map(([key, label]) => <label className="visit-discharge-field" key={key}><span className="visit-discharge-field__label">{label} <small>Optional</small></span><textarea name={key} rows={2} maxLength={10000} value={draft[key]} onChange={(event) => { setDraft((current) => ({ ...current, [key]: event.target.value })); setDirty(true); }} /></label>)}
            </div>
          </details>
          <section className="visit-discharge-medications" aria-labelledby="discharge-medications-heading">
            <div className="visit-discharge-section-heading"><h3 id="discharge-medications-heading">Medications</h3></div>
            {draft.clientGuidance.medications.map((medication, index) => <div key={index} role="group" aria-label={medication.name.trim() || "New medication"} className="visit-discharge-medication"><div className="visit-discharge-medication-heading"><div><h4>{medication.name.trim() || "New medication"}</h4>{editingMedication !== index ? <p className="visit-discharge-medication-summary">{[medication.dose, medication.route, medication.frequency, medication.duration].filter(Boolean).join(' · ') || 'Directions needed'}</p> : null}</div><div className="visit-discharge-medication-actions">{editingMedication !== index ? <button type="button" className="visit-stage-navigation__link" onClick={() => setEditingMedication(index)}>Edit</button> : null}<button type="button" className="visit-discharge-remove" aria-label={`Remove ${medication.name.trim() || "new medication"}`} onClick={() => { setDraft((current) => ({ ...current, clientGuidance: { ...current.clientGuidance, medications: current.clientGuidance.medications.filter((_, i) => i !== index) } })); setEditingMedication((current) => current === null || current === index ? null : current > index ? current - 1 : current); setDirty(true); }}>Remove</button></div></div><div hidden={editingMedication !== index}><div className="visit-discharge-medication-grid">
              {medicationFields.map(([key, label]) => <label key={key} className={`visit-discharge-medication-field visit-discharge-medication-field--${key}`}><span className="visit-discharge-field__label">{label}{key === 'nextDose' || key === 'specialInstructions' ? ' (optional)' : <em aria-hidden="true"> *</em>}</span>{key === 'name' ? <DischargeMedicationName name={`medications.${index}.${key}`} value={medication.name} onChange={(value) => updateMedication(index, 'name', value)} /> : <input name={`medications.${index}.${key}`} required={key !== 'nextDose' && key !== 'specialInstructions'} aria-required={key !== 'nextDose' && key !== 'specialInstructions'} value={medication[key] ?? ''} maxLength={key === 'specialInstructions' ? 10000 : 1000} onChange={(event) => updateMedication(index, key, event.target.value)} />}</label>)}
            </div><button type="button" className="button-secondary" disabled={['name', 'dose', 'route', 'frequency', 'duration'].some((key) => !medication[key as keyof DischargeMedication]?.trim())} onClick={() => setEditingMedication(null)}>Add</button></div></div>)}
            {editingMedication === null ? <button type="button" className="button-secondary" disabled={draft.clientGuidance.medications.length >= 30} onClick={() => { setEditingMedication(draft.clientGuidance.medications.length); setDraft((current) => ({ ...current, clientGuidance: { ...current.clientGuidance, medications: [...current.clientGuidance.medications, { name: '', dose: '', route: '', frequency: '', duration: '', nextDose: '', specialInstructions: '' }] } })); setDirty(true); }}>Add medication</button> : null}
            {showMedicationDirections ? <details className="visit-discharge-extra-directions"><summary>Additional medication directions{draft.medicationInstructions.trim() ? ' · recorded' : ' (optional)'}</summary><label className="visit-discharge-field visit-discharge-medication-directions"><span className="visit-discharge-field__label">Medication directions <small>Optional</small></span><textarea name="medicationInstructions" rows={3} maxLength={10000} value={draft.medicationInstructions} onChange={(event) => { setDraft((current) => ({ ...current, medicationInstructions: event.target.value })); setDirty(true); }} /></label></details> : null}
          </section>
        </fieldset>
      </form> : null}
      {canDischarge ? <div className="visit-discharge-save-status"><p className={`autosave-indicator autosave-indicator--${saving || dirty ? 'saving' : error ? 'error' : saved ? 'saved' : 'saving'}`} role="status"><span className="autosave-indicator__dot" aria-hidden="true" />{saving ? 'Saving…' : error ? 'Changes not saved' : dirty ? 'Unsaved changes' : saved ? 'Saved' : 'Required fields marked *'}</p>{error ? <p className="visit-discharge-validation" role="alert">{error}</p> : null}</div> : null}
      {readOnly ? <p>{visit.checkout ? 'Checkout is complete.' : 'This visit is closed.'} Saved discharge instructions are read-only.</p> : null}
      {canCheckout && saved && !readOnly && !dirty ? <div className="visit-discharge-form visit-discharge-reception-handoff"><div><h3>Ready for reception</h3><p>Discharge is prepared. Review charges, collect payment, and finish the visit in Checkout.</p></div><Link className="button-primary" href={`/visits/${encodeURIComponent(visit.id)}?view=checkout`}>Open checkout</Link></div> : null}
    </section>
    {(step || canDischarge) ? <footer className="visit-discharge-final-actions">

      <div className="visit-step-actions">
        {step ? <button type="button" className="visit-stage-navigation__link" disabled={saving} onClick={step.back}>← Back to care plan</button> : null}
        {canDischarge ? <button type="submit" form={`discharge-form-${visit.id}`} className="button-primary" disabled={saving || !requiredFieldsComplete}>{saving ? 'Saving…' : step ? 'Continue to review →' : saved ? 'Update discharge' : 'Prepare discharge'}</button> : step ? <button type="button" className="button-primary" onClick={step.next}>Continue to review →</button> : null}
      </div>
    </footer> : null}
  </>;
}
