'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import type { VisitDetail } from '../lib/patient-types';
import { useCurrentUser } from '../lib/use-current-user';

const WORK_TYPES = [
  ['Diagnostic', 'Diagnostic'], ['Estimate', 'Estimate'], ['ClientApproval', 'Client approval'],
  ['Treatment', 'Treatment'], ['Medication', 'Medication'], ['ClientCommunication', 'Client communication'],
] as const;
const CLINICAL_ORDER_TYPES = new Set(['Diagnostic', 'Treatment', 'Medication']);
const TERMINAL_STATES = new Set(['Archived', 'Cancelled', 'NoShow']);

export function VisitWorkItemsPanel({ visit }: { visit: VisitDetail }) {
  const router = useRouter();
  const { user } = useCurrentUser();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const clinicalItems = visit.workItems.filter((item) => WORK_TYPES.some(([type]) => type === item.type));
  const closed = TERMINAL_STATES.has(visit.state);
  const availableTypes = WORK_TYPES.filter(([type]) =>
    !CLINICAL_ORDER_TYPES.has(type) || user?.role === 'OWNER' || user?.role === 'VETERINARIAN',
  );

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const formElement = event.currentTarget; const form = new FormData(formElement);
    setSaving(true); setError(null);
    try {
      const response = await fetch(`/api/visits/${visit.id}/work-items`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: form.get('type'), title: form.get('title') }),
      });
      const body = (await response.json()) as { message?: string };
      if (!response.ok) throw new Error(body.message ?? 'Could not add visit work.');
      formElement.reset(); router.refresh();
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not add visit work.'); }
    finally { setSaving(false); }
  }

  async function update(event: FormEvent<HTMLFormElement>, itemId: string) {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    setSaving(true); setError(null);
    try {
      const response = await fetch(`/api/visits/${visit.id}/work-items/${itemId}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: form.get('status'), reason: form.get('reason') || null }),
      });
      const body = (await response.json()) as { message?: string };
      if (!response.ok) throw new Error(body.message ?? 'Could not update visit work.');
      router.refresh();
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not update visit work.'); }
    finally { setSaving(false); }
  }

  return (
    <section className="visit-work-panel" aria-labelledby="visit-work-heading">
      <div><p className="eyebrow">Care plan</p><h2 id="visit-work-heading">Clinical Work</h2><p>Track every diagnostic, approval, treatment, medication, and client communication before discharge.</p></div>
      {!closed && availableTypes.length > 0 ? (
        <form className="visit-work-create" onSubmit={create}>
          <label>Type<select name="type">{availableTypes.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label>Work description<input name="title" required placeholder="What needs to be completed?" /></label>
          <button className="button-primary" disabled={saving}>Add Work</button>
        </form>
      ) : null}
      <div className="visit-work-list">
        {clinicalItems.length === 0 ? <p>No clinical work has been added.</p> : clinicalItems.map((item) => (
          <article key={item.id} className="visit-work-item">
            <div><span>{WORK_TYPES.find(([type]) => type === item.type)?.[1] ?? item.type}</span><strong>{item.title}</strong><small>{item.status}</small></div>
            {!closed ? <details>
              <summary>Update</summary>
              <form onSubmit={(event) => void update(event, item.id)}>
                <label>Status<select name="status" defaultValue={item.status}><option value="Pending">Pending</option><option value="InProgress">In progress</option><option value="Completed">Completed</option><option value="Declined">Declined</option><option value="Deferred">Deferred</option><option value="Cancelled">Cancelled</option></select></label>
                <label>Reason<textarea name="reason" placeholder={item.type === 'Medication' && item.status === 'Completed' ? 'Required to reverse medication and reconcile stock' : 'Required for declined, deferred, cancelled, or reopened work'} /></label>
                <button className="button-secondary" disabled={saving}>Save</button>
              </form>
            </details> : null}
          </article>
        ))}
      </div>
      {error ? <p className="form-error" role="alert">{error}</p> : null}
    </section>
  );
}
