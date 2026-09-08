'use client';

import { useVisitStep } from './visit-care-sections';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import type { VisitDetail } from '../lib/patient-types';
import { useCurrentUser } from '../lib/use-current-user';

export function VisitDischargePanel({ visit }: { visit: VisitDetail }) {
  const router = useRouter();
  const step = useVisitStep();
  const { user } = useCurrentUser();
  const [saving, setSaving] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [missingFields, setMissingFields] = useState<string[]>([]);
  const canDischarge = ['OWNER', 'VETERINARIAN', 'TECHNICIAN', 'ASSISTANT'].includes(user?.role ?? '');
  const canCheckout = ['OWNER', 'PRACTICE_MANAGER', 'RECEPTIONIST'].includes(user?.role ?? '');
  const medicationPlan = visit.workItems.filter((item) => item.type === 'Medication' && !['Cancelled', 'Declined'].includes(item.status)).map((item) => item.title).join('\n');

  async function saveDischarge(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    const missing = [
      !String(form.get('instructions') ?? '').trim() ? 'instructions' : null,
      form.get('followUpRequired') === 'yes' && !String(form.get('followUpPlan') ?? '').trim() ? 'followUpPlan' : null,
    ].filter((field): field is string => Boolean(field));
    setMissingFields(missing);
    if (missing.length) {
      setError('Fill in the required fields to continue.');
      return;
    }
    setSaving(true); setError(null);
    try {
      const response = await fetch(`/api/visits/${visit.id}/discharge`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          instructions: form.get('instructions'), medicationInstructions: form.get('medicationInstructions'),
          warningSigns: form.get('warningSigns'), followUpPlan: form.get('followUpPlan'),
          followUpRequired: form.get('followUpRequired') === 'yes',
        }),
      });
      const body = (await response.json()) as { message?: string };
      if (!response.ok) throw new Error(body.message ?? 'Could not save discharge.');
      setHasUnsavedChanges(false);
      router.refresh();
      step?.next();
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not save discharge.'); }
    finally { setSaving(false); }
  }

  async function completeCheckout(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    const dollars = Number(form.get('outstandingBalance') || 0);
    setSaving(true); setError(null);
    try {
      const response = await fetch(`/api/visits/${visit.id}/checkout/complete`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientContactConfirmed: form.get('clientContactConfirmed') === 'yes',
          missingAccountInformation: form.get('missingAccountInformation'),
          balanceDisposition: form.get('balanceDisposition'),
          outstandingBalanceCents: Math.round(dollars * 100),
        }),
      });
      const body = (await response.json()) as { message?: string };
      if (!response.ok) throw new Error(body.message ?? 'Could not complete checkout.');
      router.refresh();
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not complete checkout.'); }
    finally { setSaving(false); }
  }

  async function updateBalance() {
    setSaving(true); setError(null);
    try {
      const note = window.prompt('Record the source of this manual balance update:');
      if (!note?.trim()) { setSaving(false); return; }
      const response = await fetch(`/api/visits/${visit.id}/checkout/update-balance`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ balanceDisposition: 'NoBalanceReported', note }) });
      const body = (await response.json()) as { message?: string };
      if (!response.ok) throw new Error(body.message ?? 'Could not resolve the balance.');
      router.refresh();
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not resolve the balance.'); }
    finally { setSaving(false); }
  }

  return (
    <>
    <section id="visit-discharge" className="visit-discharge-panel" aria-labelledby="visit-discharge-heading">
      <div className="visit-discharge-panel__header"><div><h2 id="visit-discharge-heading">Discharge</h2></div><span className={visit.discharge ? 'is-complete' : ''}>{visit.discharge ? 'Prepared' : 'Draft'}</span></div>
      {canDischarge ? (
        <form id={`discharge-form-${visit.id}`} onSubmit={saveDischarge} onChange={() => setHasUnsavedChanges(true)} className="visit-discharge-form" noValidate>
          <div className="visit-discharge-form__grid">
            <label className={`visit-discharge-field visit-discharge-field--wide${missingFields.includes('instructions') ? ' is-missing' : ''}`}><span className="visit-discharge-field__label">Home care{missingFields.includes('instructions') ? <em>Required</em> : null}</span><textarea aria-invalid={missingFields.includes('instructions')} name="instructions" rows={3} placeholder="Activity, diet, wound care, or other at-home directions" defaultValue={visit.discharge?.instructions ?? visit.examFindings?.plan ?? ''} onChange={() => setMissingFields((fields) => fields.filter((field) => field !== 'instructions'))} /></label>
            <label className="visit-discharge-field"><span className="visit-discharge-field__label">Medications</span><textarea name="medicationInstructions" rows={3} placeholder="Dose, route, frequency, duration — or leave blank if none" defaultValue={visit.discharge?.medicationInstructions ?? medicationPlan} /></label>
            <label className="visit-discharge-field"><span className="visit-discharge-field__label">Watch for</span><textarea name="warningSigns" rows={3} placeholder="Warning signs and when to contact the clinic" defaultValue={visit.discharge?.warningSigns ?? ''} /></label>
            <label className={`visit-discharge-field visit-discharge-field--wide${missingFields.includes('followUpPlan') ? ' is-missing' : ''}`}><span className="visit-discharge-field__label">Follow-up{missingFields.includes('followUpPlan') ? <em>Required when follow-up is on</em> : null}</span><textarea aria-invalid={missingFields.includes('followUpPlan')} name="followUpPlan" rows={2} placeholder="Recheck timing, pending results, who will contact the client" defaultValue={visit.discharge?.followUpPlan ?? ''} onChange={() => setMissingFields((fields) => fields.filter((field) => field !== 'followUpPlan'))} /></label>
          </div>
          {error ? <p className="visit-discharge-validation" role="alert">{error}</p> : null}
          <div className="visit-discharge-form__footer"><label className="visit-discharge-check"><input type="checkbox" name="followUpRequired" value="yes" defaultChecked={visit.discharge?.followUpRequired ?? false} onChange={(event) => { if (!event.target.checked) setMissingFields((fields) => fields.filter((field) => field !== 'followUpPlan')); }} /><span className="visit-discharge-field__label">Follow-up required — create a front-desk task</span></label>{!step ? <div><button className="button-primary" disabled={saving}>{saving ? 'Saving…' : visit.discharge ? 'Update discharge' : 'Prepare discharge'}</button></div> : null}</div>
          {step ? <div className="visit-discharge-form__save"><span className={`autosave-indicator autosave-indicator--${saving ? 'saving' : error ? 'error' : hasUnsavedChanges ? 'saving' : 'saved'}`} role="status"><span className="autosave-indicator__dot" aria-hidden="true" />{saving ? 'Saving…' : error ? 'Changes not saved' : hasUnsavedChanges ? 'Unsaved changes' : 'All changes saved'}</span></div> : null}
        </form>
      ) : null}
      {canCheckout && visit.discharge ? (
        <form onSubmit={completeCheckout} className="visit-discharge-form">
          <h3>Reception checkout</h3>
          <label className="visit-discharge-check"><input type="checkbox" name="clientContactConfirmed" value="yes" required defaultChecked={visit.checkout?.clientContactConfirmed ?? false} /> Phone, email, and missing account information confirmed</label>
          <label>Missing account information<textarea name="missingAccountInformation" defaultValue={visit.checkout?.missingAccountInformation ?? ''} /></label>
          <p>Sparki records the balance reported by staff. It does not process or verify payments.</p>
          <label>Manual balance observation<select name="balanceDisposition" defaultValue={visit.checkout?.balanceStatus === 'Outstanding' ? 'OutstandingBalanceRecorded' : 'NoBalanceReported'}><option value="NoBalanceReported">No balance reported</option><option value="OutstandingBalanceRecorded">Outstanding balance recorded</option></select></label>
          <label>Outstanding balance ($)<input type="number" name="outstandingBalance" min="0" step="0.01" defaultValue={visit.checkout?.outstandingBalanceCents ? visit.checkout.outstandingBalanceCents / 100 : ''} /></label>
          <button className="button-primary" disabled={saving || Boolean(visit.checkout)}>{visit.checkout ? 'Checkout Complete' : 'Complete Checkout'}</button>
          {visit.checkout?.balanceStatus === 'Outstanding' ? <button type="button" className="button-secondary" disabled={saving} onClick={() => void updateBalance()}>Record manual balance update</button> : null}
        </form>
      ) : null}
    </section>
    {step ? <footer className="visit-step-actions">
      <button type="button" className="visit-stage-navigation__link" disabled={saving} onClick={step.back}>← Back to care plan</button>
      {canDischarge ? <button type="submit" form={`discharge-form-${visit.id}`} className="button-primary" disabled={saving}>{saving ? 'Saving…' : 'Continue to review →'}</button> : <button type="button" className="button-primary" onClick={step.next}>Continue to review →</button>}
    </footer> : null}
    </>
  );
}
