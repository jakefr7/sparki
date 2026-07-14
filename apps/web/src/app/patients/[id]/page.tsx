import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  StartAppointmentVisitButton,
  StartWalkInVisitForm,
} from '../../../components/start-visit-actions';
import { ActiveVisitDetailsButton } from '../../../components/active-visit-details-button';
import { BackButton } from '../../../components/back-button';
import { PatientAlertsPanel } from '../../../components/patient-alerts-panel';
import { PatientMedicationsPanel } from '../../../components/patient-medications-panel';
import { PatientNewAppointmentButton } from '../../../components/patient-new-appointment-button';
import { PatientProfileEditPanel } from '../../../components/patient-profile-edit-panel';
import { PatientProfileTabs } from '../../../components/patient-profile-tabs';
import { PatientPhotoActions } from '../../../components/patient-photo-actions';
import { env } from '../../../lib/env';
import { appointmentStatusLabel, formatAge, visitStateLabel } from '../../../lib/format';
import {
  appointmentTypeLabel,
  clientDisplayName,
  formatClientAddress,
  type PatientWorkspace,
  type RecentVisitSummary,
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

function visitDate(value: string) {
  return new Date(value).toLocaleDateString([], {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function fullDate(value: string) {
  return new Date(value).toLocaleDateString([], {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

function doctorLabel(visit: RecentVisitSummary): string {
  return visit.primaryVeterinarian
    ? `Dr. ${visit.primaryVeterinarian.firstName} ${visit.primaryVeterinarian.lastName}`
    : 'Unassigned';
}

function patientDobLine(dateOfBirth: string | null, estimatedAge: string | null): string {
  const age = formatAge(dateOfBirth) || estimatedAge;
  if (dateOfBirth && age) return `${age} · DOB ${fullDate(dateOfBirth)}`;
  if (dateOfBirth) return `DOB ${fullDate(dateOfBirth)}`;
  return age ?? 'Age not captured';
}

function displayValue(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
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

  const { patient, clients, upcomingAppointments, recentVisits, sections } = workspace;
  const primaryClient = clients.find((client) => client.isPrimary);
  const secondaryClients = clients.filter((client) => !client.isPrimary);
  const currentVisit = sections.currentVisit.status === 'available' ? sections.currentVisit.visit : null;
  const medications = sections.medications.status === 'available' ? sections.medications : null;
  const nextAppointment = upcomingAppointments[0] ?? null;
  const headerAlert = patient.patientAlerts[0]?.message ?? patient.alerts;
  const alertCount = patient.patientAlerts.length + (patient.patientAlerts.length === 0 && patient.alerts ? 1 : 0);
  const activeMedicationCount = medications?.items.filter((item) => item.status === 'Active').length ?? 0;
  const ageLine = patientDobLine(patient.dateOfBirth, patient.estimatedAge);
  const ownerAddress = primaryClient ? formatClientAddress(primaryClient) : null;
  const patientDetails = [
    { label: 'Species', value: patient.species },
    { label: 'Breed', value: patient.breed },
    { label: 'Sex', value: patient.sex },
    { label: 'Age / DOB', value: ageLine },
    { label: 'Coat', value: patient.color },
  ].filter((item) => displayValue(item.value));
  const ownerContactDetails = primaryClient
    ? [
        { label: 'Owner name', value: clientDisplayName(primaryClient) },
        { label: 'Cell phone', value: primaryClient.phone },
        { label: 'Home/work phone', value: primaryClient.alternatePhone },
        { label: 'Email', value: primaryClient.email },
        { label: 'Address', value: ownerAddress },
        { label: 'Preference', value: primaryClient.preferredContactMethod },
      ].filter((item) => displayValue(item.value))
    : [];
  const ownerStructuredDetails = primaryClient
    ? [
        { label: 'Address line 1', value: primaryClient.addressLine1 },
        { label: 'Address line 2', value: primaryClient.addressLine2 },
        { label: 'City', value: primaryClient.city },
        { label: 'State', value: primaryClient.state },
        { label: 'ZIP/postal code', value: primaryClient.postalCode },
        { label: 'Country', value: primaryClient.country },
      ].filter((item) => displayValue(item.value))
    : [];

  return (
    <main className="page page--wide patient-profile-hub">
      <BackButton fallbackHref="/patients" label="Back to previous page" />

      <header className="patient-profile-hero">
        <PatientPhotoActions
          patientId={patient.id}
          name={patient.name}
          species={patient.species}
          imageUrl={patient.imageUrl}
        />
        <div className="patient-profile-hero__identity">
          <p className="eyebrow">Patient Profile</p>
          <h1>{patient.name}</h1>
          {primaryClient && <p className="patient-profile-hero__owner">Owner: {clientDisplayName(primaryClient)}</p>}
          <dl className="patient-profile-hero__details">
            {patientDetails.map((item) => (
              <div key={item.label}>
                <dt>{item.label}</dt>
                <dd>{item.value}</dd>
              </div>
            ))}
          </dl>
          <div className="patient-profile-hero__badges">
            <span className={`patient-status patient-status--${patient.status.toLowerCase()}`}>
              {patient.status}
            </span>
            {currentVisit && <span className="status-badge status-badge--active">Current Visit</span>}
            {!currentVisit && nextAppointment && (
              <span className="status-badge status-badge--scheduled">Upcoming Appointment</span>
            )}
          </div>
          {headerAlert ? (
            <div className="patient-profile-hero__alert" role="note">
              <strong>Alert:</strong>
              <span>{headerAlert}</span>
              {alertCount > 1 ? <a href="#patient-profile-tab-alerts">View all</a> : null}
            </div>
          ) : null}
        </div>
        <div className="patient-profile-actions" aria-label="Patient care actions">
          <section className="patient-care-status-card" aria-labelledby="patient-care-status-heading">
            <p className="eyebrow" id="patient-care-status-heading">Care Flow</p>
            <div className="patient-care-status-card__row patient-care-status-card__row--active">
              <span>Now</span>
              {currentVisit ? (
                <>
                  <strong>{visitStateLabel(currentVisit.state)}</strong>
                  <small>{currentVisit.reason}</small>
                </>
              ) : (
                <>
                  <strong>None</strong>
                  <small>Ready for a new visit.</small>
                </>
              )}
            </div>
            <div className="patient-care-status-card__row">
              <span>Upcoming</span>
              {nextAppointment ? (
                <>
                  <strong>{appointmentTypeLabel(nextAppointment.type)}</strong>
                  <small>{appointmentTime(nextAppointment.scheduledAt)}</small>
                </>
              ) : (
                <>
                  <strong>No appointment</strong>
                  <small>No future care moment scheduled.</small>
                </>
              )}
            </div>
          </section>
          {currentVisit ? (
            <ActiveVisitDetailsButton visit={currentVisit} className="button-primary" label="View Active Visit" />
          ) : nextAppointment ? (
            <StartAppointmentVisitButton
              appointmentId={nextAppointment.id}
              appointmentState={nextAppointment.state}
              className="button-primary"
              label="Start New Visit"
            />
          ) : (
            <a href="#active-visit-heading" className="button-primary">
              Start New Visit
            </a>
          )}
          <PatientNewAppointmentButton
            patient={{
              id: patient.id,
              name: patient.name,
              species: patient.species,
              breed: patient.breed,
              sex: patient.sex,
              dateOfBirth: patient.dateOfBirth,
              weight: patient.weight,
              color: patient.color,
            }}
            primaryClient={primaryClient ?? null}
            className="button-secondary"
          />
          <PatientProfileEditPanel
            patient={{
              id: patient.id,
              name: patient.name,
              species: patient.species,
              breed: patient.breed,
              sex: patient.sex,
              dateOfBirth: patient.dateOfBirth,
              estimatedAge: patient.estimatedAge,
              color: patient.color,
              imageUrl: patient.imageUrl,
            }}
            primaryClient={
              primaryClient
                ? {
                    id: primaryClient.id,
                    firstName: primaryClient.firstName,
                    lastName: primaryClient.lastName,
                    phone: primaryClient.phone,
                    alternatePhone: primaryClient.alternatePhone,
                    email: primaryClient.email,
                    addressLine1: primaryClient.addressLine1,
                    addressLine2: primaryClient.addressLine2,
                    city: primaryClient.city,
                    state: primaryClient.state,
                    postalCode: primaryClient.postalCode,
                    country: primaryClient.country,
                  }
                : null
            }
          />
        </div>
      </header>

      <section className="patient-alert-strip" aria-label="Clinical alerts">
        <div className="patient-alert-strip__item patient-alert-strip__item--medications">
          <span>Medications</span>
          <strong>
            {activeMedicationCount > 0
              ? `${activeMedicationCount} active medication${activeMedicationCount === 1 ? '' : 's'}`
              : 'No active medications on file.'}
          </strong>
          {medications?.legacyNotes && activeMedicationCount === 0 && (
            <Link href={`/visits/${medications.legacyNotes.visitId}`}>
              Legacy note updated {visitDate(medications.legacyNotes.recordedAt)}
            </Link>
          )}
        </div>
        <div className="patient-alert-strip__item">
          <span>Allergies / Alerts</span>
          <strong>{headerAlert ?? 'No alerts on file.'}</strong>
          {alertCount > 1 ? <a href="#patient-profile-tab-alerts">View all alerts</a> : null}
        </div>
      </section>

      <PatientProfileTabs
        tabs={[
          {
            id: 'overview',
            label: 'Overview',
            panel: (
              <div className="patient-profile-overview">
                <div className="patient-profile-overview__main">
                  <section className="profile-card profile-card--accent profile-card--care-flow" aria-labelledby="active-visit-heading">
                    <div className="profile-card__header">
                      <p className="eyebrow">Care flow</p>
                      <h2 id="active-visit-heading">Visit Status</h2>
                    </div>
                    <div className="profile-care-flow">
                      {currentVisit ? (
                        <div className="profile-care-flow__item profile-care-flow__item--active">
                          <span>Now</span>
                          <div>
                            <strong>{visitStateLabel(currentVisit.state)}</strong>
                            <p>{currentVisit.reason}</p>
                            <small>
                              {currentVisit.visitType}
                              {currentVisit.client ? ` · ${clientDisplayName(currentVisit.client)}` : ''}
                            </small>
                          </div>
                          <ActiveVisitDetailsButton visit={currentVisit} label="View Visit" />
                        </div>
                      ) : (
                        <div className="profile-care-flow__item profile-care-flow__item--empty">
                          <span>Now</span>
                          <div>
                            <strong>No active visit</strong>
                            <p>
                              {sections.currentVisit.status === 'unavailable'
                                ? sections.currentVisit.reason
                                : 'Start a visit when this patient is ready for care.'}
                            </p>
                          </div>
                        </div>
                      )}
                      {nextAppointment ? (
                        <div className="profile-care-flow__item">
                          <span>Next</span>
                          <div>
                            <strong>{appointmentTypeLabel(nextAppointment.type)}</strong>
                            <p>{nextAppointment.reason}</p>
                            <small>{appointmentTime(nextAppointment.scheduledAt)}</small>
                          </div>
                          <span className="status-badge status-badge--scheduled">
                            {appointmentStatusLabel(nextAppointment.state)}
                          </span>
                        </div>
                      ) : (
                        <div className="profile-care-flow__item profile-care-flow__item--empty">
                          <span>Next</span>
                          <div>
                            <strong>No upcoming appointment</strong>
                            <p>No future care moment is scheduled.</p>
                          </div>
                        </div>
                      )}
                    </div>
                    {!currentVisit && (
                      <div className="profile-empty-action">
                        <StartWalkInVisitForm patientId={patient.id} compact submitLabel="Start New Visit" />
                      </div>
                    )}
                  </section>

                  <section className="profile-card" aria-labelledby="recent-visits-preview-heading">
                    <div className="profile-card__header">
                      <p className="eyebrow">Recent care</p>
                      <h2 id="recent-visits-preview-heading">Recent Visits</h2>
                    </div>
                    {recentVisits.length > 0 ? (
                      <ul className="profile-visit-history profile-visit-history--preview">
                        {recentVisits.slice(0, 3).map((visit) => (
                          <li key={visit.id}>
                            <Link href={`/visits/${visit.id}`} className="profile-visit-history__row">
                              <span className="profile-visit-history__date">{visitDate(visit.createdAt)}</span>
                              <span className="profile-visit-history__reason">
                                <strong>{visit.reason}</strong>
                                <small>{visit.visitType}</small>
                              </span>
                              <span className="status-badge status-badge--scheduled">
                                {visitStateLabel(visit.state)}
                              </span>
                              <span className="profile-visit-history__doctor">{doctorLabel(visit)}</span>
                            </Link>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="empty-state">No visits yet.</p>
                    )}
                  </section>
                </div>

                <aside className="patient-profile-overview__sidebar">
                  <section className="profile-card profile-card--compact" aria-labelledby="owner-summary-heading">
                    <div className="profile-card__header">
                      <p className="eyebrow">Owner</p>
                      <h2 id="owner-summary-heading">Contact Summary</h2>
                    </div>
                    {primaryClient ? (
                      <dl className="profile-info-list profile-info-list--summary">
                        {ownerContactDetails.slice(0, 4).map((item) => (
                          <div key={item.label}>
                            <dt>{item.label}</dt>
                            <dd>{item.value}</dd>
                          </div>
                        ))}
                      </dl>
                    ) : (
                      <p className="empty-state">No owner is linked to this patient.</p>
                    )}
                  </section>

                  <section className="profile-card profile-card--compact" aria-labelledby="profile-quick-actions-heading">
                    <div className="profile-card__header">
                      <p className="eyebrow">Shortcuts</p>
                      <h2 id="profile-quick-actions-heading">Quick Actions</h2>
                    </div>
                    <div className="profile-quick-actions">
                      {currentVisit ? (
                        <ActiveVisitDetailsButton
                          visit={currentVisit}
                          className="profile-quick-actions__button"
                          label="View Active Visit"
                        />
                      ) : (
                        <a href="#active-visit-heading">Start New Visit</a>
                      )}
                    </div>
                  </section>
                </aside>
              </div>
            ),
          },
          {
            id: 'alerts',
            label: 'Alerts',
            panel: <PatientAlertsPanel patientId={patient.id} alerts={patient.patientAlerts} legacyAlert={patient.alerts} />,
          },
          {
            id: 'records',
            label: 'Records',
            panel: (
              <div className="patient-tab-grid patient-tab-grid--records">
                <section className="profile-card profile-card--wide" aria-labelledby="medical-record-summary-heading">
                  <div className="profile-card__header">
                    <p className="eyebrow">Medical notes</p>
                    <h2 id="medical-record-summary-heading">Medical Record Summary</h2>
                  </div>
                  <div className="profile-records-empty">
                    <strong>No medical records have been added for this patient yet.</strong>
                    <p>
                      Ready for New Visit details, exam findings, and treatment plans as clinical notes are recorded.
                    </p>
                  </div>
                </section>
                <section className="profile-records-readiness" aria-label="Record sections">
                  {[
                    ['New Visit details', 'Ready to show notes captured during a visit.'],
                    ['Exam findings', 'Ready for exam notes.'],
                    ['Treatment plan', 'Ready for care plans and follow-up notes.'],
                  ].map(([title, copy]) => (
                    <div key={title}>
                      <span>{title}</span>
                      <p>{copy}</p>
                    </div>
                  ))}
                </section>
              </div>
            ),
          },
          {
            id: 'visits',
            label: 'Visits',
            panel: (
              <section className="profile-card profile-card--wide" aria-labelledby="visit-history-heading">
                <div className="profile-card__header">
                  <p className="eyebrow">Timeline</p>
                  <h2 id="visit-history-heading">Visit History</h2>
                </div>
                {recentVisits.length > 0 ? (
                  <ul className="profile-visit-history">
                    {recentVisits.map((visit) => (
                      <li key={visit.id}>
                        <Link href={`/visits/${visit.id}`} className="profile-visit-history__row">
                          <span className="profile-visit-history__date">{visitDate(visit.createdAt)}</span>
                          <span className="profile-visit-history__reason">
                            <strong>{visit.reason}</strong>
                            <small>{visit.visitType}</small>
                          </span>
                          <span className="status-badge status-badge--scheduled">{visitStateLabel(visit.state)}</span>
                          <span className="profile-visit-history__doctor">{doctorLabel(visit)}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="profile-empty-action">
                    <p className="empty-state">No visits yet.</p>
                    <StartWalkInVisitForm patientId={patient.id} compact submitLabel="Start New Visit" />
                  </div>
                )}
              </section>
            ),
          },
          {
            id: 'medications',
            label: 'Medications',
            panel: medications ? <PatientMedicationsPanel patientId={patient.id} medications={medications} /> : null,
          },
          {
            id: 'owner',
            label: 'Owner Info',
            panel: (
              <section className="profile-card profile-card--wide" aria-labelledby="owner-info-heading">
                <div className="profile-card__header">
                  <p className="eyebrow">Owner / Contact</p>
                  <h2 id="owner-info-heading">Owner Info</h2>
                </div>
                {primaryClient ? (
                  <>
                    <dl className="profile-info-list profile-info-list--owner">
                      {ownerContactDetails.map((item) => (
                        <div key={item.label}>
                          <dt>{item.label}</dt>
                          <dd>{item.value}</dd>
                        </div>
                      ))}
                    </dl>
                    {ownerStructuredDetails.length > 0 && (
                      <>
                        <hr className="profile-section-divider" />
                        <div className="profile-card__header profile-card__header--subtle">
                          <p className="eyebrow">Structured address</p>
                          <h3>Address Details</h3>
                        </div>
                        <dl className="profile-info-list profile-info-list--owner">
                          {ownerStructuredDetails.map((item) => (
                            <div key={item.label}>
                              <dt>{item.label}</dt>
                              <dd>{item.value}</dd>
                            </div>
                          ))}
                        </dl>
                      </>
                    )}
                  </>
                ) : (
                  <p className="empty-state">No owner is linked to this patient.</p>
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
            ),
          },
        ]}
      />
    </main>
  );
}
