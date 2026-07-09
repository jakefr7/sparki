'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  useEffect,
  useMemo,
  useState,
  type DragEvent,
  type FormEvent,
  type KeyboardEvent,
} from 'react';
import { DashboardCard, DashboardShell, type DashboardRoute } from './dashboard-shell';
import { NewAppointmentAction } from './new-appointment-action';
import { NewPatientModal, type NewPatientCreationResult } from './new-patient-modal';
import { EmptyQueue } from './command-center/empty-states';
import { PetPhotoPlaceholder } from './pet-photo-placeholder';
import { StatusTransitionMenu } from './status-transition-menu';
import {
  DASHBOARD_ROLE_CHANGE_EVENT,
  DASHBOARD_ROLE_LABELS,
  DASHBOARD_ROLE_STORAGE_KEY,
  DEFAULT_DASHBOARD_ROLE,
  isDashboardRole,
  type DashboardRole,
} from '../lib/dashboard-role';
import {
  appointmentToScheduleRow,
  formatTime,
  visitToClinicRow,
  type ClinicDisplayRow,
  type ScheduleDisplayRow,
} from '../lib/dashboard-status';
import { useOperationsDashboard } from '../lib/use-operations-dashboard';
import { useCurrentUser } from '../lib/use-current-user';
import { useDashboardStatusColors, type DashboardStatusKey } from '../lib/use-dashboard-status-colors';
import type { DashboardAppointmentSummary, DashboardVisitSummary } from '../lib/patient-types';

const ROLE_SUBTITLES: Record<DashboardRole, string> = {
  receptionist: "Here's what's happening at Sparki Clinic today.",
  technician: "Here's what needs clinical attention at Sparki Clinic today.",
  veterinarian: "Here's what needs medical review at Sparki Clinic today.",
};

const SHOW_DEV_FALLBACK_ROWS = process.env.NODE_ENV !== 'production';
const ENABLE_DEV_ROLE_PREVIEW = process.env.NODE_ENV !== 'production';

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

interface TaskDraft {
  title: string;
  assignee: string;
  dueAt: string;
  assignedBy: string;
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

function formatDateTime(value: string) {
  return new Date(value).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function toDateTimeInputValue(value: string) {
  const date = new Date(value);
  const offset = date.getTimezoneOffset();
  const localDate = new Date(date.getTime() - offset * 60 * 1000);
  return localDate.toISOString().slice(0, 16);
}

function fromDateTimeInputValue(value: string) {
  return value ? new Date(value).toISOString() : undefined;
}

function PlusIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" focusable="false">
      <path d="M10 4.25v11.5M4.25 10h11.5" />
    </svg>
  );
}

function GripIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" focusable="false">
      <path d="M7 5.5h.01M13 5.5h.01M7 10h.01M13 10h.01M7 14.5h.01M13 14.5h.01" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" focusable="false">
      <path d="M4.5 6h11M8 6V4.75h4V6M6 6l.55 9.25h6.9L14 6" />
    </svg>
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

