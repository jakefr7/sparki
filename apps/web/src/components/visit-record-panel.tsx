'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';
import type { StaffMember, VisitDetail } from '../lib/patient-types';
import { useCurrentUser } from '../lib/use-current-user';

export function VisitRecordPanel({ visit }: { visit: VisitDetail }) {
  const router = useRouter();
  const { user } = useCurrentUser();
  const note = visit.soapNotes[0];
  const isAssignedDoctor = user?.id === visit.primaryVeterinarian?.id;
  const isAssignedTechnician = visit.visitType === 'TechnicianAppointment' && user?.id === visit.assignedTechnician?.id;
  const isDelegate = visit.signoffDelegates.some((entry) => entry.delegateId === user?.id);
  const canEdit = Boolean(user && (isAssignedDoctor || isAssignedTechnician || isDelegate) && note && ['Draft', 'ReadyForReview'].includes(note.status));
  const canDelegate = Boolean(user && (isAssignedDoctor || ['OWNER', 'PRACTICE_MANAGER'].includes(user.role)) && note && ['Draft', 'ReadyForReview'].includes(note.status));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [eligibleSigners, setEligibleSigners] = useState<StaffMember[]>([]);
  const [delegateId, setDelegateId] = useState('');
  const [amending, setAmending] = useState(false);
  const lockedNote = visit.soapNotes.find((entry) => entry.status === 'Locked');
  const canAmend = Boolean(user && lockedNote && (user.id === visit.primaryVeterinarian?.id || user.id === lockedNote.veterinarianId || isAssignedTechnician));

  useEffect(() => {
    if (!canDelegate) return;
    fetch('/api/staff?role=VETERINARIAN,OWNER', { cache: 'no-store' })
      .then((response) => response.json())
      .then((staff: StaffMember[]) => setEligibleSigners(staff.filter((entry) => entry.canFinalizeRecordsForOthers)))
      .catch(() => setError('Could not load backup record signers.'));
  }, [canDelegate]);

  if (!note) return null;

  async function saveForm(formElement: HTMLFormElement) {
    const form = new FormData(formElement);
    const response = await fetch(`/api/visits/${visit.id}/record/draft`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subjective: form.get('subjective'), objective: form.get('objective'),
          assessment: form.get('assessment'), plan: form.get('plan'), version: note?.version ?? 0,
        }),
      });
    const payload = (await response.json()) as { message?: string };
    if (!response.ok) throw new Error(payload.message ?? 'Could not save the record.');
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true); setError(null);
    try {
      await saveForm(event.currentTarget);
      router.refresh();
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not save the record.'); }
    finally { setSaving(false); }
  }

  async function finalize(form: HTMLFormElement | null) {
    if (!window.confirm('Finalize and lock this medical record? Future corrections must be amendments.')) return;
    setSaving(true); setError(null);
    try {
      if (form) await saveForm(form);
      const response = await fetch(`/api/visits/${visit.id}/record/finalize`, { method: 'POST' });
      const payload = (await response.json()) as { message?: string };
      if (!response.ok) throw new Error(payload.message ?? 'Could not finalize the record.');
      router.refresh();
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not finalize the record.'); }
    finally { setSaving(false); }
  }

  async function delegate() {
    if (!delegateId) return;
    setSaving(true); setError(null);
    try {
      const response = await fetch(`/api/visits/${visit.id}/record/delegate`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ delegateId }),
      });
      const payload = (await response.json()) as { message?: string };
      if (!response.ok) throw new Error(payload.message ?? 'Could not assign the backup signer.');
      router.refresh();
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not assign the backup signer.'); }
    finally { setSaving(false); }
  }

  async function amend(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setSaving(true); setError(null);
    try {
      const response = await fetch(`/api/visits/${visit.id}/record/amend`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reason: form.get('reason'), subjective: form.get('subjective'), objective: form.get('objective'),
          assessment: form.get('assessment'), plan: form.get('plan'),
        }),
      });
      const payload = (await response.json()) as { message?: string };
      if (!response.ok) throw new Error(payload.message ?? 'Could not add the amendment.');
      setAmending(false); router.refresh();
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not add the amendment.'); }
    finally { setSaving(false); }
  }

  return (
    <section className="visit-record-panel" aria-labelledby="visit-record-heading">
      <div className="visit-record-panel__header">
        <div><p className="eyebrow">Medical record</p><h2 id="visit-record-heading">SOAP Note</h2></div>
        <span className={`visit-record-status visit-record-status--${note.status.toLowerCase()}`}>{note.status}</span>
      </div>
      {canDelegate ? (
        <div className="visit-record-delegate">
          <label>Backup signer
            <select value={delegateId} onChange={(event) => setDelegateId(event.target.value)}>
              <option value="">Select an authorized clinician</option>
              {eligibleSigners.filter((staff) => staff.id !== visit.primaryVeterinarian?.id).map((staff) => (
                <option key={staff.id} value={staff.id}>{staff.displayName}</option>
              ))}
            </select>
          </label>
          <button type="button" className="button-secondary" disabled={!delegateId || saving} onClick={() => void delegate()}>Assign</button>
        </div>
      ) : null}
      {canEdit ? (
        <form onSubmit={save} className="visit-record-form">
          <label>Subjective<textarea name="subjective" defaultValue={note.subjective ?? ''} /></label>
          <label>Objective<textarea name="objective" defaultValue={note.objective ?? ''} /></label>
          <label>Assessment<textarea name="assessment" defaultValue={note.assessment ?? ''} /></label>
          <label>Plan<textarea name="plan" defaultValue={note.plan ?? ''} /></label>
          {error ? <p className="form-error" role="alert">{error}</p> : null}
          <div className="visit-record-form__actions">
            <button type="submit" className="button-secondary" disabled={saving}>{saving ? 'Saving…' : 'Save Draft'}</button>
            <button type="button" className="button-primary" disabled={saving} onClick={(event) => void finalize(event.currentTarget.form)}>Save &amp; Finalize</button>
          </div>
        </form>
      ) : (
        <dl className="visit-record-summary">
          <div><dt>Subjective</dt><dd>{note.subjective || 'Not recorded'}</dd></div>
          <div><dt>Objective</dt><dd>{note.objective || 'Not recorded'}</dd></div>
          <div><dt>Assessment</dt><dd>{note.assessment || 'Not recorded'}</dd></div>
          <div><dt>Plan</dt><dd>{note.plan || 'Not recorded'}</dd></div>
        </dl>
      )}
      {canAmend ? (
        <div className="visit-record-amendment">
          {!amending ? <button type="button" className="button-secondary" onClick={() => setAmending(true)}>Add Amendment</button> : (
            <form onSubmit={amend} className="visit-record-form">
              <h3>Append record amendment</h3>
              <p>The finalized note remains unchanged. This correction will be stored separately.</p>
              <label>Reason for correction<textarea name="reason" required /></label>
              <label>Subjective<textarea name="subjective" defaultValue={lockedNote?.subjective ?? ''} /></label>
              <label>Objective<textarea name="objective" defaultValue={lockedNote?.objective ?? ''} /></label>
              <label>Assessment<textarea name="assessment" defaultValue={lockedNote?.assessment ?? ''} /></label>
              <label>Plan<textarea name="plan" defaultValue={lockedNote?.plan ?? ''} /></label>
              <div className="visit-record-form__actions">
                <button className="button-primary" disabled={saving}>Save Amendment</button>
                <button type="button" className="button-secondary" onClick={() => setAmending(false)}>Cancel</button>
              </div>
            </form>
          )}
        </div>
      ) : null}
      {error && !canEdit ? <p className="form-error" role="alert">{error}</p> : null}
    </section>
  );
}
