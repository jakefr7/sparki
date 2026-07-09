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
  | 'Upcoming'
  | 'Checked In'
  | 'In Room'
  | 'Ready for Checkout'
  | 'Completed';

type StatusSubjectKind = 'appointment' | 'visit' | 'dev';

interface StatusAction {
  label: ReceptionStatus;
  description: string;
  endpoint?: string;
}

interface ClinicDisplayRow {
  id: string;
  patientName: string;
  species?: string | undefined;
  clientName: string;
  location: string;
  status: ReceptionStatus;
  state: string;
  kind: StatusSubjectKind;
  statusDetail?: string | undefined;
  href?: string;
}

interface ScheduleDisplayRow {
  id: string;
  time: string;
  patientName: string;
  species?: string | undefined;
  clientName: string;
  status: ReceptionStatus;
  state: string;
  kind: StatusSubjectKind;
  location?: string | undefined;
  statusDetail?: string | undefined;
  href?: string;
}

const DEV_CLINIC_ROWS: ClinicDisplayRow[] = [
  {
    id: 'dev-clinic-bella',
    patientName: 'Bella',
    species: 'Dog',
    clientName: 'Sarah Johnson',
    location: 'Lobby',
    status: 'Checked In',
    state: 'Arrived',
    kind: 'dev',
  },
  {
    id: 'dev-clinic-max',
    patientName: 'Max',
    species: 'Dog',
    clientName: 'Michael Lee',
    location: 'Exam Room 2',
    status: 'In Room',
    state: 'VeterinarianExamReady',
    kind: 'dev',
    statusDetail: 'Room 2',
  },
  {
    id: 'dev-clinic-luna',
    patientName: 'Luna',
    species: 'Cat',
    clientName: 'Emily Davis',
    location: 'Treatment',
    status: 'In Room',
    state: 'TreatmentPending',
    kind: 'dev',
  },
  {
    id: 'dev-clinic-cooper',
    patientName: 'Cooper',
    species: 'Dog',
    clientName: 'David Wilson',
    location: 'Checkout',
    status: 'Ready for Checkout',
    state: 'CheckoutReady',
    kind: 'dev',
  },
];

const DEV_SCHEDULE_ROWS: ScheduleDisplayRow[] = [
  {
    id: 'dev-schedule-bella',
    time: '9:00 AM',
    patientName: 'Bella',
    species: 'Dog',
    clientName: 'Sarah Johnson',
    status: 'Upcoming',
    state: 'Scheduled',
    kind: 'dev',
    location: 'Lobby',
  },
  {
    id: 'dev-schedule-max',
    time: '9:30 AM',
    patientName: 'Max',
    species: 'Dog',
    clientName: 'Michael Lee',
    status: 'Checked In',
    state: 'Arrived',
    kind: 'dev',
    location: 'Exam Room 2',
  },
  {
    id: 'dev-schedule-luna',
    time: '10:15 AM',
    patientName: 'Luna',
    species: 'Cat',
    clientName: 'Emily Davis',
    status: 'In Room',
    state: 'VeterinarianExamReady',
    kind: 'dev',
    location: 'Exam Room 3',
    statusDetail: 'Room 3',
  },
  {
    id: 'dev-schedule-cooper',
    time: '11:00 AM',
    patientName: 'Cooper',
    species: 'Dog',
    clientName: 'David Wilson',
    status: 'Ready for Checkout',
    state: 'CheckoutReady',
    kind: 'dev',
    location: 'Checkout',
  },
  {
    id: 'dev-schedule-milo',
    time: '11:45 AM',
    patientName: 'Milo',
    species: 'Cat',
    clientName: 'Priya Patel',
    status: 'Upcoming',
    state: 'Scheduled',
    kind: 'dev',
  },
  {
    id: 'dev-schedule-daisy',
    time: '12:30 PM',
    patientName: 'Daisy',
    species: 'Dog',
    clientName: 'Jordan Smith',
    status: 'Upcoming',
    state: 'Scheduled',
    kind: 'dev',
  },
];

