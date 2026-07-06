import Link from 'next/link';
import { notFound } from 'next/navigation';
import { env } from '../../../lib/env';
import {
  appointmentTypeLabel,
  clientDisplayName,
  type VisitDetail,
} from '../../../lib/patient-types';

async function getVisit(id: string): Promise<VisitDetail | null> {
  const response = await fetch(new URL(`/visits/${id}`, env.API_URL), { cache: 'no-store' });
  if (response.status === 404) {
    return null;
  }
  if (!response.ok) {
    throw new Error(`Failed to load visit (${response.status})`);
  }
  return response.json() as Promise<VisitDetail>;
}

function enumLabel(value: string): string {
  return value.replace(/([a-z])([A-Z])/g, '$1 $2');
}

function personLabel(
  person: {
    displayName: string | null;
    firstName: string;
    lastName: string;
    role: string;
  } | null,
): string {
  if (!person) return 'Unassigned';
  const name = person.displayName ?? `${person.firstName} ${person.lastName}`;
  return `${name} · ${enumLabel(person.role)}`;
}

function nextStepForState(state: string): string {
  if (
    [
      'Arrived',
      'CheckInInProgress',
      'ArrivedWithExceptions',
      'Triaged',
      'Waiting',
      'ReadyForIntake',
    ].includes(state)
  ) {
    return 'Room the patient, confirm intake context, or assign the clinical owner.';
  }
  if (state === 'CheckoutReady') return 'Review charges, collect payment, and close the visit.';
  if (state === 'InProgress' || state === 'ProviderExam') {
    return 'Continue the clinical workflow from the current visit state.';
  }
  return 'Continue the visit workflow from this state.';
}

export default async function VisitWorkspacePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ from?: string }>;
}) {
  const { id } = await params;
  const { from } = await searchParams;
  const visit = await getVisit(id);
  if (!visit) {
    notFound();
  }

  const openedFromCommandCenter = from === 'command-center';
  const backHref = openedFromCommandCenter ? '/' : `/patients/${visit.patient.id}`;
  const backLabel = openedFromCommandCenter ? 'Back to Command Center' : `Back to ${visit.patient.name}`;
  const appointmentContext = visit.appointment
    ? `${appointmentTypeLabel(visit.appointment.type)} · ${new Date(
        visit.appointment.scheduledAt,
      ).toLocaleString()}`
    : 'Walk-in / no appointment';

  return (
    <main className="page page--wide">
      <Link href={backHref} className="back-link">
        ← {backLabel}
      </Link>

      <header className="patient-header patient-header--command">
        <div>
          <p className="eyebrow">Visit Workspace</p>
          <h1>{visit.patient.name}</h1>
          <p className="patient-header__subtitle">
            {visit.patient.species}
            {visit.patient.breed ? ` · ${visit.patient.breed}` : ''} · {visit.reason}
          </p>
        </div>
        <div className="patient-header__status">
          <span className="patient-status">{enumLabel(visit.state)}</span>
          <span className="source-label">Opened {openedFromCommandCenter ? 'from Command Center' : 'from patient workspace'}</span>
        </div>
      </header>

      <section className="visit-command-grid" aria-label="Visit command context">
        <div className="visit-command-card visit-command-card--status">
          <span>Visit status</span>
          <strong>{enumLabel(visit.state)}</strong>
          <p>
            {enumLabel(visit.visitType)} · Started {new Date(visit.createdAt).toLocaleString()}
          </p>
        </div>

        <div className="visit-command-card">
          <span>Patient / client context</span>
          <strong>{visit.patient.name}</strong>
          <p>{visit.client ? clientDisplayName(visit.client) : 'No client linked'}</p>
        </div>

        <div className="visit-command-card">
          <span>Assigned provider / technician</span>
          <strong>{personLabel(visit.primaryVeterinarian)}</strong>
          <p>Technician: {personLabel(visit.assignedTechnician)}</p>
          <p>Current owner: {personLabel(visit.currentOwner)}</p>
        </div>

        <div className="visit-command-card">
          <span>Appointment reason</span>
          <strong>{visit.reason}</strong>
          <p>{appointmentContext}</p>
        </div>

        <div className="visit-command-card visit-command-card--next">
          <span>Current next step</span>
          <strong>{nextStepForState(visit.state)}</strong>
          <p>This workspace is intentionally scoped to visit command context.</p>
        </div>
      </section>
    </main>
  );
}
