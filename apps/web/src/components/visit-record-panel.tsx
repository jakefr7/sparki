'use client';

import { useVisitStep } from './visit-care-sections';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import type { StaffMember, VisitDetail } from '../lib/patient-types';
import { useCurrentUser } from '../lib/use-current-user';

const RECORD_STATUS_LABELS: Record<string, string> = {
  Draft: 'Draft',
  ReadyForReview: 'Ready for review',
  Locked: 'Signed',
};

// The record cannot be signed until every SOAP section carries content (mirrors the API rule).
const SOAP_FIELDS = [
  ['subjective', 'Subjective'],
  ['objective', 'Objective'],
  ['assessment', 'Assessment'],
  ['plan', 'Plan'],
] as const;

const EXAM_SYSTEM_LABELS: Record<string, string> = { eyes: 'Eyes', ears: 'Ears', noseThroat: 'Nose/throat', oralDental: 'Oral/dental', cardiovascular: 'Cardiovascular', respiratory: 'Respiratory', abdomen: 'Abdomen/GI', urogenital: 'Urogenital', musculoskeletal: 'Musculoskeletal', neurologic: 'Neurologic', skinCoat: 'Skin/coat', lymphNodes: 'Peripheral lymph nodes' };

interface StructuredExam {
  kind?: string;
  general?: { painScore?: string; bodyConditionScore?: string };
  systems?: Record<string, { status?: string; notes?: string; documented?: boolean }>;
  additionalNotes?: string;
}

function readableObjective(value: string | null | undefined): string {
  if (!value) return '';
  try {
    const parsed = JSON.parse(value) as StructuredExam;
    if (parsed.kind !== 'sparki-small-animal-exam') return value;
    const general = [parsed.general?.painScore && `Pain: ${parsed.general.painScore}`, parsed.general?.bodyConditionScore && `BCS: ${parsed.general.bodyConditionScore}/9`].filter(Boolean).join('; ');
    const systems = Object.entries(parsed.systems ?? {})
      .filter(([, finding]) => finding.documented === true && (finding.status !== 'Not examined' || Boolean(finding.notes?.trim())))
      .map(([key, finding]) => `${EXAM_SYSTEM_LABELS[key] ?? key}: ${finding.status ?? 'Not examined'}${finding.notes ? ` — ${finding.notes}` : ''}`);
    return [general, ...systems, parsed.additionalNotes].filter(Boolean).join('\n');
  } catch { return value; }
}

// A signed routine record should be glanceable: a normal exam collapses to one line,
// only abnormal or noted findings stay on the surface. Works from the structured exam
// JSON and from the flattened "System: Status — notes" text the review step saves.
function summarizeObjective(value: string | null | undefined): { normalHeadline: string | null; notable: string[]; normalCount: number; full: string } {
  const full = readableObjective(value);
  if (!value) return { normalHeadline: null, notable: [], normalCount: 0, full: '' };

  try {
    const parsed = JSON.parse(value) as StructuredExam;
    if (parsed.kind === 'sparki-small-animal-exam') {
      const notable: string[] = [];
      let normalCount = 0;
      let documentedCount = 0;
      for (const [key, finding] of Object.entries(parsed.systems ?? {})) {
        if (finding.documented !== true || (finding.status === 'Not examined' && !finding.notes?.trim())) continue;
        documentedCount += 1;
        if ((finding.status && finding.status !== 'Normal') || finding.notes) {
          notable.push(`${EXAM_SYSTEM_LABELS[key] ?? key}: ${finding.status ?? 'Not examined'}${finding.notes ? ` — ${finding.notes}` : ''}`);
        } else {
          normalCount += 1;
        }
      }
      const general = [parsed.general?.painScore && `Pain ${parsed.general.painScore}`, parsed.general?.bodyConditionScore && `BCS ${parsed.general.bodyConditionScore}/9`].filter(Boolean).join(' · ');
      if (general) notable.unshift(general);
      if (parsed.additionalNotes) notable.push(parsed.additionalNotes);
      return { normalHeadline: notable.length || documentedCount !== Object.keys(EXAM_SYSTEM_LABELS).length ? null : 'All body systems normal', notable, normalCount, full };
    }
  } catch { /* not structured JSON — fall through to the text parser */ }

  const systems = new Set(Object.values(EXAM_SYSTEM_LABELS).map((label) => label.toLowerCase()));
  const notable: string[] = [];
  let normalCount = 0;
  for (const line of full.split('\n').map((entry) => entry.trim()).filter(Boolean)) {
    const match = line.match(/^(.+?):\s*(.+)$/);
    const system = match?.[1]?.toLowerCase();
    const finding = match?.[2]?.trim();
    if (system && finding && systems.has(system) && /^normal$/i.test(finding)) {
      normalCount += 1;
    } else {
      notable.push(line);
    }
  }
  return { normalHeadline: notable.length || normalCount < 6 ? null : 'All body systems normal', notable, normalCount, full };
}

