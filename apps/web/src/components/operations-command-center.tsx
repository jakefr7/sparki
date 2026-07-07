'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import {
  appointmentHref,
  appointmentNextAction,
  clientLabel,
  ownerLabel,
  visitActionLabel,
} from './command-center/card-helpers';
import { EmptyQueue } from './command-center/empty-states';
import { enumLabel } from '../lib/format';
import { useOperationsDashboard } from '../lib/use-operations-dashboard';
import type { DashboardAppointmentSummary, DashboardVisitSummary } from '../lib/patient-types';

const MOCK_ROLE = {
  label: 'Front Desk',
  focus: 'Arrivals, handoffs, and patient flow',
};

const NAV_ITEMS = [
  { href: '/', label: 'My Dashboard' },
  { href: '/today', label: "Today's Schedule" },
  { href: '/scheduler', label: 'Scheduler' },
  { href: '/patients', label: 'Patients / Clients' },
] as const;

function patientHref(patientId?: string | null) {
  return patientId ? `/patients/${patientId}` : '/patients';
}

function formatTime(value: string) {
  return new Date(value).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

type CoreArea = (typeof NAV_ITEMS)[number]['href'];

function HomeNavigation({ activeHref }: { activeHref: CoreArea }) {
  return (
    <nav className="home-nav" aria-label="Primary">
      {NAV_ITEMS.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className={
            item.href === activeHref ? 'home-nav__link home-nav__link--active' : 'home-nav__link'
          }
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}

function DashboardHeader({
  eyebrow,
  title,
  refreshing,
  onRefresh,
}: {
  eyebrow: string;
  title: string;
  refreshing: boolean;
  onRefresh: () => void;
}) {
  return (
    <header className="dashboard-home__header">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        <p className="dashboard-home__subtitle">
          {MOCK_ROLE.label} view · {MOCK_ROLE.focus}
        </p>
      </div>
      <button type="button" className="button-secondary" onClick={onRefresh} disabled={refreshing}>
        {refreshing ? 'Refreshing...' : 'Refresh'}
      </button>
    </header>
  );
}

function QuickActions() {
  return (
    <section className="home-widget home-widget--actions" aria-labelledby="quick-actions-heading">
      <div className="home-widget__header">
        <div>
          <p className="eyebrow">Role-aware</p>
          <h2 id="quick-actions-heading">Quick Actions</h2>
        </div>
      </div>
      <div className="quick-action-grid">
        <Link href="/patients/new" className="quick-action">
          <strong>New Intake</strong>
          <span>Create a patient/client and start today&apos;s visit.</span>
        </Link>
        <Link href="/patients" className="quick-action">
          <strong>Find Patient</strong>
          <span>Open a patient profile or resume active work.</span>
        </Link>
        <Link href="/scheduler" className="quick-action">
          <strong>Set Appointment</strong>
          <span>Place follow-up scheduling work in one place.</span>
        </Link>
      </div>
    </section>
  );
}

function TodaySnapshot({
  dashboard,
}: {
  dashboard: NonNullable<ReturnType<typeof useOperationsDashboard>['dashboard']>;
}) {
  const items = [
    { label: 'Scheduled', value: dashboard.summary.scheduledToday },
    { label: 'Checked in', value: dashboard.summary.arrived },
    { label: 'Active visits', value: dashboard.summary.active },
    { label: 'Checkout ready', value: dashboard.summary.checkoutReady },
  ];

  return (
    <section className="home-widget" aria-labelledby="today-snapshot-heading">
      <div className="home-widget__header">
        <div>
          <p className="eyebrow">Clinic flow</p>
          <h2 id="today-snapshot-heading">Today Snapshot</h2>
        </div>
        <span className="home-widget__meta">Updated {formatTime(dashboard.generatedAt)}</span>
      </div>
      <div className="snapshot-grid">
        {items.map((item) => (
          <div className="snapshot-tile" key={item.label}>
            <strong>{item.value}</strong>
            <span>{item.label}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function ActiveVisitRow({ visit }: { visit: DashboardVisitSummary }) {
  return (
    <Link href={`/visits/${visit.id}`} className="home-list-row">
      <div className="home-list-row__main">
        <strong>{visit.patient.name}</strong>
        <span>
          {enumLabel(visit.state)} · {visit.reason}
        </span>
        <span>{clientLabel(visit.client)} · {ownerLabel(visit.currentOwner)}</span>
      </div>
      <div className="home-list-row__action">
        <span>{visit.elapsedMinutes}m</span>
        <strong>{visitActionLabel(visit)}</strong>
      </div>
    </Link>
  );
}

function AppointmentRow({ appointment }: { appointment: DashboardAppointmentSummary }) {
  const href = appointmentHref(appointment) ?? patientHref(appointment.patient?.id);
  return (
    <Link href={href} className="home-list-row">
      <div className="home-list-row__main">
        <strong>{appointment.patient?.name ?? 'Unlinked patient'}</strong>
        <span>
          {formatTime(appointment.scheduledAt)} · {appointment.reason || enumLabel(appointment.type)}
        </span>
        <span>{clientLabel(appointment.client)} · {ownerLabel(appointment.provider)}</span>
      </div>
      <div className="home-list-row__action">
        <span>{enumLabel(appointment.state)}</span>
        <strong>{appointmentNextAction(appointment)}</strong>
      </div>
    </Link>
  );
}

function CheckedInVisits({ visits }: { visits: DashboardVisitSummary[] }) {
  const displayVisits = visits.slice(0, 5);

  return (
    <section className="home-widget home-widget--wide" aria-labelledby="active-visits-heading">
      <div className="home-widget__header">
        <div>
          <p className="eyebrow">Patient flow</p>
          <h2 id="active-visits-heading">Checked-In / Active Visits</h2>
        </div>
        <Link href="/today" className="home-widget__link">
          View schedule
        </Link>
      </div>
      <div className="home-list">
        {displayVisits.length > 0 ? (
          displayVisits.map((visit) => <ActiveVisitRow key={visit.id} visit={visit} />)
        ) : (
          <EmptyQueue label="No patients are checked in or active right now." />
        )}
      </div>
    </section>
  );
}

function UpcomingAppointments({ appointments }: { appointments: DashboardAppointmentSummary[] }) {
  const displayAppointments = appointments.slice(0, 4);

  return (
    <section className="home-widget" aria-labelledby="upcoming-heading">
      <div className="home-widget__header">
        <div>
          <p className="eyebrow">Next up</p>
          <h2 id="upcoming-heading">Today&apos;s Schedule</h2>
        </div>
      </div>
      <div className="home-list home-list--compact">
        {displayAppointments.length > 0 ? (
          displayAppointments.map((appointment) => (
            <AppointmentRow key={appointment.id} appointment={appointment} />
          ))
        ) : (
          <EmptyQueue label="No upcoming appointments are queued." />
        )}
      </div>
    </section>
  );
}

function InternalNotesPlaceholder() {
  return (
    <section className="home-widget" aria-labelledby="notes-heading">
      <div className="home-widget__header">
        <div>
          <p className="eyebrow">Placeholder</p>
          <h2 id="notes-heading">Tasks / Internal Notes</h2>
        </div>
      </div>
      <div className="notes-placeholder">
        <strong>Team notes will live here.</strong>
        <p>
          This widget is reserved for role-specific tasks and internal handoffs in a follow-up
          phase.
        </p>
      </div>
    </section>
  );
}

export function OperationsCommandCenter({
  activeHref = '/',
  eyebrow = 'My Dashboard',
  title = 'Today at Sparki Clinic',
}: {
  activeHref?: CoreArea;
  eyebrow?: string;
  title?: string;
}) {
  const { dashboard, loading, refreshing, error, groups, refresh } = useOperationsDashboard();

  const activeVisits = useMemo(
    () => [
      ...groups.waitingVisits,
      ...groups.examReadyVisits,
      ...groups.inProgressVisits,
      ...groups.checkoutVisits,
    ],
    [groups],
  );

  return (
    <main className="page page--ops dashboard-home">
      <HomeNavigation activeHref={activeHref} />
      <DashboardHeader eyebrow={eyebrow} title={title} refreshing={refreshing} onRefresh={refresh} />

      {loading && (
        <div className="ops-panel-state ops-panel-state--loading">
          <span className="ops-status-badge__dot" aria-hidden="true" />
          Loading dashboard...
        </div>
      )}

      {error && (
        <div className="ops-panel-state ops-panel-state--error" role="alert">
          <strong>Dashboard could not load.</strong>
          <span>{error}</span>
        </div>
      )}

      {!loading && !error && dashboard && (
        <div className="dashboard-widget-grid">
          <QuickActions />
          <TodaySnapshot dashboard={dashboard} />
          <CheckedInVisits visits={activeVisits} />
          <UpcomingAppointments appointments={groups.upcomingAppointments} />
          <InternalNotesPlaceholder />
        </div>
      )}
    </main>
  );
}
