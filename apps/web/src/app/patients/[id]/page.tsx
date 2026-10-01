import { PatientPrescriptionsPanel } from '../../../components/patient-prescriptions-panel';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
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
import { PatientInvoicePanel } from '../../../components/patient-invoice-panel';
import { env } from '../../../lib/env';
import { authenticatedServerFetch } from '../../../lib/server-api';
import { formatAge, visitStateLabel } from '../../../lib/format';
import {
  appointmentTypeLabel,
  clientDisplayName,
  formatClientAddress,
  type PatientWorkspace,
  type RecentVisitSummary,
} from '../../../lib/patient-types';

async function getWorkspace(id: string): Promise<PatientWorkspace | null> {
  const response = await authenticatedServerFetch(
    new URL(`/patients/${id}/workspace`, env.API_URL),
  );
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

  const { patient, clients, upcomingAppointments, patientAttachments, recentVisits, sections } = workspace;
  const primaryClient = clients.find((client) => client.isPrimary);
  const currentVisit = sections.currentVisit.status === 'available' ? sections.currentVisit.visit : null;
  const medications = sections.medications.status === 'available' ? sections.medications : null;
  const nextAppointment = upcomingAppointments[0] ?? null;
  const headerAlert = patient.patientAlerts[0]?.message ?? patient.alerts;
  const alertCount = patient.patientAlerts.length + (patient.patientAlerts.length === 0 && patient.alerts ? 1 : 0);
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
            <span className={`patient-status patient-status--${patient.status.toLowerCase()}${patient.status === 'ACTIVE' ? ' patient-status--subtle' : ''}`}>
              {patient.status}
            </span>
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

      <PatientProfileTabs
        tabs={[
          {
            id: 'overview',
            label: 'Overview',
            panel: (
              <div className="patient-profile-overview">
                <div className="patient-profile-overview__main">
                  {currentVisit ? <section className="profile-card profile-card--accent profile-card--care-flow" aria-labelledby="active-visit-heading">
                    <div className="profile-card__header">
                      <p className="eyebrow">Now</p>
                      <h2 id="active-visit-heading">Current Visit</h2>
                    </div>
                    <div className="profile-care-flow__item profile-care-flow__item--active">
                      <div><strong>{visitStateLabel(currentVisit.state)}</strong><p>{currentVisit.reason}</p><small>{currentVisit.visitType}{currentVisit.primaryVeterinarian ? ` · Dr. ${currentVisit.primaryVeterinarian.firstName} ${currentVisit.primaryVeterinarian.lastName}` : currentVisit.assignedTechnician ? ` · ${currentVisit.assignedTechnician.firstName} ${currentVisit.assignedTechnician.lastName}` : ''}</small></div>
                      <ActiveVisitDetailsButton visit={currentVisit} label="View Visit" />
                    </div>
                  </section> : null}

                  {nextAppointment ? <section className="profile-card" aria-labelledby="next-appointment-heading">
                    <div className="profile-card__header"><p className="eyebrow">Scheduled next</p><h2 id="next-appointment-heading">Next Appointment</h2></div>
                    <div className="profile-care-flow__item"><div><strong>{appointmentTypeLabel(nextAppointment.type)}</strong><p>{nextAppointment.reason}</p><small>{appointmentTime(nextAppointment.scheduledAt)}</small></div></div>
                  </section> : null}

                  {!currentVisit ? <div className="profile-empty-action"><StartWalkInVisitForm patientId={patient.id} compact submitLabel="Start Walk-In" /></div> : null}

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

                </aside>
              </div>
            ),
          },
          {
            id: 'records',
            label: 'Medical History',
            panel: (
              <div className="patient-tab-grid patient-tab-grid--records">
                <section className="profile-card profile-card--wide" aria-labelledby="medical-record-summary-heading">
                  <div className="profile-card__header">
                    <p className="eyebrow">Chronology</p>
                    <h2 id="medical-record-summary-heading">Medical History</h2>
                  </div>
                  {patientAttachments.length ? <div><strong>Patient attachments</strong><ul>{patientAttachments.map((attachment) => <li key={attachment.id}>{attachment.href ? <a href={`/api${attachment.href}`}>{attachment.label || attachment.fileName}</a> : <span>{attachment.label || attachment.fileName}</span>} {attachment.removedAt ? <small>· Removed from active clinical history</small> : <small>· authenticated clinical file</small>}{attachment.auditEvents?.filter((event) => event.action === 'REMOVED_FROM_FINALIZED_HISTORY' || event.action === 'SUPERSEDED').map((event) => <small key={`${event.action}-${event.createdAt}`} className="clinical-attachment-audit"> · {event.action === 'SUPERSEDED' ? 'Corrected/replaced' : 'Audited removal'} by {event.actor?.displayName || [event.actor?.firstName, event.actor?.lastName].filter(Boolean).join(' ') || 'authorized user'} on {new Date(event.createdAt).toLocaleString()}: {event.reason}</small>)}</li>)}</ul></div> : null}
                  {recentVisits.length ? <ol className="profile-visit-history">{recentVisits.map((visit) => <li key={visit.id}><article className="profile-visit-history__row"><span className="profile-visit-history__date">{visitDate(visit.createdAt)}</span><div className="profile-visit-history__reason"><h3><Link href={`/visits/${visit.id}`}>{visit.reason}</Link></h3><p>{visit.intake?.chiefComplaint || visit.intake?.historyNotes}</p>{visit.examFindings?.assessment ? <p><strong>Assessment:</strong> {visit.examFindings.assessment}</p> : null}{visit.careItems?.length ? <ul>{visit.careItems.map((item) => <li key={item.id}>{item.type}: {item.title} — {item.status}</li>)}</ul> : null}{visit.discharge ? <p><strong>Discharge:</strong> {visit.discharge.instructions}</p> : null}{visit.soapNote ? <p><strong>SOAP v{visit.soapNote.version}:</strong> {visit.soapNote.status}{visit.soapNote.amendmentReason ? ` · Amended: ${visit.soapNote.amendmentReason}` : ''}</p> : null}{visit.attachments?.length ? <div><strong>Attachments</strong><ul>{visit.attachments.map((attachment) => <li key={attachment.id}>{attachment.href ? <a href={`/api${attachment.href}`}>{attachment.label || attachment.fileName}</a> : <span>{attachment.label || attachment.fileName}</span>} {attachment.removedAt ? <small>· Removed from active clinical history</small> : <small>· authenticated clinical file</small>}{attachment.auditEvents?.filter((event) => event.action === 'REMOVED_FROM_FINALIZED_HISTORY' || event.action === 'SUPERSEDED').map((event) => <small key={`${event.action}-${event.createdAt}`} className="clinical-attachment-audit"> · {event.action === 'SUPERSEDED' ? 'Corrected/replaced' : 'Audited removal'} by {event.actor?.displayName || [event.actor?.firstName, event.actor?.lastName].filter(Boolean).join(' ') || 'authorized user'} on {new Date(event.createdAt).toLocaleString()}: {event.reason}</small>)}</li>)}</ul></div> : null}<small>{doctorLabel(visit)} · provenance: visit documentation</small></div></article></li>)}</ol> : <p>No clinical history has been recorded.</p>}
                </section>
              </div>
            ),
          },
          {
            id: 'medications',
            label: 'Medications',
            panel: medications ? <><PatientMedicationsPanel patientId={patient.id} medications={medications} />{medications.permissions.canManage ? <PatientPrescriptionsPanel patientId={patient.id} /> : null}</> : null,
          },
          {
            id: 'alerts',
            label: 'Alerts',
            panel: <PatientAlertsPanel patientId={patient.id} alerts={patient.patientAlerts} legacyAlert={patient.alerts} />,
          },
          {
            id: 'invoices',
            label: 'Invoices',
            panel: <PatientInvoicePanel patientId={patient.id} activeVisitId={currentVisit?.id ?? null} />,
          },
        ]}
      />
    </main>
  );
}
