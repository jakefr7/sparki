'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import type { VisitDetail } from '../lib/patient-types';

const STARTABLE_STATES = new Set(['Arrived', 'ReadyForIntake']);

const APPETITE_OPTIONS = ['Normal', 'Decreased', 'Increased', 'Not Eating'] as const;

type VisitIntake = NonNullable<VisitDetail['intake']>;

interface IntakePayload {
  chiefComplaint?: string | null;
  historyNotes?: string | null;
  weight?: number | null;
  temperature?: number | null;
  heartRate?: number | null;
  respiratoryRate?: number | null;
  appetite?: string | null;
  vomiting?: boolean;
  diarrhea?: boolean;
  medicationsAllergies?: string | null;
}

function numberOrNull(formData: FormData, key: string): number | null {
  const value = formData.get(key);
  if (typeof value !== 'string' || value.trim() === '') return null;
  return Number(value);
}

function textOrNull(formData: FormData, key: string): string | null {
  const value = formData.get(key);
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function yesNo(formData: FormData, key: string): boolean {
  return formData.get(key) === 'yes';
}

function intakePayload(formData: FormData): IntakePayload {
  return {
    chiefComplaint: textOrNull(formData, 'chiefComplaint'),
    historyNotes: textOrNull(formData, 'historyNotes'),
    weight: numberOrNull(formData, 'weight'),
    temperature: numberOrNull(formData, 'temperature'),
    heartRate: numberOrNull(formData, 'heartRate'),
    respiratoryRate: numberOrNull(formData, 'respiratoryRate'),
    appetite: textOrNull(formData, 'appetite'),
    vomiting: yesNo(formData, 'vomiting'),
    diarrhea: yesNo(formData, 'diarrhea'),
    medicationsAllergies: textOrNull(formData, 'medicationsAllergies'),
  };
}

/** Two-option Yes/No control (radio pair styled as a segmented toggle) —
 *  more structured and faster to scan than a bare checkbox. */
function YesNoToggle({
  name,
  label,
  defaultValue,
}: {
  name: string;
  label: string;
  defaultValue: boolean;
}) {
  return (
    <div className="visit-toggle">
      <span className="visit-toggle__label">{label}</span>
      <div className="visit-toggle__options" role="radiogroup" aria-label={label}>
        <label className="visit-toggle__option">
          <input type="radio" name={name} value="no" defaultChecked={!defaultValue} />
          No
        </label>
        <label className="visit-toggle__option">
          <input type="radio" name={name} value="yes" defaultChecked={defaultValue} />
          Yes
        </label>
      </div>
    </div>
  );
}

function IntakeSummary({ intake }: { intake: VisitIntake }) {
  const vitals = [
    intake.weight ? `${intake.weight} lb` : null,
    intake.temperature ? `${intake.temperature} F` : null,
    intake.heartRate ? `${intake.heartRate} bpm` : null,
    intake.respiratoryRate ? `${intake.respiratoryRate} rpm` : null,
  ].filter(Boolean);

  return (
    <div className="visit-intake-summary">
      <h3>Saved Intake Summary</h3>
      <dl>
        <div>
          <dt>Reason for visit</dt>
          <dd>{intake.chiefComplaint ?? 'Not captured'}</dd>
        </div>
        <div>
          <dt>Vitals</dt>
          <dd>{vitals.length > 0 ? vitals.join(' · ') : 'Not captured'}</dd>
        </div>
        <div>
          <dt>Patient status</dt>
          <dd>
            {[
              intake.appetite ? `Appetite: ${intake.appetite}` : null,
              intake.vomiting ? 'Vomiting' : null,
              intake.diarrhea ? 'Diarrhea' : null,
            ]
              .filter(Boolean)
              .join(' · ') || 'Nothing reported'}
          </dd>
        </div>
        <div>
          <dt>Medications / allergies</dt>
          <dd>{intake.medicationsAllergies ?? 'Not captured'}</dd>
        </div>
      </dl>
    </div>
  );
}

export function VisitIntakePanel({
  visitId,
  state,
  intake,
}: {
  visitId: string;
  state: string;
  intake: VisitDetail['intake'];
}) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function startIntake() {
    setSubmitting(true);
    setError(null);

    try {
      const response = await fetch(`/api/visits/${visitId}/start`, { method: 'POST' });
      const payload = (await response.json()) as { message?: string };
      if (!response.ok) throw new Error(payload.message ?? 'Could not start intake.');
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not start intake.');
    } finally {
      setSubmitting(false);
    }
  }

  async function saveIntake(formData: FormData) {
    const response = await fetch(`/api/visits/${visitId}/intake`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(intakePayload(formData)),
    });
    const payload = (await response.json()) as { message?: string };
    if (!response.ok) throw new Error(payload.message ?? 'Could not save intake.');
  }

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      await saveIntake(new FormData(event.currentTarget));
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not save intake.');
    } finally {
      setSubmitting(false);
    }
  }

  async function completeFromForm(form: HTMLFormElement) {
    setSubmitting(true);
    setError(null);

    try {
      await saveIntake(new FormData(form));
      const response = await fetch(`/api/visits/${visitId}/intake/complete`, { method: 'POST' });
      const payload = (await response.json()) as { message?: string };
      if (!response.ok) throw new Error(payload.message ?? 'Could not complete intake.');
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not complete intake.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="visit-intake-panel" aria-labelledby="visit-intake-heading">
      <div className="visit-intake-panel__header">
        <div>
          <p className="eyebrow">Technician Intake</p>
          <h2 id="visit-intake-heading">Visit Intake</h2>
        </div>
        {STARTABLE_STATES.has(state) && (
          <button
            type="button"
            className="button-primary"
            onClick={startIntake}
            disabled={submitting}
          >
            {submitting ? 'Starting...' : 'Start Intake'}
          </button>
        )}
      </div>

      {state === 'IntakeInProgress' && (
        <form className="visit-intake-form" onSubmit={handleSave}>
          <fieldset className="visit-intake-group">
            <legend>Reason for Visit</legend>
            <textarea
              name="chiefComplaint"
              aria-label="Reason for visit"
              placeholder="What brought the patient in today?"
              defaultValue={intake?.chiefComplaint ?? ''}
            />
          </fieldset>

          <fieldset className="visit-intake-group">
            <legend>Vitals</legend>
            <div className="visit-intake-form__vitals">
              <label>
                Weight (lb)
                <input
                  name="weight"
                  type="number"
                  step="0.1"
                  defaultValue={intake?.weight ?? ''}
                />
              </label>
              <label>
                Temp (F)
                <input
                  name="temperature"
                  type="number"
                  step="0.1"
                  defaultValue={intake?.temperature ?? ''}
                />
              </label>
              <label>
                Heart rate (bpm)
                <input name="heartRate" type="number" defaultValue={intake?.heartRate ?? ''} />
              </label>
              <label>
                Resp. rate (rpm)
                <input
                  name="respiratoryRate"
                  type="number"
                  defaultValue={intake?.respiratoryRate ?? ''}
                />
              </label>
            </div>
          </fieldset>

          <fieldset className="visit-intake-group">
            <legend>Patient Status</legend>
            <div className="visit-intake-form__status">
              <label>
                Appetite
                <select name="appetite" defaultValue={intake?.appetite ?? ''}>
                  <option value="">Not assessed</option>
                  {APPETITE_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>
              <YesNoToggle name="vomiting" label="Vomiting" defaultValue={intake?.vomiting ?? false} />
              <YesNoToggle name="diarrhea" label="Diarrhea" defaultValue={intake?.diarrhea ?? false} />
            </div>
          </fieldset>

          <fieldset className="visit-intake-group">
            <legend>Notes</legend>
            <label>
              History / notes
              <textarea name="historyNotes" defaultValue={intake?.historyNotes ?? ''} />
            </label>
          </fieldset>

          <fieldset className="visit-intake-group">
            <legend>Medications &amp; Allergies</legend>
            <textarea
              name="medicationsAllergies"
              aria-label="Medications and allergies"
              placeholder="Current medications, known allergies, or adverse reactions"
              defaultValue={intake?.medicationsAllergies ?? ''}
            />
          </fieldset>

          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <div className="visit-intake-form__actions">
            <button type="submit" className="button-secondary" disabled={submitting}>
              {submitting ? 'Saving...' : 'Save Intake'}
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
              {submitting ? 'Completing...' : 'Complete Intake'}
            </button>
          </div>
        </form>
      )}

      {state !== 'IntakeInProgress' && !STARTABLE_STATES.has(state) && (
        <p className="visit-intake-panel__status">
          Intake is not editable while this visit is in {state}.
        </p>
      )}

      {intake && <IntakeSummary intake={intake} />}
    </section>
  );
}
