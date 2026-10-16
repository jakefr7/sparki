import { PetPhotoPlaceholder } from './pet-photo-placeholder';
import { VisitBackButton } from './visit-back-button';
import { enumLabel } from '../lib/format';
import type { PatientAlertSummary } from '../lib/patient-types';

export type AutosaveState = 'idle' | 'saving' | 'saved' | 'error';

export function AutosaveIndicator({
  state,
  lastSavedAt,
  compact = false,
}: {
  state: AutosaveState;
  lastSavedAt: Date | null;
  compact?: boolean;
}) {
  const savedTimeLabel = lastSavedAt
    ? lastSavedAt.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    : null;

  const copy =
    state === 'saving'
      ? 'Saving…'
      : state === 'error'
        ? 'Save failed — Retry'
        : state === 'saved' && savedTimeLabel
          ? compact
            ? `Saved ${savedTimeLabel}`
            : `All changes saved · ${savedTimeLabel}`
          : 'All changes saved';

  return (
    <span className={`autosave-indicator autosave-indicator--${state}`}>
      <span className="autosave-indicator__dot" aria-hidden="true" />
      {copy}
    </span>
  );
}

const ALERT_SEVERITY_ORDER: Record<string, number> = { Critical: 0, Caution: 1, Info: 2 };

function PatientAlertBadges({ alerts }: { alerts: PatientAlertSummary[] }) {
  const active = alerts.filter((alert) => alert.isActive);
  if (active.length === 0) return null;

  const sorted = [...active].sort(
    (a, b) => (ALERT_SEVERITY_ORDER[a.severity] ?? 3) - (ALERT_SEVERITY_ORDER[b.severity] ?? 3),
  );

  return (
    <div className="patient-context-bar__alerts" role="list" aria-label="Patient alerts">
      {sorted.slice(0, 4).map((alert) => (
        <span
          key={alert.id}
          role="listitem"
          className={`patient-context-bar__alert patient-context-bar__alert--${alert.severity.toLowerCase()}`}
          title={alert.message}
        >
          {enumLabel(alert.category)}
        </span>
      ))}
      {sorted.length > 4 ? (
        <span className="patient-context-bar__alert patient-context-bar__alert--more">
          +{sorted.length - 4} more
        </span>
      ) : null}
    </div>
  );
}

export function PatientContextBar({
  backHref,
  patient,
  clientName,
  reason,
  primaryVeterinarian,
  assignedTechnician,
  room,
  alerts,
}: {
  backHref: string;
  patient: {
    name: string;
    species: string;
    breed: string | null;
    sex: string | null;
    imageUrl: string | null;
    /** Display age, e.g. "About 5 years old" (see patientAgeLabel). */
    age: string | null;
    weight: number | null;
  };
  clientName: string | null;
  reason: string;
  primaryVeterinarian: string;
  assignedTechnician: string;
  room: string | null;
  alerts: PatientAlertSummary[];
}) {
  const metaItems = [
    patient.species,
    patient.breed,
    patient.sex ? enumLabel(patient.sex) : null,
    patient.age,
    patient.weight ? `${patient.weight} lb` : null,
  ].filter((item): item is string => Boolean(item));

  return (
    <header className="patient-context-bar" aria-labelledby="patient-context-heading">
      <div className="patient-context-bar__back-row">
        <VisitBackButton fallbackHref={backHref} />
      </div>
      <div className="patient-context-bar__identity">
        <PetPhotoPlaceholder
          name={patient.name}
          species={patient.species}
          imageUrl={patient.imageUrl}
          className="patient-context-bar__avatar"
        />
        <div className="patient-context-bar__name-block">
          <h1 id="patient-context-heading">{patient.name}</h1>
          <p className="patient-context-bar__meta">{metaItems.join(' · ')}</p>
        </div>
      </div>

      <div className="patient-context-bar__details">
        <div className="patient-context-bar__reason">
          <span className="patient-context-bar__reason-label">Today’s visit</span>
          <strong>{reason}</strong>
        </div>
        <dl className={`patient-context-bar__facts${room ? ' patient-context-bar__facts--with-room' : ''}`}>
          <div>
            <dt>Client</dt>
            <dd>{clientName ?? 'No client linked'}</dd>
          </div>
          <div>
            <dt>Veterinarian</dt>
            <dd>{primaryVeterinarian}</dd>
          </div>
          <div>
            <dt>Technician</dt>
            <dd>{assignedTechnician}</dd>
          </div>
          {room ? (
            <div>
              <dt>Room</dt>
              <dd>{room}</dd>
            </div>
          ) : null}
        </dl>
        <PatientAlertBadges alerts={alerts} />
      </div>
    </header>
  );
}
