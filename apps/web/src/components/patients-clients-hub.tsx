'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { DashboardCard, DashboardShell } from './dashboard-shell';
import { appointmentHref, clientLabel } from './command-center/card-helpers';
import { EmptyQueue } from './command-center/empty-states';
import { PetPhotoPlaceholder } from './pet-photo-placeholder';
import { PatientSearch } from './patient-search';
import { appointmentTypeLabel, type DashboardAppointmentSummary, type DashboardVisitSummary } from '../lib/patient-types';
import { useOperationsDashboard } from '../lib/use-operations-dashboard';

const SHOW_DEV_FALLBACK_ROWS = process.env.NODE_ENV !== 'production';

interface PatientWorkspaceRow {
  id: string;
  patientName: string;
  species?: string | undefined;
  clientName: string;
  status?: string | undefined;
  location?: string | undefined;
  timeLabel?: string | undefined;
  typeLabel?: string | undefined;
  href: string;
}

const DEV_ACTIVE_PATIENTS: PatientWorkspaceRow[] = [
  {
    id: 'dev-active-bella',
    patientName: 'Bella',
    species: 'Dog',
    clientName: 'Sarah Johnson',
    status: 'Arrived',
    location: 'Lobby',
    href: '/patients',
  },
  {
    id: 'dev-active-luna',
    patientName: 'Luna',
    species: 'Cat',
    clientName: 'Emily Davis',
    status: 'In Room',
    location: 'Exam Room 3',
    href: '/patients',
  },
];

const DEV_UPCOMING_PATIENTS: PatientWorkspaceRow[] = [
  {
    id: 'dev-upcoming-max',
    patientName: 'Max',
    species: 'Dog',
    clientName: 'Michael Lee',
    timeLabel: 'Today, 2:30 PM',
    typeLabel: 'Wellness',
    href: '/patients',
  },
  {
    id: 'dev-upcoming-milo',
    patientName: 'Milo',
    species: 'Cat',
    clientName: 'Priya Patel',
    timeLabel: 'Tomorrow, 9:15 AM',
    typeLabel: 'Vaccines',
    href: '/patients',
  },
];

