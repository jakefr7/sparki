'use client';

import { VitalObservationFields } from './vital-observation-fields';

import { forwardRef, type ReactNode } from 'react';
import type { PatientAlertSummary, PatientMedicationSummary } from '../lib/patient-types';
import {
  APPETITE_OPTIONS,
  GUM_COLOR_OPTIONS,
  QUICK_REASON_OPTIONS,
  WEIGHT_UNIT_OPTIONS,
  TRIAGE_LABELS,
  derivedTriageLevel,
  weightUnitLabel,
  type IntakePayload,
  type IntakeSectionId,
  type IntakeSectionMeta,
} from '../lib/visit-intake-fields';

export function IntakeSectionNavigator({
  sections,
  activeSection,
  completed,
  onSelect,
}: {
  sections: readonly IntakeSectionMeta[];
  activeSection: IntakeSectionId;
  completed: Set<IntakeSectionId>;
  onSelect: (id: IntakeSectionId) => void;
}) {
  return (
    <nav className="intake-nav" aria-label="Intake sections">
      <ol className="intake-nav__list">
        {sections.map((section) => {
          const isActive = section.id === activeSection;
          const isComplete = completed.has(section.id);
          const status = isComplete ? 'complete' : section.optional ? 'optional' : 'incomplete';
          return (
            <li key={section.id}>
              <button
                type="button"
                className={`intake-nav__item intake-nav__item--${status}${isActive ? ' intake-nav__item--active' : ''}`}
                aria-current={isActive ? 'step' : undefined}
                onClick={() => onSelect(section.id)}
              >
                <span className="intake-nav__marker" aria-hidden="true">
                  {isComplete ? '✓' : section.number}
                </span>
                <span className="intake-nav__text">
                  <span className="intake-nav__label">{section.label}</span>
                  <span className="intake-nav__state">
                    {isComplete ? 'Complete' : section.optional ? 'Optional' : 'Incomplete'}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

function FieldLabel({
  label,
  hint,
  children,
  className = '',
  htmlFor,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
  className?: string;
  htmlFor?: string;
}) {
  return (
    <label className={`intake-field ${className}`.trim()} htmlFor={htmlFor}>
      <span className="intake-field__label">{label}</span>
      {children}
      {hint ? <small className="intake-field__hint">{hint}</small> : null}
    </label>
  );
}

function YesNoToggle({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <div className="intake-toggle" role="group" aria-label={label}>
      <span className="intake-toggle__label">{label}</span>
      <div className="intake-toggle__options">
        <button
          type="button"
          className={!value ? 'is-selected' : ''}
          aria-pressed={!value}
          onClick={() => onChange(false)}
        >
          No
        </button>
        <button
          type="button"
          className={value ? 'is-selected' : ''}
          aria-pressed={value}
          onClick={() => onChange(true)}
        >
          Yes
        </button>
      </div>
    </div>
  );
}

interface SectionShellProps {
  meta: IntakeSectionMeta;
  isActive: boolean;
  isComplete: boolean;
  summary: ReactNode;
  continueLabel?: string;
  onContinue?: () => void;
  onExpand: () => void;
  children: ReactNode;
}

export const IntakeSectionShell = forwardRef<HTMLDivElement, SectionShellProps>(function IntakeSectionShell(
  { meta, isActive, isComplete, summary, continueLabel, onContinue, onExpand, children },
  ref,
) {
  if (!isActive) {
    return (
      <section
        ref={ref}
        id={meta.id}
        className={`intake-section-card intake-section-card--collapsed${isComplete ? ' intake-section-card--complete' : ''}`}
      >
        <button type="button" className="intake-section-card__summary-trigger" onClick={onExpand}>
          <span className="intake-section-card__marker" aria-hidden="true">
            {isComplete ? '✓' : meta.number}
          </span>
          <span className="intake-section-card__summary-text">
            <strong>{meta.title}</strong>
            <span>{summary}</span>
          </span>
          <span className="intake-section-card__edit" aria-hidden="true">
            {isComplete ? 'Edit' : 'Open'}
          </span>
        </button>
      </section>
    );
  }

  return (
    <section
      ref={ref}
      id={meta.id}
      className="intake-section-card intake-section-card--active"
      aria-labelledby={`${meta.id}-heading`}
    >
      <header className="intake-section-card__header">
        <span className="intake-section-card__marker intake-section-card__marker--active" aria-hidden="true">
          {meta.number}
        </span>
        <div>
          <h2 id={`${meta.id}-heading`}>{meta.title}</h2>
          <p>{meta.description}</p>
        </div>
        {meta.optional ? <span className="intake-section-card__optional-tag">Optional</span> : null}
      </header>
      <div className="intake-section-card__body">{children}</div>
      {onContinue ? (
        <footer className="intake-section-card__footer">
          <button type="button" className="button-primary" onClick={onContinue}>
            {continueLabel ?? 'Continue'}
          </button>
        </footer>
      ) : null}
    </section>
  );
});

export function VisitStorySection({
  payload,
  onChange,
  ...shellProps
}: {
  payload: IntakePayload;
  onChange: (patch: Partial<IntakePayload>) => void;
} & Omit<SectionShellProps, 'children' | 'summary'>) {
  const summary = payload.chiefComplaint || 'Not captured yet';
  return (
    <IntakeSectionShell {...shellProps} summary={summary}>
      <div className="intake-quick-reasons" role="group" aria-label="Quick reason options">
        {QUICK_REASON_OPTIONS.map((option) => (
          <button
            key={option}
            type="button"
            className={payload.chiefComplaint === option ? 'is-selected' : ''}
            onClick={() => onChange({ chiefComplaint: option })}
          >
            {option}
          </button>
        ))}
        <button
          type="button"
          className={
            payload.chiefComplaint && !(QUICK_REASON_OPTIONS as readonly string[]).includes(payload.chiefComplaint)
              ? 'is-selected'
              : ''
          }
          onClick={() => onChange({ chiefComplaint: '' })}
        >
          Other
        </button>
      </div>
      <FieldLabel label="Reason for visit" hint="Use the client’s words when they add useful context." htmlFor="chiefComplaint">
        <textarea
          id="chiefComplaint"
          className="intake-field__textarea intake-field__textarea--compact"
          placeholder="What brought the patient in today?"
          value={payload.chiefComplaint ?? ''}
          onChange={(event) => onChange({ chiefComplaint: event.target.value })}
        />
      </FieldLabel>
      <FieldLabel
        label="Medical history"
        hint="Onset, duration, progression, and relevant prior episodes."
        htmlFor="historyNotes"
      >
        <textarea
          id="historyNotes"
          className="intake-field__textarea intake-field__textarea--tall"
          placeholder="What changed, when did it start, and how has it progressed?"
          value={payload.historyNotes ?? ''}
          onChange={(event) => onChange({ historyNotes: event.target.value })}
        />
      </FieldLabel>
    </IntakeSectionShell>
  );
}

export function VitalsTriageSection({
  payload,
  onChange,
  ...shellProps
}: {
  payload: IntakePayload;
  onChange: (patch: Partial<IntakePayload>) => void;
} & Omit<SectionShellProps, 'children' | 'summary'>) {
  const triage = derivedTriageLevel(payload);
  const showNote = triage === 'attention' || triage === 'urgent';
  const vitalsSummary = [
    payload.weight ? `${payload.weight} ${weightUnitLabel(payload.weightUnit ?? 'LB')}` : null,
    payload.temperature ? `${payload.temperature}°F` : null,
    payload.heartRate ? `${payload.heartRate} bpm` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <IntakeSectionShell {...shellProps} summary={vitalsSummary || 'Not captured yet'}>
      <div className="intake-vitals-grid">
        <FieldLabel label="Weight" htmlFor="weight">
          <span className="intake-unit-input">
            <input
              id="weight"
              type="number"
              inputMode="decimal"
              step="0.1"
              min="0"
              value={payload.weight ?? ''}
              onChange={(event) => onChange({ weight: event.target.value === '' ? null : Number(event.target.value) })}
            />
            <select
              aria-label="Weight unit"
              value={payload.weightUnit ?? 'LB'}
              onChange={(event) => onChange({ weightUnit: event.target.value })}
            >
              {WEIGHT_UNIT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </span>
        </FieldLabel>
        <FieldLabel label="Temperature" htmlFor="temperature">
          <span className="intake-unit-input">
            <input
              id="temperature"
              type="number"
              inputMode="decimal"
              step="0.1"
              min="0"
              value={payload.temperature ?? ''}
              onChange={(event) =>
                onChange({ temperature: event.target.value === '' ? null : Number(event.target.value) })
              }
            />
            <span className="intake-unit-input__suffix">°F</span>
          </span>
        </FieldLabel>
        <FieldLabel label="Heart rate" htmlFor="heartRate">
          <span className="intake-unit-input">
            <input
              id="heartRate"
              type="number"
              inputMode="numeric"
              min="0"
              value={payload.heartRate ?? ''}
              onChange={(event) =>
                onChange({ heartRate: event.target.value === '' ? null : Number(event.target.value) })
              }
            />
            <span className="intake-unit-input__suffix">bpm</span>
          </span>
        </FieldLabel>
        <VitalObservationFields payload={payload} onChange={onChange} />
        <FieldLabel label="Gum color" htmlFor="gumColor">
          <select
            id="gumColor"
            value={payload.gumColor ?? ''}
            onChange={(event) => onChange({ gumColor: event.target.value || null })}
          >
            <option value="">Not assessed</option>
            {GUM_COLOR_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </FieldLabel>
      </div>

      <div className={`intake-triage intake-triage--${triage}`}>
        <span className="intake-triage__label">Triage assessment</span>
        <strong>{TRIAGE_LABELS[triage]}</strong>
        <span className="intake-triage__hint">Based on captured vitals · updates automatically</span>
      </div>

      {showNote ? (
        <FieldLabel
          label="Clinical note"
          hint="What specifically needs the veterinarian's attention before the exam."
          htmlFor="systemicConcerns"
        >
          <textarea
            id="systemicConcerns"
            className="intake-field__textarea intake-field__textarea--compact"
            value={payload.systemicConcerns ?? ''}
            onChange={(event) => onChange({ systemicConcerns: event.target.value })}
            placeholder="Describe the concern driving this triage level"
          />
        </FieldLabel>
      ) : null}
    </IntakeSectionShell>
  );
}

export function CurrentConditionSection({
  payload,
  onChange,
  ...shellProps
}: {
  payload: IntakePayload;
  onChange: (patch: Partial<IntakePayload>) => void;
} & Omit<SectionShellProps, 'children' | 'summary'>) {
  const symptoms = [
    payload.vomiting ? 'Vomiting' : null,
    payload.diarrhea ? 'Diarrhea' : null,
    payload.sneezing ? 'Sneezing' : null,
  ].filter(Boolean);
  const summary = [payload.attitude, symptoms.join(', ') || null].filter(Boolean).join(' · ') || 'Not captured yet';

  return (
    <IntakeSectionShell {...shellProps} summary={summary}>
      <div className="intake-condition-grid">
        <FieldLabel label="Mentation" htmlFor="attitude">
          <select
            id="attitude"
            value={payload.attitude ?? ''}
            onChange={(event) => onChange({ attitude: event.target.value || null })}
          >
            <option value="">Not assessed</option>
            <option value="BAR">BAR — bright, alert, responsive</option>
            <option value="QAR">QAR — quiet, alert, responsive</option>
            <option value="Depressed">Depressed</option>
            <option value="Obtunded">Obtunded</option>
          </select>
        </FieldLabel>
        <FieldLabel label="Appetite" htmlFor="appetite">
          <select
            id="appetite"
            value={payload.appetite ?? ''}
            onChange={(event) => onChange({ appetite: event.target.value || null })}
          >
            <option value="">Not assessed</option>
            {APPETITE_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </FieldLabel>
      </div>
      <div className="intake-symptom-row">
        <YesNoToggle label="Vomiting" value={payload.vomiting ?? false} onChange={(value) => onChange({ vomiting: value })} />
        <YesNoToggle label="Diarrhea" value={payload.diarrhea ?? false} onChange={(value) => onChange({ diarrhea: value })} />
        <YesNoToggle label="Sneezing" value={payload.sneezing ?? false} onChange={(value) => onChange({ sneezing: value })} />
      </div>
      <FieldLabel
        label="General observations"
        hint="Describe appearance and anything not captured above, or enter Normal."
        htmlFor="appearance"
      >
        <textarea
          id="appearance"
          className="intake-field__textarea intake-field__textarea--compact"
          value={payload.appearance ?? ''}
          onChange={(event) => onChange({ appearance: event.target.value })}
          placeholder="Describe appearance or enter Normal"
        />
      </FieldLabel>
    </IntakeSectionShell>
  );
}

function ExistingMedicationsList({ medications }: { medications: PatientMedicationSummary[] }) {
  const active = medications.filter((medication) => medication.status === 'Active' || !medication.status);
  if (active.length === 0) return null;
  return (
    <div className="intake-existing-medications">
      <span className="intake-existing-medications__label">On file for this patient — confirm or update below</span>
      <ul>
        {active.slice(0, 4).map((medication) => (
          <li key={medication.id}>
            <strong>{medication.medicationName}</strong>
            <span>{[medication.dose, medication.frequency].filter(Boolean).join(' · ') || 'Active'}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ExistingAlertsList({ alerts }: { alerts: PatientAlertSummary[] }) {
  const active = alerts.filter((alert) => alert.isActive);
  if (active.length === 0) return null;
  return (
    <div className="intake-existing-alerts">
      {active.map((alert) => (
        <p key={alert.id} className={`intake-existing-alerts__item intake-existing-alerts__item--${alert.severity.toLowerCase()}`}>
          <strong>{alert.category}</strong>
          {alert.message}
        </p>
      ))}
    </div>
  );
}

export function MedicationSafetySection({
  payload,
  onChange,
  patientAlerts,
  patientMedications,
  ...shellProps
}: {
  payload: IntakePayload;
  onChange: (patch: Partial<IntakePayload>) => void;
  patientAlerts: PatientAlertSummary[];
  patientMedications: PatientMedicationSummary[];
} & Omit<SectionShellProps, 'children' | 'summary'>) {
  const summary =
    [payload.currentMedications, payload.allergies].filter(Boolean).join(' · ') || 'Not captured yet';

  return (
    <IntakeSectionShell {...shellProps} summary={summary}>
      <ExistingAlertsList alerts={patientAlerts} />
      <ExistingMedicationsList medications={patientMedications} />
      <div className="intake-two-col">
        <FieldLabel label="Current medications" htmlFor="currentMedications">
          <textarea
            id="currentMedications"
            className="intake-field__textarea intake-field__textarea--compact"
            value={payload.currentMedications ?? ''}
            onChange={(event) => onChange({ currentMedications: event.target.value })}
            placeholder="List medications or enter None"
          />
        </FieldLabel>
        <FieldLabel label="Allergies" htmlFor="allergies">
          <textarea
            id="allergies"
            className="intake-field__textarea intake-field__textarea--compact"
            value={payload.allergies ?? ''}
            onChange={(event) => onChange({ allergies: event.target.value })}
            placeholder="List allergies or enter None known"
          />
        </FieldLabel>
        <FieldLabel label="Sedation problems" htmlFor="sedationIssues">
          <textarea
            id="sedationIssues"
            className="intake-field__textarea intake-field__textarea--compact"
            value={payload.sedationIssues ?? ''}
            onChange={(event) => onChange({ sedationIssues: event.target.value })}
            placeholder="Prior reactions or enter None known"
          />
        </FieldLabel>
        <FieldLabel label="Past surgeries" htmlFor="pastSurgeries">
          <textarea
            id="pastSurgeries"
            className="intake-field__textarea intake-field__textarea--compact"
            value={payload.pastSurgeries ?? ''}
            onChange={(event) => onChange({ pastSurgeries: event.target.value })}
            placeholder="Prior surgeries or enter None"
          />
        </FieldLabel>
      </div>
    </IntakeSectionShell>
  );
}

export function BackgroundSection({
  payload,
  onChange,
  ...shellProps
}: {
  payload: IntakePayload;
  onChange: (patch: Partial<IntakePayload>) => void;
} & Omit<SectionShellProps, 'children' | 'summary'>) {
  const filled = [payload.vaccinationHistory, payload.recentTravel, payload.specialDiet, payload.supplements].filter(
    Boolean,
  ).length;
  const summary = filled > 0 ? `${filled} of 4 captured` : 'Optional — nothing captured yet';

  return (
    <IntakeSectionShell {...shellProps} summary={summary}>
      <div className="intake-two-col">
        <FieldLabel label="Vaccination history" htmlFor="vaccinationHistory">
          <textarea
            id="vaccinationHistory"
            className="intake-field__textarea intake-field__textarea--compact"
            value={payload.vaccinationHistory ?? ''}
            onChange={(event) => onChange({ vaccinationHistory: event.target.value })}
            placeholder="Known vaccines, dates, or records status"
          />
        </FieldLabel>
        <FieldLabel label="Recent travel" htmlFor="recentTravel">
          <textarea
            id="recentTravel"
            className="intake-field__textarea intake-field__textarea--compact"
            value={payload.recentTravel ?? ''}
            onChange={(event) => onChange({ recentTravel: event.target.value })}
            placeholder="Locations and dates, or None"
          />
        </FieldLabel>
        <FieldLabel label="Special diet" htmlFor="specialDiet">
          <textarea
            id="specialDiet"
            className="intake-field__textarea intake-field__textarea--compact"
            value={payload.specialDiet ?? ''}
            onChange={(event) => onChange({ specialDiet: event.target.value })}
            placeholder="Diet details or None"
          />
        </FieldLabel>
        <FieldLabel label="Supplements" htmlFor="supplements">
          <textarea
            id="supplements"
            className="intake-field__textarea intake-field__textarea--compact"
            value={payload.supplements ?? ''}
            onChange={(event) => onChange({ supplements: event.target.value })}
            placeholder="Supplements or None"
          />
        </FieldLabel>
      </div>
    </IntakeSectionShell>
  );
}
