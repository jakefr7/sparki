'use client';

import Link from 'next/link';
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { DashboardShell } from './dashboard-shell';
import { useLockBodyScroll } from '../hooks/use-lock-body-scroll';
import {
  AppointmentConfirmationModal,
  NewAppointmentModal,
  type NewAppointmentCreatedSummary,
} from './new-appointment-modal';
import {
  appointmentTypeLabel,
  clientDisplayName,
  confirmationStatusLabel,
  recordsPrepStatusLabel,
  CONFIRMATION_STATUSES,
  type DashboardAppointmentSummary,
  type AppointmentTypeValue,
  type OperationsDashboard,
  type StaffMember,
} from '../lib/patient-types';

type SchedulerView = 'day' | 'week';

export interface SchedulerAppointment extends DashboardAppointmentSummary {
  room: string | null;
}

interface SelectedSlot {
  startsAt: Date;
  endsAt: Date;
}

type AppointmentColorKey =
  'teal' | 'blue' | 'purple' | 'amber' | 'orange' | 'green' | 'slate' | 'rose';

export interface SchedulerAppointmentTypeSetting {
  id: string;
  appointmentType: AppointmentTypeValue | null;
  name: string;
  color: string;
  isActive: boolean;
  sortOrder: number;
  defaultDurationMinutes: number;
  providers?: Array<{ id: string; displayName: string; role: string; isActive: boolean }>;
  isBookable?: boolean;
}
type AppointmentTypeSetting = SchedulerAppointmentTypeSetting;

interface SchedulerSlotTemplate {
  id: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  label: string;
  color: string;
  staffId: string | null;
  room: string | null;
  isActive: boolean;
}

interface SchedulerConfig {
  settings: { slotIntervalMinutes: number };
  appointmentTypes: SchedulerAppointmentTypeSetting[];
  slotTemplates: SchedulerSlotTemplate[];
  canManage: boolean;
}

const CLINIC_START_HOUR = 7;
const CLINIC_END_HOUR = 19;
const DAY_MS = 24 * 60 * 60 * 1000;
const FALLBACK_APPOINTMENT_COLOR = '#475569';

const LEGACY_COLOR_HEX: Record<AppointmentColorKey, string> = {
  teal: '#0D9488',
  blue: '#2563EB',
  purple: '#7C3AED',
  amber: '#D97706',
  orange: '#EA580C',
  green: '#16A34A',
  slate: '#475569',
  rose: '#BE123C',
};

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

