'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import type { VisitDetail } from '../lib/patient-types';
import { useCurrentUser } from '../lib/use-current-user';

export function VisitDischargePanel({ visit }: { visit: VisitDetail }) {
  const router = useRouter();
  const { user } = useCurrentUser();
  const [saving, setSaving] = useState(false);
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
      setError('Complete the highlighted information before saving the synopsis.');
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
      router.refresh();
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
          balanceStatus: form.get('balanceStatus'),
          outstandingBalanceCents: Math.round(dollars * 100),
        }),
      });
      const body = (await response.json()) as { message?: string };
      if (!response.ok) throw new Error(body.message ?? 'Could not complete checkout.');
      router.refresh();
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not complete checkout.'); }
    finally { setSaving(false); }
  }

  async function resolveBalance() {
    setSaving(true); setError(null);
    try {
      const response = await fetch(`/api/visits/${visit.id}/checkout/resolve-balance`, { method: 'POST' });
      const body = (await response.json()) as { message?: string };
      if (!response.ok) throw new Error(body.message ?? 'Could not resolve the balance.');
      router.refresh();
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not resolve the balance.'); }
    finally { setSaving(false); }
  }

  return (
    <section className="visit-discharge-panel" aria-labelledby="visit-discharge-heading">
      <div className="visit-discharge-panel__header"><div><p className="eyebrow">Step 3 · Client handoff</p><h2 id="visit-discharge-heading">Discharge synopsis</h2><p>Prepare the clear, written plan the client will use at home.</p></div><span className={visit.discharge ? 'is-complete' : ''}>{visit.discharge ? '✓ Prepared' : 'Draft'}</span></div>
      {canDischarge ? (
        <form onSubmit={saveDischarge} className="visit-discharge-form" noValidate>
          <div className="visit-discharge-form__grid">
            <label className={`visit-discharge-field visit-discharge-field--wide${missingFields.includes('instructions') ? ' is-missing' : ''}`}><span><b>Home care {missingFields.includes('instructions') ? <em>* Required</em> : null}</b><small>Activity, diet, wound care, or other at-home directions</small></span><textarea name="instructions" rows={4} placeholder="What should the client do at home?" defaultValue={visit.discharge?.instructions ?? visit.examFindings?.plan ?? ''} onChange={() => setMissingFields((fields) => fields.filter((field) => field !== 'instructions'))} /></label>
            <label className="visit-discharge-field"><span><b>Medications</b><small>Dose, route, frequency, duration, and special handling</small></span><textarea name="medicationInstructions" rows={4} placeholder="No take-home medications" defaultValue={visit.discharge?.medicationInstructions ?? medicationPlan} /></label>
            <label className="visit-discharge-field"><span><b>Watch for</b><small>Expected recovery and reasons to contact the clinic</small></span><textarea name="warningSigns" rows={4} placeholder="List warning signs and when to seek care" defaultValue={visit.discharge?.warningSigns ?? ''} /></label>
            <label className={`visit-discharge-field visit-discharge-field--wide${missingFields.includes('followUpPlan') ? ' is-missing' : ''}`}><span><b>Follow-up {missingFields.includes('followUpPlan') ? <em>* Required when follow-up is selected</em> : null}</b><small>Recheck timing, pending results, and who will contact the client</small></span><textarea name="followUpPlan" rows={3} placeholder="No follow-up required" defaultValue={visit.discharge?.followUpPlan ?? ''} onChange={() => setMissingFields((fields) => fields.filter((field) => field !== 'followUpPlan'))} /></label>
          </div>
          {error ? <p className="visit-discharge-validation" role="alert">{error}</p> : null}
          <div className="visit-discharge-form__footer"><label className="visit-discharge-check"><input type="checkbox" name="followUpRequired" value="yes" defaultChecked={visit.discharge?.followUpRequired ?? false} onChange={(event) => { if (!event.target.checked) setMissingFields((fields) => fields.filter((field) => field !== 'followUpPlan')); }} /><span><b>Follow-up required</b><small>Create a follow-up task for the front desk</small></span></label><div><button className="button-primary" disabled={saving}>{visit.discharge ? 'Update Synopsis' : 'Complete Client Handoff'}</button></div></div>
        </form>
      ) : null}
      {canCheckout && visit.discharge ? (
        <form onSubmit={completeCheckout} className="visit-discharge-form">
          <h3>Reception checkout</h3>
          <label className="visit-discharge-check"><input type="checkbox" name="clientContactConfirmed" value="yes" required defaultChecked={visit.checkout?.clientContactConfirmed ?? false} /> Phone, email, and missing account information confirmed</label>
          <label>Missing account information<textarea name="missingAccountInformation" defaultValue={visit.checkout?.missingAccountInformation ?? ''} /></label>
          <label>Balance status<select name="balanceStatus" defaultValue={visit.checkout?.balanceStatus ?? 'Paid'}><option value="Paid">Paid</option><option value="Outstanding">Outstanding</option></select></label>
          <label>Outstanding balance ($)<input type="number" name="outstandingBalance" min="0" step="0.01" defaultValue={visit.checkout?.outstandingBalanceCents ? visit.checkout.outstandingBalanceCents / 100 : ''} /></label>
          <button className="button-primary" disabled={saving || Boolean(visit.checkout)}>{visit.checkout ? 'Checkout Complete' : 'Complete Checkout'}</button>
          {visit.checkout?.balanceStatus === 'Outstanding' ? <button type="button" className="button-secondary" disabled={saving} onClick={() => void resolveBalance()}>Mark Balance Paid</button> : null}
        </form>
      ) : null}
    </section>
  );
}
