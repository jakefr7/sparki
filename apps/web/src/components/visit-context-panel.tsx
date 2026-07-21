'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { enumLabel } from '../lib/format';
import {
  RECORDS_PREP_STATUSES,
  recordsPrepStatusLabel,
  type PatientAlertSummary,
  type VisitDetail,
} from '../lib/patient-types';
import {
  INTAKE_SECTIONS,
  fieldLabel,
  sectionForField,
  type IntakeSectionId,
  type RequiredIntakeField,
} from '../lib/visit-intake-fields';
import { AutosaveIndicator, type AutosaveState } from './patient-context-bar';

function PatientAlertsSummary({ alerts }: { alerts: PatientAlertSummary[] }) {
  const active = alerts.filter((alert) => alert.isActive);
  if (active.length === 0) {
    return (
      <section className="context-panel__section">
        <h3>Patient alerts</h3>
        <p className="context-panel__empty">No active alerts on file.</p>
      </section>
    );
  }
  return (
    <section className="context-panel__section">
      <h3>Patient alerts</h3>
      <ul className="context-panel__alert-list">
        {active.map((alert) => (
          <li key={alert.id} className={`context-panel__alert context-panel__alert--${alert.severity.toLowerCase()}`}>
            <strong>{enumLabel(alert.category)}</strong>
            <span>{alert.message}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function VisitTeamSummary({
  primaryVeterinarian,
  assignedTechnician,
  room,
}: {
  primaryVeterinarian: string;
  assignedTechnician: string;
  room: string | null;
}) {
  return (
    <section className="context-panel__section">
      <h3>Visit team</h3>
      <dl className="context-panel__facts">
        <div>
          <dt>Veterinarian</dt>
          <dd>{primaryVeterinarian}</dd>
        </div>
        <div>
          <dt>Technician</dt>
          <dd>{assignedTechnician}</dd>
        </div>
        <div>
          <dt>Room</dt>
          <dd>{room ?? 'Not assigned'}</dd>
        </div>
      </dl>
    </section>
  );
}

function PriorRecordsSummary({ appointment }: { appointment: NonNullable<VisitDetail['appointment']> }) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function setStatus(nextStatus: string) {
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/appointments/${appointment.id}/records-prep-status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recordsPrepStatus: nextStatus }),
      });
      if (!response.ok) throw new Error('Could not update records status.');
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not update records status.');
    } finally {
      setSaving(false);
    }
  }

  const context = [
    appointment.primaryCareVetName ? `Primary vet: ${appointment.primaryCareVetName}` : null,
    appointment.previousClinicName ? `Previous clinic: ${appointment.previousClinicName}` : null,
    appointment.lastSeenAt ? `Last seen ${new Date(appointment.lastSeenAt).toLocaleDateString()}` : null,
  ].filter(Boolean);

  return (
    <section className="context-panel__section">
      <h3>Prior records</h3>
      <p className={`context-panel__records-status context-panel__records-status--${appointment.recordsPrepStatus.toLowerCase()}`}>
        {recordsPrepStatusLabel(appointment.recordsPrepStatus)}
      </p>
      {context.length > 0 ? (
        <p className="context-panel__records-context">{context.join(' · ')}</p>
      ) : null}
      <div className="context-panel__records-actions">
        {RECORDS_PREP_STATUSES.map((status) => (
          <button
            key={status}
            type="button"
            className={status === appointment.recordsPrepStatus ? 'is-selected' : ''}
            disabled={saving}
            onClick={() => void setStatus(status)}
          >
            {recordsPrepStatusLabel(status)}
          </button>
        ))}
      </div>
      {error ? <p className="form-error" role="alert">{error}</p> : null}
    </section>
  );
}

function IntakeCompletionSummary({
  completedSections,
  missing,
  onFocusField,
}: {
  completedSections: Set<IntakeSectionId>;
  missing: RequiredIntakeField[];
  onFocusField: (field: RequiredIntakeField) => void;
}) {
  const requiredSections = INTAKE_SECTIONS.filter((section) => !section.optional);
  const completedRequiredSections = requiredSections.filter((section) => completedSections.has(section.id)).length;

  const groupedMissing = new Map<IntakeSectionId, RequiredIntakeField[]>();
  for (const field of missing) {
    const sectionId = sectionForField(field);
    groupedMissing.set(sectionId, [...(groupedMissing.get(sectionId) ?? []), field]);
  }

  return (
    <section className="context-panel__section">
      <h3>Intake status</h3>
      <p className="context-panel__completion-line">
        {completedRequiredSections} of {requiredSections.length} required sections complete
      </p>
      {missing.length > 0 ? (
        <ul className="context-panel__missing-list">
          {INTAKE_SECTIONS.filter((section) => groupedMissing.has(section.id)).map((section) => (
            <li key={section.id}>
              <span className="context-panel__missing-section">{section.label}</span>
              {(groupedMissing.get(section.id) ?? []).map((field) => (
                <button key={field} type="button" onClick={() => onFocusField(field)}>
                  {fieldLabel(field)}
                </button>
              ))}
            </li>
          ))}
        </ul>
      ) : (
        <p className="context-panel__empty context-panel__empty--success">
          Everything required is captured.
        </p>
      )}
    </section>
  );
}

export function VisitContextPanel({
  patientAlerts,
  primaryVeterinarian,
  assignedTechnician,
  room,
  appointment,
  completedSections,
  missing,
  onFocusField,
  autosaveState,
  lastSavedAt,
  stickyTop,
}: {
  patientAlerts: PatientAlertSummary[];
  primaryVeterinarian: string;
  assignedTechnician: string;
  room: string | null;
  appointment: VisitDetail['appointment'];
  completedSections: Set<IntakeSectionId>;
  missing: RequiredIntakeField[];
  onFocusField: (field: RequiredIntakeField) => void;
  autosaveState: AutosaveState;
  lastSavedAt: Date | null;
  /** Measured height of the sticky header above this panel (px) — the panel
   *  can't know that height from CSS alone since it varies with content
   *  (alerts wrapping, patient name length, breakpoint reflow). */
  stickyTop: number;
}) {
  return (
    <aside
      className="context-panel"
      aria-label="Visit context"
      style={{ top: stickyTop, maxHeight: `calc(100vh - ${stickyTop}px - 6rem)` }}
    >
      <div className="context-panel__autosave">
        <AutosaveIndicator state={autosaveState} lastSavedAt={lastSavedAt} />
      </div>
      <PatientAlertsSummary alerts={patientAlerts} />
      <VisitTeamSummary primaryVeterinarian={primaryVeterinarian} assignedTechnician={assignedTechnician} room={room} />
      {appointment ? <PriorRecordsSummary appointment={appointment} /> : null}
      <IntakeCompletionSummary
        completedSections={completedSections}
        missing={missing}
        onFocusField={onFocusField}
      />
    </aside>
  );
}
