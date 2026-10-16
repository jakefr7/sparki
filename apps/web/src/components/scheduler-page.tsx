'use client';

import { AppointmentTextStatus } from './appointment-text-status';
import Link from 'next/link';
import {
  createContext,
  useContext,
  useCallback,
  useEffect,
  useMemo,
  useLayoutEffect,
  useRef,
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
  type StaffMember,
} from '../lib/patient-types';

type SchedulerView = 'day' | 'week';
type SchedulerZoom = 'overview' | 'detail' | 'close';

export type SchedulerAppointment = DashboardAppointmentSummary;

interface SelectedSlot {
  startsAt: Date;
  endsAt: Date;
}

interface PendingAppointmentMove {
  appointmentId: string;
  slot: SelectedSlot;
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
  appointmentTypeIds: string[];
}

interface SchedulerConfig {
  settings: { slotIntervalMinutes: number };
  appointmentTypes: SchedulerAppointmentTypeSetting[];
  slotTemplates: SchedulerSlotTemplate[];
  canManage: boolean;
}

type CalendarHours = { start: number; end: number };
const DEFAULT_HOURS: CalendarHours = { start: 7, end: 19 };
const CalendarHoursContext = createContext(DEFAULT_HOURS);
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

function formatDateTime(date: Date): string {
  return date.toLocaleString([], {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
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

function minutesSinceClinicOpen(date: Date, hours: CalendarHours): number {
  return (date.getHours() - hours.start) * 60 + date.getMinutes();
}

function appointmentStyle(appointment: SchedulerAppointment, hours: CalendarHours): { top: string; height: string } {
  const minutes = minutesSinceClinicOpen(new Date(appointment.scheduledAt), hours);
  const duration = appointment.expectedDurationMinutes ?? 0;
  const total = (hours.end - hours.start) * 60;
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
  return appointment;
}

function slotStartsAt(day: Date, slotIndex: number, slotIntervalMinutes: number, hours: CalendarHours): Date {
  const startsAt = new Date(day);
  startsAt.setHours(hours.start, slotIndex * slotIntervalMinutes, 0, 0);
  return startsAt;
}

function slotCount(slotIntervalMinutes: number, hours: CalendarHours): number {
  return Math.ceil(((hours.end - hours.start) * 60) / slotIntervalMinutes);
}

function timeSlotsFor(day: Date, slotIntervalMinutes: number, hours: CalendarHours): SelectedSlot[] {
  return Array.from({ length: slotCount(slotIntervalMinutes, hours) }, (_, slotIndex) => {
    const startsAt = slotStartsAt(day, slotIndex, slotIntervalMinutes, hours);
    const lastMinute = new Date(day);
    lastMinute.setHours(hours.end, 0, 0, 0);
    return { startsAt, endsAt: new Date(Math.min(lastMinute.getTime(), startsAt.getTime() + slotIntervalMinutes * 60_000)) };
  });
}

function minutesFromTime(value: string): number {
  const [hours = '0', minutes = '0'] = value.split(':');
  return Number(hours) * 60 + Number(minutes);
}

function slotTemplateStyle(template: SchedulerSlotTemplate, hours: CalendarHours): CSSProperties {
  const start = minutesFromTime(template.startTime) - hours.start * 60;
  const end = minutesFromTime(template.endTime) - hours.start * 60;
  const total = (hours.end - hours.start) * 60;
  return {
    top: `${(Math.max(0, start) / total) * 100}%`,
    height: `${((Math.min(total, end) - Math.max(0, start)) / total) * 100}%`,
    backgroundColor: colorWithAlpha(template.color, '26'),
    borderColor: colorWithAlpha(template.color, '80'),
  };
}

function slotTemplateOverlayStyle(template: SchedulerSlotTemplate, hours: CalendarHours): CSSProperties {
  const start = minutesFromTime(template.startTime) - hours.start * 60;
  const end = minutesFromTime(template.endTime) - hours.start * 60;
  const total = (hours.end - hours.start) * 60;
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

function slotContainedByTemplate(slot: SelectedSlot, templates: SchedulerSlotTemplate[]): boolean {
  const slotStart = slot.startsAt.getHours() * 60 + slot.startsAt.getMinutes();
  const slotEnd = slot.endsAt.getHours() * 60 + slot.endsAt.getMinutes();
  return templates.some((template) =>
    template.isActive &&
    template.dayOfWeek === slot.startsAt.getDay() &&
    slotStart >= minutesFromTime(template.startTime) &&
    slotEnd <= minutesFromTime(template.endTime),
  );
}

function templateForAppointment(
  appointment: SchedulerAppointment,
  templates: SchedulerSlotTemplate[],
): SchedulerSlotTemplate | null {
  const startsAt = new Date(appointment.scheduledAt);
  const duration = appointment.expectedDurationMinutes ?? 30;
  const slot = { startsAt, endsAt: new Date(startsAt.getTime() + duration * 60_000) };
  return templates.find((template) => slotContainedByTemplate(slot, [template])) ?? null;
}

function appointmentsForDay(
  appointments: SchedulerAppointment[],
  day: Date,
): SchedulerAppointment[] {
  return appointments.filter(
    (appointment) =>
      isSameDay(new Date(appointment.scheduledAt), day),
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
  const [zoomScale, setZoomScale] = useState(1);
  const zoom: SchedulerZoom = zoomScale >= 1.5 ? 'close' : zoomScale > 1 ? 'detail' : 'overview';
  const calendarRef = useRef<HTMLDivElement>(null);
  const zoomValue = useRef(1);
  const zoomAnchor = useRef<{ grid: HTMLElement; fraction: number; y: number } | null>(null);
  const changeZoom = useCallback((delta: number) => {
    const next = Math.max(1, Math.min(2.5, Math.round((zoomValue.current + delta) * 100) / 100));
    if (next === zoomValue.current) return;
    const grid = calendarRef.current?.querySelector<HTMLElement>('.scheduler-week__body');
    if (grid) {
      const bounds = grid.getBoundingClientRect();
      const y = Math.min(bounds.bottom, Math.max(bounds.top, 180));
      zoomAnchor.current = { grid, fraction: (y - bounds.top) / bounds.height, y };
    }
    zoomValue.current = next;
    setZoomScale(next);
  }, []);

  useLayoutEffect(() => {
    const anchor = zoomAnchor.current;
    if (!anchor) return;
    zoomAnchor.current = null;
    const bounds = anchor.grid.getBoundingClientRect();
    const offset = bounds.top + bounds.height * anchor.fraction - anchor.y;
    let parent = anchor.grid.parentElement;
    while (parent && !/(auto|scroll)/.test(getComputedStyle(parent).overflowY)) parent = parent.parentElement;
    if (parent) parent.scrollTop += offset;
    else window.scrollBy(0, offset);
  }, [zoomScale]);

  const [anchorDate, setAnchorDate] = useState(today);
  const [appointments, setAppointments] = useState<SchedulerAppointment[]>([]);
  const [providers, setProviders] = useState<StaffMember[]>([]);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const scheduleRequest = useRef(0);
  const [schedulerConfig, setSchedulerConfig] =
    useState<SchedulerConfig>(FALLBACK_SCHEDULER_CONFIG);
  const [bookingSetupStatus, setBookingSetupStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [moveError, setMoveError] = useState<string | null>(null);
  const [pendingMove, setPendingMove] = useState<PendingAppointmentMove | null>(null);
  const [draggingAppointmentId, setDraggingAppointmentId] = useState<string | null>(null);
  const [providerFilter, setProviderFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedAppointment, setSelectedAppointment] = useState<SchedulerAppointment | null>(null);
  const [bookingNote, setBookingNote] = useState<string | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<SelectedSlot | null>(null);
  const [confirmedAppointment, setConfirmedAppointment] = useState<NewAppointmentCreatedSummary | null>(null);
  const [editingAppointment, setEditingAppointment] = useState<NewAppointmentCreatedSummary | null>(null);

  const loadSchedulerData = useCallback(
    async (rangeStart: Date, rangeEnd: Date, signal?: AbortSignal, background = false) => {
      const requestId = ++scheduleRequest.current;
      if (!background) { setLoading(true); setBookingSetupStatus('loading'); }
      try {
        const requestInit: RequestInit = signal
          ? { cache: 'no-store', signal }
          : { cache: 'no-store' };
        const rangeQuery = new URLSearchParams({
          startDate: rangeStart.toISOString(),
          endDate: rangeEnd.toISOString(),
        });
        const appointmentsResponse = await fetch(`/api/appointments/schedule?${rangeQuery.toString()}`, requestInit);

        if (!appointmentsResponse.ok) {
          throw new Error(`Schedule failed to load (${appointmentsResponse.status})`);
        }
        const scheduleAppointments =
          (await appointmentsResponse.json()) as DashboardAppointmentSummary[];

        const loadedAppointments = uniqueAppointments(
          scheduleAppointments.map(toSchedulerAppointment),
        );

        {
          const [staffResponse, configResponse] = await Promise.all([
            fetch('/api/staff?canReceiveAppointments=true', requestInit),
            fetch('/api/scheduler-config', requestInit),
          ]);
          if (!staffResponse.ok || !configResponse.ok) throw new Error('Could not load booking setup.');
          const staff = staffResponse.ok ? ((await staffResponse.json()) as StaffMember[]) : [];
          const config = configResponse.ok
            ? ((await configResponse.json()) as SchedulerConfig)
            : FALLBACK_SCHEDULER_CONFIG;
          if (requestId !== scheduleRequest.current || signal?.aborted) return;
          setProviders(staff);
          setSchedulerConfig(config);
          setBookingSetupStatus('ready');
        }

        if (requestId !== scheduleRequest.current || signal?.aborted) return;
        setAppointments(loadedAppointments);
        setGeneratedAt(new Date().toISOString());
        setLoadError(null);
      } catch (caught) {
        if (requestId !== scheduleRequest.current || signal?.aborted) return;
        if (!(caught instanceof DOMException && caught.name === 'AbortError')) {
          if (!background) {
            setBookingSetupStatus('error');
            setAppointments([]);
            setGeneratedAt(null);
          }
          setLoadError(caught instanceof Error ? caught.message : 'Schedule could not be updated.');
        }
      } finally {
        if (!background && requestId === scheduleRequest.current && !signal?.aborted) setLoading(false);
      }
    },
    [],
  );

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

  const calendarHours = useMemo<CalendarHours>(() => {
    let start = DEFAULT_HOURS.start;
    let end = DEFAULT_HOURS.end;
    for (const template of schedulerConfig.slotTemplates) {
      if (!template.isActive || !days.some((day) => day.getDay() === template.dayOfWeek)) continue;
      start = Math.min(start, Math.floor(minutesFromTime(template.startTime) / 60));
      end = Math.max(end, Math.ceil(minutesFromTime(template.endTime) / 60));
    }
    for (const appointment of appointments) {
      const date = new Date(appointment.scheduledAt);
      start = Math.min(start, date.getHours());
      end = Math.max(end, Math.ceil((date.getHours() * 60 + date.getMinutes() + (appointment.expectedDurationMinutes ?? 30)) / 60));
    }
    return { start, end: Math.min(24, end) };
  }, [schedulerConfig.slotTemplates, appointments, days]);

  useEffect(() => {
    const controller = new AbortController();
    const rangeStart = startOfDay(days[0]!);
    const rangeEnd = addDays(startOfDay(days[days.length - 1]!), 1);
    void loadSchedulerData(rangeStart, rangeEnd, controller.signal);
    return () => controller.abort();
  }, [days, loadSchedulerData]);

  useEffect(() => {
    const controller = new AbortController();
    const rangeStart = startOfDay(days[0]!);
    const rangeEnd = addDays(startOfDay(days[days.length - 1]!), 1);
    const update = () => {
      if (!loading && document.visibilityState === 'visible') {
        void loadSchedulerData(rangeStart, rangeEnd, controller.signal, true);
      }
    };
    const interval = window.setInterval(update, 15_000);
    document.addEventListener('visibilitychange', update);
    window.addEventListener('focus', update);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', update);
      window.removeEventListener('focus', update);
      controller.abort();
    };
  }, [days, loadSchedulerData, loading]);

  const visibleSlotMinutes = zoom === 'close'
    ? Math.min(schedulerConfig.settings.slotIntervalMinutes, 15)
    : zoom === 'detail'
      ? Math.min(schedulerConfig.settings.slotIntervalMinutes, 30)
      : schedulerConfig.settings.slotIntervalMinutes;

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

  function requestAppointmentMove(appointmentId: string, slot: SelectedSlot) {
    const appointment = appointments.find((candidate) => candidate.id === appointmentId);
    if (!appointment) return;
    const targetDay = startOfDay(slot.startsAt);
    if (targetDay < today) {
      setMoveError('This appointment can’t be moved to a past date.');
      return;
    }
    const duration = appointment.expectedDurationMinutes ?? 30;
    const fullSlot = {
      startsAt: slot.startsAt,
      endsAt: new Date(slot.startsAt.getTime() + duration * 60_000),
    };
    const restriction = moveRestriction(appointment, fullSlot);
    if (restriction) {
      setMoveError(restriction);
      return;
    }
    const restrictedBlocks = appointment.appointmentTypeSettingId
      ? schedulerConfig.slotTemplates.filter((template) =>
          template.appointmentTypeIds?.includes(appointment.appointmentTypeSettingId!),
        )
      : [];
    if (restrictedBlocks.length > 0 && !slotContainedByTemplate(fullSlot, restrictedBlocks)) {
      const styleName = schedulerConfig.appointmentTypes.find(
        (type) => type.id === appointment.appointmentTypeSettingId,
      )?.name ?? appointment.type;
      setMoveError(`${styleName} can only be moved into a schedule block assigned to that appointment style.`);
      return;
    }
    setMoveError(null);
    setPendingMove({ appointmentId, slot: fullSlot });
  }

  function moveRestriction(appointment: SchedulerAppointment, slot: SelectedSlot): string | null {
    if (startOfDay(slot.startsAt) < today) return 'Past dates are unavailable';
    const duration = appointment.expectedDurationMinutes ?? 30;
    const fullSlot = { startsAt: slot.startsAt, endsAt: new Date(slot.startsAt.getTime() + duration * 60_000) };
    const providerId = appointment.provider?.id ?? null;
    const eligibleDayBlocks = schedulerConfig.slotTemplates.filter((template) =>
      template.isActive &&
      template.dayOfWeek === slot.startsAt.getDay() &&
      (!template.staffId || template.staffId === providerId),
    );
    const restrictedBlocks = appointment.appointmentTypeSettingId
      ? eligibleDayBlocks.filter((template) => template.appointmentTypeIds?.includes(appointment.appointmentTypeSettingId!))
      : [];
    const generalBlocks = eligibleDayBlocks.filter((template) => (template.appointmentTypeIds ?? []).length === 0);
    const styleHasRestrictions = appointment.appointmentTypeSettingId
      ? schedulerConfig.slotTemplates.some((template) => template.appointmentTypeIds?.includes(appointment.appointmentTypeSettingId!))
      : false;
    if (styleHasRestrictions && !slotContainedByTemplate(fullSlot, restrictedBlocks)) {
      return 'Outside this appointment style’s block';
    }
    if (!styleHasRestrictions && !slotContainedByTemplate(fullSlot, generalBlocks)) {
      const insideReservedBlock = slotContainedByTemplate(fullSlot, eligibleDayBlocks);
      return insideReservedBlock
        ? 'Reserved for other appointment styles'
        : 'Outside available scheduling hours';
    }
    const targetBlock = (styleHasRestrictions ? restrictedBlocks : generalBlocks)
      .find((template) => slotContainedByTemplate(fullSlot, [template]));
    const conflict = appointments.some((candidate) => {
      if (candidate.id === appointment.id) return false;
      const providerConflict = candidate.provider?.id === providerId;
      const roomConflict = Boolean(targetBlock?.room && candidate.room === targetBlock.room);
      if (!providerConflict && !roomConflict) return false;
      if (['Cancelled', 'NoShow', 'Completed'].includes(candidate.state)) return false;
      const candidateStart = new Date(candidate.scheduledAt);
      const candidateEnd = new Date(candidateStart.getTime() + (candidate.expectedDurationMinutes ?? 30) * 60_000);
      return fullSlot.startsAt < candidateEnd && fullSlot.endsAt > candidateStart;
    });
    return conflict ? 'Conflicts with another appointment' : null;
  }

  async function handleAppointmentMove(appointmentId: string, slot: SelectedSlot) {
    const appointment = appointments.find((candidate) => candidate.id === appointmentId);
    if (!appointment) return;

    const movedAppointment: SchedulerAppointment = {
      ...appointment,
      scheduledAt: slot.startsAt.toISOString(),
    };
    const eligibleBlocks = schedulerConfig.slotTemplates.filter((template) =>
      template.isActive &&
      template.dayOfWeek === slot.startsAt.getDay() &&
      (!template.staffId || template.staffId === appointment.provider?.id) &&
      slotContainedByTemplate(slot, [template]),
    );
    const styleHasRestrictions = Boolean(appointment.appointmentTypeSettingId) &&
      schedulerConfig.slotTemplates.some((template) => template.appointmentTypeIds?.includes(appointment.appointmentTypeSettingId!));
    const targetBlock = eligibleBlocks.find((template) =>
      styleHasRestrictions
        ? template.appointmentTypeIds?.includes(appointment.appointmentTypeSettingId!)
        : (template.appointmentTypeIds ?? []).length === 0,
    );
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
          scheduleBlockId: targetBlock?.id,
          reason: 'Moved by drag and drop',
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
            candidate.id === appointmentId
              ? {
                  ...candidate,
                  scheduledAt: updated.scheduledAt,
                  expectedDurationMinutes: updated.expectedDurationMinutes,
                  provider: updated.provider,
                  appointmentTypeSettingId: updated.appointmentTypeSettingId,
                }
              : candidate,
          ),
        ),
      );
    } catch (caught) {
      setAppointments(previousAppointments);
      setMoveError(caught instanceof Error ? caught.message : 'Could not move the appointment. The schedule was restored.');
    }
  }

  const pendingMoveAppointment = pendingMove
    ? appointments.find((appointment) => appointment.id === pendingMove.appointmentId) ?? null
    : null;
  const draggingAppointment = draggingAppointmentId
    ? appointments.find((appointment) => appointment.id === draggingAppointmentId) ?? null
    : null;

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
          providers={providers}
          statuses={statusOptions}
          providerFilter={providerFilter}
          statusFilter={statusFilter}
          onProviderFilterChange={setProviderFilter}
          onStatusFilterChange={setStatusFilter}
          onToday={() => setAnchorDate(today)}
          onPrevious={() => move(-1)}
          onNext={() => move(1)}
          anchorDate={anchorDate}
          onDateChange={setAnchorDate}
          zoomScale={zoomScale}
          onZoomChange={changeZoom}
        />
        {!loading && !loadError ? <div className="scheduler-results" role="status">
          <span>{filteredAppointments.length} of {appointments.length} appointments in this {view}</span>
          {providerFilter !== 'all' || statusFilter !== 'all' ? <button type="button" className="button-secondary" onClick={() => { setProviderFilter('all'); setStatusFilter('all'); }}>Clear filters</button> : null}
          <span className="scheduler-live-status">{generatedAt ? `Auto-updating · Updated ${formatTime(new Date(generatedAt))}` : 'Connecting…'}</span>
        </div> : null}
        {loadError ? (
          <p className="scheduler-inline-error" role="alert">
            {loadError} {generatedAt ? 'Showing the last updated schedule; another sync will be attempted automatically.' : 'No appointments could be loaded.'}
          </p>
        ) : null}
        <CalendarHoursContext.Provider value={calendarHours}>
        <div ref={calendarRef} className={`scheduler-calendar-zoom scheduler-calendar-zoom--${zoom}`} style={{ '--scheduler-grid-height': `${4.5 * (calendarHours.end - calendarHours.start) * zoomScale}rem` } as CSSProperties}>
        {view === 'week' ? (
        <WeekSchedulerGrid
            days={days}
            appointments={filteredAppointments}
            today={today}
            currentTime={currentTime}
            appointmentTypes={schedulerConfig.appointmentTypes}
            slotIntervalMinutes={visibleSlotMinutes}
            slotTemplates={schedulerConfig.slotTemplates}
            onSlotClick={setSelectedSlot}
            onAppointmentClick={setSelectedAppointment}
            onAppointmentMove={requestAppointmentMove}
            draggingAppointment={draggingAppointment}
            onAppointmentDragStart={setDraggingAppointmentId}
            onAppointmentDragEnd={() => setDraggingAppointmentId(null)}
            getMoveRestriction={moveRestriction}
          />
        ) : (
          <DaySchedulerGrid
            day={days[0]!}
            appointments={filteredAppointments}
            today={today}
            currentTime={currentTime}
            appointmentTypes={schedulerConfig.appointmentTypes}
            slotIntervalMinutes={visibleSlotMinutes}
            slotTemplates={schedulerConfig.slotTemplates}
            onSlotClick={setSelectedSlot}
            onAppointmentClick={setSelectedAppointment}
            onAppointmentMove={requestAppointmentMove}
            draggingAppointment={draggingAppointment}
            onAppointmentDragStart={setDraggingAppointmentId}
            onAppointmentDragEnd={() => setDraggingAppointmentId(null)}
            getMoveRestriction={moveRestriction}
          />
        )}
        </div>
        </CalendarHoursContext.Provider>
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
          initialAppointmentTypeSettingId={editingAppointment?.appointmentTypeSettingId ?? null}
          providers={providers}
          appointmentTypes={schedulerConfig.appointmentTypes}
          setupStatus={bookingSetupStatus}
          onRetrySetup={() => { void loadSchedulerData(startOfDay(days[0]!), addDays(startOfDay(days[days.length - 1]!), 1)); }}
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
            setAppointments((current) => current.map((item) => item.id === id ? { ...item, state: 'Cancelled' } : item));
            setSelectedAppointment(null);
            setBookingNote('Appointment cancelled.');
          }}
        />
      )}
      {pendingMove && pendingMoveAppointment ? (
        <ModalFrame
          title="Move appointment"
          subtitle={appointmentPatientName(pendingMoveAppointment)}
          onClose={() => setPendingMove(null)}
          variant="move-confirm"
        >
          <div className="scheduler-move-confirmation">
            <div><span>Current</span><strong>{formatDateTime(new Date(pendingMoveAppointment.scheduledAt))}</strong></div>
            <span className="scheduler-move-confirmation__arrow" aria-hidden="true">→</span>
            <div className="scheduler-move-confirmation__new"><span>New</span><strong>{formatDateTime(pendingMove.slot.startsAt)}</strong></div>
          </div>
          <div className="scheduler-modal__actions">
            <button type="button" className="button-secondary" onClick={() => setPendingMove(null)}>
              Cancel
            </button>
            <button
              type="button"
              className="scheduler-primary-action"
              onClick={() => {
                const move = pendingMove;
                setPendingMove(null);
                void handleAppointmentMove(move.appointmentId, move.slot);
              }}
            >
              Move appointment
            </button>
          </div>
        </ModalFrame>
      ) : null}
      {moveError ? (
        <ModalFrame
          title="Can’t move appointment"
          onClose={() => setMoveError(null)}
          variant="move-error"
        >
          <p className="scheduler-move-error-message" role="alert">{moveError}</p>
          <div className="scheduler-modal__actions">
            <button type="button" className="scheduler-primary-action" onClick={() => setMoveError(null)}>
              Close
            </button>
          </div>
        </ModalFrame>
      ) : null}
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
    schedulerSlotTemplateId: appointment.schedulerSlotTemplateId,
    schedulingIssue: null,
  };
}

