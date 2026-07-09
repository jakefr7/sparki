'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { DashboardCard, DashboardShell } from './dashboard-shell';
import { appointmentHref, clientLabel } from './command-center/card-helpers';
import { EmptyQueue } from './command-center/empty-states';
import { NewAppointmentAction } from './new-appointment-action';
import { PetPhotoPlaceholder } from './pet-photo-placeholder';
import { StatusTransitionMenu } from './status-transition-menu';
import {
  visitToClinicRow,
  type ReceptionStatus,
} from '../lib/dashboard-status';
import {
  appointmentTypeLabel,
  type DashboardAppointmentSummary,
  type DashboardVisitSummary,
} from '../lib/patient-types';
import { useOperationsDashboard } from '../lib/use-operations-dashboard';
import { useDashboardStatusColors, type DashboardStatusKey } from '../lib/use-dashboard-status-colors';

const SHOW_DEV_FALLBACK_ROWS = process.env.NODE_ENV !== 'production';

type TodayFilter = 'all' | 'upcoming' | 'checked-in' | 'in-clinic' | 'checkout' | 'completed';

type TodayStatus =
  | 'Upcoming'
  | 'Checked In'
  | 'In Room'
  | 'With Technician'
  | 'With Doctor'
  | 'Treatment'
  | 'Ready for Checkout'
  | 'Completed'
  | 'Cancelled';

interface TodayAppointmentRow {
  id: string;
  time: string;
  patientName: string;
  species?: string | undefined;
  clientName: string;
  appointmentType: string;
  status: TodayStatus;
  /** Raw AppointmentState (or a dev-fixture stand-in) — feeds the shared
   *  status-transition menu, which needs it to decide whether "Checked In"
   *  is currently reachable (see dashboardStatusAction in lib/dashboard-status). */
  state: string;
  /** 'dev' for SHOW_DEV_FALLBACK_ROWS fixtures, so the status menu shows a
   *  non-persisting demo preview instead of calling a real mutation. */
  kind: 'appointment' | 'dev';
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
    status: 'Upcoming',
    state: 'Scheduled',
    kind: 'dev',
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
    status: 'Checked In',
    state: 'Arrived',
    kind: 'dev',
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
    state: 'VeterinarianExamReady',
    kind: 'dev',
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
    state: 'CheckoutReady',
    kind: 'dev',
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
    status: 'Upcoming',
    state: 'Scheduled',
    kind: 'dev',
    doctor: 'Unassigned',
  },
  {
    id: 'dev-today-daisy',
    time: '12:30 PM',
    patientName: 'Daisy',
    species: 'Dog',
    clientName: 'Jordan Smith',
    appointmentType: 'Follow-up',
    status: 'Upcoming',
    state: 'Scheduled',
    kind: 'dev',
    doctor: 'Dr. Nguyen',
  },
];

function formatTime(value: string) {
  return new Date(value).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

/**
 * Confirmed clinic-facing labels (Anna, Phase 2 cleanup): only
 * 'Arrived'/'VisitCreated', 'Completed', and 'Cancelled' are real
 * AppointmentState values — everything else defaults to "Upcoming". The
 * 'In Room'/'With Technician'/'With Doctor'/'Treatment' statuses reflect a
 * Visit's progress past check-in, which lives on the separate Visit state
 * machine, not on Appointment; they're reachable here only via
 * DEV_TODAY_ROWS fixtures until this cross-references real visit data.
 */
function appointmentStatus(appointment: DashboardAppointmentSummary): TodayStatus {
  if (appointment.state === 'Arrived' || appointment.state === 'VisitCreated') return 'Checked In';
  if (appointment.state === 'Completed') return 'Completed';
  if (appointment.state === 'Cancelled') return 'Cancelled';
  return 'Upcoming';
}

function appointmentLocation(status: TodayStatus) {
  if (status === 'Ready for Checkout') return 'Checkout';
  if (['In Room', 'With Doctor'].includes(status)) return 'Exam Room';
  if (['With Technician', 'Treatment'].includes(status)) return 'Treatment';
  if (status === 'Checked In') return 'Lobby';
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
    state: appointment.state,
    kind: 'appointment',
    location: appointmentLocation(status),
    doctor: appointment.provider?.displayName,
    href: appointmentHref(appointment) ?? undefined,
  };
}

