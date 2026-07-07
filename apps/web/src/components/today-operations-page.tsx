'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { DashboardCard, DashboardShell } from './dashboard-shell';
import { appointmentHref, clientLabel } from './command-center/card-helpers';
import { EmptyQueue } from './command-center/empty-states';
import { PetPhotoPlaceholder } from './pet-photo-placeholder';
import {
  appointmentTypeLabel,
  type DashboardAppointmentSummary,
  type DashboardVisitSummary,
} from '../lib/patient-types';
import { useOperationsDashboard } from '../lib/use-operations-dashboard';

const SHOW_DEV_FALLBACK_ROWS = process.env.NODE_ENV !== 'production';

type TodayFilter = 'all' | 'upcoming' | 'checked-in' | 'in-clinic' | 'checkout' | 'completed';

type TodayStatus =
  | 'Scheduled'
  | 'Arrived'
  | 'Checked In'
  | 'In Room'
  | 'With Technician'
  | 'With Doctor'
  | 'Treatment'
  | 'Ready for Checkout'
  | 'Complete'
  | 'Cancelled';

interface TodayAppointmentRow {
  id: string;
  time: string;
  patientName: string;
  species?: string | undefined;
  clientName: string;
  appointmentType: string;
  status: TodayStatus;
  location?: string | undefined;
  doctor?: string | undefined;
  href?: string | undefined;
}

const FILTERS: Array<{ value: TodayFilter; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'upcoming', label: 'Upcoming' },
  { value: 'checked-in', label: 'Checked In' },
  { value: 'in-clinic', label: 'In Clinic' },
  { value: 'checkout', label: 'Ready for Checkout' },
  { value: 'completed', label: 'Completed' },
];

const DEV_TODAY_ROWS: TodayAppointmentRow[] = [
  {
    id: 'dev-today-bella',
    time: '9:00 AM',
    patientName: 'Bella',
    species: 'Dog',
    clientName: 'Sarah Johnson',
    appointmentType: 'Wellness',
    status: 'Scheduled',
    location: 'Lobby',
    doctor: 'Dr. Patel',
  },
  {
    id: 'dev-today-max',
    time: '9:30 AM',
    patientName: 'Max',
    species: 'Dog',
    clientName: 'Michael Lee',
    appointmentType: 'Exam',
    status: 'Arrived',
    location: 'Exam Room 2',
    doctor: 'Dr. Nguyen',
  },
  {
    id: 'dev-today-luna',
    time: '10:15 AM',
    patientName: 'Luna',
    species: 'Cat',
    clientName: 'Emily Davis',
    appointmentType: 'Recheck',
    status: 'In Room',
    location: 'Exam Room 3',
    doctor: 'Dr. Patel',
  },
  {
    id: 'dev-today-cooper',
    time: '11:00 AM',
    patientName: 'Cooper',
    species: 'Dog',
    clientName: 'David Wilson',
    appointmentType: 'Dental',
    status: 'Ready for Checkout',
    location: 'Checkout',
    doctor: 'Dr. Ramos',
  },
  {
    id: 'dev-today-milo',
    time: '11:45 AM',
    patientName: 'Milo',
    species: 'Cat',
    clientName: 'Priya Patel',
    appointmentType: 'Vaccines',
    status: 'Scheduled',
    doctor: 'Unassigned',
  },
  {
    id: 'dev-today-daisy',
    time: '12:30 PM',
    patientName: 'Daisy',
    species: 'Dog',
    clientName: 'Jordan Smith',
    appointmentType: 'Follow-up',
    status: 'Scheduled',
    doctor: 'Dr. Nguyen',
  },
];