function SchedulerToolbar({
  view,
  onViewChange,
  rangeLabel,
  providers,
  statuses,
  providerFilter,
  statusFilter,
  onProviderFilterChange,
  onStatusFilterChange,
  onToday,
  onPrevious,
  onNext,
  anchorDate,
  onDateChange,
  zoomScale,
  onZoomChange,
}: {
  view: SchedulerView;
  onViewChange: (view: SchedulerView) => void;
  rangeLabel: string;
  providers: StaffMember[];
  statuses: string[];
  providerFilter: string;
  statusFilter: string;
  onProviderFilterChange: (value: string) => void;
  onStatusFilterChange: (value: string) => void;
  onToday: () => void;
  onPrevious: () => void;
  onNext: () => void;
  anchorDate: Date;
  onDateChange: (date: Date) => void;
  zoomScale: number;
  onZoomChange: (delta: number) => void;
}) {
  return (
    <section className="scheduler-toolbar" aria-label="Scheduler controls">
      <div className="scheduler-toolbar__navigation">
        <div className="scheduler-toolbar__period" aria-label={`Navigate ${view} view`}>
          <button type="button" onClick={onPrevious} aria-label={view === 'day' ? 'Previous day' : 'Previous week'}>
            <span aria-hidden="true">‹</span>
          </button>
          <strong>{rangeLabel}</strong>
          <button type="button" onClick={onNext} aria-label={view === 'day' ? 'Next day' : 'Next week'}>
            <span aria-hidden="true">›</span>
          </button>
        </div>
        <label className="scheduler-date-jump">
          <span className="sr-only">Go to date</span>
          <input type="date" value={`${anchorDate.getFullYear()}-${String(anchorDate.getMonth() + 1).padStart(2, '0')}-${String(anchorDate.getDate()).padStart(2, '0')}`} onChange={(event) => {
            if (!event.target.value) return;
            const [year, month, day] = event.target.value.split('-').map(Number);
            const date = new Date(year!, month! - 1, day!);
            if (!Number.isNaN(date.getTime())) onDateChange(date);
          }} />
        </label>
        <button type="button" className="scheduler-toolbar__current" onClick={onToday}>
          Today
        </button>
      </div>
      <div className="scheduler-toolbar__meta">
        <div className="scheduler-toolbar__filters" aria-label="Schedule filters">
          <label>
            <span>Provider</span>
            <select value={providerFilter} onChange={(event) => onProviderFilterChange(event.target.value)}>
              <option value="all">All providers</option>
              {providers.map((provider) => (
                <option key={provider.id} value={provider.id}>{provider.displayName}</option>
              ))}
            </select>
          </label>
          <label>
            <span>Status</span>
            <select value={statusFilter} onChange={(event) => onStatusFilterChange(event.target.value)}>
              <option value="all">All statuses</option>
              {statuses.map((status) => (
                <option key={status} value={status}>{STATUS_LABELS[status] ?? status}</option>
              ))}
            </select>
          </label>
        </div>
        <div className="scheduler-zoom" role="group" aria-label="Calendar zoom">
          <button type="button" aria-label="Zoom out" disabled={zoomScale <= 1} onClick={() => onZoomChange(-0.25)}>−</button>
          <output aria-label="Calendar zoom level">{Math.round(zoomScale * 100)}%</output>
          <button type="button" aria-label="Zoom in" disabled={zoomScale >= 2.5} onClick={() => onZoomChange(0.25)}>+</button>
        </div>
      </div>
      <SchedulerViewToggle view={view} onViewChange={onViewChange} />
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
  draggingAppointment,
  onAppointmentDragStart,
  onAppointmentDragEnd,
  getMoveRestriction,
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
  draggingAppointment: SchedulerAppointment | null;
  onAppointmentDragStart: (appointmentId: string) => void;
  onAppointmentDragEnd: () => void;
  getMoveRestriction: (appointment: SchedulerAppointment, slot: SelectedSlot) => string | null;
}) {
  const todayIndex = days.findIndex((day) => isSameDay(day, currentTime));
  return (
    <section className={draggingAppointment ? 'scheduler-calendar-card scheduler-calendar-card--dragging' : 'scheduler-calendar-card'} aria-label="Week appointment calendar">
      <div className="scheduler-week">
        <div className="scheduler-week__header">
          <div className="scheduler-time-gutter" aria-hidden="true" />
          {days.map((day) => (
            <div
              key={day.toISOString()}
              className={[
                'scheduler-day-heading',
                isSameDay(day, today) ? 'scheduler-day-heading--today' : '',
                day < today && !isSameDay(day, today) ? 'scheduler-day-heading--past' : '',
              ].filter(Boolean).join(' ')}
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
              draggingAppointment={draggingAppointment}
              onAppointmentDragStart={onAppointmentDragStart}
              onAppointmentDragEnd={onAppointmentDragEnd}
              getMoveRestriction={getMoveRestriction}
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
  draggingAppointment,
  onAppointmentDragStart,
  onAppointmentDragEnd,
  getMoveRestriction,
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
  draggingAppointment: SchedulerAppointment | null;
  onAppointmentDragStart: (appointmentId: string) => void;
  onAppointmentDragEnd: () => void;
  getMoveRestriction: (appointment: SchedulerAppointment, slot: SelectedSlot) => string | null;
}) {
  return (
    <section
      className={draggingAppointment ? 'scheduler-calendar-card scheduler-calendar-card--day scheduler-calendar-card--dragging' : 'scheduler-calendar-card scheduler-calendar-card--day'}
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
          draggingAppointment={draggingAppointment}
          onAppointmentDragStart={onAppointmentDragStart}
          onAppointmentDragEnd={onAppointmentDragEnd}
          getMoveRestriction={getMoveRestriction}
        />
        {isSameDay(day, currentTime) ? (
          <CurrentTimeIndicator currentTime={currentTime} todayIndex={0} columnCount={1} />
        ) : null}
      </div>
    </section>
  );
}

function currentTimeTopPercent(currentTime: Date, hours: CalendarHours): number | null {
  const minutes = minutesSinceClinicOpen(currentTime, hours);
  const total = (hours.end - hours.start) * 60;
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
  const hours = useContext(CalendarHoursContext);
  const top = currentTimeTopPercent(currentTime, hours);
  if (top === null) return null;

  const segmentWidth = 100 / columnCount;
  const segmentLeft = todayIndex * segmentWidth;
  const currentTimeLabel = formatTime(currentTime);

  return (
    <div
      className={`scheduler-now-indicator${currentTime.getMinutes() < 15 ? ' scheduler-now-indicator--near-hour' : ''}`}
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
  const hours = useContext(CalendarHoursContext);
  const subdivisions = 4;
  const markerCount = (hours.end - hours.start) * subdivisions;
  return (
    <div className="scheduler-time-column" style={{ gridTemplateRows: `repeat(${markerCount}, 1fr)` }} aria-hidden="true">
      {Array.from({ length: markerCount }, (_, index) => {
        const time = new Date();
        time.setHours(hours.start, index * 15, 0, 0);
        const minute = time.getMinutes();
        return <span key={index} className={minute === 0 ? 'scheduler-time-column__hour' : minute === 30 ? 'scheduler-time-column__half' : 'scheduler-time-column__quarter'}>{minute === 0 ? formatTime(time) : `:${String(minute).padStart(2, '0')}`}</span>;
      })}
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
  draggingAppointment,
  onAppointmentDragStart,
  onAppointmentDragEnd,
  getMoveRestriction,
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
  draggingAppointment: SchedulerAppointment | null;
  onAppointmentDragStart: (appointmentId: string) => void;
  onAppointmentDragEnd: () => void;
  getMoveRestriction: (appointment: SchedulerAppointment, slot: SelectedSlot) => string | null;
}) {
  const hours = useContext(CalendarHoursContext);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const isPastDay = day < today && !isSameDay(day, today);
  const targetSlot = dropTarget
    ? timeSlotsFor(day, slotIntervalMinutes, hours).find((slot) => slot.startsAt.toISOString() === dropTarget) ?? null
    : null;
  const targetDuration = draggingAppointment?.expectedDurationMinutes ?? 30;
  const fullTargetSlot = targetSlot
    ? { startsAt: targetSlot.startsAt, endsAt: new Date(targetSlot.startsAt.getTime() + targetDuration * 60_000) }
    : null;
  const restriction = draggingAppointment && fullTargetSlot
    ? getMoveRestriction(draggingAppointment, fullTargetSlot)
    : null;

  useEffect(() => {
    if (!draggingAppointment) setDropTarget(null);
  }, [draggingAppointment]);

  return (
    <div
      className={[
        'scheduler-day-column',
        isSameDay(day, today) ? 'scheduler-day-column--today' : '',
        isPastDay ? 'scheduler-day-column--past' : '',
        draggingAppointment ? 'scheduler-day-column--drag-active' : '',
        targetSlot ? 'scheduler-day-column--drag-target' : '',
      ].filter(Boolean).join(' ')}
      style={{ '--scheduler-slot-count': ((hours.end - hours.start) * 60) / slotIntervalMinutes, '--scheduler-hour-count': hours.end - hours.start } as CSSProperties}
    >
      {slotTemplates.map((template) => (
        <div
          key={template.id}
          className="scheduler-slot-template scheduler-slot-template--wash"
          style={slotTemplateStyle(template, hours)}
          aria-hidden="true"
        />
      ))}
      <div
        className="scheduler-day-column__slots"
        style={{ gridTemplateRows: timeSlotsFor(day, slotIntervalMinutes, hours).map((slot) => `${(slot.endsAt.getTime() - slot.startsAt.getTime()) / 60_000}fr`).join(' ') }}
      >
        {timeSlotsFor(day, slotIntervalMinutes, hours).map((slot) => {
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
              onClick={() => {
                if (!isPastDay) onSlotClick(slot);
              }}
              onDragOver={(event) => {
                event.preventDefault();
                event.dataTransfer.dropEffect = 'move';
                setDropTarget(slotKey);
                const edge = 72;
                if (event.clientY < edge) window.scrollBy({ top: -10, behavior: 'auto' });
                if (event.clientY > window.innerHeight - edge) window.scrollBy({ top: 10, behavior: 'auto' });
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
              <span>+ {formatTime(slot.startsAt)}</span>
            </button>
          );
        })}
      </div>
      {draggingAppointment && fullTargetSlot ? (
        <div
          className={restriction ? 'scheduler-drop-preview scheduler-drop-preview--invalid' : 'scheduler-drop-preview scheduler-drop-preview--valid'}
          style={appointmentStyle({ ...draggingAppointment, scheduledAt: fullTargetSlot.startsAt.toISOString() }, hours)}
          aria-live="polite"
        >
          <span>{fullTargetSlot.startsAt.toLocaleDateString([], { weekday: 'short' })} · {formatTime(fullTargetSlot.startsAt)}–{formatTime(fullTargetSlot.endsAt)}</span>
          <strong>{restriction ?? appointmentPatientName(draggingAppointment)}</strong>
        </div>
      ) : null}
      {appointments.map((appointment) => (
        <SchedulerAppointmentCard
          key={appointment.id}
          appointment={appointment}
          appointmentTypes={appointmentTypes}
          compact={compact}
          style={appointmentStyle(appointment, hours)}
          blockColor={templateForAppointment(appointment, slotTemplates)?.color ?? null}
          dragging={draggingAppointment?.id === appointment.id}
          readOnly={isPastDay}
          onDragStart={() => onAppointmentDragStart(appointment.id)}
          onDragEnd={onAppointmentDragEnd}
          onClick={() => onAppointmentClick(appointment)}
        />
      ))}
      {slotTemplates.map((template) => (
        <div
          key={`${template.id}-overlay`}
          className="scheduler-slot-template scheduler-slot-template--overlay"
          style={slotTemplateOverlayStyle(template, hours)}
          aria-hidden="true"
        >
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
  blockColor,
  dragging,
  readOnly,
  onDragStart,
  onDragEnd,
  onClick,
}: {
  appointment: SchedulerAppointment;
  appointmentTypes: AppointmentTypeSetting[];
  compact?: boolean | undefined;
  style: { top: string; height: string };
  blockColor: string | null;
  dragging: boolean;
  readOnly: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
  onClick: () => void;
}) {
  const careTeamMeta = appointmentCareTeamMeta(appointment);
  const reason = appointment.reason?.trim() || configuredAppointmentTypeLabel(appointment.type, appointmentTypes);
  const summary = `${appointmentPatientName(appointment)} · ${timeRange(appointment)} · ${reason}`;
  const color = appointmentColor(appointment, appointmentTypes);
  const cardStyle: CSSProperties = {
    ...style,
    '--scheduler-card-accent': color,
    '--scheduler-card-bg': colorWithAlpha(color, '14'),
    '--scheduler-block-tint': blockColor ? colorWithAlpha(blockColor, '2e') : 'transparent',
  } as CSSProperties;

  return (
    <button
      type="button"
      className={`scheduler-appointment-card ${compact ? 'scheduler-appointment-card--compact' : ''} ${dragging ? 'scheduler-appointment-card--dragging' : ''} ${readOnly ? 'scheduler-appointment-card--past' : ''}`}
      style={cardStyle}
      aria-label={summary}
      title={summary}
      draggable={!readOnly}
      onDragStart={(event) => {
        if (readOnly) {
          event.preventDefault();
          return;
        }
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', appointment.id);
        const dragGhost = document.createElement('span');
        dragGhost.className = 'scheduler-drag-ghost';
        dragGhost.textContent = appointmentPatientName(appointment);
        document.body.appendChild(dragGhost);
        event.dataTransfer.setDragImage(dragGhost, 12, 12);
        window.requestAnimationFrame(() => dragGhost.remove());
        onDragStart();
      }}
      onDragEnd={onDragEnd}
      onClick={onClick}
    >
      {!readOnly ? (
        <span className="scheduler-appointment-card__drag" aria-hidden="true">
          ::
        </span>
      ) : null}
      <strong>{appointmentPatientName(appointment)}</strong>
      <span className="scheduler-appointment-card__meta scheduler-appointment-card__meta--primary">
        {timeRange(appointment)}
      </span>
      <span className="scheduler-appointment-card__reason">{reason}</span>
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
  variant,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  onClose: () => void;
  variant?: 'move-error' | 'move-confirm';
}) {
  useLockBodyScroll(true);

  return (
    <div className="scheduler-modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className={variant ? `scheduler-modal scheduler-modal--${variant}` : 'scheduler-modal'}
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
            ×
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
  const today = startOfDay(new Date());
  const isPastAppointment = startsAt < today;
  const [note, setNote] = useState(appointment.reason ?? '');
  const [savingNote, setSavingNote] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
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
      const response = await fetch(`/api/appointments/${encodeURIComponent(appointment.id)}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: cancelReason.trim() }),
      });
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
        <AppointmentTextStatus appointmentId={appointment.id} />
        {isPastAppointment ? (
          <div className="appointment-viewer__note appointment-viewer__note--read-only">
            <div><span>Appointment note</span><small>Historical appointment · View only</small></div>
            <p>{appointment.reason || 'No appointment note recorded.'}</p>
          </div>
        ) : (
          <div className="appointment-viewer__note">
            <div><label htmlFor="appointment-note">Appointment note</label><small>Visible to the clinic team</small></div>
            <textarea id="appointment-note" value={note} maxLength={500} onChange={(event) => setNote(event.target.value)} placeholder="Add a note for this appointment" />
            <button type="button" onClick={() => void saveNote()} disabled={savingNote || note === appointment.reason}>{savingNote ? 'Saving…' : 'Save Note'}</button>
          </div>
        )}
        {actionError ? <p className="scheduler-modal__error" role="alert">{actionError}</p> : null}
        <div className="appointment-viewer__actions">
          {!isPastAppointment ? <button type="button" className="scheduler-primary-action" onClick={onReschedule}>Reschedule</button> : null}
          {appointment.patient ? <Link href={`/patients/${appointment.patient.id}`} onClick={onClose}>Open Patient Profile</Link> : null}
          {!isPastAppointment ? <button type="button" className="appointment-viewer__cancel" onClick={() => setConfirmCancel(true)}>Cancel Appointment</button> : null}
        </div>
        {confirmCancel && !isPastAppointment ? (
          <div className="appointment-cancel-confirmation" role="alertdialog" aria-modal="true" aria-labelledby="cancel-appointment-title">
            <div className="appointment-cancel-confirmation__panel">
              <span className="appointment-cancel-confirmation__icon" aria-hidden="true">!</span>
              <h3 id="cancel-appointment-title">Cancel this appointment?</h3>
              <p>{appointmentPatientName(appointment)} will be removed from the schedule. This cannot be undone.</p>
              <label className="appointment-cancel-confirmation__reason">
                <span>Reason</span>
                <textarea value={cancelReason} onChange={(event) => setCancelReason(event.target.value)} maxLength={500} placeholder="Why is this appointment being cancelled?" autoFocus />
              </label>
              <div>
                <button type="button" className="scheduler-secondary-action" disabled={cancelling} onClick={() => setConfirmCancel(false)}>No, Keep It</button>
                <button type="button" className="appointment-cancel-confirmation__yes" disabled={cancelling || !cancelReason.trim()} onClick={() => void cancelAppointment()}>{cancelling ? 'Cancelling…' : 'Yes, Cancel'}</button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </ModalFrame>
  );
}
