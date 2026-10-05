'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import type { VisitDetail } from '../lib/patient-types';
import type { AutosaveState } from './patient-context-bar';
import { DiagnosisInput } from './diagnosis-input';

const EXAM_IN_PROGRESS_STATE = 'VeterinarianExamInProgress';
const AUTOSAVE_DELAY_MS = 900;
const STRUCTURED_EXAM_KIND = 'sparki-small-animal-exam';

type ExamFindings = NonNullable<VisitDetail['examFindings']>;
type Intake = VisitDetail['intake'];
type FindingStatus = 'Normal' | 'Abnormal' | 'Not examined';
type SystemFinding = { status: FindingStatus; notes: string; documented?: boolean };

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
  whatsNext: string;
}

interface ExamFindingsPayload {
  subjective?: string | null;
  objective?: string | null;
  assessment?: string | null;
  plan?: string | null;
}

function emptySystems(): Record<SystemKey, SystemFinding> {
  return Object.fromEntries(EXAM_SYSTEMS.map(([key]) => [key, { status: 'Not examined', notes: '', documented: false }])) as Record<SystemKey, SystemFinding>;
}

const WHATS_NEXT_HEADING = "\n\nWhat's Next\n";

function splitPlan(value: string | null | undefined) {
  const plan = value ?? '';
  const marker = plan.indexOf(WHATS_NEXT_HEADING);
  if (marker === -1) return { treatmentPlan: plan, whatsNext: '' };
  return {
    treatmentPlan: plan.slice(0, marker),
    whatsNext: plan.slice(marker + WHATS_NEXT_HEADING.length),
  };
}

function draftFromFindings(findings: VisitDetail['examFindings']): ExamDraft {
  const plan = splitPlan(findings?.plan);
  const fallback: ExamDraft = {
    kind: STRUCTURED_EXAM_KIND,
    version: 1,
    general: { demeanor: '', painScore: '', bodyConditionScore: '', hydration: '' },
    systems: emptySystems(),
    additionalNotes: findings?.objective ?? findings?.subjective ?? '',
    problemList: findings?.assessment ?? '',
    recommendations: plan.treatmentPlan,
    whatsNext: plan.whatsNext,
  };

  if (!findings?.objective) return fallback;
  try {
    const parsed = JSON.parse(findings.objective) as Partial<StructuredExam>;
    if (parsed.kind !== STRUCTURED_EXAM_KIND) return fallback;
    return {
      ...fallback,
      ...parsed,
      general: { ...fallback.general, ...parsed.general },
      // Preserve explicit historical findings; untouched systems remain unexamined.
      systems: {
        ...fallback.systems,
        ...Object.fromEntries(Object.entries(parsed.systems ?? {}).filter(([, finding]) => finding?.documented === true)),
      },
      problemList: findings.assessment ?? '',
      recommendations: plan.treatmentPlan,
      whatsNext: plan.whatsNext,
    };
  } catch {
    return fallback;
  }
}

function payloadFromDraft(draft: ExamDraft): ExamFindingsPayload {
  const { problemList, recommendations, whatsNext, ...structured } = draft;
  return {
    subjective: null,
    objective: JSON.stringify(structured),
    assessment: problemList || null,
    plan: recommendations || whatsNext
      ? `${recommendations}${whatsNext ? `${WHATS_NEXT_HEADING}${whatsNext}` : ''}`
      : null,
  };
}

