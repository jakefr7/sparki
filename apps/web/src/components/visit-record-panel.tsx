'use client';
import { VisitDocumentDownload } from './visit-document-download';

import { useVisitStep } from './visit-care-sections';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent, type ReactNode } from 'react';
import type { VisitDetail } from '../lib/patient-types';
import { useCurrentUser } from '../lib/use-current-user';

const RECORD_STATUS_LABELS: Record<string, string> = {
  Draft: 'Draft',
  ReadyForReview: 'Ready for review',
  Locked: 'Signed',
};

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

function VisitOverview({ visit }: { visit: VisitDetail }) {
  const note = visit.soapNotes[0];
  const objective = summarizeObjective(note?.objective);
  const completedCare = visit.workItems.filter((item) =>
    ['Diagnostic', 'Treatment', 'Medication'].includes(item.type) && item.status === 'Completed',
  );
  const [treatmentPlan, whatsNext = ''] = (note?.plan ?? visit.examFindings?.plan ?? '').split("\n\nWhat's Next\n");
  return (
    <section className="visit-final-overview" aria-labelledby="visit-final-overview-heading">
      <div className="visit-record-panel__header">
        <div><p className="eyebrow">Visit closeout</p><h2 id="visit-final-overview-heading">Review visit</h2><p>Review today’s care and discharge instructions, then finalize the visit.</p></div>
      </div>
      <div className="post-exam-review__summary-grid">
        <article><span>Intake</span><p>{note?.subjective || visit.intake?.chiefComplaint || visit.intake?.historyNotes || visit.reason}</p></article>
        <article className="post-exam-review__findings"><span>Exam findings</span>{objective.normalHeadline ? <p>{objective.normalHeadline}</p> : objective.notable.length ? <ul>{objective.notable.map((line, index) => <li key={index}>{line}</li>)}</ul> : <p>{objective.full || 'No exam findings documented.'}</p>}{objective.normalCount > 0 && !objective.normalHeadline ? <p>{objective.normalCount} other {objective.normalCount === 1 ? 'system' : 'systems'} normal</p> : null}{objective.full ? <details><summary>View full exam</summary><p style={{ whiteSpace: 'pre-line' }}>{objective.full}</p></details> : null}</article>
        <article><span>Diagnosis</span><p>{note?.assessment || visit.examFindings?.assessment || 'No diagnosis documented.'}</p></article>
        <article><span>Treatment plan</span><p>{treatmentPlan || 'No treatment plan documented.'}</p></article>
        <article><span>What&apos;s next</span><p>{whatsNext || visit.discharge?.followUpPlan || 'No follow-up recommendation documented.'}</p></article>
        <article><span>Home-care instructions</span><p>{visit.discharge?.instructions || 'Discharge instructions have not been saved.'}</p></article>
        <article className="post-exam-review__findings"><span>Care completed</span>{completedCare.length ? <ul>{completedCare.map((item) => <li key={item.id}><strong>{item.title}</strong><span>{item.type}</span></li>)}</ul> : <p>No performed care documented.</p>}</article>
      </div>
    </section>
  );
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
  const canFinalize = Boolean(user && (isAssignedDoctor || isUnassignedClinicalCompleter || isAssignedTechnician || isDelegate) && note && ['Draft', 'ReadyForReview'].includes(note.status));
  const signed = note?.status === 'Locked';
  const signedOn = note?.lockedAt ?? note?.signedAt ?? null;
  const signingVet = visit.primaryVeterinarian;
  const signerName = note?.veterinarianId && signingVet?.id === note.veterinarianId
    ? (signingVet.displayName ?? `${signingVet.firstName} ${signingVet.lastName}`.trim())
    : null;
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [amending, setAmending] = useState(false);
  const lockedNote = visit.soapNotes.find((entry) => entry.status === 'Locked');
  const canAmend = Boolean(user && lockedNote && (user.id === visit.primaryVeterinarian?.id || user.id === lockedNote.veterinarianId || isAssignedTechnician));
  const objectiveText = readableObjective(note?.objective);
  const objective = summarizeObjective(note?.objective);
  if (!note) return null;

  async function finalize() {
    setSaving(true); setError(null);
    try {
      const response = await fetch(`/api/visits/${visit.id}/record/finalize`, { method: 'POST' });
      const payload = (await response.json()) as { message?: string };
      if (!response.ok) throw new Error(payload.message === 'Complete all SOAP sections before finalizing the medical record.' ? 'Document the history, exam findings, diagnosis, and treatment plan before finalizing the visit.' : payload.message ?? 'Could not sign the record.');
      router.push('/');
      router.refresh();
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not sign the record.'); }
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
    {!signed ? <VisitOverview visit={visit} /> : null}
    {signed ? <section id="visit-record" className={`visit-record-panel${signed ? ' visit-record-panel--signed' : ''}`} aria-labelledby="visit-record-heading">
      <div className="visit-record-panel__header">
        <div>
          <h2 id="visit-record-heading">Medical record</h2>
          {signed && signedOn ? (
            <p className="visit-record-panel__signed">Signed {new Date(signedOn).toLocaleDateString('en-US', { timeZone: visit.location?.timeZone ?? 'UTC', month: 'short', day: 'numeric', year: 'numeric' })} · {new Date(signedOn).toLocaleTimeString('en-US', { timeZone: visit.location?.timeZone ?? 'UTC', hour: 'numeric', minute: '2-digit' })}{signerName ? ` · ${signerName}` : ''}</p>
          ) : null}
        </div>
        <span className={`visit-record-status visit-record-status--${note.status.toLowerCase()}`}>{RECORD_STATUS_LABELS[note.status] ?? note.status}</span>
      </div>
      {lockedNote ? <VisitDocumentDownload visitId={visit.id} kind="record">Download medical record PDF</VisitDocumentDownload> : null}
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
      {error && !canFinalize ? <p className="form-error" role="alert">{error}</p> : null}
      {attachments ? <div className="visit-record-panel__attachments">{attachments}</div> : null}
      {canAmend && !amending ? (
        <p className="visit-record-panel__correct">
          <button type="button" onClick={() => setAmending(true)}>Correct this record</button>
        </p>
      ) : null}
    </section> : null}
    {!signed && !canFinalize ? <p role="status">Only the assigned clinician or a recorded signoff delegate can finalize this visit.</p> : null}
    {!signed && (!visit.discharge || visit.workItems.some((item) => ['Diagnostic', 'Treatment', 'Medication'].includes(item.type) && ['Pending', 'InProgress'].includes(item.status))) ? <p role="status">Complete care and save discharge instructions before finalizing the visit.</p> : null}
    {!signed && error ? <p className="form-error" role="alert">{error}</p> : null}
    {step || canFinalize ? (
      <footer className="visit-step-actions visit-record-footer">
        {step ? <button type="button" className="visit-stage-navigation__link" disabled={saving} onClick={step.back}>← Back to discharge</button> : <span />}
          {canFinalize ? <button type="button" className="button-primary" disabled={saving || !visit.discharge || visit.workItems.some((item) => ['Diagnostic', 'Treatment', 'Medication'].includes(item.type) && ['Pending', 'InProgress'].includes(item.status))} onClick={() => void finalize()}>{saving ? 'Finalizing…' : 'Finalize visit'}</button> : null}
      </footer>
    ) : null}
    </>
  );
}
