'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { DashboardShell } from './dashboard-shell';
import { useLockBodyScroll } from '../hooks/use-lock-body-scroll';
import {
  APPOINTMENT_TYPES,
  appointmentTypeLabel,
  clientDisplayName,
  type DashboardAppointmentSummary,
  type AppointmentTypeValue,
  type OperationsDashboard,
  type PatientSearchResult,
  type StaffMember,
} from '../lib/patient-types';

type SchedulerView = 'day' | 'week';

interface SchedulerAppointment extends DashboardAppointmentSummary {
  room: string | null;
}

interface SelectedSlot {
  startsAt: Date;
  endsAt: Date;
}

type AppointmentColorKey = 'teal' | 'blue' | 'purple' | 'amber' | 'orange' | 'green' | 'slate' | 'rose';

interface CreatedAppointmentResponse {
  id: string;
  type: string;
  reason: string;
  state: string;
  scheduledAt: string;
  expectedDurationMinutes: number | null;
  colorKey: string | null;
  providerId: string | null;
}

const CLINIC_START_HOUR = 7;
const CLINIC_END_HOUR = 19;
const SLOT_MINUTES = 30;
const SLOT_COUNT = ((CLINIC_END_HOUR - CLINIC_START_HOUR) * 60) / SLOT_MINUTES;
const DAY_MS = 24 * 60 * 60 * 1000;

// Confirmed clinic-facing labels (Anna, Phase 2 cleanup): Scheduled reads
// "Upcoming", Arrived/VisitCreated read "Checked In" — matches
// appointmentStatusLabel() in lib/format.ts. Draft/PreVisitPending/Confirmed/
// Rescheduled/Cancelled/NoShow stay as their own distinct labels here since
// scheduler staff need that finer-grained state, unlike the simplified
// Today/dashboard status chips.
const STATUS_LABELS: Record<string, string> = {
  Draft: 'Draft',
  Scheduled: 'Upcoming',
  PreVisitPending: 'Pre-visit',
  Confirmed: 'Confirmed',
  Arrived: 'Checked In',
  VisitCreated: 'Checked In',
  Completed: 'Completed',
  Rescheduled: 'Rescheduled',
  Cancelled: 'Cancelled',
  NoShow: 'No show',
};

const CARD_TYPE_LABELS: Record<string, string> = {
  WellnessPreventiveCare: 'Wellness',
  SickVisit: 'Sick Visit',
  Recheck: 'Recheck',
  TechnicianAppointment: 'Technician',
  Vaccination: 'Vaccination',
  SurgeryProcedure: 'Surgery',
  DropOff: 'Drop-Off',
  EmergencyUrgent: 'Urgent',
  Telemedicine: 'Telemedicine',
  Euthanasia: 'Euthanasia',
  BoardingNonMedical: 'Boarding',
};

const APPOINTMENT_COLOR_OPTIONS: { key: AppointmentColorKey; label: string }[] = [
  { key: 'teal', label: 'Teal' },
  { key: 'blue', label: 'Blue' },
  { key: 'purple', label: 'Purple' },
  { key: 'amber', label: 'Amber' },
  { key: 'orange', label: 'Orange' },
  { key: 'green', label: 'Green' },
  { key: 'slate', label: 'Slate' },
  { key: 'rose', label: 'Rose' },
];

const DEFAULT_COLOR_BY_APPOINTMENT_TYPE: Record<AppointmentTypeValue, AppointmentColorKey> = {
  WellnessPreventiveCare: 'teal',
  SickVisit: 'blue',
  Recheck: 'green',
  TechnicianAppointment: 'amber',
  Vaccination: 'teal',
  SurgeryProcedure: 'purple',
  DropOff: 'slate',
  EmergencyUrgent: 'orange',
  Telemedicine: 'blue',
  Euthanasia: 'rose',
  BoardingNonMedical: 'slate',
};

function startOfDay(date: Date): Date {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function startOfWeek(date: Date): Date {
  const next = startOfDay(date);
  next.setDate(next.getDate() - next.getDay());
  return next;
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS);
}

