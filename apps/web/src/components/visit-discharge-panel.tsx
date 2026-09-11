'use client';

import { useVisitStep } from './visit-care-sections';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import type { VisitDetail } from '../lib/patient-types';
import { useCurrentUser } from '../lib/use-current-user';

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function text(value: unknown): string { return typeof value === 'string' ? value.trim() : ''; }

export function VisitDischargePanel({ visit }: { visit: VisitDetail }) {
  const router = useRouter();
  const step = useVisitStep();
  const { user } = useCurrentUser();
  const [saving, setSaving] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [additionalInstructions, setAdditionalInstructions] = useState('');
  const canDischarge = ['OWNER', 'VETERINARIAN', 'TECHNICIAN', 'ASSISTANT'].includes(user?.role ?? '');
  const canCheckout = ['OWNER', 'PRACTICE_MANAGER', 'RECEPTIONIST'].includes(user?.role ?? '');
  const activeCare = visit.workItems.filter((item) =>
    ['Treatment', 'Diagnostic', 'Medication'].includes(item.type) &&
    item.status === 'Completed',
  );
  const careSummary = activeCare
    .filter((item) => item.type !== 'Medication')
    .map((item) => {
      const recommendation = text(record(record(item.result).plan).recommendation);
      return [item.title, recommendation].filter(Boolean).join(' — ');
    })
    .filter(Boolean)
    .join('\n');
  const medicationPlan = activeCare
    .filter((item) => item.type === 'Medication' && !['Cancelled', 'Declined'].includes(item.status))
    .map((item) => {
      const plan = record(record(item.result).plan);
      const medication = record(plan.medication);
      // Only take-home medication belongs in the client's discharge directions.
      // Older orders without a documented disposition remain visible so their
      // instructions are not silently omitted.
      if (text(medication.disposition) === 'AdministeredInClinic') return null;
      const directions = [text(medication.orderedDose), text(medication.route), text(medication.frequency), text(medication.duration)].filter(Boolean);
      return [item.title, directions.length ? directions.join(' · ') : null].filter(Boolean).join(' — ');
    })
    .filter((line): line is string => Boolean(line))
    .join('\n');
  const followUpPlan = visit.workItems
    .filter((item) => item.type === 'FollowUp' && !['Cancelled', 'Declined'].includes(item.status))
    .map((item) => {
      const recommendation = text(record(record(item.result).plan).recommendation);
      return [item.title, recommendation].filter(Boolean).join(' — ');
    })
    .filter(Boolean)
    .join('\n');
  const generatedHomeCare = careSummary || visit.examFindings?.plan?.trim() || '';

  async function saveDischarge(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const instructions = [generatedHomeCare, additionalInstructions.trim()].filter(Boolean).join('\n\n');
    if (!instructions) {
      setError('Add client-facing instructions before continuing.');
      return;
    }
    setSaving(true); setError(null);
    try {
      const response = await fetch(`/api/visits/${visit.id}/discharge`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          instructions,
          medicationInstructions: medicationPlan || null,
          warningSigns: visit.discharge?.warningSigns ?? null,
          followUpPlan: followUpPlan || null,
          followUpRequired: Boolean(followUpPlan),
        }),
      });
      const body = (await response.json()) as { message?: string };
      if (!response.ok) throw new Error(body.message ?? 'Could not save discharge.');
      setHasUnsavedChanges(false);
      if (step) step.next();
      else router.refresh();
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
      <div className="visit-discharge-panel__header"><div><h2 id="visit-discharge-heading">Discharge</h2><p>Review the client-facing summary assembled from completed care and take-home medication.</p></div><span className={visit.discharge ? 'is-complete' : ''}>{visit.discharge ? 'Prepared' : 'Draft'}</span></div>
      {canDischarge ? (
        <form id={`discharge-form-${visit.id}`} onSubmit={saveDischarge} onChange={() => setHasUnsavedChanges(true)} className="visit-discharge-form" noValidate>
          <div className="visit-discharge-summary" aria-label="Client discharge summary">
            <section><h3>Home care</h3><p>{generatedHomeCare || 'No home-care directions recorded.'}</p></section>
            <section><h3>Take-home medications</h3><p>{medicationPlan || 'None.'}</p></section>
            <section><h3>Follow-up</h3><p>{followUpPlan || 'None.'}</p></section>
          </div>
          <label className="visit-discharge-field visit-discharge-field--wide visit-discharge-additional"><span className="visit-discharge-field__label">Additional instructions <small>Optional</small></span><textarea name="additionalInstructions" rows={3} autoComplete="off" placeholder="Add any client-facing guidance not already covered above" value={additionalInstructions} onChange={(event) => setAdditionalInstructions(event.target.value)} /></label>
          {error ? <p className="visit-discharge-validation" role="alert">{error}</p> : null}
          <div className="visit-discharge-form__footer">{followUpPlan ? <span className="visit-discharge-derived-note">A front-desk follow-up task will be created.</span> : <span />}{!step ? <div><button className="button-primary" disabled={saving}>{saving ? 'Saving…' : visit.discharge ? 'Update discharge' : 'Prepare discharge'}</button></div> : null}</div>
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