interface StickyNote {
  id: string;
  body: string;
  updatedAt: string;
}

type TaskState = 'overdue' | 'pending' | 'completed';

interface ClinicTask {
  id: string;
  title: string;
  createdAt: string;
  assignedBy: string;
  assignee: string;
  status: TaskState;
  dueAt?: string;
}

const DEV_STICKY_NOTES: StickyNote[] = [
  {
    id: 'dev-note-callbacks',
    body: 'Three lab-result callbacks before lunch. Keep front desk clear after 11.',
    updatedAt: new Date('2026-07-08T08:20:00').toISOString(),
  },
  {
    id: 'dev-note-surgery',
    body: 'Room 2 reserved for post-op checks until noon.',
    updatedAt: new Date('2026-07-08T08:45:00').toISOString(),
  },
];

const DEV_TASKS: ClinicTask[] = [
  {
    id: 'dev-task-overdue',
    title: 'Call Davis about Luna estimate approval',
    createdAt: new Date('2026-07-08T07:55:00').toISOString(),
    assignedBy: 'Mia Chen',
    assignee: 'Front Desk',
    status: 'overdue',
    dueAt: new Date('2026-07-08T09:00:00').toISOString(),
  },
  {
    id: 'dev-task-pending',
    title: 'Prep checkout packet for Cooper',
    createdAt: new Date('2026-07-08T09:10:00').toISOString(),
    assignedBy: 'Dr. Patel',
    assignee: 'Sam Rivera',
    status: 'pending',
    dueAt: new Date('2026-07-08T11:30:00').toISOString(),
  },
  {
    id: 'dev-task-pending-2',
    title: 'Room 1 turnover before 10:30 appointment',
    createdAt: new Date('2026-07-08T09:18:00').toISOString(),
    assignedBy: 'Front Desk',
    assignee: 'Care Team',
    status: 'pending',
    dueAt: new Date('2026-07-08T10:20:00').toISOString(),
  },
  {
    id: 'dev-task-pending-3',
    title: 'Print discharge instructions for Cooper',
    createdAt: new Date('2026-07-08T09:28:00').toISOString(),
    assignedBy: 'Dr. Patel',
    assignee: 'Front Desk',
    status: 'pending',
  },
  {
    id: 'dev-task-completed',
    title: 'Confirm Bella vaccine records',
    createdAt: new Date('2026-07-08T08:35:00').toISOString(),
    assignedBy: 'Front Desk',
    assignee: 'Mia Chen',
    status: 'completed',
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

function formatDateTime(value: string) {
  return new Date(value).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function roomLabelFromLocation(location?: string) {
  const match = location?.match(/(?:Exam\s*)?Room\s*(\d+)/i);
  return match ? `Room ${match[1]}` : undefined;
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

  // Anna: the word "Intake" shouldn't surface in the UI — this is a
  // location label (alongside Lobby/Exam Room/Treatment/Checkout), so
  // "Triage" reads correctly as a place rather than "New Visit" language,
  // which only fits actions/CTAs.
  if (visit.state === 'IntakeInProgress') {
    return 'Triage';
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
      'IntakeInProgress',
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
    return 'In Room';
  }
  return 'Checked In';
}

function statusTone(status: ReceptionStatus) {
  if (status === 'In Room') return 'blue';
  if (status === 'Ready for Checkout') return 'orange';
  if (status === 'Completed') return 'green';
  if (status === 'Upcoming') return 'gray';
  return 'teal';
}

function appointmentReceptionStatus(appointment: DashboardAppointmentSummary): ReceptionStatus {
  if (appointment.state === 'Completed') return 'Completed';
  if (appointment.state === 'Arrived' || appointment.state === 'VisitCreated') return 'Checked In';
  if (appointment.state === 'InRoom') return 'In Room';
  if (appointment.state === 'CheckoutReady') return 'Ready for Checkout';
  return 'Upcoming';
}

function visitToClinicRow(visit: DashboardVisitSummary): ClinicDisplayRow {
  return {
    id: visit.id,
    patientName: visit.patient.name,
    species: visit.patient.species,
    clientName: clientLabel(visit.client),
    location: visitLocation(visit),
    status: visitReceptionStatus(visit),
    state: visit.state,
    kind: 'visit',
    statusDetail: roomLabelFromLocation(visitLocation(visit)),
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
    state: appointment.state,
    kind: 'appointment',
    href,
  };
}

function nextStatusActions(row: Pick<ClinicDisplayRow | ScheduleDisplayRow, 'id' | 'kind' | 'state'>): StatusAction[] {
  if (row.kind === 'dev') {
    if (row.state === 'Scheduled') {
      return [{ label: 'Checked In', description: 'Demo transition preview.' }];
    }
    if (row.state === 'Arrived') {
      return [{ label: 'In Room', description: 'Demo transition preview.' }];
    }
    return [];
  }

  if (row.kind === 'appointment') {
    if (['Scheduled', 'PreVisitPending', 'Confirmed'].includes(row.state)) {
      return [
        {
          label: 'Checked In',
          description: 'Mark this appointment arrived.',
          endpoint: `/api/appointments/${row.id}/arrive`,
        },
      ];
    }
    return [];
  }

  if (['Arrived', 'ReadyForIntake'].includes(row.state)) {
    return [
      {
        label: 'In Room',
        description: 'Start the roomed visit workflow.',
        endpoint: `/api/visits/${row.id}/start`,
      },
    ];
  }

  return [];
}

function StatusChip({
  row,
  onChanged,
}: {
  row: Pick<ClinicDisplayRow | ScheduleDisplayRow, 'id' | 'status' | 'state' | 'kind' | 'statusDetail'>;
  onChanged?: (() => void) | undefined;
}) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const actions = nextStatusActions(row);
  const label = row.statusDetail ? `${row.status} · ${row.statusDetail}` : row.status;

  async function runAction(action: StatusAction) {
    if (!action.endpoint) {
      setOpen(false);
      return;
    }

    setPending(action.endpoint);
    setError(null);
    try {
      const response = await fetch(action.endpoint, { method: 'POST' });
      if (!response.ok) throw new Error(`Status update failed (${response.status})`);
      setOpen(false);
      onChanged?.();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Status update failed.');
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="status-picker">
      <button
        type="button"
        className="reception-status-chip"
        data-tone={statusTone(row.status)}
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        {label}
      </button>
      {open && (
        <div className="status-picker__popover" role="dialog" aria-label={`${label} status actions`}>
          <strong>Next status</strong>
          {actions.length > 0 ? (
            <div className="status-picker__actions">
              {actions.map((action) => (
                <button
                  key={`${action.label}-${action.description}`}
                  type="button"
                  className="status-picker__action"
                  disabled={pending === action.endpoint}
                  onClick={() => void runAction(action)}
                >
                  <span>{pending === action.endpoint ? 'Updating...' : action.label}</span>
                  <small>{action.description}</small>
                </button>
              ))}
            </div>
          ) : (
            <p>{row.status === 'Completed' ? 'Completed is terminal.' : 'No dashboard transition available.'}</p>
          )}
          {error && <p className="status-picker__error">{error}</p>}
        </div>
      )}
    </div>
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
      description: 'Schedule a future visit.',
      tone: 'teal',
    },
    {
      href: '/patients',
      label: 'New Visit',
      description: 'Check in or start now.',
      tone: 'blue',
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
      description: 'Create a client profile.',
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
  const hasRealCounts = Object.values(dashboard.summary).some((value) => value > 0);
  const summary = hasRealCounts || !SHOW_DEV_FALLBACK_ROWS
    ? dashboard.summary
    : {
        scheduledToday: 9,
        arrived: 3,
        active: 4,
        checkoutReady: 1,
      };
  const items = [
    { label: 'Upcoming', value: summary.scheduledToday, tone: 'upcoming' },
    { label: 'Checked in', value: summary.arrived, tone: 'checked-in' },
    { label: 'Active visits', value: summary.active, tone: 'active' },
    { label: 'Checkout ready', value: summary.checkoutReady, tone: 'checkout' },
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
          <div className="snapshot-tile" data-tone={item.tone} key={item.label}>
            <strong>{item.value}</strong>
            <span>{item.label}</span>
          </div>
        ))}
      </div>
    </DashboardCard>
  );
}

function ClinicVisitRow({
  row,
  onStatusChanged,
}: {
  row: ClinicDisplayRow;
  onStatusChanged?: (() => void) | undefined;
}) {
  return (
    <div className="clinic-table__row">
      <PatientClientCell
        patientName={row.patientName}
        species={row.species}
        clientName={row.clientName}
        href={row.href}
      />
      <span className="clinic-table__location">{row.location}</span>
      <StatusChip row={row} onChanged={onStatusChanged} />
      <RowActionsButton label={`Open actions for ${row.patientName}`} />
    </div>
  );
}

function AppointmentRow({
  row,
  onStatusChanged,
}: {
  row: ScheduleDisplayRow;
  onStatusChanged?: (() => void) | undefined;
}) {
  return (
    <div className="schedule-row">
      <span className="schedule-row__time">{row.time}</span>
      <PatientClientCell
        patientName={row.patientName}
        species={row.species}
        clientName={row.clientName}
        href={row.href}
      />
      <StatusChip row={row} onChanged={onStatusChanged} />
      <span className="schedule-row__location">{row.location ?? 'Unassigned'}</span>
      <div className="schedule-row__actions">
        <RowActionsButton label={`Open actions for ${row.patientName}`} />
      </div>
    </div>
  );
}

function CurrentlyInClinicWidget({
  visits,
  onStatusChanged,
}: {
  visits: DashboardVisitSummary[];
  onStatusChanged?: (() => void) | undefined;
}) {
  const realRows = visits.map(visitToClinicRow);
  const displayRows = realRows.length > 0 ? realRows : SHOW_DEV_FALLBACK_ROWS ? DEV_CLINIC_ROWS : [];
  const hasVisits = displayRows.length > 0;
  const longestWait = visits.length > 0 ? Math.max(...visits.map((visit) => visit.elapsedMinutes)) : null;
  const roomsOccupied = displayRows.filter((row) => row.status === 'In Room').length;
  const checkoutQueue = displayRows.filter((row) => row.status === 'Ready for Checkout').length;

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
              <ClinicVisitRow key={row.id} row={row} onStatusChanged={onStatusChanged} />
            ))}
          </div>
        ) : (
          <EmptyQueue label="No patients are currently in clinic." />
        )}
      </div>
      {hasVisits && (
        <div className="clinic-flow-footer" aria-label="Clinic flow summary">
          <span>{longestWait === null ? 'Waits live' : `Longest wait ${longestWait}m`}</span>
          <span>{roomsOccupied} rooms occupied</span>
          <span>{checkoutQueue} checkout</span>
        </div>
      )}
    </DashboardCard>
  );
}

