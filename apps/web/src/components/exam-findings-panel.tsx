'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import type { VisitDetail } from '../lib/patient-types';
import type { AutosaveState } from './patient-context-bar';

const EXAM_IN_PROGRESS_STATE = 'VeterinarianExamInProgress';
const AUTOSAVE_DELAY_MS = 900;
const STRUCTURED_EXAM_KIND = 'sparki-small-animal-exam';

type ExamFindings = NonNullable<VisitDetail['examFindings']>;
type Intake = VisitDetail['intake'];
type FindingStatus = 'Normal' | 'Abnormal' | 'Not examined';
type SystemFinding = { status: FindingStatus; notes: string };

const EXAM_SYSTEMS = [
  ['eyes', 'Eyes'],
  ['ears', 'Ears'],
  ['noseThroat', 'Nose & throat'],
  ['oralDental', 'Oral & dental'],
  ['cardiovascular', 'Cardiovascular'],
  ['respiratory', 'Respiratory'],
  ['abdomen', 'Abdomen / GI'],
  ['urogenital', 'Urogenital'],
  ['musculoskeletal', 'Musculoskeletal'],
  ['neurologic', 'Neurologic'],
  ['skinCoat', 'Skin & coat'],
  ['lymphNodes', 'Peripheral lymph nodes'],
] as const;

type SystemKey = (typeof EXAM_SYSTEMS)[number][0];

interface StructuredExam {
  kind: typeof STRUCTURED_EXAM_KIND;
  version: 1;
  general: {
    demeanor: string;
    painScore: string;
    bodyConditionScore: string;
    hydration: string;
  };
  systems: Record<SystemKey, SystemFinding>;
  additionalNotes: string;
}

interface ExamDraft extends StructuredExam {
  problemList: string;
  recommendations: string;
}

interface ExamFindingsPayload {
  subjective?: string | null;
  objective?: string | null;
  assessment?: string | null;
  plan?: string | null;
}

function emptySystems(): Record<SystemKey, SystemFinding> {
  return Object.fromEntries(EXAM_SYSTEMS.map(([key]) => [key, { status: 'Not examined', notes: '' }])) as Record<SystemKey, SystemFinding>;
}

function draftFromFindings(findings: VisitDetail['examFindings']): ExamDraft {
  const fallback: ExamDraft = {
    kind: STRUCTURED_EXAM_KIND,
    version: 1,
    general: { demeanor: '', painScore: '', bodyConditionScore: '', hydration: '' },
    systems: emptySystems(),
    additionalNotes: findings?.objective ?? findings?.subjective ?? '',
    problemList: findings?.assessment ?? '',
    recommendations: findings?.plan ?? '',
  };

  if (!findings?.objective) return fallback;
  try {
    const parsed = JSON.parse(findings.objective) as Partial<StructuredExam>;
    if (parsed.kind !== STRUCTURED_EXAM_KIND) return fallback;
    return {
      ...fallback,
      ...parsed,
      general: { ...fallback.general, ...parsed.general },
      systems: { ...fallback.systems, ...parsed.systems },
      problemList: findings.assessment ?? '',
      recommendations: findings.plan ?? '',
    };
  } catch {
    return fallback;
  }
}

function payloadFromDraft(draft: ExamDraft): ExamFindingsPayload {
  const { problemList, recommendations, ...structured } = draft;
  return {
    subjective: null,
    objective: JSON.stringify(structured),
    assessment: problemList || null,
    plan: recommendations || null,
  };
}