function formatTime(value: string) {
  return new Date(value).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function statusTone(status: TodayStatus) {
  if (['In Room', 'With Doctor', 'Checked In'].includes(status)) return 'blue';
  if (['With Technician', 'Treatment'].includes(status)) return 'purple';
  if (status === 'Ready for Checkout') return 'orange';
  if (['Complete', 'Cancelled'].includes(status)) return 'gray';
  return 'teal';
}

function appointmentStatus(appointment: DashboardAppointmentSummary): TodayStatus {
  if (appointment.state === 'Arrived') return 'Arrived';
  if (appointment.state === 'CheckedIn') return 'Checked In';
  if (appointment.state === 'InRoom') return 'In Room';
  if (appointment.state === 'WithTechnician') return 'With Technician';
  if (appointment.state === 'WithDoctor') return 'With Doctor';
  if (appointment.state === 'Treatment') return 'Treatment';
  if (appointment.state === 'CheckoutReady') return 'Ready for Checkout';
  if (appointment.state === 'Completed') return 'Complete';
  if (appointment.state === 'Cancelled') return 'Cancelled';
  return 'Scheduled';
}

function appointmentLocation(status: TodayStatus) {
  if (status === 'Ready for Checkout') return 'Checkout';
  if (['In Room', 'With Doctor'].includes(status)) return 'Exam Room';
  if (['With Technician', 'Treatment'].includes(status)) return 'Treatment';
  if (['Arrived', 'Checked In'].includes(status)) return 'Lobby';
  return undefined;
}

function appointmentToRow(appointment: DashboardAppointmentSummary): TodayAppointmentRow {
  const status = appointmentStatus(appointment);
  return {
    id: appointment.id,
    time: formatTime(appointment.scheduledAt),
    patientName: appointment.patient?.name ?? 'Unlinked patient',
    species: appointment.patient?.species,
    clientName: clientLabel(appointment.client),
    appointmentType: appointmentTypeLabel(appointment.type),
    status,
    location: appointmentLocation(status),
    doctor: appointment.provider?.displayName,
    href: appointmentHref(appointment) ?? undefined,
  };
}

function filterRow(row: TodayAppointmentRow, filter: TodayFilter) {
  if (filter === 'all') return true;
  if (filter === 'upcoming') return row.status === 'Scheduled';
  if (filter === 'checked-in') return row.status === 'Arrived' || row.status === 'Checked In';
  if (filter === 'in-clinic') {
    return ['Arrived', 'Checked In', 'In Room', 'With Technician', 'With Doctor', 'Treatment'].includes(
      row.status,
    );
  }
  if (filter === 'checkout') return row.status === 'Ready for Checkout';
  return row.status === 'Complete';
}

function PatientStatusChip({ status }: { status: TodayStatus }) {
  return (
    <span className="reception-status-chip" data-tone={statusTone(status)}>
      {status}
    </span>
  );
}

function RowActionsButton({ label }: { label: string }) {
  return (
    <button type="button" className="row-actions-button" aria-label={label}>
      <span aria-hidden="true">...</span>
    </button>
  );
}

function PetClientCell({
  patientName,
  species,
  clientName,
  href,
}: {
  patientName: string;
  species?: string | undefined;
  clientName: string;
  href?: string | undefined;
}) {
  const content = (
    <>
      <PetPhotoPlaceholder
        name={patientName}
        species={species}
        className="pet-photo-placeholder patient-avatar"
      />
      <span className="patient-client-cell__text">
        <strong>{patientName}</strong>
        <span>{clientName}</span>
      </span>
    </>
  );

  return href ? (
    <Link href={href} className="patient-client-cell">
      {content}
    </Link>
  ) : (
    <div className="patient-client-cell">{content}</div>
  );
}

function TodayAppointmentRowView({ row }: { row: TodayAppointmentRow }) {
  return (
    <div className="today-appointment-row">
      <span className="schedule-row__time">{row.time}</span>
      <PetClientCell
        patientName={row.patientName}
        species={row.species}
        clientName={row.clientName}
        href={row.href}
      />
      <span className="today-appointment-row__type">{row.appointmentType}</span>
      <PatientStatusChip status={row.status} />
      <span className="today-appointment-row__meta">{row.location ?? 'Unassigned'}</span>
      <span className="today-appointment-row__meta">{row.doctor ?? 'Unassigned'}</span>
      <RowActionsButton label={`Open actions for ${row.patientName}`} />
    </div>
  );
}

function QuickActionsRail() {
  return (
    <DashboardCard aria-labelledby="today-quick-actions-heading">
      <div className="home-widget__header">
        <div>
          <h2 id="today-quick-actions-heading">Quick Actions</h2>
        </div>
      </div>
      <div className="today-quick-actions">
        <Link href="/scheduler">New Appointment</Link>
        <Link href="/patients">Find Patient</Link>
        <Link href="/patients/new">New Client</Link>
        <Link href="/patients">New Call</Link>
      </div>
    </DashboardCard>
  );
}

function CurrentlyInClinicSummary({ visits }: { visits: DashboardVisitSummary[] }) {
  return (
    <DashboardCard aria-labelledby="today-clinic-summary-heading">
      <div className="home-widget__header">
        <div>
          <h2 id="today-clinic-summary-heading">Currently in Clinic</h2>
        </div>
      </div>
      <div className="today-summary-list">
        {visits.length > 0 ? (
          visits.slice(0, 4).map((visit) => (
            <div key={visit.id}>
              <strong>{visit.patient.name}</strong>
              <span>{clientLabel(visit.client)}</span>
            </div>
          ))
        ) : (
          <EmptyQueue label="No patients are currently in clinic." />
        )}
      </div>
    </DashboardCard>
  );
}

export function TodayOperationsPage() {
  const { dashboard, loading, error, groups } = useOperationsDashboard();
  const [activeFilter, setActiveFilter] = useState<TodayFilter>('all');

  const activeVisits = useMemo(
    () => [
      ...groups.waitingVisits,
      ...groups.examReadyVisits,
      ...groups.inProgressVisits,
      ...groups.checkoutVisits,
    ],
    [groups],
  );

  const displayRows = useMemo(() => {
    const realRows = dashboard?.todaysAppointments.map(appointmentToRow) ?? [];
    return realRows.length > 0 ? realRows : SHOW_DEV_FALLBACK_ROWS ? DEV_TODAY_ROWS : [];
  }, [dashboard]);

  const filteredRows = displayRows.filter((row) => filterRow(row, activeFilter));

  return (
    <DashboardShell
      activeHref="/today"
      eyebrow="Today"
      title="Today's Schedule"
      subtitle="Appointments, arrivals, rooms, and checkout flow for today."
      userName="Anna"
      roleLabel="Receptionist"
    >
      {loading && (
        <div className="ops-panel-state ops-panel-state--loading">
          <span className="ops-status-badge__dot" aria-hidden="true" />
          Loading today...
        </div>
      )}

      {error && (
        <div className="ops-panel-state ops-panel-state--error" role="alert">
          <strong>Today could not load.</strong>
          <span>{error}</span>
        </div>
      )}

      {!loading && !error && dashboard && (
        <div className="today-operations-layout">
          <section className="today-main-card" aria-labelledby="today-appointments-heading">
            <div className="home-widget__header">
              <div>
                <p className="eyebrow">Appointments</p>
                <h2 id="today-appointments-heading">Today&apos;s Schedule</h2>
              </div>
              <span className="dashboard-live-status">Live · Updated {formatTime(dashboard.generatedAt)}</span>
            </div>
            <div className="today-filter-bar" aria-label="Today filters">
              {FILTERS.map((filter) => (
                <button
                  key={filter.value}
                  type="button"
                  className={filter.value === activeFilter ? 'today-filter today-filter--active' : 'today-filter'}
                  onClick={() => setActiveFilter(filter.value)}
                >
                  {filter.label}
                </button>
              ))}
            </div>
            <div className="today-appointment-list">
              {filteredRows.length > 0 ? (
                filteredRows.map((row) => <TodayAppointmentRowView key={row.id} row={row} />)
              ) : (
                <EmptyQueue label="No appointments match this filter." />
              )}
            </div>
          </section>

          <aside className="today-rail" aria-label="Today overview">
            <CurrentlyInClinicSummary visits={activeVisits} />
            <DashboardCard aria-labelledby="today-overview-heading">
              <div className="home-widget__header">
                <div>
                  <h2 id="today-overview-heading">Today Overview</h2>
                </div>
              </div>
              <div className="snapshot-grid snapshot-grid--rail">
                <div className="snapshot-tile">
                  <strong>{dashboard.summary.scheduledToday}</strong>
                  <span>Scheduled</span>
                </div>
                <div className="snapshot-tile">
                  <strong>{dashboard.summary.arrived}</strong>
                  <span>Checked in</span>
                </div>
                <div className="snapshot-tile">
                  <strong>{dashboard.summary.active}</strong>
                  <span>Active visits</span>
                </div>
                <div className="snapshot-tile">
                  <strong>{dashboard.summary.checkoutReady}</strong>
                  <span>Checkout ready</span>
                </div>
              </div>
            </DashboardCard>
            <QuickActionsRail />
          </aside>
        </div>
      )}
    </DashboardShell>
  );
}