function QuickActionsWidget({ onAppointmentCreated }: { onAppointmentCreated?: () => void }) {
  const router = useRouter();
  const [isNewPatientModalOpen, setIsNewPatientModalOpen] = useState(false);

  const linkActions = [
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
  ] as const;

  function handleOpenCreatedProfile(result: NewPatientCreationResult) {
    setIsNewPatientModalOpen(false);
    router.push(`/patients/${result.id}`);
  }

  return (
    <DashboardCard className="home-widget--actions" aria-labelledby="quick-actions-heading">
      <div className="home-widget__header">
        <div>
          <p className="eyebrow">Shortcuts</p>
          <h2 id="quick-actions-heading">Quick Actions</h2>
        </div>
      </div>
      <div className="quick-action-grid">
        <NewAppointmentAction
          className="quick-action"
          tone="teal"
          onCreated={onAppointmentCreated}
        >
          <strong>New Appointment</strong>
          <span>Schedule a future visit.</span>
        </NewAppointmentAction>
        {linkActions.map((action) => (
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
        <button
          type="button"
          className="quick-action"
          data-tone="orange"
          onClick={() => setIsNewPatientModalOpen(true)}
        >
          <strong>New Patient</strong>
          <span>Create a patient profile.</span>
        </button>
      </div>
      <NewPatientModal
        open={isNewPatientModalOpen}
        onClose={() => setIsNewPatientModalOpen(false)}
        onCreated={() => {}}
        onOpenProfile={handleOpenCreatedProfile}
      />
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
  statusColors,
}: {
  row: ClinicDisplayRow;
  onStatusChanged?: (() => void) | undefined;
  statusColors?: Partial<Record<DashboardStatusKey, string>> | undefined;
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
      <StatusTransitionMenu row={row} onChanged={onStatusChanged} statusColors={statusColors} />
    </div>
  );
}

function AppointmentRow({
  row,
  onStatusChanged,
  statusColors,
}: {
  row: ScheduleDisplayRow;
  onStatusChanged?: (() => void) | undefined;
  statusColors?: Partial<Record<DashboardStatusKey, string>> | undefined;
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
      <StatusTransitionMenu row={row} onChanged={onStatusChanged} statusColors={statusColors} />
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
  statusColors,
}: {
  visits: DashboardVisitSummary[];
  onStatusChanged?: (() => void) | undefined;
  statusColors?: Partial<Record<DashboardStatusKey, string>> | undefined;
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
              <ClinicVisitRow key={row.id} row={row} onStatusChanged={onStatusChanged} statusColors={statusColors} />
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
  statusColors,
}: {
  appointments: DashboardAppointmentSummary[];
  onStatusChanged?: (() => void) | undefined;
  statusColors?: Partial<Record<DashboardStatusKey, string>> | undefined;
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
            <AppointmentRow key={row.id} row={row} onStatusChanged={onStatusChanged} statusColors={statusColors} />
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
  const [isComposing, setIsComposing] = useState(false);
  const [draggedNoteId, setDraggedNoteId] = useState<string | null>(null);

  function createNote() {
    const body = draft.trim();
    if (!body) return;
    // TODO: Persist shift notes through the dashboard API once a ShiftNote model exists.
    setNotes((current) => [
      { id: `note-${Date.now()}`, body, updatedAt: new Date().toISOString() },
      ...current,
    ]);
    setDraft('');
    setIsComposing(false);
  }

  function cancelNote() {
    setDraft('');
    setIsComposing(false);
  }

  function deleteNote(note: StickyNote) {
    const shouldConfirm = note.body.trim().length > 120;
    if (shouldConfirm && !window.confirm('Delete this shift note?')) return;
    // TODO: Delete persisted shift notes through the dashboard API once backend support exists.
    setNotes((current) => current.filter((item) => item.id !== note.id));
  }

  function moveNote(sourceId: string, targetId: string) {
    if (sourceId === targetId) return;
    // TODO: Persist shift note sort order when backend support is added.
    setNotes((current) => {
      const sourceIndex = current.findIndex((note) => note.id === sourceId);
      const targetIndex = current.findIndex((note) => note.id === targetId);
      if (sourceIndex === -1 || targetIndex === -1) return current;
      const next = [...current];
      const [moved] = next.splice(sourceIndex, 1);
      if (!moved) return current;
      next.splice(targetIndex, 0, moved);
      return next;
    });
  }

  function handleDragEnterNote(event: DragEvent<HTMLElement>, targetId: string) {
    event.preventDefault();
    const sourceId = draggedNoteId ?? event.dataTransfer.getData('text/plain');
    if (sourceId) moveNote(sourceId, targetId);
  }

  function handleDrop(event: DragEvent<HTMLElement>) {
    event.preventDefault();
    setDraggedNoteId(null);
  }

  function handleComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Escape') {
      event.preventDefault();
      cancelNote();
    }
    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
      event.preventDefault();
      createNote();
    }
  }

  return (
    <DashboardCard className="sticky-notes-widget" aria-labelledby="sticky-notes-heading">
      <div className="home-widget__header">
        <div>
          <p className="eyebrow">SHIFT MEMORY</p>
          <h2 id="sticky-notes-heading">Shift Notes</h2>
          <p className="home-widget__helper">Handoff notes for today&apos;s team.</p>
        </div>
        <button
          type="button"
          className="dashboard-icon-button"
          onClick={() => setIsComposing(true)}
          aria-label="Add shift note"
          title="Add shift note"
        >
          <PlusIcon />
        </button>
      </div>
      {isComposing && (
        <div className="sticky-note-composer">
          <textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={handleComposerKeyDown}
            placeholder="Leave a handoff note..."
            aria-label="New shift note"
            autoFocus
          />
          <div className="sticky-note-composer__actions">
            <button type="button" className="button-secondary" onClick={cancelNote}>
              Cancel
            </button>
            <button type="button" className="button-primary" onClick={createNote} disabled={!draft.trim()}>
              Save
            </button>
          </div>
        </div>
      )}
      <div className="sticky-note-grid">
        {notes.map((note) => (
          <article
            className="sticky-note-card"
            key={note.id}
            draggable
            data-dragging={draggedNoteId === note.id ? 'true' : undefined}
            onDragStart={(event) => {
              setDraggedNoteId(note.id);
              event.dataTransfer.effectAllowed = 'move';
              event.dataTransfer.setData('text/plain', note.id);
            }}
            onDragEnter={(event) => handleDragEnterNote(event, note.id)}
            onDragOver={(event) => event.preventDefault()}
            onDrop={handleDrop}
            onDragEnd={() => setDraggedNoteId(null)}
          >
            <div className="sticky-note-card__topline">
              <span className="sticky-note-card__grip" aria-hidden="true" title="Drag to reorder">
                <GripIcon />
              </span>
              <button
                type="button"
                className="sticky-note-card__delete"
                onClick={() => deleteNote(note)}
                aria-label="Delete shift note"
                title="Delete shift note"
              >
                <TrashIcon />
              </button>
            </div>
            <p>{note.body}</p>
            <time dateTime={note.updatedAt}>Updated {formatDateTime(note.updatedAt)}</time>
          </article>
        ))}
        {notes.length === 0 && <EmptyQueue label="No shift notes yet." />}
      </div>
    </DashboardCard>
  );
}

function TasksWidget() {
  const { user: currentUser } = useCurrentUser();
  const [filter, setFilter] = useState<TaskState>('pending');
  const [tasks, setTasks] = useState<ClinicTask[]>(DEV_TASKS);
  const [isCreatingTask, setIsCreatingTask] = useState(false);
  const assignedByDefault = currentUser?.name ?? 'Reception';
  const assigneeOptions = useMemo(
    () => Array.from(new Set(['Front Desk', 'Care Team', ...tasks.map((task) => task.assignee)])).sort(),
    [tasks],
  );
  const filteredTasks = tasks.filter((task) => task.status === filter);
  const taskCounts = tasks.reduce<Record<TaskState, number>>(
    (counts, task) => ({ ...counts, [task.status]: counts[task.status] + 1 }),
    { overdue: 0, pending: 0, completed: 0 },
  );
  const filters: { label: string; value: TaskState; count: number }[] = [
    { label: 'Overdue', value: 'overdue', count: taskCounts.overdue },
    { label: 'Pending', value: 'pending', count: taskCounts.pending },
    { label: 'Completed', value: 'completed', count: taskCounts.completed },
  ];

  function createTask(draft: TaskDraft) {
    const title = draft.title.trim();
    const assignee = draft.assignee.trim();
    if (!title || !assignee) return;
    const dueAt = fromDateTimeInputValue(draft.dueAt);
    const task: ClinicTask = {
      id: `task-${Date.now()}`,
      title,
      assignee,
      assignedBy: draft.assignedBy.trim() || assignedByDefault,
      createdAt: new Date().toISOString(),
      status: 'pending',
      ...(dueAt ? { dueAt } : {}),
    };
    // TODO: Persist dashboard tasks through the operations dashboard API once a Task model exists.
    setTasks((current) => [task, ...current]);
    setFilter('pending');
    setIsCreatingTask(false);
  }

  return (
    <DashboardCard className="tasks-widget" aria-labelledby="tasks-heading">
      <div className="home-widget__header">
        <div>
          <p className="eyebrow">WORK QUEUE</p>
          <h2 id="tasks-heading">Tasks</h2>
        </div>
        <button
          type="button"
          className="button-primary task-create-button"
          onClick={() => setIsCreatingTask(true)}
          aria-label="Create task"
          title="Create task"
        >
          <PlusIcon />
          <span>Task</span>
        </button>
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
              <div>
                <strong>{task.title}</strong>
                <span>Created {formatDateTime(task.createdAt)}</span>
              </div>
            </div>
            <p className="task-line-item__meta">
              <span>{task.assignee}</span>
              <span>{task.dueAt ? `Due ${formatDateTime(task.dueAt)}` : 'No due date'}</span>
              <span>By {task.assignedBy}</span>
            </p>
          </article>
        ))}
        {filteredTasks.length === 0 && <EmptyQueue label={`No ${filter} tasks.`} />}
      </div>
      {isCreatingTask && (
        <TaskCreateDialog
          assignedByDefault={assignedByDefault}
          assigneeOptions={assigneeOptions}
          onCancel={() => setIsCreatingTask(false)}
          onCreate={createTask}
        />
      )}
    </DashboardCard>
  );
}