function IntakeRecap({ intake }: { intake: Intake }) {
  const [open, setOpen] = useState(true);
  if (!intake) return null;
  const vitals = [
    intake.weight != null ? `${intake.weight} ${intake.weightUnit.toLowerCase()}` : null,
    intake.temperature != null ? `${intake.temperature}°F` : null,
    intake.heartRate != null ? `${intake.heartRate} bpm` : null,
    intake.respiratoryRate != null ? `${intake.respiratoryRate} rpm` : null,
    intake.crtSeconds != null ? `CRT ${intake.crtSeconds}s` : null,
    intake.gumColor ? `Gums: ${intake.gumColor}` : null,
  ].filter(Boolean).join(' · ');

  return (
    <section className={`exam-intake-drawer${open ? ' exam-intake-drawer--open' : ''}`}>
      <button type="button" className="exam-intake-drawer__toggle" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
        <span><span className="eyebrow">Clinical handoff</span><strong>Intake recap</strong></span>
        <span className="exam-intake-drawer__action">{open ? 'Hide' : 'View'} <span aria-hidden="true">⌄</span></span>
      </button>
      {open ? (
        <div className="exam-intake-drawer__content">
          <div><span>Vitals</span><p>{vitals || 'Not captured'}</p></div>
          <div><span>Medical history</span><p>{intake.historyNotes || intake.chiefComplaint || 'Not captured'}</p></div>
        </div>
      ) : null}
    </section>
  );
}

function ExamFindingsSummary({ examFindings }: { examFindings: ExamFindings }) {
  const draft = draftFromFindings(examFindings);
  const examined = EXAM_SYSTEMS.filter(([key]) => draft.systems[key].status !== 'Not examined');
  return (
    <div className="visit-intake-summary">
      <h3>Physical exam summary</h3>
      <dl>
        <div><dt>General assessment</dt><dd>{[draft.general.painScore && `Pain ${draft.general.painScore}`, draft.general.bodyConditionScore && `BCS ${draft.general.bodyConditionScore}/9`].filter(Boolean).join(' · ') || 'Not captured'}</dd></div>
        <div><dt>Body systems</dt><dd>{examined.length ? examined.map(([key, label]) => `${label}: ${draft.systems[key].status}${draft.systems[key].notes ? ` — ${draft.systems[key].notes}` : ''}`).join('\n') : draft.additionalNotes || 'Not captured'}</dd></div>
        <div><dt>Problem list / diagnoses</dt><dd>{draft.problemList || 'Not captured'}</dd></div>
        <div><dt>Recommendations / plan</dt><dd>{draft.recommendations || 'Not captured'}</dd></div>
      </dl>
    </div>
  );
}