function formatAppointmentTime(value: string) {
  return new Date(value).toLocaleString([], {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function visitLocation(visit: DashboardVisitSummary) {
  if (visit.state.includes('Checkout')) return 'Checkout';
  if (visit.state.includes('Treatment') || visit.state.includes('Medication')) return 'Treatment';
  if (visit.state.includes('Exam') || visit.state.includes('Diagnostics')) return 'Exam Room';
  if (visit.state.includes('Intake')) return 'Intake';
  return 'Lobby';
}

function calmStatus(state: string) {
  if (state === 'CheckoutReady') return 'Ready for Checkout';
  if (state === 'Arrived') return 'Arrived';
  if (state === 'InRoom') return 'In Room';
  if (state.includes('Treatment')) return 'Treatment';
  if (state.includes('Technician')) return 'With Technician';
  if (state.includes('Exam')) return 'With Doctor';
  if (state === 'Completed') return 'Complete';
  if (state === 'Cancelled') return 'Cancelled';
  return 'Scheduled';
}

function activeVisitToRow(visit: DashboardVisitSummary): PatientWorkspaceRow {
  return {
    id: visit.id,
    patientName: visit.patient.name,
    species: visit.patient.species,
    clientName: clientLabel(visit.client),
    status: calmStatus(visit.state),
    location: visitLocation(visit),
    href: `/patients/${visit.patient.id}`,
  };
}

function appointmentToRow(appointment: DashboardAppointmentSummary): PatientWorkspaceRow {
  return {
    id: appointment.id,
    patientName: appointment.patient?.name ?? 'Unlinked patient',
    species: appointment.patient?.species,
    clientName: clientLabel(appointment.client),
    timeLabel: formatAppointmentTime(appointment.scheduledAt),
    typeLabel: appointmentTypeLabel(appointment.type),
    href: appointmentHref(appointment) ?? '/patients',
  };
}

function PatientClientResultCard({
  row,
  mode,
}: {
  row: PatientWorkspaceRow;
  mode: 'active' | 'upcoming';
}) {
  return (
    <div className="patients-hub-row">
      <div className="patient-client-cell">
        <PetPhotoPlaceholder
          name={row.patientName}
          species={row.species}
          className="pet-photo-placeholder patient-avatar"
        />
        <span className="patient-client-cell__text">
          <strong>{row.patientName}</strong>
          <span>{row.clientName}</span>
        </span>
      </div>
      <div className="patients-hub-row__meta">
        {mode === 'active' ? (
          <>
            <span>{row.status ?? 'Active'}</span>
            <strong>{row.location ?? 'Clinic'}</strong>
          </>
        ) : (
          <>
            <span>{row.timeLabel ?? 'Scheduled'}</span>
            <strong>{row.typeLabel ?? 'Appointment'}</strong>
          </>
        )}
      </div>
      <Link href={row.href} className="home-widget__link">
        Open Profile
      </Link>
    </div>
  );
}

function RecentlyActivePatients({ rows }: { rows: PatientWorkspaceRow[] }) {
  return (
    <DashboardCard aria-labelledby="recently-active-heading">
      <div className="home-widget__header">
        <div>
          <p className="eyebrow">Resume work</p>
          <h2 id="recently-active-heading">Recently Active Patients</h2>
        </div>
      </div>
      <div className="patients-hub-list">
        {rows.length > 0 ? (
          rows.map((row) => <PatientClientResultCard key={row.id} row={row} mode="active" />)
        ) : (
          <EmptyQueue label="No active patient work right now." />
        )}
      </div>
    </DashboardCard>
  );
}

function UpcomingPatients({ rows }: { rows: PatientWorkspaceRow[] }) {
  return (
    <DashboardCard aria-labelledby="upcoming-patients-heading">
      <div className="home-widget__header">
        <div>
          <p className="eyebrow">Prepare</p>
          <h2 id="upcoming-patients-heading">Upcoming / Scheduled Patients</h2>
        </div>
      </div>
      <div className="patients-hub-list">
        {rows.length > 0 ? (
          rows.map((row) => <PatientClientResultCard key={row.id} row={row} mode="upcoming" />)
        ) : (
          <EmptyQueue label="No upcoming patients to prep." />
        )}
      </div>
    </DashboardCard>
  );
}

function PatientHubQuickActions() {
  const actions = [
    { href: '/patients/new', label: 'New Patient', tone: 'teal' },
    { href: '/patients/new', label: 'New Client', tone: 'blue' },
    { href: '/scheduler', label: 'Set Appointment', tone: 'purple' },
    { href: '/patients/new', label: 'New Intake', tone: 'orange' },
  ] as const;

  return (
    <DashboardCard aria-labelledby="patient-hub-actions-heading">
      <div className="home-widget__header">
        <div>
          <p className="eyebrow">Create</p>
          <h2 id="patient-hub-actions-heading">Quick Actions</h2>
        </div>
      </div>
      <div className="patients-hub-actions">
        {actions.map((action) => (
          <Link key={action.label} href={action.href} data-tone={action.tone}>
            {action.label}
          </Link>
        ))}
      </div>
    </DashboardCard>
  );
}

function PatientSearchCard() {
  return (
    <DashboardCard className="patients-hub-search-card" aria-labelledby="patients-search-heading">
      <div className="home-widget__header">
        <div>
          <p className="eyebrow">Patient lookup</p>
          <h2 id="patients-search-heading">Find Patient Profiles</h2>
        </div>
      </div>
      <PatientSearch placeholder="Search by pet name, client name, phone, or email..." />
    </DashboardCard>
  );
}

export function PatientsClientsHub() {
  const { groups } = useOperationsDashboard();

  const activeRows = useMemo(() => {
    const realRows = [
      ...groups.waitingVisits,
      ...groups.examReadyVisits,
      ...groups.inProgressVisits,
      ...groups.checkoutVisits,
    ]
      .slice(0, 5)
      .map(activeVisitToRow);

    return realRows.length > 0 ? realRows : SHOW_DEV_FALLBACK_ROWS ? DEV_ACTIVE_PATIENTS : [];
  }, [groups]);

  const upcomingRows = useMemo(() => {
    const realRows = groups.upcomingAppointments.slice(0, 5).map(appointmentToRow);
    return realRows.length > 0 ? realRows : SHOW_DEV_FALLBACK_ROWS ? DEV_UPCOMING_PATIENTS : [];
  }, [groups.upcomingAppointments]);

  return (
    <DashboardShell
      activeHref="/patients"
      eyebrow="Patients / Clients"
      title="Patients / Clients"
      subtitle="Find patient profiles, manage client relationships, and resume clinic work."
    >
      <div className="patients-hub-grid">
        <PatientSearchCard />
        <PatientHubQuickActions />
        <RecentlyActivePatients rows={activeRows} />
        <UpcomingPatients rows={upcomingRows} />
      </div>
    </DashboardShell>
  );
}