function TodaySchedulePreviewWidget({
  appointments,
  onStatusChanged,
}: {
  appointments: DashboardAppointmentSummary[];
  onStatusChanged?: (() => void) | undefined;
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
            <AppointmentRow key={row.id} row={row} onStatusChanged={onStatusChanged} />
          ))
        ) : (
          <EmptyQueue label="No appointments are coming up." />
        )}
      </div>
    </DashboardCard>
  );
}

function StickyNotesWidget() {
  const [notes, setNotes] = useState<StickyNote[]>(DEV_STICKY_NOTES);
  const [draft, setDraft] = useState('');

  function updateNote(id: string, body: string) {
    setNotes((current) =>
      current.map((note) =>
        note.id === id ? { ...note, body, updatedAt: new Date().toISOString() } : note,
      ),
    );
  }

  function createNote() {
    const body = draft.trim();
    if (!body) return;
    setNotes((current) => [
      { id: `note-${Date.now()}`, body, updatedAt: new Date().toISOString() },
      ...current,
    ]);
    setDraft('');
  }

  return (
    <DashboardCard className="sticky-notes-widget" aria-labelledby="sticky-notes-heading">
      <div className="home-widget__header">
        <div>
          <p className="eyebrow">Shift memory</p>
          <h2 id="sticky-notes-heading">Shift Notes</h2>
          <p className="home-widget__helper">Handoff notes for today&apos;s team.</p>
        </div>
      </div>
      <div className="sticky-note-composer">
        <textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Add a handoff note..."
          aria-label="New sticky note"
        />
        <button type="button" className="button-secondary" onClick={createNote}>
          Add note
        </button>
      </div>
      <div className="sticky-note-grid">
        {notes.map((note) => (
          <article className="sticky-note-card" key={note.id}>
            <textarea
              value={note.body}
              onChange={(event) => updateNote(note.id, event.target.value)}
              aria-label={`Edit sticky note updated ${formatDateTime(note.updatedAt)}`}
            />
            <time dateTime={note.updatedAt}>Updated {formatDateTime(note.updatedAt)}</time>
          </article>
        ))}
      </div>
    </DashboardCard>
  );
}