const FALLBACK_SCHEDULER_CONFIG: SchedulerConfig = {
  settings: { slotIntervalMinutes: 30 },
  appointmentTypes: [],
  slotTemplates: [],
  canManage: false,
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
    startsAt.getTime() + (appointment.expectedDurationMinutes ?? 0) * 60_000,
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

function configuredAppointmentTypeLabel(
  type: string,
  appointmentTypes: AppointmentTypeSetting[],
): string {
  const configured = appointmentTypes.find((setting) => setting.appointmentType === type);
  return configured?.name ?? appointmentCardTypeLabel(type);
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

function appointmentPrimaryMeta(
  appointment: SchedulerAppointment,
  appointmentTypes: AppointmentTypeSetting[],
): string {
  return `${timeRange(appointment)} · ${configuredAppointmentTypeLabel(appointment.type, appointmentTypes)}`;
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

function isHexColor(value: string | null | undefined): value is string {
  return Boolean(value && /^#[0-9A-Fa-f]{6}$/.test(value));
}

function appointmentColor(
  appointment: SchedulerAppointment,
  appointmentTypes: AppointmentTypeSetting[],
): string {
  if (isHexColor(appointment.colorKey)) {
    return appointment.colorKey;
  }
  if (isAppointmentColorKey(appointment.colorKey)) {
    return LEGACY_COLOR_HEX[appointment.colorKey];
  }
  const configured = appointmentTypes.find(
    (setting) => setting.appointmentType === appointment.type && setting.isActive,
  );
  return configured?.color ?? FALLBACK_APPOINTMENT_COLOR;
}

function isAppointmentColorKey(value: string | null | undefined): value is AppointmentColorKey {
  return APPOINTMENT_COLOR_OPTIONS.some((option) => option.key === value);
}

function appointmentColorLabel(colorKey: string | null | undefined): string {
  if (isHexColor(colorKey)) return colorKey.toUpperCase();
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
  const duration = appointment.expectedDurationMinutes ?? 0;
  const total = (CLINIC_END_HOUR - CLINIC_START_HOUR) * 60;
  return {
    top: `${(minutes / total) * 100}%`,
    height: `${(duration / total) * 100}%`,
  };
}

function colorWithAlpha(color: string, alphaHex: string): string {
  return isHexColor(color) ? `${color}${alphaHex}` : color;
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

function slotStartsAt(day: Date, slotIndex: number, slotIntervalMinutes: number): Date {
  const startsAt = new Date(day);
  startsAt.setHours(CLINIC_START_HOUR, slotIndex * slotIntervalMinutes, 0, 0);
  return startsAt;
}

function slotCount(slotIntervalMinutes: number): number {
  return ((CLINIC_END_HOUR - CLINIC_START_HOUR) * 60) / slotIntervalMinutes;
}

function timeSlotsFor(day: Date, slotIntervalMinutes: number): SelectedSlot[] {
  return Array.from({ length: slotCount(slotIntervalMinutes) }, (_, slotIndex) => {
    const startsAt = slotStartsAt(day, slotIndex, slotIntervalMinutes);
    return { startsAt, endsAt: new Date(startsAt.getTime() + slotIntervalMinutes * 60_000) };
  });
}

function minutesFromTime(value: string): number {
  const [hours = '0', minutes = '0'] = value.split(':');
  return Number(hours) * 60 + Number(minutes);
}

function slotTemplateStyle(template: SchedulerSlotTemplate): CSSProperties {
  const start = minutesFromTime(template.startTime) - CLINIC_START_HOUR * 60;
  const end = minutesFromTime(template.endTime) - CLINIC_START_HOUR * 60;
  const total = (CLINIC_END_HOUR - CLINIC_START_HOUR) * 60;
  return {
    top: `${(Math.max(0, start) / total) * 100}%`,
    height: `${((Math.min(total, end) - Math.max(0, start)) / total) * 100}%`,
    backgroundColor: colorWithAlpha(template.color, '26'),
    borderColor: colorWithAlpha(template.color, '80'),
  };
}

function slotTemplateOverlayStyle(template: SchedulerSlotTemplate): CSSProperties {
  const start = minutesFromTime(template.startTime) - CLINIC_START_HOUR * 60;
  const end = minutesFromTime(template.endTime) - CLINIC_START_HOUR * 60;
  const total = (CLINIC_END_HOUR - CLINIC_START_HOUR) * 60;
  return {
    top: `${(Math.max(0, start) / total) * 100}%`,
    height: `${((Math.min(total, end) - Math.max(0, start)) / total) * 100}%`,
    color: template.color,
    borderColor: colorWithAlpha(template.color, 'a8'),
  };
}

function slotTemplatesForDay(
  templates: SchedulerSlotTemplate[],
  day: Date,
): SchedulerSlotTemplate[] {
  return templates.filter((template) => template.isActive && template.dayOfWeek === day.getDay());
}

function slotOverlapsTemplate(slot: SelectedSlot, templates: SchedulerSlotTemplate[]): boolean {
  const slotStart = slot.startsAt.getHours() * 60 + slot.startsAt.getMinutes();
  const slotEnd = slot.endsAt.getHours() * 60 + slot.endsAt.getMinutes();

  return templates.some((template) => {
    const templateStart = minutesFromTime(template.startTime);
    const templateEnd = minutesFromTime(template.endTime);
    return slotStart < templateEnd && slotEnd > templateStart;
  });
}

function appointmentsForDay(
  appointments: SchedulerAppointment[],
  day: Date,
): SchedulerAppointment[] {
  return appointments.filter(
    (appointment) =>
      isSameDay(new Date(appointment.scheduledAt), day) && inVisibleHours(appointment),
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
  const [currentTime, setCurrentTime] = useState(() => new Date());
  const [view, setView] = useState<SchedulerView>('week');
  const [anchorDate, setAnchorDate] = useState(today);
  const [appointments, setAppointments] = useState<SchedulerAppointment[]>([]);
  const [providers, setProviders] = useState<StaffMember[]>([]);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [schedulerConfig, setSchedulerConfig] =
    useState<SchedulerConfig>(FALLBACK_SCHEDULER_CONFIG);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [moveError, setMoveError] = useState<string | null>(null);
  const [providerFilter, setProviderFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedAppointment, setSelectedAppointment] = useState<SchedulerAppointment | null>(null);
  const [bookingNote, setBookingNote] = useState<string | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<SelectedSlot | null>(null);
  const [confirmedAppointment, setConfirmedAppointment] = useState<NewAppointmentCreatedSummary | null>(null);
  const [editingAppointment, setEditingAppointment] = useState<NewAppointmentCreatedSummary | null>(null);

  const loadSchedulerData = useCallback(
    async (signal?: AbortSignal) => {
      setLoading(true);
      setLoadError(null);
      try {
        const requestInit: RequestInit = signal
          ? { cache: 'no-store', signal }
          : { cache: 'no-store' };
        const [dashboardResponse, staffResponse, configResponse] = await Promise.all([
          fetch('/api/operations/dashboard', requestInit),
          fetch('/api/staff?canReceiveAppointments=true', requestInit),
          fetch('/api/scheduler-config', requestInit),
        ]);

        if (!dashboardResponse.ok) {
          throw new Error(`Schedule failed to load (${dashboardResponse.status})`);
        }
        const dashboard = (await dashboardResponse.json()) as OperationsDashboard;
        const staff = staffResponse.ok ? ((await staffResponse.json()) as StaffMember[]) : [];
        const config = configResponse.ok
          ? ((await configResponse.json()) as SchedulerConfig)
          : FALLBACK_SCHEDULER_CONFIG;

        const loadedAppointments = dashboard
          ? uniqueAppointments([
              ...dashboard.todaysAppointments.map(toSchedulerAppointment),
              ...dashboard.upcomingAppointments.map(toSchedulerAppointment),
            ])
          : [];

        setAppointments(loadedAppointments);
        setGeneratedAt(dashboard.generatedAt);
        setProviders(staff);
        setSchedulerConfig(config);
      } catch (caught) {
        if (!(caught instanceof DOMException && caught.name === 'AbortError')) {
          setAppointments([]);
          setGeneratedAt(null);
          setLoadError(caught instanceof Error ? caught.message : 'Schedule failed to load.');
        }
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    const controller = new AbortController();
    void loadSchedulerData(controller.signal);
    return () => controller.abort();
  }, [loadSchedulerData]);

  useEffect(() => {
    const interval = window.setInterval(() => setCurrentTime(new Date()), 60_000);
    return () => window.clearInterval(interval);
  }, []);

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

  useEffect(() => {
    if (!bookingNote) return;
    const timeout = window.setTimeout(() => setBookingNote(null), 6000);
    return () => window.clearTimeout(timeout);
  }, [bookingNote]);

  async function handleConfirmationStatusChange(appointmentId: string, nextStatus: string) {
    const response = await fetch(
      `/api/appointments/${encodeURIComponent(appointmentId)}/confirmation-status`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirmationStatus: nextStatus }),
      },
    );
    if (!response.ok) {
      throw new Error('Could not update confirmation status.');
    }
    // The PATCH response is the raw Appointment row (no patient/client/
    // provider relations), unlike the dashboard summary this list is built
    // from — merge just the changed field rather than replacing the whole
    // card, or patient/client/provider would disappear from the UI.
    setAppointments((current) =>
      uniqueAppointments(
        current.map((candidate) =>
          candidate.id === appointmentId
            ? { ...candidate, confirmationStatus: nextStatus }
            : candidate,
        ),
      ),
    );
    setSelectedAppointment((current) =>
      current && current.id === appointmentId ? { ...current, confirmationStatus: nextStatus } : current,
    );
  }

  async function handleAppointmentMove(appointmentId: string, slot: SelectedSlot) {
    const appointment = appointments.find((candidate) => candidate.id === appointmentId);
    if (!appointment) return;

    const movedAppointment: SchedulerAppointment = {
      ...appointment,
      scheduledAt: slot.startsAt.toISOString(),
    };
    setMoveError(null);

    const previousAppointments = appointments;
    setAppointments((current) =>
      uniqueAppointments(
        current.map((candidate) => (candidate.id === appointmentId ? movedAppointment : candidate)),
      ),
    );

    try {
      const response = await fetch(`/api/appointments/${encodeURIComponent(appointmentId)}/move`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          startTime: slot.startsAt.toISOString(),
          expectedDurationMinutes: appointment.expectedDurationMinutes ?? undefined,
          assignedProviderId: appointment.provider?.id ?? null,
        }),
      });

      if (!response.ok) {
        let detail = '';
        try {
          const body = (await response.json()) as { message?: string };
          detail = body.message ? ` ${body.message}` : '';
        } catch {
          detail = '';
        }
        throw new Error(`Move rejected.${detail}`);
      }

      const updated = (await response.json()) as DashboardAppointmentSummary;
      setAppointments((current) =>
        uniqueAppointments(
          current.map((candidate) =>
            candidate.id === appointmentId ? toSchedulerAppointment(updated) : candidate,
          ),
        ),
      );
    } catch {
      setAppointments(previousAppointments);
      setMoveError('Could not move the appointment. The schedule was restored.');
    }
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
        {loadError ? (
          <p className="scheduler-inline-error" role="alert">
            {loadError} No placeholder appointments were shown.
          </p>
        ) : null}
        {view === 'week' ? (
          <WeekSchedulerGrid
            days={days}
            appointments={filteredAppointments}
            today={today}
            currentTime={currentTime}
            appointmentTypes={schedulerConfig.appointmentTypes}
            slotIntervalMinutes={schedulerConfig.settings.slotIntervalMinutes}
            slotTemplates={schedulerConfig.slotTemplates}
            onSlotClick={setSelectedSlot}
            onAppointmentClick={setSelectedAppointment}
            onAppointmentMove={handleAppointmentMove}
          />
        ) : (
          <DaySchedulerGrid
            day={days[0]!}
            appointments={filteredAppointments}
            today={today}
            currentTime={currentTime}
            appointmentTypes={schedulerConfig.appointmentTypes}
            slotIntervalMinutes={schedulerConfig.settings.slotIntervalMinutes}
            slotTemplates={schedulerConfig.slotTemplates}
            onSlotClick={setSelectedSlot}
            onAppointmentClick={setSelectedAppointment}
            onAppointmentMove={handleAppointmentMove}
          />
        )}
        {moveError ? (
          <p className="scheduler-inline-error" role="alert">
            {moveError}
          </p>
        ) : null}
        {bookingNote ? (
          <p className="scheduler-inline-note" role="status">
            {bookingNote}
          </p>
        ) : null}
      </div>
      {selectedSlot && (
        <NewAppointmentModal
          editingAppointmentId={editingAppointment?.id ?? null}
          initialVisitReason={editingAppointment?.reason ?? null}
          initialPatient={editingAppointment?.patient ? {
            ...editingAppointment.patient,
            primaryClient: editingAppointment.client ? {
              ...editingAppointment.client,
              phone: null,
              email: null,
              preferredContactMethod: null,
            } : null,
          } : null}
          initialDate={selectedSlot.startsAt}
          initialStartTime={selectedSlot.startsAt}
          initialDurationMinutes={Math.max(
            15,
            Math.round((selectedSlot.endsAt.getTime() - selectedSlot.startsAt.getTime()) / 60_000),
          )}
          initialProviderId={editingAppointment?.provider?.id ?? (providerFilter === 'all' ? null : providerFilter)}
          initialAppointmentTypeId={editingAppointment?.appointmentType ?? null}
          providers={providers}
          appointmentTypes={schedulerConfig.appointmentTypes}
          onClose={() => { setSelectedSlot(null); setEditingAppointment(null); }}
          onCreated={(appointment) => {
            setSelectedSlot(null);
            setEditingAppointment(null);
            setConfirmedAppointment(appointment);
            setAppointments((current) =>
              uniqueAppointments([...current, toSchedulerCreatedAppointment(appointment)]),
            );
            setGeneratedAt(new Date().toISOString());
            setBookingNote('Appointment created. Confirmation not sent yet.');
          }}
        />
      )}
      {confirmedAppointment && (
        <AppointmentConfirmationModal
          appointment={confirmedAppointment}
          onClose={() => setConfirmedAppointment(null)}
          onEdit={() => {
            const appointment = confirmedAppointment;
            const start = new Date(appointment.scheduledAt);
            setConfirmedAppointment(null);
            setEditingAppointment(appointment);
            setSelectedSlot({
              startsAt: start,
              endsAt: new Date(start.getTime() + (appointment.expectedDurationMinutes ?? 30) * 60_000),
            });
          }}
        />
      )}
      {selectedAppointment && (
        <AppointmentDetailPopover
          appointment={selectedAppointment}
          appointmentTypes={schedulerConfig.appointmentTypes}
          onClose={() => setSelectedAppointment(null)}
          onChanged={(updated) => {
            setAppointments((current) => current.map((item) => item.id === updated.id ? updated : item));
            setSelectedAppointment(updated);
          }}
          onReschedule={() => {
            const appointment = selectedAppointment;
            const setting = schedulerConfig.appointmentTypes.find((item) => item.appointmentType === appointment.type || item.name === appointment.type);
            const start = new Date(appointment.scheduledAt);
            setSelectedAppointment(null);
            setEditingAppointment({
              ...appointment,
              appointmentType: setting?.appointmentType ?? 'WellnessPreventiveCare',
              appointmentTypeSettingId: setting?.id ?? '',
            });
            setSelectedSlot({ startsAt: start, endsAt: new Date(start.getTime() + (appointment.expectedDurationMinutes ?? 30) * 60_000) });
          }}
          onCancelled={(id) => {
            setAppointments((current) => current.filter((item) => item.id !== id));
            setSelectedAppointment(null);
            setBookingNote('Appointment cancelled.');
          }}
        />
      )}
    </DashboardShell>
  );
}

function toSchedulerCreatedAppointment(
  appointment: NewAppointmentCreatedSummary,
): SchedulerAppointment {
  // A freshly booked appointment always starts at these defaults (see
  // AppointmentsService.create) — the create response doesn't echo them back,
  // so fill them in rather than widening NewAppointmentCreatedSummary for a
  // value that's never actually variable at creation time.
  return {
    ...appointment,
    primaryCareVetName: null,
    previousClinicName: null,
    previousRecordsSource: null,
    lastSeenAt: null,
    recordsPrepStatus: 'NotStarted',
    confirmationStatus: 'NotSent',
  };
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
          Live ·{' '}
          {loading
            ? 'Updating'
            : `Updated ${generatedAt ? formatTime(new Date(generatedAt)) : 'now'}`}
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
        <select
          value={providerFilter}
          onChange={(event) => onProviderFilterChange(event.target.value)}
        >
          <option value="all">All providers</option>
          {providers.map((provider) => (
            <option key={provider.id} value={provider.id}>
              {provider.displayName}
            </option>
          ))}
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
  currentTime,
  appointmentTypes,
  slotIntervalMinutes,
  slotTemplates,
  onSlotClick,
  onAppointmentClick,
  onAppointmentMove,
}: {
  days: Date[];
  appointments: SchedulerAppointment[];
  today: Date;
  currentTime: Date;
  appointmentTypes: AppointmentTypeSetting[];
  slotIntervalMinutes: number;
  slotTemplates: SchedulerSlotTemplate[];
  onSlotClick: (slot: SelectedSlot) => void;
  onAppointmentClick: (appointment: SchedulerAppointment) => void;
  onAppointmentMove: (appointmentId: string, slot: SelectedSlot) => void;
}) {
  const todayIndex = days.findIndex((day) => isSameDay(day, currentTime));
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
              appointmentTypes={appointmentTypes}
              slotIntervalMinutes={slotIntervalMinutes}
              slotTemplates={slotTemplatesForDay(slotTemplates, day)}
              compact
              onSlotClick={onSlotClick}
              onAppointmentClick={onAppointmentClick}
              onAppointmentMove={onAppointmentMove}
            />
          ))}
          {todayIndex >= 0 ? (
            <CurrentTimeIndicator
              currentTime={currentTime}
              todayIndex={todayIndex}
              columnCount={7}
            />
          ) : null}
        </div>
      </div>
    </section>
  );
}

