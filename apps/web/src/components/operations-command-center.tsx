'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { DashboardCard, DashboardShell, type DashboardRoute } from './dashboard-shell';
import { appointmentHref, clientLabel } from './command-center/card-helpers';
import { EmptyQueue } from './command-center/empty-states';
import { PetPhotoPlaceholder } from './pet-photo-placeholder';
import {
  DASHBOARD_ROLE_CHANGE_EVENT,
  DASHBOARD_ROLE_LABELS,
  DASHBOARD_ROLE_STORAGE_KEY,
  DEFAULT_DASHBOARD_ROLE,
  isDashboardRole,
  type DashboardRole,
} from '../lib/dashboard-role';
import { useOperationsDashboard } from '../lib/use-operations-dashboard';
import { useCurrentUser } from '../lib/use-current-user';
import type { DashboardAppointmentSummary, DashboardVisitSummary } from '../lib/patient-types';

const ROLE_SUBTITLES: Record<DashboardRole, string> = {
  receptionist: "Here's what's happening at Sparki Clinic today.",
  technician: "Here's what needs clinical attention at Sparki Clinic today.",
  veterinarian: "Here's what needs medical review at Sparki Clinic today.",
};

const SHOW_DEV_FALLBACK_ROWS = process.env.NODE_ENV !== 'production';
const ENABLE_DEV_ROLE_PREVIEW = process.env.NODE_ENV !== 'production';

type ReceptionStatus =
  | 'Arrived'
  | 'In Room'
  | 'With Technician'
  | 'Ready for Checkout'
  | 'Scheduled';

interface ClinicDisplayRow {
  id: string;
  patientName: string;
  species?: string | undefined;
  clientName: string;
  location: string;
  status: ReceptionStatus;
  href?: string;
}

interface ScheduleDisplayRow {
  id: string;
  time: string;
  patientName: string;
  species?: string | undefined;
  clientName: string;
  status: ReceptionStatus;
  location?: string;
  href?: string;
}

const DEV_CLINIC_ROWS: ClinicDisplayRow[] = [
  {
    id: 'dev-clinic-bella',
    patientName: 'Bella',
    species: 'Dog',
    clientName: 'Sarah Johnson',
    location: 'Lobby',
    status: 'Arrived',
  },
  {
    id: 'dev-clinic-max',
    patientName: 'Max',
    species: 'Dog',
    clientName: 'Michael Lee',
    location: 'Exam Room 2',
    status: 'In Room',
  },
  {
    id: 'dev-clinic-luna',
    patientName: 'Luna',
    species: 'Cat',
    clientName: 'Emily Davis',
    location: 'Treatment',
    status: 'With Technician',
  },
  {
    id: 'dev-clinic-cooper',
    patientName: 'Cooper',
    species: 'Dog',
    clientName: 'David Wilson',
    location: 'Checkout',
    status: 'Ready for Checkout',
  },
];

const DEV_SCHEDULE_ROWS: ScheduleDisplayRow[] = [
  {
    id: 'dev-schedule-bella',
    time: '9:00 AM',
    patientName: 'Bella',
    species: 'Dog',
    clientName: 'Sarah Johnson',
    status: 'Scheduled',
    location: 'Lobby',
  },
  {
    id: 'dev-schedule-max',
    time: '9:30 AM',
    patientName: 'Max',
    species: 'Dog',
    clientName: 'Michael Lee',
    status: 'Arrived',
    location: 'Exam Room 2',
  },
  {
    id: 'dev-schedule-luna',
    time: '10:15 AM',
    patientName: 'Luna',
    species: 'Cat',
    clientName: 'Emily Davis',
    status: 'In Room',
    location: 'Exam Room 3',
  },
  {
    id: 'dev-schedule-cooper',
    time: '11:00 AM',
    patientName: 'Cooper',
    species: 'Dog',
    clientName: 'David Wilson',
    status: 'Ready for Checkout',
    location: 'Checkout',
  },
  {
    id: 'dev-schedule-milo',
    time: '11:45 AM',
    patientName: 'Milo',
    species: 'Cat',
    clientName: 'Priya Patel',
    status: 'Scheduled',
  },
  {
    id: 'dev-schedule-daisy',
    time: '12:30 PM',
    patientName: 'Daisy',
    species: 'Dog',
    clientName: 'Jordan Smith',
    status: 'Scheduled',
  },
];