function TasksWidget() {
  const [filter, setFilter] = useState<TaskState>('pending');
  const filteredTasks = DEV_TASKS.filter((task) => task.status === filter);
  const taskCounts = DEV_TASKS.reduce<Record<TaskState, number>>(
    (counts, task) => ({ ...counts, [task.status]: counts[task.status] + 1 }),
    { overdue: 0, pending: 0, completed: 0 },
  );
  const filters: { label: string; value: TaskState; count: number }[] = [
    { label: 'Overdue', value: 'overdue', count: taskCounts.overdue },
    { label: 'Pending', value: 'pending', count: taskCounts.pending },
    { label: 'Completed', value: 'completed', count: taskCounts.completed },
  ];

  return (
    <DashboardCard className="tasks-widget" aria-labelledby="tasks-heading">
      <div className="home-widget__header">
        <div>
          <p className="eyebrow">Work queue</p>
          <h2 id="tasks-heading">Tasks</h2>
        </div>
      </div>
      <div className="task-filter-tabs" role="tablist" aria-label="Task filters">
        {filters.map((item) => (
          <button
            key={item.value}
            type="button"
            role="tab"
            aria-selected={filter === item.value}
            onClick={() => setFilter(item.value)}
          >
            <span>{item.label}</span>
            <strong>{item.count}</strong>
          </button>
        ))}
      </div>
      <div className="task-line-list">
        {filteredTasks.map((task) => (
          <article className="task-line-item" data-state={task.status} key={task.id}>
            <div className="task-line-item__main">
              <strong>{task.title}</strong>
              <span>Created {formatDateTime(task.createdAt)}</span>
            </div>
            <dl className="task-line-item__meta">
              <div>
                <dt>Assigned by</dt>
                <dd>{task.assignedBy}</dd>
              </div>
              <div>
                <dt>Assignee</dt>
                <dd>{task.assignee}</dd>
              </div>
              <div>
                <dt>Due</dt>
                <dd>{task.dueAt ? formatDateTime(task.dueAt) : 'No due date'}</dd>
              </div>
            </dl>
          </article>
        ))}
        {filteredTasks.length === 0 && <EmptyQueue label={`No ${filter} tasks.`} />}
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
      description="Focused on visit prep, vitals, treatment handoffs, and doctor-ready patients."
      labels={['Visit Prep', 'Vitals Pending', 'Doctor Ready', 'In Treatment']}
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
  const { dashboard, loading, error, groups, refresh } = useOperationsDashboard();

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
          <div className="dashboard-widget-row dashboard-widget-row--top">
            <QuickActionsWidget />
            <TodaySnapshotWidget dashboard={dashboard} />
          </div>
          <div className="dashboard-widget-row dashboard-widget-row--shift">
            <StickyNotesWidget />
            <TasksWidget />
          </div>
          <div className="dashboard-widget-row dashboard-widget-row--flow">
            <CurrentlyInClinicWidget visits={activeVisits} onStatusChanged={refresh} />
            <TodaySchedulePreviewWidget appointments={groups.upcomingAppointments} onStatusChanged={refresh} />
          </div>
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