function DaySchedulerGrid({
  day,
  appointments,
  today,
  currentTime,
  appointmentTypes,
  slotIntervalMinutes,
  slotTemplates,
  onSlotClick,
  onAppointmentClick,
  onAppointmentMove,
}: {
  day: Date;
  appointments: SchedulerAppointment[];
  today: Date;
  currentTime: Date;
  appointmentTypes: AppointmentTypeSetting[];
  slotIntervalMinutes: number;
  slotTemplates: SchedulerSlotTemplate[];
  onSlotClick: (slot: SelectedSlot) => void;
  onAppointmentClick: (appointment: SchedulerAppointment) => void;
  onAppointmentMove: (appointmentId: string, slot: SelectedSlot) => void;
}) {
  return (
    <section
      className="scheduler-calendar-card scheduler-calendar-card--day"
      aria-label="Day appointment calendar"
    >
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
          appointmentTypes={appointmentTypes}
          slotIntervalMinutes={slotIntervalMinutes}
          slotTemplates={slotTemplatesForDay(slotTemplates, day)}
          onSlotClick={onSlotClick}
          onAppointmentClick={onAppointmentClick}
          onAppointmentMove={onAppointmentMove}
        />
        {isSameDay(day, currentTime) ? (
          <CurrentTimeIndicator currentTime={currentTime} todayIndex={0} columnCount={1} />
        ) : null}
      </div>
    </section>
  );
}

