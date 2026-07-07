import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  StartAppointmentVisitButton,
  StartWalkInVisitForm,
} from '../../../components/start-visit-actions';
import { env } from '../../../lib/env';
import { formatAge } from '../../../lib/format';
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

const SECTION_LABELS = {
  workItems: 'Open Work',
  timeline: 'Recent Timeline',
  communication: 'Communication',
  financial: 'Financial',
  attachments: 'Attachments',
} as const;

function appointmentSummary(appointment: PatientWorkspace['upcomingAppointments'][number]) {
  return `${appointmentTypeLabel(appointment.type)} · ${new Date(
    appointment.scheduledAt,
  ).toLocaleString()}`;
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
  const age = formatAge(patient.dateOfBirth);
  const primaryClient = clients.find((client) => client.isPrimary);
  const secondaryClients = clients.filter((client) => !client.isPrimary);
  const currentVisitSection = sections.currentVisit;
  const activeVisit = currentVisitSection.status === 'available' ? currentVisitSection.visit : null;
  const nextAppointment = upcomingAppointments[0] ?? null;

  return (
    <main className="page page--wide">
      <Link href="/" className="back-link">
        ← Back to search
      </Link>

      <div className="command-center">
        <div className="command-center__main">
          <header className="patient-header patient-header--command">
            <div>
              <p className="eyebrow">Patient Command Center</p>
              <h1>{patient.name}</h1>
              <p className="patient-header__subtitle">
                {[
                  patient.species,
                  patient.breed,
                  patient.sex,
                  age,
                  patient.color,
                  patient.weight ? `${patient.weight} lb` : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
            </div>
            <div className="patient-header__status">
              <span className={`patient-status patient-status--${patient.status.toLowerCase()}`}>
                {patient.status}
              </span>
              {patient.sourceSystem && (
                <span className="source-label">
                  Imported from {patient.sourceSystem}
                  {patient.sourceConfidence !== null
                    ? ` (${Math.round(patient.sourceConfidence * 100)}% confidence)`
                    : ''}
                </span>
              )}
            </div>
          </header>

          <section className="current-visit-panel" aria-labelledby="current-visit-heading">
            <div className="current-visit-panel__header">
              <div>
                <p className="eyebrow">Now</p>
                <h2 id="current-visit-heading">Current Visit</h2>
              </div>
              {activeVisit ? (
                <span className="status-badge status-badge--active">In Visit</span>
              ) : nextAppointment ? (
                <span className="status-badge status-badge--scheduled">Scheduled</span>
              ) : (
                <span className="status-badge status-badge--idle">No Visit Today</span>
              )}
            </div>

            {activeVisit ? (
              <div className="current-visit-panel__body">
                <div>
                  <strong>{activeVisit.state}</strong>
                  <p>{activeVisit.reason}</p>
                  <p className="muted">
                    {activeVisit.visitType}
                    {activeVisit.client ? ` · ${clientDisplayName(activeVisit.client)}` : ''}
                  </p>
                  <p className="muted">
                    Started {new Date(activeVisit.createdAt).toLocaleString()}
                  </p>
                  {activeVisit.appointment && (
                    <p className="muted">
                      Appointment: {appointmentTypeLabel(activeVisit.appointment.type)} at{' '}
                      {new Date(activeVisit.appointment.scheduledAt).toLocaleString()}
                    </p>
                  )}
                </div>
                <Link href={`/visits/${activeVisit.id}`} className="button-primary">
                  Resume Visit
                </Link>
              </div>
            ) : nextAppointment ? (
              <div className="current-visit-panel__body">
                <div>
                  <strong>{appointmentSummary(nextAppointment)}</strong>
                  <p>{nextAppointment.reason}</p>
                  <p className="muted">State: {nextAppointment.state}</p>
                </div>
                <StartAppointmentVisitButton
                  appointmentId={nextAppointment.id}
                  appointmentState={nextAppointment.state}
                  className="button-primary"
                />
              </div>
            ) : (
              <div className="current-visit-panel__body">
                <div>
                  <strong>No appointment or active visit on deck</strong>
                  <p className="muted">
                    {currentVisitSection.status === 'unavailable'
                      ? currentVisitSection.reason
                      : 'No active visit.'}
                  </p>
                </div>
                <StartWalkInVisitForm patientId={patient.id} compact />
              </div>
            )}
          </section>
        </div>

        <aside className="context-rail" aria-label="Patient context">
          <section>
            <div className="context-rail__heading">Client</div>
            {clients.length === 0 && <p className="empty-state">No client on file.</p>}
            {primaryClient && (
              <div className="client-card client-card--primary">
                <strong>{clientDisplayName(primaryClient)}</strong>
                <span className="client-card__badge">Primary</span>
                <div>{primaryClient.phone ?? primaryClient.email ?? 'No contact info on file'}</div>
              </div>
            )}
            {secondaryClients.map((client) => (
              <div className="client-card" key={client.id}>
                <strong>{clientDisplayName(client)}</strong>
                <div>{client.phone ?? client.email ?? 'No contact info on file'}</div>
              </div>
            ))}
          </section>

          <section>
            <div className="context-rail__heading">Appointment Context</div>
            {nextAppointment ? (
              <div className="rail-fact">
                <strong>{appointmentTypeLabel(nextAppointment.type)}</strong>
                <span>{new Date(nextAppointment.scheduledAt).toLocaleString()}</span>
                <span>{nextAppointment.reason}</span>
              </div>
            ) : (
              <p className="empty-state">No upcoming appointment.</p>
            )}
            <Link href={`/patients/${patient.id}/schedule`} className="button-secondary">
              Schedule Appointment
            </Link>
          </section>

          <section>
            <div className="context-rail__heading">Alerts</div>
            <p className="empty-state">No alerts on file.</p>
          </section>
        </aside>
      </div>

      <section aria-labelledby="upcoming-appointments-heading">
        <h2 id="upcoming-appointments-heading">Upcoming Appointments</h2>
        {upcomingAppointments.length === 0 && (
          <p className="empty-state">No upcoming appointments.</p>
        )}
        {upcomingAppointments.map((appointment) => (
          <div className="appointment-card" key={appointment.id}>
            <strong>{appointmentTypeLabel(appointment.type)}</strong>
            <span className="appointment-card__state">{appointment.state}</span>
            <div>{appointment.reason}</div>
            <div className="appointment-card__time">
              {new Date(appointment.scheduledAt).toLocaleString()}
              {appointment.expectedDurationMinutes
                ? ` · ${appointment.expectedDurationMinutes} min`
                : ''}
            </div>
            {!activeVisit &&
              appointment.state !== 'VisitCreated' &&
              appointment.id !== nextAppointment?.id && (
                <StartAppointmentVisitButton
                  appointmentId={appointment.id}
                  appointmentState={appointment.state}
                />
              )}
            {activeVisit && (
              <p className="appointment-card__note">
                Active visit already started for this patient.
              </p>
            )}
          </div>
        ))}
      </section>

      <section aria-labelledby="workspace-sections-heading">
        <h2 id="workspace-sections-heading">Workspace</h2>
        <div className="section-grid">
          {(Object.keys(SECTION_LABELS) as (keyof typeof SECTION_LABELS)[]).map((key) => (
            <div className="section-card section-card--unavailable" key={key}>
              <h3>{SECTION_LABELS[key]}</h3>
              <p>{sections[key].reason}</p>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