function IntakeRecap({ intake }: { intake: Intake }) {
  const [open, setOpen] = useState(true);
  if (!intake) return null;

  const vitals: Array<[string, string]> = [
    intake.weight != null ? ['Weight', `${intake.weight} ${intake.weightUnit === 'KG' ? 'kg' : 'lb'}`] as [string, string] : null,
    intake.temperature != null ? ['Temperature', `${intake.temperature}°F`] as [string, string] : null,
    intake.heartRate != null ? ['Heart rate', `${intake.heartRate} bpm`] as [string, string] : null,
    intake.respiratoryRate != null ? ['Respiratory rate', `${intake.respiratoryRate} rpm`] as [string, string] : null,
    intake.crtSeconds != null ? ['CRT', `${intake.crtSeconds} sec`] as [string, string] : null,
    intake.gumColor ? ['Gum color', intake.gumColor] as [string, string] : null,
    intake.painScore != null ? ['Pain score', `${intake.painScore}${intake.painScale ? ` (${intake.painScale})` : ''}`] as [string, string] : null,
  ].filter((entry): entry is [string, string] => entry != null);

  const symptoms = [
    intake.vomiting ? 'Vomiting' : null,
    intake.diarrhea ? 'Diarrhea' : null,
    intake.sneezing ? 'Sneezing' : null,
  ].filter(Boolean).join(' · ');

  const notes: Array<[string, string]> = [
    intake.chiefComplaint ? ['Presenting concern', intake.chiefComplaint] as [string, string] : null,
    intake.historyNotes ? ['Medical history', intake.historyNotes] as [string, string] : null,
    intake.appetite ? ['Appetite', intake.appetite] as [string, string] : null,
    symptoms ? ['Reported symptoms', symptoms] as [string, string] : null,
    intake.attitude ? ['Attitude', intake.attitude] as [string, string] : null,
    intake.appearance ? ['Appearance', intake.appearance] as [string, string] : null,
    intake.systemicConcerns ? ['Systemic concerns', intake.systemicConcerns] as [string, string] : null,
    intake.allergies || intake.medicationsAllergies
      ? ['Allergies', [intake.allergies, intake.medicationsAllergies].filter(Boolean).join(' · ')] as [string, string]
      : null,
    intake.currentMedications ? ['Current medications', intake.currentMedications] as [string, string] : null,
    intake.vaccinationHistory ? ['Vaccination history', intake.vaccinationHistory] as [string, string] : null,
    intake.pastSurgeries ? ['Past surgeries', intake.pastSurgeries] as [string, string] : null,
    intake.sedationIssues ? ['Sedation history', intake.sedationIssues] as [string, string] : null,
    intake.recentTravel ? ['Recent travel', intake.recentTravel] as [string, string] : null,
    intake.specialDiet ? ['Diet', intake.specialDiet] as [string, string] : null,
    intake.supplements ? ['Supplements', intake.supplements] as [string, string] : null,
  ].filter((entry): entry is [string, string] => entry != null);

  return (
    <section className={`exam-intake-drawer${open ? ' exam-intake-drawer--open' : ''}`}>
      <button type="button" className="exam-intake-drawer__toggle" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
        <span><span className="eyebrow">Clinical handoff</span><strong>Intake recap</strong></span>
        <span className="exam-intake-drawer__action">{open ? 'Hide' : 'View'} <span aria-hidden="true">⌄</span></span>
      </button>
      {open ? (
        <div className="exam-intake-drawer__content">
          <div className="exam-intake-drawer__vitals">
            <span>Vitals</span>
            {vitals.length ? (
              <dl>{vitals.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
            ) : <p>Not captured</p>}
          </div>
          {notes.map(([label, value]) => (
            <div key={label}><span>{label}</span><p>{value}</p></div>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function ExamFindingsSummary({ examFindings }: { examFindings: ExamFindings }) {
  const draft = draftFromFindings(examFindings);
  const examined = EXAM_SYSTEMS.filter(([key]) => draft.systems[key].documented && (draft.systems[key].status !== 'Not examined' || Boolean(draft.systems[key].notes.trim())));
  return (
    <div className="visit-intake-summary">
      <h3>Physical exam summary</h3>
      <dl>
        <div><dt>General assessment</dt><dd>{[draft.general.painScore && `Pain ${draft.general.painScore}`, draft.general.bodyConditionScore && `BCS ${draft.general.bodyConditionScore}/9`].filter(Boolean).join(' · ') || 'Not captured'}</dd></div>
        <div><dt>Body systems</dt><dd>{examined.length ? examined.map(([key, label]) => `${label}: ${draft.systems[key].status}${draft.systems[key].notes ? ` — ${draft.systems[key].notes}` : ''}`).join('\n') : draft.additionalNotes || 'Not captured'}</dd></div>
        <div><dt>Problem list / diagnoses</dt><dd>{draft.problemList || 'Not captured'}</dd></div>
        <div><dt>Treatment plan</dt><dd>{draft.recommendations || 'Not captured'}</dd></div>
        <div><dt>What&apos;s next</dt><dd>{draft.whatsNext || 'Not captured'}</dd></div>
      </dl>
    </div>
  );
}

export function ExamFindingsPanel({ visitId, state, examFindings, intake, returnToCarePlan }: { returnToCarePlan?: string | undefined; visitId: string; state: string; examFindings: VisitDetail['examFindings']; intake: Intake }) {
  const router = useRouter();
  const editable = state === EXAM_IN_PROGRESS_STATE || Boolean(returnToCarePlan);
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
      if (returnToCarePlan) {
        router.push(returnToCarePlan);
        router.refresh();
        return;
      }
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
      <p className="visit-step-caption">Step 1 of 5 · Exam</p>
      {editable ? <IntakeRecap intake={intake} /> : null}
      <section className="exam-findings-card" aria-labelledby="exam-findings-heading">
        <div className="exam-findings-card__header"><div><p className="eyebrow">Veterinarian exam</p><h2 id="exam-findings-heading">Physical examination</h2><p>{editable ? 'Record the patient’s general assessment and head-to-tail findings.' : 'Completed exam findings'}</p></div></div>

        {editable ? (
          <div className="physical-exam-form">
            <fieldset className="physical-exam-section"><legend>General assessment</legend><div className="physical-exam-general">
              {([['painScore', 'Pain score'], ['bodyConditionScore', 'Body condition score']] as const).map(([key, label]) => (
                <label key={key}>
                  <span>{label}</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={draft.general[key]}
                    maxLength={30}
                    placeholder="Enter score"
                    onChange={(event) => {
                      const value = event.target.value;
                      if (value !== '' && !/^\d+(\.\d*)?$/.test(value)) return;
                      updateDraft((d) => ({ ...d, general: { ...d.general, [key]: value } }));
                    }}
                  />
                </label>
              ))}
            </div></fieldset>

            <fieldset className="physical-exam-section"><legend>Body systems</legend><div className="physical-exam-systems">
              {EXAM_SYSTEMS.map(([key, label]) => <div className="physical-exam-system" key={key}><fieldset className="physical-exam-pill-field"><legend>{label}</legend><div className="physical-exam-pills">{(['Normal', 'Abnormal', 'Not examined'] as FindingStatus[]).map((status) => <button type="button" key={status} aria-pressed={draft.systems[key].status === status} className={draft.systems[key].status === status ? `is-selected is-${status.toLowerCase().replace(' ', '-')}` : ''} onClick={() => updateDraft((d) => ({ ...d, systems: { ...d.systems, [key]: { ...d.systems[key], status, documented: true } } }))}>{status}</button>)}</div></fieldset><label className="physical-exam-system__notes"><span className="sr-only">{label} notes</span><input maxLength={150} placeholder="Add findings or notes" value={draft.systems[key].notes} onChange={(e) => updateDraft((d) => ({ ...d, systems: { ...d.systems, [key]: { ...d.systems[key], notes: e.target.value, documented: true } } }))} /></label></div>)}
            </div></fieldset>

            <div className="physical-exam-conclusion physical-exam-conclusion--stacked">
              <DiagnosisInput value={draft.problemList} onChange={(next) => updateDraft((d) => ({ ...d, problemList: next }))} />
              <label className="physical-exam-plan"><span>Treatment Plan</span><textarea rows={8} maxLength={8000} placeholder="Document treatments, medications, diagnostics, and client instructions" value={draft.recommendations} onChange={(e) => updateDraft((d) => ({ ...d, recommendations: e.target.value }))} /></label>
              <label className="physical-exam-plan"><span>What&apos;s Next</span><textarea rows={4} maxLength={4000} placeholder="Follow-up timing, recheck recommendations, monitoring, and pending results" value={draft.whatsNext} onChange={(e) => updateDraft((d) => ({ ...d, whatsNext: e.target.value }))} /></label>
            </div>
            {draft.additionalNotes.trim() ? (
              <div className="physical-exam-legacy-notes"><span>Earlier exam notes</span><p>{draft.additionalNotes}</p></div>
            ) : null}
            {error ? <p className="form-error" role="alert">{error}</p> : null}
          </div>
        ) : <><p className="visit-intake-panel__status">This exam is complete. Findings are read-only.</p>{examFindings ? <ExamFindingsSummary examFindings={examFindings} /> : null}</>}
        {editable ? (
          <div className="exam-findings-card__save">
            <span className={`autosave-indicator autosave-indicator--${autosaveState}`}><span className="autosave-indicator__dot" aria-hidden="true" />{autosaveState === 'saving' ? 'Saving…' : autosaveState === 'error' ? 'Save failed' : lastSavedAt ? `Saved ${lastSavedAt.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : 'All changes saved'}</span>
            {autosaveState === 'error' ? <button type="button" className="intake-save-retry" onClick={() => void saveExamFindings(draft).catch(() => undefined)}>Retry</button> : null}
          </div>
        ) : null}
      </section>
      {editable ? (<div className="visit-step-actions"><span /><button type="button" className="button-primary exam-complete-button" disabled={submitting} onClick={() => void completeExam()}>{submitting ? 'Saving…' : 'Continue to treatment plan →'}</button></div>) : null}
    </div>
  );
}
