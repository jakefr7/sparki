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
  const canDischarge = ['OWNER', 'VETERINARIAN', 'TECHNICIAN', 'ASSISTANT'].includes(user?.role ?? '');
  const canCheckout = ['OWNER', 'PRACTICE_MANAGER', 'RECEPTIONIST'].includes(user?.role ?? '');

  async function saveDischarge(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget);
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
      <div><p className="eyebrow">Departure</p><h2 id="visit-discharge-heading">Discharge &amp; Checkout</h2></div>
      {canDischarge ? (
        <form onSubmit={saveDischarge} className="visit-discharge-form">
          <h3>Care-team discharge</h3>
          <label>Home-care instructions<textarea name="instructions" required defaultValue={visit.discharge?.instructions ?? ''} /></label>
          <label>Medication instructions<textarea name="medicationInstructions" defaultValue={visit.discharge?.medicationInstructions ?? ''} /></label>
          <label>Warning signs<textarea name="warningSigns" defaultValue={visit.discharge?.warningSigns ?? ''} /></label>
          <label>Follow-up plan<textarea name="followUpPlan" defaultValue={visit.discharge?.followUpPlan ?? ''} /></label>
          <label className="visit-discharge-check"><input type="checkbox" name="followUpRequired" value="yes" defaultChecked={visit.discharge?.followUpRequired ?? false} /> Follow-up is required</label>
          <button className="button-primary" disabled={saving}>{visit.discharge ? 'Update Discharge' : 'Complete Discharge'}</button>
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
      {error ? <p className="form-error" role="alert">{error}</p> : null}
    </section>
  );
}