export function ExamFindingsPanel({ visitId, state, examFindings, intake }: { visitId: string; state: string; examFindings: VisitDetail['examFindings']; intake: Intake }) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<ExamDraft>(() => draftFromFindings(examFindings));
  const [autosaveState, setAutosaveState] = useState<AutosaveState>('idle');
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function saveExamFindings(nextDraft: ExamDraft) {
    setAutosaveState('saving');
    try {
      const response = await fetch(`/api/visits/${visitId}/exam-findings`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payloadFromDraft(nextDraft)) });
      const body = (await response.json()) as { message?: string };
      if (!response.ok) throw new Error(body.message ?? 'Could not save exam findings.');
      setAutosaveState('saved');
      setLastSavedAt(new Date());
    } catch (caught) {
      setAutosaveState('error');
      throw caught;
    }
  }

  function updateDraft(updater: (current: ExamDraft) => ExamDraft) {
    setDraft((current) => {
      const next = updater(current);
      if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
      autosaveTimer.current = setTimeout(() => void saveExamFindings(next).catch(() => undefined), AUTOSAVE_DELAY_MS);
      return next;
    });
  }

  useEffect(() => () => { if (autosaveTimer.current) clearTimeout(autosaveTimer.current); }, []);
  if (state !== EXAM_IN_PROGRESS_STATE && !examFindings) return null;

  async function completeExam() {
    setSubmitting(true);
    setError(null);
    try {
      if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
      await saveExamFindings(draft);
      const response = await fetch(`/api/visits/${visitId}/exam/complete`, { method: 'POST' });
      const payload = (await response.json()) as { message?: string };
      if (!response.ok) throw new Error(payload.message ?? 'Could not complete exam.');
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not complete exam.');
    } finally { setSubmitting(false); }
  }

  return (
    <div className="exam-workspace-body">
      {state === EXAM_IN_PROGRESS_STATE ? <IntakeRecap intake={intake} /> : null}
      <section className="exam-findings-card" aria-labelledby="exam-findings-heading">
        <div className="exam-findings-card__header"><div><p className="eyebrow">Veterinarian exam</p><h2 id="exam-findings-heading">Physical examination</h2><p>Record the patient’s general assessment and head-to-tail findings.</p></div></div>

        {state === EXAM_IN_PROGRESS_STATE ? (
          <div className="physical-exam-form">
            <fieldset className="physical-exam-section"><legend>General assessment</legend><div className="physical-exam-general">
              <label><span>Pain score</span><input value={draft.general.painScore} maxLength={30} placeholder="Scale and score" onChange={(e) => updateDraft((d) => ({ ...d, general: { ...d.general, painScore: e.target.value } }))} /></label>
              <fieldset className="physical-exam-pill-field"><legend>Body condition score</legend><div className="physical-exam-pills physical-exam-pills--score">{Array.from({ length: 9 }, (_, i) => String(i + 1)).map((score) => <button type="button" key={score} aria-pressed={draft.general.bodyConditionScore === score} className={draft.general.bodyConditionScore === score ? 'is-selected' : ''} onClick={() => updateDraft((d) => ({ ...d, general: { ...d.general, bodyConditionScore: d.general.bodyConditionScore === score ? '' : score } }))}>{score}</button>)}</div></fieldset>
            </div></fieldset>

            <fieldset className="physical-exam-section"><legend>Body systems</legend><div className="physical-exam-systems">
              {EXAM_SYSTEMS.map(([key, label]) => <div className="physical-exam-system" key={key}><fieldset className="physical-exam-pill-field"><legend>{label}</legend><div className="physical-exam-pills">{(['Normal', 'Abnormal', 'Not examined'] as FindingStatus[]).map((status) => <button type="button" key={status} aria-pressed={draft.systems[key].status === status} className={draft.systems[key].status === status ? `is-selected is-${status.toLowerCase().replace(' ', '-')}` : ''} onClick={() => updateDraft((d) => ({ ...d, systems: { ...d.systems, [key]: { ...d.systems[key], status } } }))}>{status}</button>)}</div></fieldset><label className="physical-exam-system__notes"><span className="sr-only">{label} notes</span><input maxLength={150} placeholder="Add findings or notes" value={draft.systems[key].notes} onChange={(e) => updateDraft((d) => ({ ...d, systems: { ...d.systems, [key]: { ...d.systems[key], notes: e.target.value } } }))} /></label></div>)}
            </div></fieldset>

            <div className="physical-exam-conclusion">
              <label><span>Problem list / diagnoses</span><textarea maxLength={1200} placeholder="Document active problems, diagnoses, or differentials" value={draft.problemList} onChange={(e) => updateDraft((d) => ({ ...d, problemList: e.target.value }))} /></label>
              <label><span>Recommendations / plan</span><textarea maxLength={1200} placeholder="Document recommended diagnostics, treatment, and follow-up" value={draft.recommendations} onChange={(e) => updateDraft((d) => ({ ...d, recommendations: e.target.value }))} /></label>
            </div>
            <label className="physical-exam-additional"><span>Additional exam notes</span><textarea maxLength={500} placeholder="Anything not captured above" value={draft.additionalNotes} onChange={(e) => updateDraft((d) => ({ ...d, additionalNotes: e.target.value }))} /></label>
            {error ? <p className="form-error" role="alert">{error}</p> : null}
            <div className="exam-findings-actions"><div className="intake-action-bar__status"><span className={`autosave-indicator autosave-indicator--${autosaveState}`}><span className="autosave-indicator__dot" aria-hidden="true" />{autosaveState === 'saving' ? 'Saving…' : autosaveState === 'error' ? 'Save failed' : lastSavedAt ? `Saved ${lastSavedAt.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : 'All changes saved'}</span>{autosaveState === 'error' ? <button type="button" className="intake-save-retry" onClick={() => void saveExamFindings(draft).catch(() => undefined)}>Retry</button> : null}</div><button type="button" className="button-primary exam-complete-button" disabled={submitting} onClick={() => void completeExam()}>{submitting ? 'Completing…' : 'Complete Exam'}</button></div>
          </div>
        ) : <><p className="visit-intake-panel__status">Exam findings are not editable while this visit is in {state}.</p>{examFindings ? <ExamFindingsSummary examFindings={examFindings} /> : null}</>}
      </section>
    </div>
  );
}