function currentTimeTopPercent(currentTime: Date): number | null {
  const minutes = minutesSinceClinicOpen(currentTime);
  const total = (CLINIC_END_HOUR - CLINIC_START_HOUR) * 60;
  if (minutes < 0 || minutes > total) return null;
  return (minutes / total) * 100;
}

function CurrentTimeIndicator({
  currentTime,
  todayIndex,
  columnCount,
}: {
  currentTime: Date;
  todayIndex: number;
  columnCount: number;
}) {
  const top = currentTimeTopPercent(currentTime);
  if (top === null) return null;

  const segmentWidth = 100 / columnCount;
  const segmentLeft = todayIndex * segmentWidth;
  const currentTimeLabel = formatTime(currentTime);

  return (
    <div
      className="scheduler-now-indicator"
      style={
        {
          top: `${top}%`,
          '--scheduler-now-dot-left': `${segmentLeft}%`,
          '--scheduler-now-segment-left': `${segmentLeft}%`,
          '--scheduler-now-segment-width': `${segmentWidth}%`,
        } as CSSProperties
      }
      aria-hidden="true"
    >
      <span className="scheduler-now-indicator__label">{currentTimeLabel}</span>
      <span className="scheduler-now-indicator__line" />
      <span className="scheduler-now-indicator__today-segment" />
      <span className="scheduler-now-indicator__dot" />
    </div>
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
  appointmentTypes,
  slotIntervalMinutes,
  slotTemplates,
  compact,
  onSlotClick,
  onAppointmentClick,
  onAppointmentMove,
}: {
  day: Date;
  today: Date;
  appointments: SchedulerAppointment[];
  appointmentTypes: AppointmentTypeSetting[];
  slotIntervalMinutes: number;
  slotTemplates: SchedulerSlotTemplate[];
  compact?: boolean;
  onSlotClick: (slot: SelectedSlot) => void;
  onAppointmentClick: (appointment: SchedulerAppointment) => void;
  onAppointmentMove: (appointmentId: string, slot: SelectedSlot) => void;
}) {
  const [dropTarget, setDropTarget] = useState<string | null>(null);

  return (
    <div
      className={
        isSameDay(day, today)
          ? 'scheduler-day-column scheduler-day-column--today'
          : 'scheduler-day-column'
      }
      style={{ '--scheduler-slot-count': slotCount(slotIntervalMinutes) } as CSSProperties}
    >
      {slotTemplates.map((template) => (
        <div
          key={template.id}
          className="scheduler-slot-template scheduler-slot-template--wash"
          style={slotTemplateStyle(template)}
          aria-hidden="true"
        />
      ))}
      <div
        className="scheduler-day-column__slots"
        style={{ gridTemplateRows: `repeat(${slotCount(slotIntervalMinutes)}, 1fr)` }}
      >
        {timeSlotsFor(day, slotIntervalMinutes).map((slot) => {
          const slotKey = slot.startsAt.toISOString();
          const isInsideScheduleBlock = slotOverlapsTemplate(slot, slotTemplates);
          const slotClassName = [
            'scheduler-open-slot',
            isInsideScheduleBlock ? 'scheduler-open-slot--inside-block' : null,
            dropTarget === slotKey ? 'scheduler-open-slot--drop-target' : null,
          ]
            .filter(Boolean)
            .join(' ');

          return (
            <button
              key={slotKey}
              type="button"
              className={slotClassName}
              aria-label={`New appointment at ${formatTime(slot.startsAt)}`}
              onClick={() => onSlotClick(slot)}
              onDragOver={(event) => {
                event.preventDefault();
                event.dataTransfer.dropEffect = 'move';
                setDropTarget(slotKey);
              }}
              onDragLeave={() => setDropTarget(null)}
              onDrop={(event) => {
                event.preventDefault();
                setDropTarget(null);
                const appointmentId = event.dataTransfer.getData('text/plain');
                if (appointmentId) {
                  onAppointmentMove(appointmentId, slot);
                }
              }}
            >
              <span>+ Add appointment</span>
            </button>
          );
        })}
      </div>
      {appointments.map((appointment) => (
        <SchedulerAppointmentCard
          key={appointment.id}
          appointment={appointment}
          appointmentTypes={appointmentTypes}
          compact={compact}
          style={appointmentStyle(appointment)}
          onClick={() => onAppointmentClick(appointment)}
        />
      ))}
      {slotTemplates.map((template) => (
        <div
          key={`${template.id}-overlay`}
          className="scheduler-slot-template scheduler-slot-template--overlay"
          style={slotTemplateOverlayStyle(template)}
          aria-hidden="true"
        >
          <span>{template.label}</span>
          {template.room ? <small>{template.room}</small> : null}
        </div>
      ))}
    </div>
  );
}

