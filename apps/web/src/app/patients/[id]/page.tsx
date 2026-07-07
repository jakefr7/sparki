import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  StartAppointmentVisitButton,
  StartWalkInVisitForm,
} from '../../../components/start-visit-actions';
import { env } from '../../../lib/env';
import { enumLabel, formatAge } from '../../../lib/format';
import {
  appointmentTypeLabel,
  clientDisplayName,
  type PatientWorkspace,
} from '../../../lib/patient-types';

async function getWorkspace(id: string): Promise<PatientWorkspace | null> {
  const response = await fetch(new URL(`/patients/${id}/workspace`, env.API_URL), {
    cache: 'no-store',
  });
  if (response.status === 404) {
    return null;
  }
  if (!response.ok) {
    throw new Error(`Failed to load patient workspace (${response.status})`);
  }
  return response.json() as Promise<PatientWorkspace>;
}

function appointmentTime(value: string) {
  return new Date(value).toLocaleString([], {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function PatientPhotoPlaceholder({ name, species }: { name: string; species: string }) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');

  return (
    <div className="patient-profile-photo" aria-label={`${name} photo placeholder`}>
      <span>{initials || species[0]?.toUpperCase() || 'P'}</span>
    </div>
  );
}

export default async function PatientWorkspacePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const workspace = await getWorkspace(id);
  if (!workspace) {
    notFound();
  }

  const { patient, clients, upcomingAppointments, sections } = workspace;
  const primaryClient = clients.find((client) => client.isPrimary);
  const secondaryClients = clients.filter((client) => !client.isPrimary);
  const currentVisit = sections.currentVisit.status === 'available' ? sections.currentVisit.visit : null;
  const nextAppointment = upcomingAppointments[0] ?? null;
  const identityLine = [
    patient.species,
    patient.breed,
    patient.sex,
    formatAge(patient.dateOfBirth),
    patient.color,
    patient.weight ? `${patient.weight} lb` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <main className="page page--wide patient-profile-hub">
      <Link href="/patients" className="back-link">
        Back to Patients / Clients
      </Link>

      <header className="patient-profile-hero">
        <PatientPhotoPlaceholder name={patient.name} species={patient.species} />
        <div className="patient-profile-hero__identity">
          <p className="eyebrow">Patient Profile</p>
          <h1>{patient.name}</h1>
          <p>{identityLine || 'Patient details not yet captured'}</p>
          <div className="patient-profile-hero__badges">
            <span className={`patient-status patient-status--${patient.status.toLowerCase()}`}>
              {patient.status}
            </span>
            {currentVisit && <span className="status-badge status-badge--active">Active Visit</span>}
            {!currentVisit && nextAppointment && (
              <span className="status-badge status-badge--scheduled">Upcoming Appointment</span>
            )}
          </div>
        </div>
        <div className="patient-profile-actions" aria-label="Patient quick actions">
          <Link href="/patients/new" className="button-secondary">
            New Intake
          </Link>
          {currentVisit ? (
            <Link href={`/visits/${currentVisit.id}`} className="button-primary">
              New Medical Record
            </Link>
          ) : (
            <button type="button" className="button-secondary" disabled>
              New Medical Record
            </button>
          )}
          <Link href={`/patients/${patient.id}/schedule`} className="button-secondary">
            Set Appointment
          </Link>
          {!currentVisit && nextAppointment && (
            <StartAppointmentVisitButton
              appointmentId={nextAppointment.id}
              appointmentState={nextAppointment.state}
              className="button-secondary"
            />
          )}
        </div>
      </header>

      <div className="patient-profile-grid">
        <section className="profile-card" aria-labelledby="client-info-heading">
          <div className="profile-card__header">
            <p className="eyebrow">Relationship</p>
            <h2 id="client-info-heading">Client Info</h2>
          </div>
          {primaryClient ? (
            <div className="profile-fact-list">
              <div>
                <span>Primary client</span>
                <strong>{clientDisplayName(primaryClient)}</strong>
              </div>
              <div>
                <span>Contact</span>
                <strong>{primaryClient.phone ?? primaryClient.email ?? 'No contact on file'}</strong>
              </div>
              <div>
                <span>Preference</span>
                <strong>{primaryClient.preferredContactMethod ?? 'Not set'}</strong>
              </div>
            </div>
          ) : (
            <p className="empty-state">No client is linked to this patient.</p>
          )}
          {secondaryClients.length > 0 && (
            <div className="profile-secondary-list">
              {secondaryClients.map((client) => (
                <span key={client.id}>
                  {clientDisplayName(client)} · {client.phone ?? client.email ?? 'No contact'}
                </span>
              ))}
            </div>
          )}
        </section>

        <section className="profile-card" aria-labelledby="upcoming-appointment-heading">
          <div className="profile-card__header">
            <p className="eyebrow">Next care moment</p>
            <h2 id="upcoming-appointment-heading">Upcoming Appointment</h2>
          </div>
          {nextAppointment ? (
            <div className="profile-callout">
              <strong>{appointmentTypeLabel(nextAppointment.type)}</strong>
              <span>{appointmentTime(nextAppointment.scheduledAt)}</span>
              <p>{nextAppointment.reason}</p>
              <span className="status-badge status-badge--scheduled">
                {enumLabel(nextAppointment.state)}
              </span>
            </div>
          ) : (
            <div className="profile-empty-action">
              <p className="empty-state">No upcoming appointment.</p>
              <Link href={`/patients/${patient.id}/schedule`} className="button-secondary">
                Set Appointment
              </Link>
            </div>
          )}
        </section>

        <section className="profile-card profile-card--wide" aria-labelledby="active-visit-heading">
          <div className="profile-card__header">
            <p className="eyebrow">Today</p>
            <h2 id="active-visit-heading">Active Visit</h2>
          </div>
          {currentVisit ? (
            <div className="profile-visit-row">
              <div>
                <strong>{enumLabel(currentVisit.state)}</strong>
                <span>{currentVisit.reason}</span>
                <span>
                  {currentVisit.visitType}
                  {currentVisit.client ? ` · ${clientDisplayName(currentVisit.client)}` : ''}
                </span>
              </div>
              <Link href={`/visits/${currentVisit.id}`} className="button-primary">
                Resume Visit
              </Link>
            </div>
          ) : (
            <div className="profile-empty-action">
              <p className="empty-state">
                {sections.currentVisit.status === 'unavailable'
                  ? sections.currentVisit.reason
                  : 'No active visit.'}
              </p>
              <StartWalkInVisitForm patientId={patient.id} compact />
            </div>
          )}
        </section>

        <section className="profile-card profile-card--wide" aria-labelledby="visit-history-heading">
          <div className="profile-card__header">
            <p className="eyebrow">Clinical context</p>
            <h2 id="visit-history-heading">Visit History</h2>
          </div>
          <div className="profile-history-placeholder">
            <strong>Visit history skeleton</strong>
            <p>{sections.timeline.reason}</p>
          </div>
        </section>
      </div>
    </main>
  );
}
