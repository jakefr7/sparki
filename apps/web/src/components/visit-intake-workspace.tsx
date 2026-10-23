'use client';

import { respiratoryLabel, crtLabel } from '@sparki/config';
import { VitalObservationFields } from './vital-observation-fields';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState, type ChangeEvent, type ReactNode } from 'react';
import { useCurrentUser } from '../lib/use-current-user';
import type { PatientAlertSummary, PatientMedicationSummary, VisitDetail } from '../lib/patient-types';
import {
  GUM_COLOR_OPTIONS,
  WEIGHT_UNIT_OPTIONS,
  missingRequiredFields,
  completedRequiredFields,
  payloadFromIntake,
  weightUnitLabel,
  type IntakePayload,
  type RequiredIntakeField,
} from '../lib/visit-intake-fields';
import { PatientContextBar, type AutosaveState } from './patient-context-bar';

const STARTABLE_STATES = new Set(['Arrived', 'ReadyForIntake']);
const AUTOSAVE_DELAY_MS = 900;

function buildIntakeRequestBody(payload: IntakePayload) {
  return {
    chiefComplaint: payload.chiefComplaint ?? null,
    historyNotes: payload.historyNotes ?? null,
    weight: payload.weight ?? null,
    weightUnit: payload.weightUnit ?? null,
    temperature: payload.temperature ?? null,
    heartRate: payload.heartRate ?? null,
    respiratoryRate: payload.respiratoryRate ?? null,
    respiratoryPattern: payload.respiratoryPattern ?? null,
    crtAssessment: payload.crtAssessment ?? null,
    crtSeconds: payload.crtSeconds ?? null,
    gumColor: payload.gumColor ?? null,
    appetite: payload.appetite ?? null,
    vomiting: payload.vomiting ?? false,
    diarrhea: payload.diarrhea ?? false,
    medicationsAllergies: payload.medicationsAllergies ?? null,
    vaccinationHistory: payload.vaccinationHistory ?? null,
    recentTravel: payload.recentTravel ?? null,
    specialDiet: payload.specialDiet ?? null,
    supplements: payload.supplements ?? null,
    attitude: payload.attitude ?? null,
    appearance: payload.appearance ?? null,
    allergies: payload.allergies ?? null,
    sedationIssues: payload.sedationIssues ?? null,
    pastSurgeries: payload.pastSurgeries ?? null,
    currentMedications: payload.currentMedications ?? null,
    sneezing: payload.sneezing ?? false,
    systemicConcerns: payload.systemicConcerns ?? null,
    painScore: payload.painScore ?? null,
    painScale: payload.painScale ?? null,
  };
}

function IntakeReadOnlySummary({ intake, onEdit }: { intake: NonNullable<VisitDetail['intake']>; onEdit?: (() => void) | undefined }) {
  const vitals = [
    intake.weight ? `${intake.weight} ${weightUnitLabel(intake.weightUnit)}` : null,
    intake.temperature ? `${intake.temperature}°F` : null,
    intake.heartRate ? `${intake.heartRate} bpm` : null,
    respiratoryLabel(intake.respiratoryRate, intake.respiratoryPattern),
    crtLabel(intake.crtSeconds, intake.crtAssessment) ? `CRT ${crtLabel(intake.crtSeconds, intake.crtAssessment)}` : null,
    intake.gumColor ? `Gums: ${intake.gumColor}` : null,
  ].filter(Boolean);

  return (
    <div className="intake-readonly-summary">
      <header>
        <div>
          <p className="eyebrow">Clinical handoff</p>
          <h2>Intake at a glance</h2>
        </div>
        <div className="intake-readonly-summary__actions">
          <span className="intake-readonly-summary__status">
            <span aria-hidden="true">✓</span>
            {intake.completedAt ? 'Intake complete' : 'Draft saved'}
          </span>
          {onEdit ? <button type="button" className="button-secondary" onClick={onEdit}>Edit intake</button> : null}
        </div>
      </header>
      <dl>
        <div className="intake-readonly-summary__item--wide">
          <dt>Vitals</dt>
          <dd>{vitals.join(' · ') || 'Not captured'}</dd>
        </div>
        <div className="intake-readonly-summary__item--wide">
          <dt>Medical History</dt>
          <dd>{intake.historyNotes ?? 'Not captured'}</dd>
        </div>
      </dl>
    </div>
  );
}