function filterRow(row: TodayAppointmentRow, filter: TodayFilter) {
  if (filter === 'all') return true;
  if (filter === 'upcoming') return row.status === 'Upcoming';
  if (filter === 'checked-in') return row.status === 'Checked In';
  if (filter === 'in-clinic') {
    return ['Checked In', 'In Room', 'With Technician', 'With Doctor', 'Treatment'].includes(row.status);
  }
  if (filter === 'checkout') return row.status === 'Ready for Checkout';
  return row.status === 'Completed';
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

function TodayAppointmentRowView({
  row,
  onStatusChanged,
  statusColors,
}: {
  row: TodayAppointmentRow;
  onStatusChanged?: (() => void) | undefined;
  statusColors?: Partial<Record<DashboardStatusKey, string>> | undefined;
}) {
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
      <StatusTransitionMenu
        row={{
          id: row.id,
          kind: row.kind,
          state: row.state,
          // TodayStatus is a superset of ReceptionStatus (adds Cancelled and a
          // few fixture-only values never produced by real data — see
          // appointmentStatus above). getAdjacentDashboardStatusActions treats
          // any status outside DASHBOARD_STATUS_ORDER as having no adjacent
          // move, which is the correct "no transition" outcome for those.
          status: row.status as ReceptionStatus,
        }}
        onChanged={onStatusChanged}
        statusColors={statusColors}
      />
      <span className="today-appointment-row__meta">{row.location ?? 'Unassigned'}</span>
      <span className="today-appointment-row__meta">{row.doctor ?? 'Unassigned'}</span>
      <RowActionsButton label={`Open actions for ${row.patientName}`} />
    </div>
  );
}

function QuickActionsRail({ onAppointmentCreated }: { onAppointmentCreated?: () => void }) {
  return (
    <DashboardCard aria-labelledby="today-quick-actions-heading">
      <div className="home-widget__header">
        <div>
          <h2 id="today-quick-actions-heading">Quick Actions</h2>
        </div>
      </div>
      <div className="today-quick-actions">
        <NewAppointmentAction onCreated={onAppointmentCreated}>
          New Appointment
        </NewAppointmentAction>
        <Link href="/patients">Find Patient</Link>
        <Link href="/patients/new">New Client</Link>
        <Link href="/patients">New Call</Link>
      </div>
    </DashboardCard>
  );
}

function CurrentlyInClinicSummary({
  visits,
  onStatusChanged,
  statusColors,
}: {
  visits: DashboardVisitSummary[];
  onStatusChanged?: (() => void) | undefined;
  statusColors?: Partial<Record<DashboardStatusKey, string>> | undefined;
}) {
  const rows = visits.slice(0, 4).map(visitToClinicRow);

  return (
    <DashboardCard aria-labelledby="today-clinic-summary-heading">
      <div className="home-widget__header">
        <div>
          <h2 id="today-clinic-summary-heading">Currently in Clinic</h2>
        </div>
      </div>
      <div className="today-summary-list">
        {rows.length > 0 ? (
          rows.map((row) => (
            <div key={row.id}>
              <span className="today-summary-list__info">
                <strong>{row.patientName}</strong>
                <span>{row.clientName}</span>
              </span>
              <StatusTransitionMenu row={row} onChanged={onStatusChanged} statusColors={statusColors} />
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
  const { dashboard, loading, error, groups, refresh } = useOperationsDashboard();
  const { colorMap: statusColors } = useDashboardStatusColors();
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
                filteredRows.map((row) => (
                  <TodayAppointmentRowView
                    key={row.id}
                    row={row}
                    onStatusChanged={refresh}
                    statusColors={statusColors}
                  />
                ))
              ) : (
                <EmptyQueue label="No appointments match this filter." />
              )}
            </div>
          </section>

          <aside className="today-rail" aria-label="Today overview">
            <CurrentlyInClinicSummary visits={activeVisits} onStatusChanged={refresh} statusColors={statusColors} />
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
            <QuickActionsRail onAppointmentCreated={refresh} />
          </aside>
        </div>
      )}
    </DashboardShell>
  );
}