function TaskCreateDialog({
  assignedByDefault,
  assigneeOptions,
  onCancel,
  onCreate,
}: {
  assignedByDefault: string;
  assigneeOptions: string[];
  onCancel: () => void;
  onCreate: (draft: TaskDraft) => void;
}) {
  const [draft, setDraft] = useState<TaskDraft>({
    title: '',
    assignee: assigneeOptions[0] ?? '',
    dueAt: '',
    assignedBy: assignedByDefault,
  });

  useEffect(() => {
    function handleKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key === 'Escape') onCancel();
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onCancel]);

  function submitTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onCreate(draft);
  }

  return (
    <div className="task-create-backdrop" role="presentation" onMouseDown={onCancel}>
      <form
        className="task-create-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="task-create-title"
        onSubmit={submitTask}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="task-create-dialog__header">
          <div>
            <p className="eyebrow">Quick task</p>
            <h3 id="task-create-title">Create Task</h3>
          </div>
          <button
            type="button"
            className="dashboard-icon-button dashboard-icon-button--close"
            onClick={onCancel}
            aria-label="Close task form"
          >
            <PlusIcon />
          </button>
        </div>
        <label>
          <span>Title</span>
          <input
            value={draft.title}
            onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))}
            placeholder="What needs to happen?"
            required
            autoFocus
          />
        </label>
        <label>
          <span>Assignee</span>
          <input
            value={draft.assignee}
            onChange={(event) => setDraft((current) => ({ ...current, assignee: event.target.value }))}
            list="dashboard-task-assignees"
            required
          />
        </label>
        <datalist id="dashboard-task-assignees">
          {assigneeOptions.map((assignee) => (
            <option value={assignee} key={assignee} />
          ))}
        </datalist>
        <div className="task-create-dialog__split">
          <label>
            <span>Due</span>
            <input
              type="datetime-local"
              value={draft.dueAt}
              min={toDateTimeInputValue(new Date().toISOString())}
              onChange={(event) => setDraft((current) => ({ ...current, dueAt: event.target.value }))}
            />
          </label>
          <label>
            <span>Assigned by</span>
            <input
              value={draft.assignedBy}
              onChange={(event) => setDraft((current) => ({ ...current, assignedBy: event.target.value }))}
            />
          </label>
        </div>
        <div className="task-create-dialog__actions">
          <button type="button" className="button-secondary" onClick={onCancel}>
            Cancel
          </button>
          <button type="submit" className="button-primary" disabled={!draft.title.trim() || !draft.assignee.trim()}>
            Create
          </button>
        </div>
      </form>
    </div>
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
  const { colorMap: statusColors } = useDashboardStatusColors();

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
            <QuickActionsWidget onAppointmentCreated={refresh} />
            <TodaySnapshotWidget dashboard={dashboard} />
          </div>
          <div className="dashboard-widget-row dashboard-widget-row--shift">
            <StickyNotesWidget />
            <TasksWidget />
          </div>
          <div className="dashboard-widget-row dashboard-widget-row--flow">
            <CurrentlyInClinicWidget visits={activeVisits} onStatusChanged={refresh} statusColors={statusColors} />
            <TodaySchedulePreviewWidget
              appointments={groups.upcomingAppointments}
              onStatusChanged={refresh}
              statusColors={statusColors}
            />
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