function formatShortDate(date: Date): string {
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function formatRange(anchorDate: Date, view: SchedulerView): string {
  if (view === 'day') {
    return anchorDate.toLocaleDateString([], {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });
  }

  const start = startOfWeek(anchorDate);
  const end = addDays(start, 6);
  return `${formatShortDate(start)} - ${formatShortDate(end)}, ${end.getFullYear()}`;
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function formatHour(hour: number): string {
  const date = new Date();
  date.setHours(hour, 0, 0, 0);
  return date.toLocaleTimeString([], { hour: 'numeric' });
}

function timeRange(appointment: SchedulerAppointment): string {
  const startsAt = new Date(appointment.scheduledAt);
  const endsAt = new Date(
    startsAt.getTime() + (appointment.expectedDurationMinutes ?? 30) * 60_000,
  );
  const startLabel = formatTime(startsAt);
  const endLabel = formatTime(endsAt);
  const startMeridiem = startLabel.match(/\s(AM|PM)$/)?.[1];
  const endMeridiem = endLabel.match(/\s(AM|PM)$/)?.[1];

  if (startMeridiem && startMeridiem === endMeridiem) {
    return `${startLabel.replace(/\s(AM|PM)$/, '')}-${endLabel}`;
  }

  return `${startLabel}-${endLabel}`;
}

function appointmentCardTypeLabel(type: string): string {
  return CARD_TYPE_LABELS[type] ?? appointmentTypeLabel(type);
}

function appointmentClientName(appointment: SchedulerAppointment): string {
  return appointment.client ? clientDisplayName(appointment.client) : 'No client linked';
}

function appointmentPatientName(appointment: SchedulerAppointment): string {
  return appointment.patient?.name ?? 'Unassigned patient';
}

function appointmentProviderName(appointment: SchedulerAppointment): string | null {
  return appointment.provider?.displayName ?? null;
}

function appointmentPrimaryMeta(appointment: SchedulerAppointment): string {
  return `${timeRange(appointment)} · ${appointmentCardTypeLabel(appointment.type)}`;
}

function appointmentCareTeamMeta(appointment: SchedulerAppointment): string | null {
  const parts: string[] = [];
  const provider = appointmentProviderName(appointment);
  if (provider) {
    parts.push(provider);
  }
  if (appointment.room) {
    parts.push(appointment.room);
  }
  return parts.length > 0 ? parts.join(' · ') : null;
}

function appointmentColorKey(appointment: SchedulerAppointment): AppointmentColorKey {
  if (isAppointmentColorKey(appointment.colorKey)) {
    return appointment.colorKey;
  }
  if (isAppointmentTypeValue(appointment.type)) {
    return DEFAULT_COLOR_BY_APPOINTMENT_TYPE[appointment.type];
  }
  return 'slate';
}

function isAppointmentColorKey(value: string | null | undefined): value is AppointmentColorKey {
  return APPOINTMENT_COLOR_OPTIONS.some((option) => option.key === value);
}

function isAppointmentTypeValue(value: string): value is AppointmentTypeValue {
  return (APPOINTMENT_TYPES as readonly string[]).includes(value);
}

function appointmentColorLabel(colorKey: string | null | undefined): string {
  const safeColorKey = isAppointmentColorKey(colorKey) ? colorKey : 'slate';
  return APPOINTMENT_COLOR_OPTIONS.find((option) => option.key === safeColorKey)?.label ?? 'Slate';
}

function isSameDay(a: Date, b: Date): boolean {
  return startOfDay(a).getTime() === startOfDay(b).getTime();
}

function minutesSinceClinicOpen(date: Date): number {
  return (date.getHours() - CLINIC_START_HOUR) * 60 + date.getMinutes();
}

function inVisibleHours(appointment: SchedulerAppointment): boolean {
  const startsAt = new Date(appointment.scheduledAt);
  const minutes = minutesSinceClinicOpen(startsAt);
  return minutes >= 0 && minutes < (CLINIC_END_HOUR - CLINIC_START_HOUR) * 60;
}

function appointmentStyle(appointment: SchedulerAppointment): { top: string; height: string } {
  const minutes = minutesSinceClinicOpen(new Date(appointment.scheduledAt));
  const duration = Math.max(90, appointment.expectedDurationMinutes ?? 30);
  const total = (CLINIC_END_HOUR - CLINIC_START_HOUR) * 60;
  return {
    top: `${(minutes / total) * 100}%`,
    height: `${(duration / total) * 100}%`,
  };
}

function uniqueAppointments(appointments: SchedulerAppointment[]): SchedulerAppointment[] {
  const byId = new Map<string, SchedulerAppointment>();
  for (const appointment of appointments) {
    byId.set(appointment.id, appointment);
  }
  return Array.from(byId.values()).sort(
    (a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime(),
  );
}

function toSchedulerAppointment(appointment: DashboardAppointmentSummary): SchedulerAppointment {
  return { ...appointment, room: null };
}

function createFallbackAppointments(anchorDate: Date): SchedulerAppointment[] {
  if (process.env.NODE_ENV === 'production') {
    return [];
  }

  const weekStart = startOfWeek(anchorDate);
  const makeDate = (dayOffset: number, hour: number, minute = 0) => {
    const date = addDays(weekStart, dayOffset);
    date.setHours(hour, minute, 0, 0);
    return date.toISOString();
  };

  return [
    {
      id: 'fallback-bella',
      type: 'WellnessPreventiveCare',
      reason: 'Wellness visit',
      state: 'Scheduled',
      scheduledAt: makeDate(2, 9),
      expectedDurationMinutes: 30,
      colorKey: 'teal',
      patient: { id: 'fallback-patient-bella', name: 'Bella', species: 'Canine' },
      client: { id: 'fallback-client-sarah', firstName: 'Sarah', lastName: 'Johnson' },
      provider: { id: 'fallback-provider-patel', displayName: 'Dr. Patel', role: 'VETERINARIAN' },
      room: 'Exam Room 1',
    },
    {
      id: 'fallback-milo',
      type: 'SickVisit',
      reason: 'Sick visit',
      state: 'Confirmed',
      scheduledAt: makeDate(2, 10, 30),
      expectedDurationMinutes: 45,
      colorKey: 'blue',
      patient: { id: 'fallback-patient-milo', name: 'Milo', species: 'Feline' },
      client: { id: 'fallback-client-lee', firstName: 'Jordan', lastName: 'Lee' },
      provider: { id: 'fallback-provider-kim', displayName: 'Dr. Kim', role: 'VETERINARIAN' },
      room: 'Exam Room 2',
    },
    {
      id: 'fallback-daisy',
      type: 'TechnicianAppointment',
      reason: 'Technician appointment',
      state: 'Arrived',
      scheduledAt: makeDate(4, 14),
      expectedDurationMinutes: 30,
      colorKey: 'amber',
      patient: { id: 'fallback-patient-daisy', name: 'Daisy', species: 'Canine' },
      client: { id: 'fallback-client-morgan', firstName: 'Morgan', lastName: 'Reed' },
      provider: { id: 'fallback-provider-carter', displayName: 'Ben Carter', role: 'TECHNICIAN' },
      room: 'Treatment',
    },
    {
      id: 'fallback-pepper',
      type: 'Recheck',
      reason: 'Recheck',
      state: 'Scheduled',
      scheduledAt: makeDate(5, 16),
      expectedDurationMinutes: 30,
      colorKey: 'green',
      patient: { id: 'fallback-patient-pepper', name: 'Pepper', species: 'Rabbit' },
      client: { id: 'fallback-client-nguyen', firstName: 'Avery', lastName: 'Nguyen' },
      provider: null,
      room: 'Consult',
    },
  ];
}

function slotStartsAt(day: Date, slotIndex: number): Date {
  const startsAt = new Date(day);
  startsAt.setHours(CLINIC_START_HOUR, slotIndex * SLOT_MINUTES, 0, 0);
  return startsAt;
}

function timeSlotsFor(day: Date): SelectedSlot[] {
  return Array.from({ length: SLOT_COUNT }, (_, slotIndex) => {
    const startsAt = slotStartsAt(day, slotIndex);
    return { startsAt, endsAt: new Date(startsAt.getTime() + SLOT_MINUTES * 60_000) };
  });
}

function appointmentsForDay(appointments: SchedulerAppointment[], day: Date): SchedulerAppointment[] {
  return appointments.filter(
    (appointment) => isSameDay(new Date(appointment.scheduledAt), day) && inVisibleHours(appointment),
  );
}

function statusClass(state: string): string {
  if (state === 'Arrived' || state === 'Confirmed') return 'scheduler-status--teal';
  if (state === 'VisitCreated') return 'scheduler-status--blue';
  if (state === 'PreVisitPending' || state === 'Rescheduled') return 'scheduler-status--purple';
  if (state === 'Cancelled' || state === 'NoShow') return 'scheduler-status--muted';
  if (state === 'Completed') return 'scheduler-status--green';
  return 'scheduler-status--scheduled';
}

export function SchedulerPage() {
  const today = useMemo(() => startOfDay(new Date()), []);
  const [view, setView] = useState<SchedulerView>('week');
  const [anchorDate, setAnchorDate] = useState(today);
  const [appointments, setAppointments] = useState<SchedulerAppointment[]>([]);
  const [providers, setProviders] = useState<StaffMember[]>([]);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [providerFilter, setProviderFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedAppointment, setSelectedAppointment] = useState<SchedulerAppointment | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<SelectedSlot | null>(null);

  const loadSchedulerData = useCallback(
    async (signal?: AbortSignal) => {
      setLoading(true);
      try {
        const requestInit: RequestInit = signal
          ? { cache: 'no-store', signal }
          : { cache: 'no-store' };
        const [dashboardResponse, staffResponse] = await Promise.all([
          fetch('/api/operations/dashboard', requestInit),
          fetch('/api/staff?canReceiveAppointments=true', requestInit),
        ]);

        const dashboard = dashboardResponse.ok
          ? ((await dashboardResponse.json()) as OperationsDashboard)
          : null;
        const staff = staffResponse.ok ? ((await staffResponse.json()) as StaffMember[]) : [];

        const loadedAppointments = dashboard
          ? uniqueAppointments([
              ...dashboard.todaysAppointments.map(toSchedulerAppointment),
              ...dashboard.upcomingAppointments.map(toSchedulerAppointment),
            ])
          : [];

        setAppointments(
          loadedAppointments.length > 0 ? loadedAppointments : createFallbackAppointments(anchorDate),
        );
        setGeneratedAt(dashboard?.generatedAt ?? new Date().toISOString());
        setProviders(staff);
      } catch (caught) {
        if (!(caught instanceof DOMException && caught.name === 'AbortError')) {
          setAppointments(createFallbackAppointments(anchorDate));
          setGeneratedAt(new Date().toISOString());
        }
      } finally {
        setLoading(false);
      }
    },
    [anchorDate],
  );

  useEffect(() => {
    const controller = new AbortController();
    void loadSchedulerData(controller.signal);
    return () => controller.abort();
  }, [loadSchedulerData]);

  const days = useMemo(() => {
    if (view === 'day') {
      return [startOfDay(anchorDate)];
    }
    const weekStart = startOfWeek(anchorDate);
    return Array.from({ length: 7 }, (_, index) => addDays(weekStart, index));
  }, [anchorDate, view]);

  const filteredAppointments = useMemo(
    () =>
      appointments.filter((appointment) => {
        const providerMatches =
          providerFilter === 'all' || appointment.provider?.id === providerFilter;
        const statusMatches = statusFilter === 'all' || appointment.state === statusFilter;
        return providerMatches && statusMatches;
      }),
    [appointments, providerFilter, statusFilter],
  );

  const statusOptions = useMemo(
    () => Array.from(new Set(appointments.map((appointment) => appointment.state))).sort(),
    [appointments],
  );

  function move(offset: number) {
    setAnchorDate((current) => addDays(current, view === 'week' ? offset * 7 : offset));
  }

  return (
    <DashboardShell
      activeHref="/scheduler"
      eyebrow="Scheduler"
      title="Scheduler"
      subtitle="Plan appointments, doctors, rooms, and clinic availability."
    >
      <div className="scheduler-page">
        <SchedulerToolbar
          view={view}
          onViewChange={setView}
          rangeLabel={formatRange(anchorDate, view)}
          generatedAt={generatedAt}
          loading={loading}
          onToday={() => setAnchorDate(today)}
          onPrevious={() => move(-1)}
          onNext={() => move(1)}
        />
        <SchedulerFilters
          providers={providers}
          statuses={statusOptions}
          providerFilter={providerFilter}
          statusFilter={statusFilter}
          onProviderFilterChange={setProviderFilter}
          onStatusFilterChange={setStatusFilter}
        />
        {view === 'week' ? (
          <WeekSchedulerGrid
            days={days}
            appointments={filteredAppointments}
            today={today}
            onSlotClick={setSelectedSlot}
            onAppointmentClick={setSelectedAppointment}
          />
        ) : (
          <DaySchedulerGrid
            day={days[0]!}
            appointments={filteredAppointments}
            today={today}
            onSlotClick={setSelectedSlot}
            onAppointmentClick={setSelectedAppointment}
          />
        )}
      </div>
      {selectedSlot && (
        <NewAppointmentSlotModal
          slot={selectedSlot}
          providers={providers}
          onClose={() => setSelectedSlot(null)}
          onCreated={(appointment) => {
            setSelectedSlot(null);
            setAppointments((current) => uniqueAppointments([...current, appointment]));
            setGeneratedAt(new Date().toISOString());
          }}
        />
      )}
      {selectedAppointment && (
        <AppointmentDetailPopover
          appointment={selectedAppointment}
          onClose={() => setSelectedAppointment(null)}
        />
      )}
    </DashboardShell>
  );
}

function SchedulerToolbar({
  view,
  onViewChange,
  rangeLabel,
  generatedAt,
  loading,
  onToday,
  onPrevious,
  onNext,
}: {
  view: SchedulerView;
  onViewChange: (view: SchedulerView) => void;
  rangeLabel: string;
  generatedAt: string | null;
  loading: boolean;
  onToday: () => void;
  onPrevious: () => void;
  onNext: () => void;
}) {
  return (
    <section className="scheduler-toolbar" aria-label="Scheduler controls">
      <div className="scheduler-toolbar__navigation">
        <button type="button" onClick={onToday}>
          Today
        </button>
        <div className="scheduler-toolbar__stepper" aria-label="Navigate scheduler">
          <button type="button" onClick={onPrevious} aria-label="Previous date range">
            <span aria-hidden="true">&lt;</span>
          </button>
          <button type="button" onClick={onNext} aria-label="Next date range">
            <span aria-hidden="true">&gt;</span>
          </button>
        </div>
        <strong>{rangeLabel}</strong>
      </div>
      <div className="scheduler-toolbar__meta">
        <span className="scheduler-live-status">
          Live · {loading ? 'Updating' : `Updated ${generatedAt ? formatTime(new Date(generatedAt)) : 'now'}`}
        </span>
        <SchedulerViewToggle view={view} onViewChange={onViewChange} />
      </div>
    </section>
  );
}

function SchedulerViewToggle({
  view,
  onViewChange,
}: {
  view: SchedulerView;
  onViewChange: (view: SchedulerView) => void;
}) {
  return (
    <div className="scheduler-view-toggle" aria-label="Calendar view">
      {(['day', 'week'] as const).map((option) => (
        <button
          key={option}
          type="button"
          className={view === option ? 'scheduler-view-toggle__button--active' : undefined}
          aria-pressed={view === option}
          onClick={() => onViewChange(option)}
        >
          {option === 'day' ? 'Day' : 'Week'}
        </button>
      ))}
    </div>
  );
}

function SchedulerFilters({
  providers,
  statuses,
  providerFilter,
  statusFilter,
  onProviderFilterChange,
  onStatusFilterChange,
}: {
  providers: StaffMember[];
  statuses: string[];
  providerFilter: string;
  statusFilter: string;
  onProviderFilterChange: (value: string) => void;
  onStatusFilterChange: (value: string) => void;
}) {
  return (
    <section className="scheduler-filters" aria-label="Scheduler filters">
      <label>
        <span>Doctor / Provider</span>
        <select value={providerFilter} onChange={(event) => onProviderFilterChange(event.target.value)}>
          <option value="all">All providers</option>
          {providers.map((provider) => (
            <option key={provider.id} value={provider.id}>
              {provider.displayName}
            </option>
          ))}
        </select>
      </label>
      <label>
        <span>Room</span>
        <select disabled value="all" aria-label="Room filter unavailable">
          <option value="all">Rooms not connected yet</option>
        </select>
      </label>
      <label>
        <span>Appointment status</span>
        <select value={statusFilter} onChange={(event) => onStatusFilterChange(event.target.value)}>
          <option value="all">All statuses</option>
          {statuses.map((status) => (
            <option key={status} value={status}>
              {STATUS_LABELS[status] ?? status}
            </option>
          ))}
        </select>
      </label>
    </section>
  );
}

function WeekSchedulerGrid({
  days,
  appointments,
  today,
  onSlotClick,
  onAppointmentClick,
}: {
  days: Date[];
  appointments: SchedulerAppointment[];
  today: Date;
  onSlotClick: (slot: SelectedSlot) => void;
  onAppointmentClick: (appointment: SchedulerAppointment) => void;
}) {
  return (
    <section className="scheduler-calendar-card" aria-label="Week appointment calendar">
      <div className="scheduler-week">
        <div className="scheduler-week__header">
          <div className="scheduler-time-gutter" aria-hidden="true" />
          {days.map((day) => (
            <div
              key={day.toISOString()}
              className={
                isSameDay(day, today)
                  ? 'scheduler-day-heading scheduler-day-heading--today'
                  : 'scheduler-day-heading'
              }
            >
              <span>{day.toLocaleDateString([], { weekday: 'short' })}</span>
              <strong>{day.getDate()}</strong>
            </div>
          ))}
        </div>
        <div className="scheduler-week__body">
          <TimeColumn />
          {days.map((day) => (
            <SchedulerDayColumn
              key={day.toISOString()}
              day={day}
              today={today}
              appointments={appointmentsForDay(appointments, day)}
              compact
              onSlotClick={onSlotClick}
              onAppointmentClick={onAppointmentClick}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

function DaySchedulerGrid({
  day,
  appointments,
  today,
  onSlotClick,
  onAppointmentClick,
}: {
  day: Date;
  appointments: SchedulerAppointment[];
  today: Date;
  onSlotClick: (slot: SelectedSlot) => void;
  onAppointmentClick: (appointment: SchedulerAppointment) => void;
}) {
  return (
    <section className="scheduler-calendar-card scheduler-calendar-card--day" aria-label="Day appointment calendar">
      <div
        className={
          isSameDay(day, today)
            ? 'scheduler-day-view__header scheduler-day-view__header--today'
            : 'scheduler-day-view__header'
        }
      >
        <div>
          <span>{day.toLocaleDateString([], { weekday: 'long' })}</span>
          <strong>{day.toLocaleDateString([], { month: 'long', day: 'numeric' })}</strong>
        </div>
        <p>{appointmentsForDay(appointments, day).length} appointments</p>
      </div>
      <div className="scheduler-week__body scheduler-week__body--day">
        <TimeColumn />
        <SchedulerDayColumn
          day={day}
          today={today}
          appointments={appointmentsForDay(appointments, day)}
          onSlotClick={onSlotClick}
          onAppointmentClick={onAppointmentClick}
        />
      </div>
    </section>
  );
}

function TimeColumn() {
  return (
    <div className="scheduler-time-column" aria-hidden="true">
      {Array.from({ length: CLINIC_END_HOUR - CLINIC_START_HOUR }, (_, index) => (
        <span key={index}>{formatHour(CLINIC_START_HOUR + index)}</span>
      ))}
    </div>
  );
}

function SchedulerDayColumn({
  day,
  today,
  appointments,
  compact,
  onSlotClick,
  onAppointmentClick,
}: {
  day: Date;
  today: Date;
  appointments: SchedulerAppointment[];
  compact?: boolean;
  onSlotClick: (slot: SelectedSlot) => void;
  onAppointmentClick: (appointment: SchedulerAppointment) => void;
}) {
  return (
    <div
      className={
        isSameDay(day, today)
          ? 'scheduler-day-column scheduler-day-column--today'
          : 'scheduler-day-column'
      }
    >
      <div className="scheduler-day-column__slots">
        {timeSlotsFor(day).map((slot) => (
          <button
            key={slot.startsAt.toISOString()}
            type="button"
            className="scheduler-open-slot"
            aria-label={`New appointment at ${formatTime(slot.startsAt)}`}
            onClick={() => onSlotClick(slot)}
          />
        ))}
      </div>
      {appointments.map((appointment) => (
        <SchedulerAppointmentCard
          key={appointment.id}
          appointment={appointment}
          compact={compact}
          style={appointmentStyle(appointment)}
          onClick={() => onAppointmentClick(appointment)}
        />
      ))}
    </div>
  );
}

function SchedulerAppointmentCard({
  appointment,
  compact = false,
  style,
  onClick,
}: {
  appointment: SchedulerAppointment;
  compact?: boolean | undefined;
  style: { top: string; height: string };
  onClick: () => void;
}) {
  const careTeamMeta = appointmentCareTeamMeta(appointment);
  const colorKey = appointmentColorKey(appointment);

  return (
    <button
      type="button"
      className={`scheduler-appointment-card ${compact ? 'scheduler-appointment-card--compact' : ''} scheduler-color--${colorKey}`}
      style={style}
      onClick={onClick}
    >
      <strong>{appointmentPatientName(appointment)}</strong>
      <span className="scheduler-appointment-card__client">
        {appointmentClientName(appointment)}
      </span>
      <span className="scheduler-appointment-card__meta scheduler-appointment-card__meta--primary">
        {appointmentPrimaryMeta(appointment)}
      </span>
      {careTeamMeta ? (
        <span className="scheduler-appointment-card__meta scheduler-appointment-card__meta--care-team">
          {careTeamMeta}
        </span>
      ) : null}
      {!compact && (
        <small className="scheduler-appointment-card__status">
          {STATUS_LABELS[appointment.state] ?? appointment.state}
        </small>
      )}
    </button>
  );
}

function ModalFrame({
  title,
  subtitle,
  children,
  onClose,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  useLockBodyScroll(true);

  return (
    <div className="scheduler-modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="scheduler-modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="scheduler-modal__header">
          <div>
            <h2>{title}</h2>
            {subtitle ? <p>{subtitle}</p> : null}
          </div>
          <button type="button" onClick={onClose} aria-label="Close dialog">
            x
          </button>
        </div>
        {children}
      </section>
    </div>
  );
}

function NewAppointmentSlotModal({
  slot,
  providers,
  onClose,
  onCreated,
}: {
  slot: SelectedSlot;
  providers: StaffMember[];
  onClose: () => void;
  onCreated: (appointment: SchedulerAppointment) => void;
}) {
  const [patientQuery, setPatientQuery] = useState('');
  const [patientResults, setPatientResults] = useState<PatientSearchResult[]>([]);
  const [selectedPatient, setSelectedPatient] = useState<PatientSearchResult | null>(null);
  const [patientSearchLoading, setPatientSearchLoading] = useState(false);
  const [appointmentType, setAppointmentType] = useState<AppointmentTypeValue>(
    'WellnessPreventiveCare',
  );
  const [visitReason, setVisitReason] = useState(appointmentTypeLabel('WellnessPreventiveCare'));
  const [durationMinutes, setDurationMinutes] = useState('30');
  const [assignedProviderId, setAssignedProviderId] = useState(
    providers.length === 1 ? providers[0]!.id : '',
  );
  const [colorKey, setColorKey] = useState<AppointmentColorKey>(
    DEFAULT_COLOR_BY_APPOINTMENT_TYPE.WellnessPreventiveCare,
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (providers.length === 1) {
      setAssignedProviderId(providers[0]!.id);
    }
  }, [providers]);

  useEffect(() => {
    const trimmed = patientQuery.trim();
    if (trimmed.length < 2) {
      setPatientResults([]);
      setPatientSearchLoading(false);
      return;
    }

    const controller = new AbortController();
    setPatientSearchLoading(true);
    const timeout = window.setTimeout(() => {
      fetch(`/api/patients/search?query=${encodeURIComponent(trimmed)}&limit=6`, {
        signal: controller.signal,
      })
        .then((response) => (response.ok ? (response.json() as Promise<PatientSearchResult[]>) : []))
        .then(setPatientResults)
        .catch((caught) => {
          if (!(caught instanceof DOMException && caught.name === 'AbortError')) {
            setPatientResults([]);
          }
        })
        .finally(() => setPatientSearchLoading(false));
    }, 220);

    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [patientQuery]);

  function handleAppointmentTypeChange(value: AppointmentTypeValue) {
    setAppointmentType(value);
    setColorKey(DEFAULT_COLOR_BY_APPOINTMENT_TYPE[value]);
    setVisitReason((current) => (current.trim() ? current : appointmentTypeLabel(value)));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedPatient) {
      setError('Choose an existing patient before creating the appointment.');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const response = await fetch('/api/appointments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patientId: selectedPatient.id,
          clientId: selectedPatient.primaryClient?.id,
          appointmentType,
          visitReason: visitReason.trim() || appointmentTypeLabel(appointmentType),
          startTime: slot.startsAt.toISOString(),
          expectedDurationMinutes: Number(durationMinutes),
          assignedProviderId: assignedProviderId || undefined,
          colorKey,
        }),
      });

      if (!response.ok) {
        setError('Could not create the appointment. Check the fields and try again.');
        return;
      }

      const created = (await response.json()) as CreatedAppointmentResponse;
      const selectedProvider =
        providers.find((provider) => provider.id === (created.providerId ?? assignedProviderId)) ?? null;

      onCreated({
        id: created.id,
        type: created.type,
        reason: created.reason,
        state: created.state,
        scheduledAt: created.scheduledAt,
        expectedDurationMinutes: created.expectedDurationMinutes,
        colorKey: created.colorKey,
        patient: {
          id: selectedPatient.id,
          name: selectedPatient.name,
          species: selectedPatient.species,
        },
        client: selectedPatient.primaryClient
          ? {
              id: selectedPatient.primaryClient.id,
              firstName: selectedPatient.primaryClient.firstName,
              lastName: selectedPatient.primaryClient.lastName,
            }
          : null,
        provider: selectedProvider
          ? {
              id: selectedProvider.id,
              displayName: selectedProvider.displayName,
              role: selectedProvider.role,
            }
          : null,
        room: null,
      });
    } catch {
      setError('Could not reach the server. Try again.');
    } finally {
      setSubmitting(false);
    }
  }

  const endTime = new Date(slot.startsAt.getTime() + Number(durationMinutes) * 60_000);
  const newPatientHref = `/patients/new?scheduledAt=${encodeURIComponent(slot.startsAt.toISOString())}`;

  return (
    <ModalFrame
      title="New Appointment"
      subtitle={`Schedule a patient visit for ${slot.startsAt.toLocaleDateString([], {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
      })} at ${formatTime(slot.startsAt)}.`}
      onClose={onClose}
    >
      <form className="scheduler-booking-form" onSubmit={handleSubmit}>
        <div className="scheduler-booking-form__summary">
          <div>
            <span>Date</span>
            <strong>
              {slot.startsAt.toLocaleDateString([], {
                weekday: 'long',
                month: 'long',
                day: 'numeric',
                year: 'numeric',
              })}
            </strong>
          </div>
          <div>
            <span>Time</span>
            <strong>
              {formatTime(slot.startsAt)} - {formatTime(endTime)}
            </strong>
          </div>
        </div>

        <fieldset className="scheduler-booking-fieldset">
          <legend>Patient</legend>
          <label htmlFor="scheduler-patient-search">Existing patient</label>
          <input
            id="scheduler-patient-search"
            type="search"
            value={patientQuery}
            onChange={(event) => {
              setPatientQuery(event.target.value);
              setSelectedPatient(null);
            }}
            placeholder="Search pet, owner, phone, or email"
            autoFocus
          />
          {patientSearchLoading ? (
            <p className="scheduler-modal__hint">Searching...</p>
          ) : null}
          {patientResults.length > 0 ? (
            <div className="scheduler-patient-results">
              {patientResults.map((patient) => (
                <button
                  key={patient.id}
                  type="button"
                  className={
                    selectedPatient?.id === patient.id
                      ? 'scheduler-patient-result scheduler-patient-result--selected'
                      : 'scheduler-patient-result'
                  }
                  onClick={() => {
                    setSelectedPatient(patient);
                    setPatientQuery(patient.name);
                  }}
                >
                  <strong>{patient.name}</strong>
                  <span>
                    {patient.species}
                    {patient.primaryClient ? ` · ${clientDisplayName(patient.primaryClient)}` : ''}
                  </span>
                </button>
              ))}
            </div>
          ) : null}
          {selectedPatient ? (
            <div className="scheduler-selected-patient">
              <strong>{selectedPatient.name}</strong>
              <span>
                {selectedPatient.primaryClient
                  ? `${clientDisplayName(selectedPatient.primaryClient)}${
                      selectedPatient.primaryClient.phone ? ` · ${selectedPatient.primaryClient.phone}` : ''
                    }`
                  : 'No owner linked'}
              </span>
            </div>
          ) : null}
          <Link href={newPatientHref} className="scheduler-inline-link" onClick={onClose}>
            Create New Patient
          </Link>
        </fieldset>

        <div className="scheduler-booking-grid">
          <label>
            <span>Appointment type</span>
            <select
              value={appointmentType}
              onChange={(event) =>
                handleAppointmentTypeChange(event.target.value as AppointmentTypeValue)
              }
              required
            >
              {APPOINTMENT_TYPES.map((type) => (
                <option key={type} value={type}>
                  {appointmentTypeLabel(type)}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Duration</span>
            <select
              value={durationMinutes}
              onChange={(event) => setDurationMinutes(event.target.value)}
              required
            >
              {[15, 30, 45, 60, 90, 120].map((minutes) => (
                <option key={minutes} value={minutes}>
                  {minutes} minutes
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Doctor / Provider</span>
            <select
              value={assignedProviderId}
              onChange={(event) => setAssignedProviderId(event.target.value)}
              disabled={providers.length === 0}
            >
              {providers.length === 0 ? (
                <option value="">Provider not connected yet</option>
              ) : (
                <>
                  <option value="">Unassigned</option>
                  {providers.map((provider) => (
                    <option key={provider.id} value={provider.id}>
                      {provider.displayName}
                    </option>
                  ))}
                </>
              )}
            </select>
          </label>
          <label>
            <span>Visit reason</span>
            <input
              type="text"
              value={visitReason}
              onChange={(event) => setVisitReason(event.target.value)}
              maxLength={500}
              required
            />
          </label>
        </div>

        <fieldset className="scheduler-color-picker">
          <legend>Calendar color</legend>
          <p>Used to make the schedule easier to scan.</p>
          <div className="scheduler-color-picker__chips">
            {APPOINTMENT_COLOR_OPTIONS.map((option) => (
              <button
                key={option.key}
                type="button"
                className={
                  colorKey === option.key
                    ? `scheduler-color-chip scheduler-color-chip--selected scheduler-color-chip--${option.key}`
                    : `scheduler-color-chip scheduler-color-chip--${option.key}`
                }
                aria-pressed={colorKey === option.key}
                onClick={() => setColorKey(option.key)}
              >
                <span aria-hidden="true" />
                {option.label}
              </button>
            ))}
          </div>
        </fieldset>

        {error ? (
          <p className="scheduler-modal__error" role="alert">
            {error}
          </p>
        ) : null}

        <div className="scheduler-modal__actions">
          <button type="submit" className="scheduler-primary-action" disabled={submitting}>
            {submitting ? 'Creating...' : 'Create appointment'}
          </button>
        </div>
      </form>
    </ModalFrame>
  );
}

function AppointmentDetailPopover({
  appointment,
  onClose,
}: {
  appointment: SchedulerAppointment;
  onClose: () => void;
}) {
  return (
    <ModalFrame title={appointmentPatientName(appointment)} onClose={onClose}>
      <dl className="scheduler-detail-list">
        <div>
          <dt>Client</dt>
          <dd>{appointmentClientName(appointment)}</dd>
        </div>
        <div>
          <dt>Time</dt>
          <dd>{timeRange(appointment)}</dd>
        </div>
        <div>
          <dt>Visit type</dt>
          <dd>{appointmentTypeLabel(appointment.type)}</dd>
        </div>
        <div>
          <dt>Doctor</dt>
          <dd>{appointmentProviderName(appointment) ?? 'Unassigned'}</dd>
        </div>
        <div>
          <dt>Room</dt>
          <dd>{appointment.room ?? 'Not assigned'}</dd>
        </div>
        <div>
          <dt>Status</dt>
          <dd>
            <span className={`scheduler-status-chip ${statusClass(appointment.state)}`}>
              {STATUS_LABELS[appointment.state] ?? appointment.state}
            </span>
          </dd>
        </div>
        <div>
          <dt>Calendar color</dt>
          <dd>
            <span className={`scheduler-color-readout scheduler-color-readout--${appointmentColorKey(appointment)}`}>
              {appointmentColorLabel(appointmentColorKey(appointment))}
            </span>
          </dd>
        </div>
      </dl>
      <div className="scheduler-modal__actions">
        {appointment.patient && (
          <Link href={`/patients/${appointment.patient.id}`} onClick={onClose}>
            Open Patient Profile
          </Link>
        )}
        <Link href="/today" onClick={onClose}>
          View Today Flow
        </Link>
      </div>
    </ModalFrame>
  );
}
