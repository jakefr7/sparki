'use client';

import { resolveConfiguredStatus, type ConfiguredDashboardStatus } from '@sparki/config';
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
import { useNewAppointmentModal } from '../hooks/use-new-appointment-modal';
import { PetPhotoPlaceholder } from './pet-photo-placeholder';
import { ConfiguredStatusMenu } from './configured-status-menu';
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
import { useDashboardStatusColors } from '../lib/use-dashboard-status-colors';
import type { DashboardAppointmentSummary, DashboardVisitSummary, StaffMember } from '../lib/patient-types';

const ROLE_SUBTITLES: Record<DashboardRole, string> = {
  receptionist: "Here's what's happening at Sparki Clinic today.",
  technician: "Here's what needs clinical attention at Sparki Clinic today.",
  veterinarian: "Here's what needs medical review at Sparki Clinic today.",
};

const ENABLE_DEV_ROLE_PREVIEW = process.env.NODE_ENV !== 'production';

interface StickyNote {
  id: string;
  body: string;
  updatedAt: string;
}

/** Matches the API's derived effectiveStatus (see TasksService.effectiveTaskStatus)
 *  — "Overdue" is never stored, just computed from a Pending task's dueAt. */
type TaskState = 'Overdue' | 'Pending' | 'Completed';

interface ClinicTask {
  id: string;
  title: string;
  createdAt: string;
  assignedBy: string;
  assignee: string;
  assigneeId: string | null;
  createdById: string;
  status: 'Pending' | 'Completed';
  effectiveStatus: TaskState;
  dueAt?: string | null;
}

interface TaskDraft {
  title: string;
  assigneeId: string;
  dueDate: string;
  dueTime: string;
}

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

function todayDateInputValue() {
  const now = new Date();
  const offset = now.getTimezoneOffset();
  return new Date(now.getTime() - offset * 60 * 1000).toISOString().slice(0, 10);
}