function SchedulerAppointmentCard({
  appointment,
  appointmentTypes,
  compact = false,
  style,
  onClick,
}: {
  appointment: SchedulerAppointment;
  appointmentTypes: AppointmentTypeSetting[];
  compact?: boolean | undefined;
  style: { top: string; height: string };
  onClick: () => void;
}) {
  const careTeamMeta = appointmentCareTeamMeta(appointment);
  const color = appointmentColor(appointment, appointmentTypes);
  const cardStyle: CSSProperties = {
    ...style,
    '--scheduler-card-accent': color,
    '--scheduler-card-bg': colorWithAlpha(color, '14'),
  } as CSSProperties;

  return (
    <button
      type="button"
      className={`scheduler-appointment-card ${compact ? 'scheduler-appointment-card--compact' : ''}`}
      style={cardStyle}
      draggable
      onDragStart={(event) => {
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', appointment.id);
      }}
      onClick={onClick}
    >
      <span className="scheduler-appointment-card__drag" aria-hidden="true">
        ::
      </span>
      <strong>{appointmentPatientName(appointment)}</strong>
      <span className="scheduler-appointment-card__meta scheduler-appointment-card__meta--primary">
        {appointmentPrimaryMeta(appointment, appointmentTypes)}
      </span>
      <span className="scheduler-appointment-card__client">
        {appointmentClientName(appointment)}
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
  children: ReactNode;
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

export function AppointmentDetailPopover({
  appointment,
  appointmentTypes,
  onClose,
  onChanged,
  onReschedule,
  onCancelled,
}: {
  appointment: SchedulerAppointment;
  appointmentTypes: SchedulerAppointmentTypeSetting[];
  onClose: () => void;
  onChanged: (appointment: SchedulerAppointment) => void;
  onReschedule: () => void;
  onCancelled: (appointmentId: string) => void;
}) {
  const color = appointmentColor(appointment, appointmentTypes);
  const startsAt = new Date(appointment.scheduledAt);
  const [note, setNote] = useState(appointment.reason ?? '');
  const [savingNote, setSavingNote] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  async function saveNote() {
    setSavingNote(true);
    setActionError(null);
    try {
      const response = await fetch(`/api/appointments/${encodeURIComponent(appointment.id)}/note`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ note }),
      });
      if (!response.ok) throw new Error('note');
      onChanged({ ...appointment, reason: note.trim() || appointment.type });
    } catch {
      setActionError('Could not save the note. Please try again.');
    } finally {
      setSavingNote(false);
    }
  }

  async function cancelAppointment() {
    setCancelling(true);
    setActionError(null);
    try {
      const response = await fetch(`/api/appointments/${encodeURIComponent(appointment.id)}/cancel`, { method: 'POST' });
      if (response.ok) onCancelled(appointment.id);
      else setActionError('Could not cancel the appointment. Please try again.');
    } finally {
      setCancelling(false);
      setConfirmCancel(false);
    }
  }

  return (
    <ModalFrame title={appointmentPatientName(appointment)} subtitle={configuredAppointmentTypeLabel(appointment.type, appointmentTypes)} onClose={onClose}>
      <div className="appointment-viewer">
        <div className="appointment-viewer__hero" style={{ '--appointment-color': color } as CSSProperties}>
          <div><span>{startsAt.toLocaleDateString([], { weekday: 'long' })}</span><strong>{startsAt.toLocaleDateString([], { month: 'short', day: 'numeric' })}</strong></div>
          <div><span>Appointment time</span><strong>{timeRange(appointment)}</strong><small>{appointment.expectedDurationMinutes ?? 0} minutes</small></div>
          <span className={`scheduler-status-chip ${statusClass(appointment.state)}`}>{STATUS_LABELS[appointment.state] ?? appointment.state}</span>
        </div>
        <dl className="appointment-viewer__facts">
          <div><dt>Patient</dt><dd>{appointmentPatientName(appointment)}</dd></div>
          <div><dt>Client</dt><dd>{appointmentClientName(appointment)}</dd></div>
          <div><dt>Appointment type</dt><dd>{configuredAppointmentTypeLabel(appointment.type, appointmentTypes)}</dd></div>
          <div><dt>Provider</dt><dd>{appointmentProviderName(appointment) ?? 'Unassigned'}</dd></div>
          <div><dt>Room</dt><dd>{appointment.room ?? 'Not assigned'}</dd></div>
          <div><dt>Schedule color</dt><dd><span className="scheduler-color-readout" style={{ '--scheduler-readout-color': color } as CSSProperties}>{appointment.colorKey ? appointmentColorLabel(appointment.colorKey) : 'Type color'}</span></dd></div>
        </dl>
        <div className="appointment-viewer__note">
          <div><label htmlFor="appointment-note">Appointment note</label><small>Visible to the clinic team</small></div>
          <textarea id="appointment-note" value={note} maxLength={500} onChange={(event) => setNote(event.target.value)} placeholder="Add a note for this appointment" />
          <button type="button" onClick={() => void saveNote()} disabled={savingNote || note === appointment.reason}>{savingNote ? 'Saving…' : 'Save Note'}</button>
        </div>
        {actionError ? <p className="scheduler-modal__error" role="alert">{actionError}</p> : null}
        <div className="appointment-viewer__actions">
          <button type="button" className="scheduler-primary-action" onClick={onReschedule}>Reschedule</button>
          {appointment.patient ? <Link href={`/patients/${appointment.patient.id}`} onClick={onClose}>Open Patient Profile</Link> : null}
          <button type="button" className="appointment-viewer__cancel" onClick={() => setConfirmCancel(true)}>Cancel Appointment</button>
        </div>
        {confirmCancel ? (
          <div className="appointment-cancel-confirmation" role="alertdialog" aria-modal="true" aria-labelledby="cancel-appointment-title">
            <div className="appointment-cancel-confirmation__panel">
              <span className="appointment-cancel-confirmation__icon" aria-hidden="true">!</span>
              <h3 id="cancel-appointment-title">Cancel this appointment?</h3>
              <p>{appointmentPatientName(appointment)} will be removed from the schedule. This cannot be undone.</p>
              <div>
                <button type="button" className="scheduler-secondary-action" disabled={cancelling} onClick={() => setConfirmCancel(false)}>No, Keep It</button>
                <button type="button" className="appointment-cancel-confirmation__yes" disabled={cancelling} onClick={() => void cancelAppointment()}>{cancelling ? 'Cancelling…' : 'Yes, Cancel'}</button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </ModalFrame>
  );
}
