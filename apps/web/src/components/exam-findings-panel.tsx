'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import type { VisitDetail } from '../lib/patient-types';

const EXAM_IN_PROGRESS_STATE = 'VeterinarianExamInProgress';

type ExamFindings = NonNullable<VisitDetail['examFindings']>;

interface ExamFindingsPayload {
  subjective?: string | null;
  objective?: string | null;
  assessment?: string | null;
  plan?: string | null;
}

function textOrNull(formData: FormData, key: string): string | null {
  const value = formData.get(key);
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function examFindingsPayload(formData: FormData): ExamFindingsPayload {
  return {
    subjective: textOrNull(formData, 'subjective'),
    objective: textOrNull(formData, 'objective'),
    assessment: textOrNull(formData, 'assessment'),
    plan: textOrNull(formData, 'plan'),
  };
}

function ExamFindingsSummary({ examFindings }: { examFindings: ExamFindings }) {
  return (
    <div className="visit-intake-summary">
      <h3>Exam Findings Summary</h3>
      <dl>
        <div>
          <dt>Subjective</dt>
          <dd>{examFindings.subjective ?? 'Not captured'}</dd>
        </div>
        <div>
          <dt>Objective</dt>
          <dd>{examFindings.objective ?? 'Not captured'}</dd>
        </div>
        <div>
          <dt>Assessment</dt>
          <dd>{examFindings.assessment ?? 'Not captured'}</dd>
        </div>
        <div>
          <dt>Plan</dt>
          <dd>{examFindings.plan ?? 'Not captured'}</dd>
        </div>
      </dl>
    </div>
  );
}

export function ExamFindingsPanel({
  visitId,
  state,
  examFindings,
}: {
  visitId: string;
  state: string;
  examFindings: VisitDetail['examFindings'];
}) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (state !== EXAM_IN_PROGRESS_STATE && !examFindings) {
    return null;
  }

  async function saveExamFindings(formData: FormData) {
    const response = await fetch(`/api/visits/${visitId}/exam-findings`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(examFindingsPayload(formData)),
    });
    const payload = (await response.json()) as { message?: string };
    if (!response.ok) throw new Error(payload.message ?? 'Could not save exam findings.');
  }

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      await saveExamFindings(new FormData(event.currentTarget));
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not save exam findings.');
    } finally {
      setSubmitting(false);
    }
  }

  async function completeFromForm(form: HTMLFormElement) {
    setSubmitting(true);
    setError(null);

    try {
      await saveExamFindings(new FormData(form));
      const response = await fetch(`/api/visits/${visitId}/exam/complete`, { method: 'POST' });
      const payload = (await response.json()) as { message?: string };
      if (!response.ok) throw new Error(payload.message ?? 'Could not complete exam.');
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not complete exam.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="visit-intake-panel" aria-labelledby="exam-findings-heading">
      <div className="visit-intake-panel__header">
        <div>
          <p className="eyebrow">Veterinarian Exam</p>
          <h2 id="exam-findings-heading">Exam Findings</h2>
        </div>
      </div>

      {state === EXAM_IN_PROGRESS_STATE && (
        <form className="visit-intake-form" onSubmit={handleSave}>
          <fieldset className="visit-intake-group">
            <legend>Subjective</legend>
            <textarea
              name="subjective"
              aria-label="Subjective notes"
              placeholder="Owner-reported history and observations"
              defaultValue={examFindings?.subjective ?? ''}
            />
          </fieldset>

          <fieldset className="visit-intake-group">
            <legend>Objective</legend>
            <textarea
              name="objective"
              aria-label="Objective findings"
              placeholder="Exam findings, vitals, diagnostic observations"
              defaultValue={examFindings?.objective ?? ''}
            />
          </fieldset>

          <fieldset className="visit-intake-group">
            <legend>Assessment</legend>
            <textarea
              name="assessment"
              aria-label="Assessment"
              placeholder="Diagnosis or differential"
              defaultValue={examFindings?.assessment ?? ''}
            />
          </fieldset>

          <fieldset className="visit-intake-group">
            <legend>Plan</legend>
            <textarea
              name="plan"
              aria-label="Plan"
              placeholder="Treatment plan"
              defaultValue={examFindings?.plan ?? ''}
            />
          </fieldset>

          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <div className="visit-intake-form__actions">
            <button type="submit" className="button-secondary" disabled={submitting}>
              {submitting ? 'Saving...' : 'Save Findings'}
            </button>
            <button
              type="button"
              className="button-primary"
              disabled={submitting}
              onClick={(event) => {
                const form = event.currentTarget.form;
                if (form) void completeFromForm(form);
              }}
            >
              {submitting ? 'Completing...' : 'Complete Exam'}
            </button>
          </div>
        </form>
      )}

      {state !== EXAM_IN_PROGRESS_STATE && (
        <p className="visit-intake-panel__status">
          Exam findings are not editable while this visit is in {state}.
        </p>
      )}

      {examFindings && <ExamFindingsSummary examFindings={examFindings} />}
    </section>
  );
}