function combineDateAndTime(date: string, time: string): string | undefined {
  if (!date) return undefined;
  const parsed = new Date(`${date}T${time || '00:00'}`);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
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

function PatientClientCell({
  patientName,
  species,
  imageUrl,
  clientName,
  href,
}: {
  patientName: string;
  species?: string | undefined;
  imageUrl?: string | null | undefined;
  clientName: string;
  href?: string | undefined;
}) {
  const content = (
    <>
      <PetPhotoPlaceholder
        name={patientName}
        species={species}
        imageUrl={imageUrl}
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
  const { openNewAppointment, newAppointmentModal } = useNewAppointmentModal(() => onAppointmentCreated?.());

  const linkActions = [
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

  function handleNewAppointmentForCreatedPatient(result: NewPatientCreationResult) {
    setIsNewPatientModalOpen(false);
    openNewAppointment({
      patient: {
        id: result.id,
        name: result.name,
        species: result.species,
        breed: result.breed,
        sex: result.sex,
        dateOfBirth: result.dateOfBirth,
        primaryClient: {
          id: result.clientId,
          firstName: result.clientFirstName,
          lastName: result.clientLastName,
          phone: result.clientPhone,
          email: result.clientEmail,
          preferredContactMethod: null,
        },
      },
    });
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
        onNewAppointment={handleNewAppointmentForCreatedPatient}
      />
      {newAppointmentModal}
    </DashboardCard>
  );
}

function TodaySnapshotWidget({
  dashboard,
}: {
  dashboard: NonNullable<ReturnType<typeof useOperationsDashboard>['dashboard']>;
}) {
  const summary = dashboard.summary;
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
  statuses,
}: {
  row: ClinicDisplayRow;
  onStatusChanged?: (() => void) | undefined;
  statuses: ConfiguredDashboardStatus[];
}) {
  const status = resolveConfiguredStatus(statuses, 'visit', row.state);
  return (
    <div className="clinic-table__row">
      <PatientClientCell
        patientName={row.patientName}
        species={row.species}
        imageUrl={row.imageUrl}
        clientName={row.clientName}
        href={row.href}
      />
      {status ? (
        <ConfiguredStatusMenu
          row={{ id: row.id, kind: 'visit', state: row.state, status }}
          statuses={statuses}
          {...(onStatusChanged ? { onChanged: onStatusChanged } : {})}
        />
      ) : null}
      <span className="clinic-table__location">{row.location}</span>
    </div>
  );
}

function AppointmentRow({
  row,
  onStatusChanged,
  statuses,
}: {
  row: ScheduleDisplayRow;
  onStatusChanged?: (() => void) | undefined;
  statuses: ConfiguredDashboardStatus[];
}) {
  const status = resolveConfiguredStatus(statuses, 'appointment', row.state);
  return (
    <div className="schedule-row">
      <span className="schedule-row__time">{row.time}</span>
      <PatientClientCell
        patientName={row.patientName}
        species={row.species}
        imageUrl={row.imageUrl}
        clientName={row.clientName}
        href={row.href}
      />
      {status ? (
        <ConfiguredStatusMenu
          row={{ id: row.id, kind: 'appointment', state: row.state, status }}
          statuses={statuses}
          {...(onStatusChanged ? { onChanged: onStatusChanged } : {})}
        />
      ) : null}
      <span className="schedule-row__location">{row.location ?? 'Unassigned'}</span>
    </div>
  );
}

function CurrentlyInClinicWidget({
  visits,
  onStatusChanged,
  statuses,
}: {
  visits: DashboardVisitSummary[];
  onStatusChanged?: (() => void) | undefined;
  statuses: ConfiguredDashboardStatus[];
}) {
  const realRows = visits.map(visitToClinicRow);
  const displayRows = realRows;
  const hasVisits = displayRows.length > 0;
  const roomsOccupied = displayRows.filter((row) => row.status === 'In Room').length;
  const checkoutQueue = displayRows.filter((row) => row.status === 'Ready for Checkout').length;

  return (
    <DashboardCard
      className={`dashboard-flow-widget dashboard-flow-widget--clinic${hasVisits ? ' dashboard-widget--primary' : ''}`}
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
              <ClinicVisitRow key={row.id} row={row} onStatusChanged={onStatusChanged} statuses={statuses} />
            ))}
          </div>
        ) : (
          <EmptyQueue label="No patients are currently in clinic." />
        )}
      </div>
      {hasVisits && (
        <div className="clinic-flow-footer" aria-label="Clinic flow summary">
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
  statuses,
}: {
  appointments: DashboardAppointmentSummary[];
  onStatusChanged?: (() => void) | undefined;
  statuses: ConfiguredDashboardStatus[];
}) {
  const realRows = appointments.map(appointmentToScheduleRow);
  const displayRows = realRows;
  const hasOverflow = displayRows.length > 5;
  const hasAppointments = displayRows.length > 0;

  return (
    <DashboardCard
      className={`dashboard-flow-widget dashboard-flow-widget--schedule${hasAppointments ? ' dashboard-widget--primary' : ''}`}
      aria-labelledby="upcoming-heading"
    >
      <div className="home-widget__header">
        <div>
          <p className="eyebrow">Next up</p>
          <h2 id="upcoming-heading">Today&apos;s Schedule</h2>
        </div>
        <Link href="/today" className="home-widget__link home-widget__link--primary">
          View schedule
        </Link>
      </div>
      <div className={hasOverflow ? 'home-list home-list--scroll' : 'home-list'}>
        {hasAppointments ? (
          displayRows.map((row) => (
            <AppointmentRow key={row.id} row={row} onStatusChanged={onStatusChanged} statuses={statuses} />
          ))
        ) : (
          <EmptyQueue label="No appointments are coming up." />
        )}
      </div>
    </DashboardCard>
  );
}