export function VisitIntakeWorkspace({
  visitId,
  visitType,
  state,
  intake,
  patientAlerts,
  patientMedications: _patientMedications,
  assignedTechnician,
  primaryVeterinarian,
  room,
  appointment: _appointment,
  patient,
  clientName,
  reason,
  backHref,
  examStatusNote: _examStatusNote,
  headerOnly = false,
  handlingAssessment,
}: {
  visitId: string;
  visitType: string;
  state: string;
  intake: VisitDetail['intake'];
  patientAlerts: PatientAlertSummary[];
  patientMedications: PatientMedicationSummary[];
  assignedTechnician: string;
  primaryVeterinarian: string;
  room: string | null;
  appointment: VisitDetail['appointment'];
  patient: {
    name: string;
    species: string;
    breed: string | null;
    sex: string | null;
    imageUrl: string | null;
    age: string | null;
    weight: number | null;
  };
  clientName: string | null;
  reason: string;
  backHref: string;
  examStatusNote?: string | null;
  headerOnly?: boolean;
  handlingAssessment?: ReactNode;
}) {
  const router = useRouter();
  const { user } = useCurrentUser();
  const [payload, setPayload] = useState<IntakePayload>(() => payloadFromIntake(intake));
  const [temperatureUnit, setTemperatureUnit] = useState<'F' | 'C'>('F');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [autosaveState, setAutosaveState] = useState<AutosaveState>('idle');
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [pendingFocusField, setPendingFocusField] = useState<RequiredIntakeField | null>(null);
  const [attemptedHandoff, setAttemptedHandoff] = useState(false);
  const [editingCompletedIntake, setEditingCompletedIntake] = useState(false);
  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dirtyRef = useRef(false);

  const canManageIntake = ['OWNER', 'VETERINARIAN', 'TECHNICIAN', 'ASSISTANT'].includes(user?.role ?? '');
  const canDeferEmergency = visitType === 'Emergency' && canManageIntake;
  const isDeferredEmergencyIntake = visitType === 'Emergency' && state === 'TreatmentPending' && !intake?.completedAt;
  const canEditCompletedIntake = canManageIntake && state === 'VeterinarianExamReady';
  const canEditIntake = canManageIntake && (state === 'IntakeInProgress' || isDeferredEmergencyIntake || editingCompletedIntake);
  const isStartable = STARTABLE_STATES.has(state);

  // Claim legacy in-progress intakes when a technician opens them directly.
  // This keeps the context header in sync even when the visit was started
  // before technician auto-assignment was enabled.
  useEffect(() => {
    if (user?.role !== 'TECHNICIAN' || state !== 'IntakeInProgress' || assignedTechnician !== 'Unassigned') return;
    let cancelled = false;
    fetch(`/api/visits/${visitId}/start`, { method: 'POST' })
      .then((response) => {
        if (response.ok && !cancelled) router.refresh();
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [assignedTechnician, router, state, user?.role, visitId]);

  const missing = useMemo(() => missingRequiredFields(payload), [payload]);

  async function persist(nextPayload: IntakePayload) {
    setAutosaveState('saving');
    try {
      const response = await fetch(`/api/visits/${visitId}/intake`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildIntakeRequestBody(nextPayload)),
      });
      if (!response.ok) throw new Error('Could not save intake details.');
      setAutosaveState('saved');
      setLastSavedAt(new Date());
      dirtyRef.current = false;
      return true;
    } catch {
      setAutosaveState('error');
      return false;
    }
  }

  function updateField(patch: Partial<IntakePayload>) {
    setPayload((current) => ({ ...current, ...patch }));
    dirtyRef.current = true;
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    autosaveTimer.current = setTimeout(() => {
      setPayload((current) => {
        void persist(current);
        return current;
      });
    }, AUTOSAVE_DELAY_MS);
  }

  useEffect(() => {
    return () => {
      if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    };
  }, []);

  useEffect(() => {
    if (!pendingFocusField) return;
    const frame = requestAnimationFrame(() => {
      const element = document.getElementById(pendingFocusField);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        (element as HTMLElement).focus();
      }
      setPendingFocusField(null);
    });
    return () => cancelAnimationFrame(frame);
  }, [pendingFocusField]);

  function focusField(field: RequiredIntakeField) {
    setPendingFocusField(field);
  }

  function numberValue(event: ChangeEvent<HTMLInputElement>): number | null {
    return event.target.value === '' ? null : Number(event.target.value);
  }

  function displayedTemperature(): number | '' {
    if (payload.temperature === null || payload.temperature === undefined) return '';
    return temperatureUnit === 'F'
      ? payload.temperature
      : Math.round(((payload.temperature - 32) * 5 / 9) * 10) / 10;
  }

  function updateTemperature(event: ChangeEvent<HTMLInputElement>) {
    const entered = numberValue(event);
    updateField({
      temperature: entered === null || temperatureUnit === 'F'
        ? entered
        : Math.round(((entered * 9 / 5) + 32) * 10) / 10,
    });
  }

  async function startIntake() {
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch(`/api/visits/${visitId}/start`, { method: 'POST' });
      const body = (await response.json()) as { message?: string };
      if (!response.ok) throw new Error(body.message ?? 'Could not begin intake.');
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not begin intake.');
    } finally {
      setSubmitting(false);
    }
  }

  async function deferForEmergency() {
    const emergencyReason = window.prompt('Briefly describe why stabilization must begin before intake is complete.');
    if (!emergencyReason?.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch(`/api/visits/${visitId}/intake/defer-emergency`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: emergencyReason.trim() }),
      });
      const body = (await response.json()) as { message?: string };
      if (!response.ok) throw new Error(body.message ?? 'Could not defer intake.');
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not defer intake.');
    } finally {
      setSubmitting(false);
    }
  }

  async function completeHandoff() {
    const [firstMissing] = missing;
    if (firstMissing) {
      setAttemptedHandoff(true);
      focusField(firstMissing);
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
      const saved = await persist(payload);
      if (!saved) throw new Error('Save failed. Retry before handoff.');
      const response = await fetch(`/api/visits/${visitId}/intake/complete`, { method: 'POST' });
      const body = (await response.json()) as { message?: string };
      if (!response.ok) throw new Error(body.message ?? 'Could not complete intake.');
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not complete intake.');
    } finally {
      setSubmitting(false);
    }
  }

  async function finishEditing() {
    setSubmitting(true);
    setError(null);
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    const saved = await persist(payload);
    setSubmitting(false);
    if (saved) setEditingCompletedIntake(false);
  }

  return (
    <div className={`intake-workspace${headerOnly || state === 'VeterinarianExamInProgress' ? ' intake-workspace--header-only' : ''}`}>
      <div className="intake-workspace__header">
        <PatientContextBar
          backHref={backHref}
          patient={patient}
          clientName={clientName}
          reason={reason}
          primaryVeterinarian={primaryVeterinarian}
          assignedTechnician={assignedTechnician}
          room={room}
          alerts={patientAlerts}
        />
      </div>

      {headerOnly ? null : canEditIntake ? (
        <>
          <div className="intake-simple-body">
            <section className="intake-simple-section" aria-labelledby="vitals-heading">
              <header><h2 id="vitals-heading">Vitals</h2><p>Record the patient’s current clinical baseline.</p></header>
              <div className="intake-simple-vitals">
                <label><span>Weight</span><div className="intake-simple-unit"><input id="weight" type="number" min="0" step="0.1" value={payload.weight ?? ''} onChange={(e) => updateField({ weight: numberValue(e), weightUnit: payload.weightUnit ?? 'KG' })}/><select aria-label="Weight unit" value={payload.weightUnit ?? 'KG'} onChange={(e) => updateField({ weightUnit: e.target.value })}>{WEIGHT_UNIT_OPTIONS.map((unit) => <option key={unit.value} value={unit.value}>{unit.label}</option>)}</select></div></label>
                <label><span>Temperature</span><div className="intake-simple-unit"><input id="temperature" type="number" min={temperatureUnit === 'F' ? 80 : 26.7} max={temperatureUnit === 'F' ? 115 : 46.1} step="0.1" value={displayedTemperature()} onChange={updateTemperature}/><select aria-label="Temperature unit" value={temperatureUnit} onChange={(e) => setTemperatureUnit(e.target.value as 'F' | 'C')}><option value="F">°F</option><option value="C">°C</option></select></div></label>
                <label><span>Heart rate</span><div className="intake-simple-unit"><input id="heartRate" type="number" min="1" max="400" value={payload.heartRate ?? ''} onChange={(e) => updateField({ heartRate: numberValue(e) })}/><span>bpm</span></div></label>
                <VitalObservationFields payload={payload} onChange={updateField} />
                <label><span>Gum color</span><select id="gumColor" value={payload.gumColor ?? ''} onChange={(e) => updateField({ gumColor: e.target.value || null })}><option value="">Select color</option>{GUM_COLOR_OPTIONS.map((color) => <option key={color}>{color}</option>)}</select></label>
              </div>
              {handlingAssessment}
            </section>
            <section className="intake-simple-section" aria-labelledby="history-heading">
              <header><h2 id="history-heading">Medical History</h2><p>Capture the clinically relevant story for the veterinarian.</p></header>
              <textarea id="historyNotes" className="intake-simple-history" rows={8} placeholder="Enter relevant history" value={payload.historyNotes ?? ''} onChange={(e) => { updateField({ historyNotes: e.target.value }); e.currentTarget.style.height = 'auto'; e.currentTarget.style.height = `${e.currentTarget.scrollHeight}px`; }}/>
              {attemptedHandoff && missing.length ? <p className="form-error" role="alert">Complete {missing.map((field) => field === 'crtSeconds' ? 'capillary refill' : field === 'historyNotes' ? 'medical history' : field.replace(/([A-Z])/g, ' $1').toLowerCase()).join(', ')} before handoff.</p> : null}
              {error ? <p className="form-error" role="alert">{error}</p> : null}
              <div className="intake-history-actions">
                <div className="intake-action-bar__status">
                  <AutosaveIndicatorInline state={autosaveState} lastSavedAt={lastSavedAt} />
                  {autosaveState === 'error' ? <button type="button" className="intake-save-retry" onClick={() => void persist(payload)}>Retry</button> : null}
                </div>
                <button
                  type="button"
                  className="button-primary intake-handoff-button"
                  onClick={() => editingCompletedIntake ? void finishEditing() : void completeHandoff()}
                  disabled={submitting || (!editingCompletedIntake && completedRequiredFields(payload) === 0)}
                >
                  {submitting ? 'Saving…' : editingCompletedIntake ? 'Done editing' : 'Ready for Veterinarian'}
                </button>
              </div>
            </section>
          </div>
        </>
      ) : isStartable ? (
        <div className="intake-simple-body intake-simple-body--start">
          <div className="intake-start-card">
            <p className="eyebrow">Next step</p>
            <h2>Begin patient intake</h2>
            <p>Record vitals and medical history, then hand the visit to the veterinarian.</p>
            {error ? <p className="form-error" role="alert">{error}</p> : null}
            {canManageIntake || canDeferEmergency ? (
              <div className="intake-start-card__actions">
                {canDeferEmergency ? (
                  <button type="button" className="button-secondary" onClick={() => void deferForEmergency()} disabled={submitting}>
                    Begin emergency care
                  </button>
                ) : null}
                {canManageIntake ? (
                  <button type="button" className="button-primary" onClick={() => void startIntake()} disabled={submitting}>
                    {submitting ? 'Starting…' : 'Begin Intake'}
                  </button>
                ) : null}
              </div>
            ) : (
              <p className="intake-access-note">Intake will be captured by the technician team.</p>
            )}
          </div>
        </div>
      ) : state === 'VeterinarianExamInProgress' ? null : !canManageIntake && (state === 'IntakeInProgress' || isDeferredEmergencyIntake) ? (
        <div className="intake-access-state">
          <span className="intake-access-state__icon" aria-hidden="true">↗</span>
          <div>
            <strong>Intake is with the technician team</strong>
            <p>Technicians and assistants capture the history and vitals here. Their completed handoff will appear automatically for the exam.</p>
          </div>
        </div>
      ) : (
        <div className="intake-simple-body intake-complete-body">
          <div className="intake-access-state intake-access-state--complete">
            <span className="intake-access-state__icon" aria-hidden="true">✓</span>
            <div>
              <strong>Intake complete</strong>
              <p>The clinical handoff is ready for the veterinarian.</p>
            </div>
          </div>
          {intake ? <IntakeReadOnlySummary intake={intake} onEdit={canEditCompletedIntake ? () => setEditingCompletedIntake(true) : undefined} /> : null}
        </div>
      )}
    </div>
  );
}

function AutosaveIndicatorInline({ state, lastSavedAt }: { state: AutosaveState; lastSavedAt: Date | null }) {
  return (
    <span className={`autosave-indicator autosave-indicator--${state}`}>
      <span className="autosave-indicator__dot" aria-hidden="true" />
      {state === 'saving'
        ? 'Saving…'
        : state === 'error'
          ? 'Save failed'
          : lastSavedAt
            ? `Saved ${lastSavedAt.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`
            : 'All changes saved'}
    </span>
  );
}