export function VisitRecordPanel({ visit, attachments }: { visit: VisitDetail; attachments?: ReactNode }) {
  const router = useRouter();
  const step = useVisitStep();
  const { user } = useCurrentUser();
  const note = visit.soapNotes[0];
  const isAssignedDoctor = user?.id === visit.primaryVeterinarian?.id;
  const isUnassignedClinicalCompleter = !visit.primaryVeterinarian && Boolean(user?.permissions.includes('clinical:complete'));
  const isAssignedTechnician = visit.visitType === 'TechnicianAppointment' && user?.id === visit.assignedTechnician?.id;
  const isDelegate = visit.signoffDelegates.some((entry) => entry.delegateId === user?.id);
  const canEdit = Boolean(user && (isAssignedDoctor || isUnassignedClinicalCompleter || isAssignedTechnician || isDelegate) && note && ['Draft', 'ReadyForReview'].includes(note.status));
  const canDelegate = Boolean(user && (isAssignedDoctor || ['OWNER', 'PRACTICE_MANAGER'].includes(user.role)) && note && ['Draft', 'ReadyForReview'].includes(note.status));
  const signed = note?.status === 'Locked';
  const signedOn = note?.lockedAt ?? note?.signedAt ?? null;
  const signingVet = visit.primaryVeterinarian;
  const signerName = note?.veterinarianId && signingVet?.id === note.veterinarianId
    ? (signingVet.displayName ?? `${signingVet.firstName} ${signingVet.lastName}`.trim())
    : null;
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [eligibleSigners, setEligibleSigners] = useState<StaffMember[]>([]);
  const [delegateId, setDelegateId] = useState('');
  const [amending, setAmending] = useState(false);
  const [missingSoap, setMissingSoap] = useState<string[]>([]);
  const lockedNote = visit.soapNotes.find((entry) => entry.status === 'Locked');
  const canAmend = Boolean(user && lockedNote && (user.id === visit.primaryVeterinarian?.id || user.id === lockedNote.veterinarianId || isAssignedTechnician));
  const objectiveText = readableObjective(note?.objective);
  const objective = summarizeObjective(note?.objective);
  const recordForm = useRef<HTMLFormElement>(null);
  const version = useRef(note?.version ?? 0);
  const saveQueue = useRef<Promise<void>>(Promise.resolve());
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const revision = useRef(0);
  const [saveStatus, setSaveStatus] = useState('All changes saved');
  const [saveError, setSaveError] = useState<string | null>(null);
  useEffect(() => () => { if (saveTimer.current) clearTimeout(saveTimer.current); }, []);

  useEffect(() => {
    if (!canDelegate) return;
    fetch('/api/staff?role=VETERINARIAN,OWNER', { cache: 'no-store' })
      .then((response) => response.json())
      .then((staff: StaffMember[]) => setEligibleSigners(staff.filter((entry) => entry.canFinalizeRecordsForOthers)))
      .catch(() => setError('Could not load backup record signers.'));
  }, [canDelegate]);

  if (!note) return null;

  function saveForm(formElement: HTMLFormElement) {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    const form = new FormData(formElement);
    const savedRevision = revision.current;
    const fields = {
      subjective: form.get('subjective'), objective: form.get('objective'),
      assessment: form.get('assessment'), plan: form.get('plan'),
    };
    setSaveStatus('Saving…');
    const operation = saveQueue.current.catch(() => undefined).then(async () => {
      const response = await fetch(`/api/visits/${visit.id}/record/draft`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...fields, version: version.current }),
      });
      const payload = await response.json() as { message?: string; version: number };
      if (!response.ok) throw new Error(payload.message ?? 'Could not save the record.');
      version.current = payload.version;
      if (savedRevision === revision.current) {
        setSaveStatus('All changes saved');
        setSaveError(null);
        setError(null);
      }
    }).catch((caught: unknown) => {
      setSaveStatus('Changes not saved');
      setSaveError(caught instanceof Error ? caught.message : 'Could not save the record.');
      setError(null);
      throw caught;
    });
    saveQueue.current = operation;
    return operation;
  }

  function scheduleSave() {
    revision.current += 1;
    setSaveStatus('Saving…');
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      if (recordForm.current) void saveForm(recordForm.current).catch(() => undefined);
    }, 700);
  }

  function pendingSoapGaps(): string[] {
    const form = recordForm.current;
    if (!form) return [];
    const data = new FormData(form);
    return SOAP_FIELDS.filter(([name]) => !String(data.get(name) ?? '').trim()).map(([name]) => name);
  }

  function requestFinalize() {
    if (saveError) {
      setError(null);
      return;
    }
    const gaps = pendingSoapGaps();
    const firstGap = gaps[0];
    if (firstGap) {
      setMissingSoap(gaps);
      const labels = SOAP_FIELDS.filter(([name]) => gaps.includes(name)).map(([, label]) => label);
      setError(`Add ${labels.join(', ')} before signing. Every SOAP section must have content.`);
      const field = recordForm.current?.elements.namedItem(firstGap);
      if (field instanceof HTMLElement) field.focus();
      return;
    }
    setMissingSoap([]);
    setError(null);
    void finalize();
  }

  async function finalize() {
    const form = recordForm.current;
    setSaving(true); setError(null);
    try {
      if (form) await saveForm(form);
      const response = await fetch(`/api/visits/${visit.id}/record/finalize`, { method: 'POST' });
      const payload = (await response.json()) as { message?: string };
      if (!response.ok) throw new Error(payload.message ?? 'Could not sign the record.');
      router.push('/');
      router.refresh();
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not sign the record.'); }
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
    <>
    <section id="visit-record" className={`visit-record-panel${signed ? ' visit-record-panel--signed' : ''}`} aria-labelledby="visit-record-heading">
      <div className="visit-record-panel__header">
        <div>
          <h2 id="visit-record-heading">Medical record</h2>
          {signed && signedOn ? (
            <p className="visit-record-panel__signed">Signed {new Date(signedOn).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })} · {new Date(signedOn).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}{signerName ? ` · ${signerName}` : ''}</p>
          ) : null}
        </div>
        <span className={`visit-record-status visit-record-status--${note.status.toLowerCase()}`}>{RECORD_STATUS_LABELS[note.status] ?? note.status}</span>
      </div>
      {canDelegate ? (
        <details className="visit-record-delegate-options"><summary>Assign a backup signer</summary><div className="visit-record-delegate">
          <label>Backup signer
            <select value={delegateId} onChange={(event) => setDelegateId(event.target.value)}>
              <option value="">Select an authorized clinician</option>
              {eligibleSigners.filter((staff) => staff.id !== visit.primaryVeterinarian?.id).map((staff) => (
                <option key={staff.id} value={staff.id}>{staff.displayName}</option>
              ))}
            </select>
          </label>
          <button type="button" className="button-secondary" disabled={!delegateId || saving} onClick={() => void delegate()}>Assign</button>
        </div></details>
      ) : null}
      {canEdit ? (
        <form id={`visit-record-form-${visit.id}`} ref={recordForm} onChange={scheduleSave} onSubmit={(event) => event.preventDefault()} className="visit-record-form visit-record-form--review">
          {SOAP_FIELDS.map(([name, label]) => {
            const defaults: Record<string, string> = { subjective: note.subjective ?? '', objective: objectiveText, assessment: note.assessment ?? '', plan: note.plan ?? '' };
            const missing = missingSoap.includes(name);
            return (
              <label key={name} className={missing ? 'is-missing' : undefined}>
                <span>{label}{missing ? <em> · required</em> : null}</span>
                <textarea
                  name={name}
                  aria-invalid={missing || undefined}
                  rows={name === 'objective' ? Math.max(5, Math.min(18, objectiveText.split('\n').length + 1)) : undefined}
                  defaultValue={defaults[name]}
                  onChange={() => { if (missing) setMissingSoap((current) => current.filter((field) => field !== name)); }}
                />
              </label>
            );
          })}
          {error ? <p className="form-error" role="alert">{error}</p> : null}
        </form>
      ) : (
        <dl className="visit-record-soap">
          <div><dt>Subjective</dt><dd>{note.subjective || '—'}</dd></div>
          <div>
            <dt>Objective</dt>
            <dd>
              {objective.normalHeadline ? (
                <>
                  {objective.normalHeadline}
                  {objective.full ? <details className="visit-record-soap__more"><summary>View by system</summary><p>{objective.full}</p></details> : null}
                </>
              ) : objective.notable.length ? (
                <>
                  {objective.notable.map((line, index) => <span key={index} className="visit-record-soap__line">{line}</span>)}
                  {objective.normalCount ? <span className="visit-record-soap__muted">{objective.normalCount} other {objective.normalCount === 1 ? 'system' : 'systems'} normal</span> : null}
                </>
              ) : (objectiveText || '—')}
            </dd>
          </div>
          <div><dt>Assessment</dt><dd>{note.assessment || '—'}</dd></div>
          <div><dt>Plan</dt><dd>{note.plan || '—'}</dd></div>
        </dl>
      )}
      {canAmend && amending ? (
        <div className="visit-record-amendment visit-record-amendment--open">
          <form onSubmit={amend} className="visit-record-form">
            <h3>Amend the signed record</h3>
            <p>The signed record stays unchanged. Your amendment is stored and attributed separately.</p>
            <label>Reason for amendment<textarea name="reason" required /></label>
            <label>Subjective<textarea name="subjective" defaultValue={lockedNote?.subjective ?? ''} /></label>
            <label>Objective<textarea name="objective" defaultValue={lockedNote?.objective ?? ''} /></label>
            <label>Assessment<textarea name="assessment" defaultValue={lockedNote?.assessment ?? ''} /></label>
            <label>Plan<textarea name="plan" defaultValue={lockedNote?.plan ?? ''} /></label>
            <div className="visit-record-form__actions">
              <button className="button-primary" disabled={saving}>Save amendment</button>
              <button type="button" className="button-secondary" onClick={() => setAmending(false)}>Cancel</button>
            </div>
          </form>
        </div>
      ) : null}
      {error && !canEdit ? <p className="form-error" role="alert">{error}</p> : null}
      {attachments ? <div className="visit-record-panel__attachments">{attachments}</div> : null}
      {canAmend && !amending ? (
        <p className="visit-record-panel__correct">
          <button type="button" onClick={() => setAmending(true)}>Correct this record</button>
        </p>
      ) : null}
      {canEdit ? (
        <div className="visit-record-panel__save">
          <span id={`visit-record-save-status-${visit.id}`} className={`autosave-indicator autosave-indicator--${saveStatus === 'Changes not saved' ? 'error' : saveStatus === 'Saving…' ? 'saving' : 'saved'}`} role="status"><span className="autosave-indicator__dot" aria-hidden="true" />{saveError ? `Not saved — ${saveError}` : saveStatus}</span>
          {saveStatus === 'Changes not saved' ? <button type="button" className="visit-record-save-draft" onClick={() => { if (recordForm.current) void saveForm(recordForm.current).catch(() => undefined); }}>Retry</button> : null}
        </div>
      ) : null}
    </section>
    {step || canEdit ? (
      <footer className="visit-step-actions visit-record-footer">
        {step ? <button type="button" className="visit-stage-navigation__link" disabled={saving} onClick={step.back}>← Back to discharge</button> : <span />}
          {canEdit ? <button type="button" className="button-primary" disabled={saving || Boolean(saveError)} aria-describedby={saveError ? `visit-record-save-status-${visit.id}` : undefined} onClick={requestFinalize}>{saving ? 'Completing…' : 'Complete visit'}</button> : null}
      </footer>
    ) : null}
    </>
  );
}