function StickyNotesWidget() {
  const [notes, setNotes] = useState<StickyNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState('');
  const [isComposing, setIsComposing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draggedNoteId, setDraggedNoteId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/notes', { cache: 'no-store' })
      .then((response) => (response.ok ? (response.json() as Promise<StickyNote[]>) : []))
      .then((data) => {
        if (!cancelled) setNotes(data);
      })
      .catch(() => {
        if (!cancelled) setError('Could not load notes.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function createNote() {
    const body = draft.trim();
    if (!body) return;
    setSaving(true);
    setError(null);
    try {
      const response = await fetch('/api/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body }),
      });
      if (!response.ok) throw new Error('note create failed');
      const created = (await response.json()) as StickyNote;
      setNotes((current) => [created, ...current]);
      setDraft('');
      setIsComposing(false);
    } catch {
      setError('Could not save this note. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  function cancelNote() {
    setDraft('');
    setIsComposing(false);
    setError(null);
  }

  async function deleteNote(note: StickyNote) {
    const shouldConfirm = note.body.trim().length > 120;
    if (shouldConfirm && !window.confirm('Delete this note?')) return;
    const previous = notes;
    setNotes((current) => current.filter((item) => item.id !== note.id));
    const response = await fetch(`/api/notes/${note.id}`, { method: 'DELETE' });
    if (!response.ok) {
      setNotes(previous);
      setError('Could not delete this note. Please try again.');
    }
  }

  function moveNote(sourceId: string, targetId: string) {
    if (sourceId === targetId) return;
    setNotes((current) => {
      const sourceIndex = current.findIndex((note) => note.id === sourceId);
      const targetIndex = current.findIndex((note) => note.id === targetId);
      if (sourceIndex === -1 || targetIndex === -1) return current;
      const next = [...current];
      const [moved] = next.splice(sourceIndex, 1);
      if (!moved) return current;
      next.splice(targetIndex, 0, moved);
      void fetch('/api/notes/reorder', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: next.map((note) => note.id) }),
      });
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
      void createNote();
    }
  }

  return (
    <DashboardCard className="sticky-notes-widget" aria-labelledby="sticky-notes-heading">
      <div className="home-widget__header">
        <div>
          <p className="eyebrow">PERSONAL</p>
          <h2 id="sticky-notes-heading">Notes</h2>
          <p className="home-widget__helper">Only visible to you — stick around as long as you need.</p>
        </div>
        <button
          type="button"
          className="dashboard-icon-button"
          onClick={() => setIsComposing(true)}
          aria-label="Add note"
          title="Add note"
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
            placeholder="Write a note..."
            aria-label="New note"
            autoFocus
          />
          <div className="sticky-note-composer__actions">
            <button type="button" className="button-secondary" onClick={cancelNote} disabled={saving}>
              Cancel
            </button>
            <button
              type="button"
              className="button-primary"
              onClick={() => void createNote()}
              disabled={!draft.trim() || saving}
            >
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>
      )}
      {error && <p className="form-error">{error}</p>}
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
                onClick={() => void deleteNote(note)}
                aria-label="Delete note"
                title="Delete note"
              >
                <TrashIcon />
              </button>
            </div>
            <p>{note.body}</p>
            <time dateTime={note.updatedAt}>Updated {formatDateTime(note.updatedAt)}</time>
          </article>
        ))}
        {!loading && notes.length === 0 && <EmptyQueue label="No notes yet." />}
      </div>
    </DashboardCard>
  );
}

