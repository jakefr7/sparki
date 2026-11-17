'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import type { VisitDetail } from '../lib/patient-types';
import { useCurrentUser } from '../lib/use-current-user';

export function TechnicianVisitNotes({ visit, returnHref }: { visit: VisitDetail; returnHref: string }) {
  const router = useRouter();
  const { user } = useCurrentUser();
  const note = visit.soapNotes[0];
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canEdit = note && ['Draft', 'ReadyForReview'].includes(note.status) && user && (user.id === visit.assignedTechnician?.id || user.id === visit.primaryVeterinarian?.id || visit.signoffDelegates.some(entry => entry.delegateId === user.id));
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!note) return;
    const data = new FormData(event.currentTarget);
    setSaving(true); setError(null);
    try {
      const response = await fetch(`/api/visits/${visit.id}/record/draft`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ version: note.version, subjective: note.subjective, objective: note.objective, assessment: data.get('assessment'), plan: data.get('plan') }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message ?? 'Could not save visit notes.');
      router.push(returnHref); router.refresh();
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not save visit notes.'); }
    finally { setSaving(false); }
  }
  return <section className="visit-record-panel" aria-labelledby="technician-notes-heading">
    <p className="visit-step-caption">Step 1 of 5 · Visit notes</p>
    <h2 id="technician-notes-heading">Technician visit notes</h2>
    <p>Document the reason for technician care and the care plan. History and vitals are available separately.</p>
    {canEdit ? <form className="visit-record-form" onSubmit={save}>
      <label>Assessment / care notes<textarea name="assessment" required defaultValue={note.assessment ?? ''} /></label>
      <label>Care plan<textarea name="plan" required defaultValue={note.plan ?? ''} /></label>
      {error ? <p role="alert" className="form-error">{error}</p> : null}
      <button className="button-primary" disabled={saving}>{saving ? 'Saving…' : 'Save and continue'}</button>
    </form> : <p>Only the assigned clinician or a recorded signoff delegate can edit these notes before finalization.</p>}
  </section>;
}
