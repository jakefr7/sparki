'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import type { ClinicalAttachmentSummary } from '../lib/patient-types';
import { useCurrentUser } from '../lib/use-current-user';

type Correction = { attachmentId: string; kind: 'remove' | 'replace' } | null;

export function ClinicalAttachmentsPanel({ patientId, visitId, attachments, finalized }: { patientId: string; visitId: string; attachments: ClinicalAttachmentSummary[]; finalized: boolean }) {
  const router = useRouter();
  const { user } = useCurrentUser();
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [correction, setCorrection] = useState<Correction>(null);
  const mayCorrect = ['OWNER', 'PRACTICE_MANAGER', 'VETERINARIAN'].includes(user?.role ?? '');

  async function postUpload(form: FormData) {
    setSaving(true);
    setError(null);
    try {
      const response = await fetch('/api/clinical-attachments', { method: 'POST', body: form });
      const body = await response.json() as { message?: string };
      if (!response.ok) throw new Error(body.message ?? 'Could not upload attachment.');
      setCorrection(null);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not upload attachment.');
    } finally {
      setSaving(false);
    }
  }

  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formNode = event.currentTarget;
    const form = new FormData(formNode);
    form.set('patientId', patientId);
    form.set('visitId', visitId);
    await postUpload(form);
    formNode.reset();
  }

  async function correct(event: FormEvent<HTMLFormElement>, attachmentId: string, kind: 'remove' | 'replace') {
    event.preventDefault();
    const formNode = event.currentTarget;
    const form = new FormData(formNode);
    const reason = String(form.get('reason') ?? '').trim();
    if (kind === 'replace') {
      form.set('patientId', patientId);
      form.set('visitId', visitId);
      form.set('replacesAttachmentId', attachmentId);
      form.set('correctionReason', reason);
      await postUpload(form);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/clinical-attachments/${attachmentId}/remove`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason, auditedFinalizedRemoval: finalized }),
      });
      const body = await response.json() as { message?: string };
      if (!response.ok) throw new Error(body.message ?? 'Could not remove attachment.');
      setCorrection(null);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not remove attachment.');
    } finally {
      setSaving(false);
    }
  }

  return <section id="visit-attachments" className="visit-work-panel" aria-labelledby="clinical-attachments-heading">
    <header><p className="eyebrow">Clinical record</p><h2 id="clinical-attachments-heading">Attachments</h2><p>PDF, JPG, or PNG · 25 MB maximum · private authenticated access.</p></header>
    <form onSubmit={(event) => void upload(event)}><label>File<input name="file" type="file" accept="application/pdf,image/jpeg,image/png,.pdf,.jpg,.jpeg,.png" required /></label><label>Clinical label<input name="label" maxLength={200} placeholder="Lab report, referral record, image…" /></label><button className="button-secondary" disabled={saving}>{saving ? 'Saving…' : 'Add to clinical record'}</button></form>
    {attachments.length ? <ul>{attachments.map((attachment) => <li key={attachment.id}>
      {attachment.href ? <a href={`/api${attachment.href}`}>{attachment.label || attachment.fileName}</a> : <span>{attachment.label || attachment.fileName}</span>} <small>{Math.ceil(attachment.sizeBytes / 1024)} KB · {new Date(attachment.createdAt).toLocaleString()}</small>
      {mayCorrect ? <span><button type="button" disabled={saving} onClick={() => setCorrection({ attachmentId: attachment.id, kind: 'remove' })}>{finalized ? 'Audited removal' : 'Remove'}</button><button type="button" disabled={saving} onClick={() => setCorrection({ attachmentId: attachment.id, kind: 'replace' })}>Replace with correction</button></span> : null}
      {correction?.attachmentId === attachment.id ? <form onSubmit={(event) => void correct(event, attachment.id, correction.kind)}>
        <p><strong>{correction.kind === 'replace' ? 'Replace with a corrected attachment' : finalized ? 'Remove from finalized history' : 'Remove attachment'}</strong></p>
        <label>Reason<input name="reason" maxLength={500} required /></label>
        {correction.kind === 'replace' ? <><label>Corrected file<input name="file" type="file" accept="application/pdf,image/jpeg,image/png,.pdf,.jpg,.jpeg,.png" required /></label><label>Clinical label<input name="label" maxLength={200} defaultValue={attachment.label ?? ''} /></label></> : null}
        {finalized ? <p><small>The original file and its association remain in the audit history.</small></p> : null}
        <button className="button-secondary" disabled={saving}>{saving ? 'Saving…' : correction.kind === 'replace' ? 'Save corrected attachment' : finalized ? 'Confirm audited removal' : 'Confirm removal'}</button>
        <button type="button" disabled={saving} onClick={() => setCorrection(null)}>Cancel</button>
      </form> : null}
    </li>)}</ul> : <p>No clinical attachments.</p>}
    {error ? <p className="form-error" role="alert">{error}</p> : null}
  </section>;
}