function TasksWidget() {
  const { user: currentUser } = useCurrentUser();
  const [filter, setFilter] = useState<TaskState>('Pending');
  const [tasks, setTasks] = useState<ClinicTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [isCreatingTask, setIsCreatingTask] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const assignedByDefault = currentUser?.name ?? 'Reception';

  useEffect(() => {
    let cancelled = false;
    fetch('/api/tasks', { cache: 'no-store' })
      .then((response) => (response.ok ? (response.json() as Promise<ClinicTask[]>) : []))
      .then((data) => {
        if (!cancelled) setTasks(data);
      })
      .catch(() => {
        if (!cancelled) setError('Could not load tasks.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/staff', { cache: 'no-store' })
      .then((response) => (response.ok ? (response.json() as Promise<StaffMember[]>) : []))
      .then((data) => {
        if (!cancelled) setStaff(data);
      })
      .catch(() => {
        if (!cancelled) setStaff([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const staffOptions = useMemo(
    () => [...staff].sort((a, b) => a.displayName.localeCompare(b.displayName)),
    [staff],
  );
  const filteredTasks = tasks.filter((task) => task.effectiveStatus === filter);
  function canCompleteTask(task: ClinicTask) {
    if (!currentUser) return false;
    return task.assigneeId === currentUser.id || task.createdById === currentUser.id;
  }
  const taskCounts = tasks.reduce<Record<TaskState, number>>(
    (counts, task) => ({ ...counts, [task.effectiveStatus]: counts[task.effectiveStatus] + 1 }),
    { Overdue: 0, Pending: 0, Completed: 0 },
  );
  const filters: { label: string; value: TaskState; count: number }[] = [
    { label: 'Overdue', value: 'Overdue', count: taskCounts.Overdue },
    { label: 'Pending', value: 'Pending', count: taskCounts.Pending },
    { label: 'Completed', value: 'Completed', count: taskCounts.Completed },
  ];

  async function createTask(draft: TaskDraft) {
    const title = draft.title.trim();
    const assigneeMember = staff.find((member) => member.id === draft.assigneeId);
    if (!title || !assigneeMember) return;
    const dueAt = combineDateAndTime(draft.dueDate, draft.dueTime);
    setError(null);
    try {
      const response = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          assignee: assigneeMember.displayName,
          assigneeId: assigneeMember.id,
          assignedBy: assignedByDefault,
          ...(dueAt ? { dueAt } : {}),
        }),
      });
      if (!response.ok) throw new Error('task create failed');
      const created = (await response.json()) as ClinicTask;
      setTasks((current) => [created, ...current]);
      setFilter('Pending');
      setIsCreatingTask(false);
    } catch {
      setError('Could not create this task. Please try again.');
    }
  }

  async function toggleTaskComplete(task: ClinicTask) {
    const nextStatus = task.status === 'Completed' ? 'Pending' : 'Completed';
    const previous = tasks;
    setTasks((current) =>
      current.map((item) =>
        item.id === task.id
          ? {
              ...item,
              status: nextStatus,
              // Optimistic guess — the PATCH response (below) overwrites this
              // with the server's real Overdue/Pending distinction.
              effectiveStatus:
                nextStatus === 'Completed'
                  ? 'Completed'
                  : item.dueAt && new Date(item.dueAt).getTime() < Date.now()
                    ? 'Overdue'
                    : 'Pending',
            }
          : item,
      ),
    );
    try {
      const response = await fetch(`/api/tasks/${task.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: nextStatus }),
      });
      if (!response.ok) throw new Error('task update failed');
      const updated = (await response.json()) as ClinicTask;
      setTasks((current) => current.map((item) => (item.id === task.id ? updated : item)));
    } catch {
      setTasks(previous);
      setError('Could not update this task. Please try again.');
    }
  }

  async function deleteTask(task: ClinicTask) {
    if (!window.confirm('Delete this task?')) return;
    const previous = tasks;
    setTasks((current) => current.filter((item) => item.id !== task.id));
    const response = await fetch(`/api/tasks/${task.id}`, { method: 'DELETE' });
    if (!response.ok) {
      setTasks(previous);
      setError('Could not delete this task. Please try again.');
    }
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
          className="dashboard-icon-button"
          onClick={() => setIsCreatingTask(true)}
          aria-label="Create task"
          title="Create task"
        >
          <PlusIcon />
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
      {error && <p className="form-error">{error}</p>}
      <div className="task-line-list">
        {filteredTasks.map((task) => (
          <article className="task-line-item" data-state={task.effectiveStatus.toLowerCase()} key={task.id}>
            <div className="task-line-item__top">
              <input
                type="checkbox"
                className="task-line-item__checkbox"
                checked={task.status === 'Completed'}
                onChange={() => void toggleTaskComplete(task)}
                disabled={!canCompleteTask(task)}
                aria-label={task.status === 'Completed' ? 'Mark task pending' : 'Mark task complete'}
                title={
                  canCompleteTask(task)
                    ? undefined
                    : `Only ${task.assignee} or whoever created this task can mark it complete.`
                }
              />
              <div className="task-line-item__main">
                <strong>{task.title}</strong>
                <span>Created {formatDateTime(task.createdAt)}</span>
              </div>
              <button
                type="button"
                className="task-line-item__delete"
                onClick={() => void deleteTask(task)}
                aria-label="Delete task"
                title="Delete task"
              >
                <TrashIcon />
              </button>
            </div>
            <p className="task-line-item__meta">
              <span>{task.assignee}</span>
              <span>{task.dueAt ? `Due ${formatDateTime(task.dueAt)}` : 'No due date'}</span>
              <span>By {task.assignedBy}</span>
            </p>
          </article>
        ))}
        {!loading && filteredTasks.length === 0 && <EmptyQueue label={`No ${filter.toLowerCase()} tasks.`} />}
      </div>
      {isCreatingTask && (
        <TaskCreateDialog
          assignedByDefault={assignedByDefault}
          staffOptions={staffOptions}
          onCancel={() => setIsCreatingTask(false)}
          onCreate={(draft) => void createTask(draft)}
        />
      )}
    </DashboardCard>
  );
}

function TaskCreateDialog({
  assignedByDefault,
  staffOptions,
  onCancel,
  onCreate,
}: {
  assignedByDefault: string;
  staffOptions: StaffMember[];
  onCancel: () => void;
  onCreate: (draft: TaskDraft) => void;
}) {
  const [draft, setDraft] = useState<TaskDraft>({
    title: '',
    assigneeId: staffOptions[0]?.id ?? '',
    dueDate: '',
    dueTime: '',
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
          <span>Assign to</span>
          {staffOptions.length > 0 ? (
            <select
              value={draft.assigneeId}
              onChange={(event) => setDraft((current) => ({ ...current, assigneeId: event.target.value }))}
              required
            >
              {staffOptions.map((member) => (
                <option value={member.id} key={member.id}>
                  {member.displayName}
                </option>
              ))}
            </select>
          ) : (
            <input value="Loading team..." disabled readOnly />
          )}
        </label>
        <label>
          <span>Due date &amp; time</span>
          <div className="task-create-dialog__datetime">
            <input
              type="date"
              value={draft.dueDate}
              min={todayDateInputValue()}
              onChange={(event) => setDraft((current) => ({ ...current, dueDate: event.target.value }))}
              aria-label="Due date"
            />
            <input
              type="time"
              value={draft.dueTime}
              onChange={(event) => setDraft((current) => ({ ...current, dueTime: event.target.value }))}
              aria-label="Due time"
              disabled={!draft.dueDate}
            />
          </div>
        </label>
        <p className="task-create-dialog__assigned-by">Assigned by {assignedByDefault}</p>
        <div className="task-create-dialog__actions">
          <button type="button" className="button-secondary" onClick={onCancel}>
            Cancel
          </button>
          <button type="submit" className="button-primary" disabled={!draft.title.trim() || !draft.assigneeId}>
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
  const { colors } = useDashboardStatusColors();
  const statuses = colors ?? [];

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
            <CurrentlyInClinicWidget visits={activeVisits} onStatusChanged={refresh} statuses={statuses} />
            <TodaySchedulePreviewWidget
              appointments={groups.upcomingAppointments}
              onStatusChanged={refresh}
              statuses={statuses}
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