function greetingForDate(date: Date, name?: string | null) {
  const hour = date.getHours();
  const daypart = hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening';
  return name ? `Good ${daypart}, ${name}! 👋` : `Good ${daypart}! 👋`;
}

function patientHref(patientId?: string | null) {
  return patientId ? `/patients/${patientId}` : '/patients';
}

function formatTime(value: string) {
  return new Date(value).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function visitLocation(visit: DashboardVisitSummary) {
  if (
    ['CheckoutReady', 'CheckoutInProgress', 'PaymentPending', 'PaymentComplete'].includes(
      visit.state,
    )
  ) {
    return 'Checkout';
  }

  if (
    [
      'VeterinarianExamReady',
      'VeterinarianExamInProgress',
      'PlanDrafted',
      'EstimateNeeded',
      'EstimatePrepared',
      'ClientApprovalPending',
      'Approved',
      'PartiallyApproved',
      'Declined',
      'DiagnosticsPending',
      'DiagnosticsInProgress',
      'ResultsPending',
      'ResultsReady',
      'VeterinarianReviewPending',
    ].includes(visit.state)
  ) {
    return 'Exam Room';
  }

  if (
    [
      'TreatmentPending',
      'TreatmentInProgress',
      'TreatmentComplete',
      'MedicationPending',
      'ClientCommunicationPending',
      'FollowUpPending',
    ].includes(visit.state)
  ) {
    return 'Treatment';
  }

  if (visit.state === 'IntakeInProgress') {
    return 'Intake';
  }

  return 'Lobby';
}

function visitReceptionStatus(visit: DashboardVisitSummary) {
  if (
    ['CheckoutReady', 'CheckoutInProgress', 'PaymentPending', 'PaymentComplete'].includes(
      visit.state,
    )
  ) {
    return 'Ready for Checkout';
  }
  if (
    [
      'VeterinarianExamReady',
      'VeterinarianExamInProgress',
      'PlanDrafted',
      'EstimateNeeded',
      'EstimatePrepared',
      'ClientApprovalPending',
      'Approved',
      'PartiallyApproved',
      'Declined',
      'DiagnosticsPending',
      'DiagnosticsInProgress',
      'ResultsPending',
      'ResultsReady',
      'VeterinarianReviewPending',
    ].includes(visit.state)
  ) {
    return 'In Room';
  }
  if (
    [
      'TreatmentPending',
      'TreatmentInProgress',
      'TreatmentComplete',
      'MedicationPending',
      'ClientCommunicationPending',
      'FollowUpPending',
    ].includes(visit.state)
  ) {
    return 'With Technician';
  }
  return 'Arrived';
}

function statusTone(status: ReceptionStatus) {
  if (status === 'In Room') return 'blue';
  if (status === 'With Technician') return 'purple';
  if (status === 'Ready for Checkout') return 'orange';
  if (status === 'Scheduled') return 'gray';
  return 'teal';
}

function appointmentReceptionStatus(appointment: DashboardAppointmentSummary): ReceptionStatus {
  if (appointment.state === 'Arrived') return 'Arrived';
  if (appointment.state === 'InRoom') return 'In Room';
  if (appointment.state === 'CheckoutReady') return 'Ready for Checkout';
  return 'Scheduled';
}

function visitToClinicRow(visit: DashboardVisitSummary): ClinicDisplayRow {
  return {
    id: visit.id,
    patientName: visit.patient.name,
    species: visit.patient.species,
    clientName: clientLabel(visit.client),
    location: visitLocation(visit),
    status: visitReceptionStatus(visit),
    href: `/visits/${visit.id}`,
  };
}

function appointmentToScheduleRow(appointment: DashboardAppointmentSummary): ScheduleDisplayRow {
  const href = appointmentHref(appointment) ?? patientHref(appointment.patient?.id);
  return {
    id: appointment.id,
    time: formatTime(appointment.scheduledAt),
    patientName: appointment.patient?.name ?? 'Unlinked patient',
    species: appointment.patient?.species,
    clientName: clientLabel(appointment.client),
    status: appointmentReceptionStatus(appointment),
    href,
  };
}

function StatusChip({ status }: { status: ReceptionStatus }) {
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

function PatientClientCell({
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

  if (href) {
    return (
      <Link href={href} className="patient-client-cell">
        {content}
      </Link>
    );
  }

  return <div className="patient-client-cell">{content}</div>;
}

function QuickActionsWidget() {
  const actions = [
    {
      href: '/scheduler',
      label: 'New Appointment',
      description: 'Schedule a visit.',
      tone: 'teal',
    },
    {
      href: '/patients',
      label: 'Find Patient',
      description: 'Open a profile.',
      tone: 'purple',
    },
    {
      href: '/patients/new',
      label: 'New Client',
      description: 'Start intake.',
      tone: 'blue',
    },
    {
      href: '/patients',
      label: 'New Call',
      description: 'Look up caller.',
      tone: 'orange',
    },
  ] as const;

  return (
    <DashboardCard className="home-widget--actions" aria-labelledby="quick-actions-heading">
      <div className="home-widget__header">
        <div>
          <p className="eyebrow">Role-aware</p>
          <h2 id="quick-actions-heading">Quick Actions</h2>
        </div>
      </div>
      <div className="quick-action-grid">
        {actions.map((action) => (
          <Link
            key={action.label}
            href={action.href}
            className="quick-action"
            data-tone={action.tone}
          >
            <strong>{action.label}</strong>
            <span>{action.description}</span>
          </Link>
        ))}
      </div>
    </DashboardCard>
  );
}

function TodaySnapshotWidget({
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
    <DashboardCard aria-labelledby="today-snapshot-heading">
      <div className="home-widget__header">
        <div>
          <p className="eyebrow">Clinic flow</p>
          <h2 id="today-snapshot-heading">Today Snapshot</h2>
        </div>
        <span className="dashboard-live-status">Live · Updated {formatTime(dashboard.generatedAt)}</span>
      </div>
      <div className="snapshot-grid">
        {items.map((item) => (
          <div className="snapshot-tile" key={item.label}>
            <strong>{item.value}</strong>
            <span>{item.label}</span>
          </div>
        ))}
      </div>
    </DashboardCard>
  );
}

function ClinicVisitRow({ row }: { row: ClinicDisplayRow }) {
  return (
    <div className="clinic-table__row">
      <PatientClientCell
        patientName={row.patientName}
        species={row.species}
        clientName={row.clientName}
        href={row.href}
      />
      <span className="clinic-table__location">{row.location}</span>
      <StatusChip status={row.status} />
      <RowActionsButton label={`Open actions for ${row.patientName}`} />
    </div>
  );
}

function AppointmentRow({ row }: { row: ScheduleDisplayRow }) {
  return (
    <div className="schedule-row">
      <span className="schedule-row__time">{row.time}</span>
      <PatientClientCell
        patientName={row.patientName}
        species={row.species}
        clientName={row.clientName}
        href={row.href}
      />
      <StatusChip status={row.status} />
      <span className="schedule-row__location">{row.location ?? 'Unassigned'}</span>
      <div className="schedule-row__actions">
        <RowActionsButton label={`Open actions for ${row.patientName}`} />
      </div>
    </div>
  );
}

function CurrentlyInClinicWidget({ visits }: { visits: DashboardVisitSummary[] }) {
  const realRows = visits.map(visitToClinicRow);
  const displayRows = realRows.length > 0 ? realRows : SHOW_DEV_FALLBACK_ROWS ? DEV_CLINIC_ROWS : [];
  const hasVisits = displayRows.length > 0;

  return (
    <DashboardCard
      className={hasVisits ? 'dashboard-widget--primary' : undefined}
      aria-labelledby="active-visits-heading"
    >
      <div className="home-widget__header">
        <div>
          <p className="eyebrow">Patient flow</p>
          <h2 id="active-visits-heading">Currently in Clinic</h2>
        </div>
        <Link href="/today" className="home-widget__link">
          View schedule
        </Link>
      </div>
      <div className="clinic-table" role="table" aria-label="Currently in clinic">
        {hasVisits ? (
          <div className="clinic-table__body">
            {displayRows.map((row) => (
              <ClinicVisitRow key={row.id} row={row} />
            ))}
          </div>
        ) : (
          <EmptyQueue label="No patients are currently in clinic." />
        )}
      </div>
    </DashboardCard>
  );
}

function TodaySchedulePreviewWidget({
  appointments,
}: {
  appointments: DashboardAppointmentSummary[];
}) {
  const realRows = appointments.map(appointmentToScheduleRow);
  const displayRows =
    realRows.length > 0 ? realRows : SHOW_DEV_FALLBACK_ROWS ? DEV_SCHEDULE_ROWS : [];
  const hasOverflow = displayRows.length > 5;
  const hasAppointments = displayRows.length > 0;

  return (
    <DashboardCard
      className={hasAppointments ? 'dashboard-widget--primary' : undefined}
      aria-labelledby="upcoming-heading"
    >
      <div className="home-widget__header">
        <div>
          <p className="eyebrow">Next up</p>
          <h2 id="upcoming-heading">Today&apos;s Schedule</h2>
        </div>
        <Link href="/today" className="home-widget__link home-widget__link--primary">
          View full schedule
        </Link>
      </div>
      <div className={hasOverflow ? 'home-list home-list--scroll' : 'home-list'}>
        {hasAppointments ? (
          displayRows.map((row) => (
            <AppointmentRow key={row.id} row={row} />
          ))
        ) : (
          <EmptyQueue label="No appointments are coming up." />
        )}
      </div>
    </DashboardCard>
  );
}

function TasksNotesWidget() {
  return (
    <DashboardCard aria-labelledby="notes-heading">
      <div className="home-widget__header">
        <div>
          <h2 id="notes-heading">Tasks / Internal Notes</h2>
        </div>
      </div>
      <div className="notes-placeholder">
        <span className="ops-empty-state__mark" aria-hidden="true">
          ✓
        </span>
        <strong>No open tasks yet.</strong>
      </div>
    </DashboardCard>
  );
}

function RoleDashboardPlaceholder({
  title,
  description,
  labels,
}: {
  title: string;
  description: string;
  labels: string[];
}) {
  return (
    <div className="dashboard-widget-grid">
      <DashboardCard className="role-placeholder-card" aria-labelledby="role-placeholder-heading">
        <p className="eyebrow">Role dashboard</p>
        <h2 id="role-placeholder-heading">{title}</h2>
        <p>{description}</p>
        <div className="role-placeholder-preview" aria-label="Preview focus areas">
          {labels.map((label) => (
            <span key={label}>{label}</span>
          ))}
        </div>
      </DashboardCard>
    </div>
  );
}

function TechnicianDashboardPlaceholder() {
  return (
    <RoleDashboardPlaceholder
      title="Technician dashboard coming next"
      description="Focused on intake, vitals, treatment handoffs, and doctor-ready patients."
      labels={['Intake Needed', 'Vitals Pending', 'Doctor Ready', 'In Treatment']}
    />
  );
}

function VeterinarianDashboardPlaceholder() {
  return (
    <RoleDashboardPlaceholder
      title="Veterinarian dashboard coming next"
      description="Focused on assigned visits, exams, diagnostics, SOAP notes, and discharges."
      labels={['Ready for Exam', 'My Active Visits', 'Diagnostics Pending', 'Records to Finish']}
    />
  );
}

function ReceptionistDashboard() {
  const { dashboard, loading, error, groups } = useOperationsDashboard();

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
    <>
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
          <QuickActionsWidget />
          <TodaySnapshotWidget dashboard={dashboard} />
          <CurrentlyInClinicWidget visits={activeVisits} />
          <TodaySchedulePreviewWidget appointments={groups.upcomingAppointments} />
          <TasksNotesWidget />
          <SecondaryNotesWidget />
        </div>
      )}
    </>
  );
}

function RoleDashboardSwitcher({ role }: { role: DashboardRole }) {
  switch (role) {
    case 'technician':
      return <TechnicianDashboardPlaceholder />;
    case 'veterinarian':
      return <VeterinarianDashboardPlaceholder />;
    default:
      return <ReceptionistDashboard />;
  }
}

function SecondaryNotesWidget() {
  return (
    <DashboardCard aria-labelledby="secondary-notes-heading">
      <div className="home-widget__header">
        <div>
          <h2 id="secondary-notes-heading">Sticky Notes</h2>
        </div>
      </div>
      <div className="notes-placeholder notes-placeholder--secondary">
        <span className="ops-empty-state__mark" aria-hidden="true">
          ✓
        </span>
        <strong>No sticky notes yet.</strong>
      </div>
    </DashboardCard>
  );
}

export function OperationsCommandCenter({
  activeHref = '/',
  eyebrow = 'My Dashboard',
}: {
  activeHref?: DashboardRoute;
  eyebrow?: string;
  title?: string;
}) {
  const { user: currentUser } = useCurrentUser();
  const firstName = currentUser?.name?.split(' ')[0];
  const [selectedRole, setSelectedRole] = useState<DashboardRole>(DEFAULT_DASHBOARD_ROLE);
  const [greeting, setGreeting] = useState(() => greetingForDate(new Date(), firstName));

  useEffect(() => {
    setGreeting(greetingForDate(new Date(), firstName));
  }, [firstName]);

  useEffect(() => {
    if (!ENABLE_DEV_ROLE_PREVIEW) {
      setSelectedRole(DEFAULT_DASHBOARD_ROLE);
      return;
    }

    const storedRole = window.localStorage.getItem(DASHBOARD_ROLE_STORAGE_KEY);
    if (isDashboardRole(storedRole)) {
      setSelectedRole(storedRole);
    }

    const handleStorage = (event: StorageEvent) => {
      if (event.key !== DASHBOARD_ROLE_STORAGE_KEY) return;
      setSelectedRole(isDashboardRole(event.newValue) ? event.newValue : DEFAULT_DASHBOARD_ROLE);
    };

    const handleRoleChange = (event: Event) => {
      const nextRole = (event as CustomEvent<unknown>).detail;
      setSelectedRole(isDashboardRole(nextRole) ? nextRole : DEFAULT_DASHBOARD_ROLE);
    };

    window.addEventListener('storage', handleStorage);
    window.addEventListener(DASHBOARD_ROLE_CHANGE_EVENT, handleRoleChange);
    return () => {
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener(DASHBOARD_ROLE_CHANGE_EVENT, handleRoleChange);
    };
  }, []);

  return (
    <DashboardShell
      activeHref={activeHref}
      eyebrow={eyebrow}
      title={greeting}
      subtitle={ROLE_SUBTITLES[selectedRole]}
      userName={firstName}
      roleLabel={DASHBOARD_ROLE_LABELS[selectedRole]}
    >
      <RoleDashboardSwitcher role={selectedRole} />
    </DashboardShell>
  );
}
