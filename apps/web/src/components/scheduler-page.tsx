'use client';

import Link from 'next/link';
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type FormEvent,
  type ReactNode,
} from 'react';
import { DashboardShell } from './dashboard-shell';
import { useLockBodyScroll } from '../hooks/use-lock-body-scroll';
import {
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

type AppointmentColorKey =
  'teal' | 'blue' | 'purple' | 'amber' | 'orange' | 'green' | 'slate' | 'rose';

interface AppointmentTypeSetting {
  id: string;
  appointmentType: AppointmentTypeValue | null;
  name: string;
  color: string;
  isActive: boolean;
  sortOrder: number;
}

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
  appointmentTypes: AppointmentTypeSetting[];
  slotTemplates: SchedulerSlotTemplate[];
  canManage: boolean;
}

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

const DEFAULT_APPOINTMENT_TYPE_SETTINGS: AppointmentTypeSetting[] = [
  {
    id: 'default-WellnessPreventiveCare',
    appointmentType: 'WellnessPreventiveCare',
    name: 'Consultation',
    color: '#2563EB',
    isActive: true,
    sortOrder: 10,
  },
  {
    id: 'default-Recheck',
    appointmentType: 'Recheck',
    name: 'Recheck',
    color: '#7C3AED',
    isActive: true,
    sortOrder: 20,
  },
  {
    id: 'default-SurgeryProcedure',
    appointmentType: 'SurgeryProcedure',
    name: 'Surgery',
    color: '#16A34A',
    isActive: true,
    sortOrder: 30,
  },
  {
    id: 'default-TechnicianAppointment',
    appointmentType: 'TechnicianAppointment',
    name: 'Technician',
    color: '#D97706',
    isActive: true,
    sortOrder: 40,
  },
  {
    id: 'default-EmergencyUrgent',
    appointmentType: 'EmergencyUrgent',
    name: 'Emergency',
    color: '#DC2626',
    isActive: true,
    sortOrder: 50,
  },
  {
    id: 'default-SickVisit',
    appointmentType: 'SickVisit',
    name: 'Sick visit',
    color: '#0891B2',
    isActive: true,
    sortOrder: 60,
  },
  {
    id: 'default-Vaccination',
    appointmentType: 'Vaccination',
    name: 'Vaccination',
    color: '#0D9488',
    isActive: true,
    sortOrder: 70,
  },
  {
    id: 'default-DropOff',
    appointmentType: 'DropOff',
    name: 'Drop-off / Post-op',
    color: '#CA8A04',
    isActive: true,
    sortOrder: 80,
  },
  {
    id: 'default-Telemedicine',
    appointmentType: 'Telemedicine',
    name: 'Telemedicine',
    color: '#4F46E5',
    isActive: true,
    sortOrder: 90,
  },
  {
    id: 'default-Euthanasia',
    appointmentType: 'Euthanasia',
    name: 'Euthanasia',
    color: '#BE123C',
    isActive: true,
    sortOrder: 100,
  },
  {
    id: 'default-BoardingNonMedical',
    appointmentType: 'BoardingNonMedical',
    name: 'Boarding',
    color: '#475569',
    isActive: true,
    sortOrder: 110,
  },
];

const FALLBACK_SCHEDULER_CONFIG: SchedulerConfig = {
  settings: { slotIntervalMinutes: 30 },
  appointmentTypes: DEFAULT_APPOINTMENT_TYPE_SETTINGS,
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
  const duration = Math.max(30, appointment.expectedDurationMinutes ?? 30);
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

function isFallbackAppointment(appointment: SchedulerAppointment): boolean {
  return appointment.id.startsWith('fallback-');
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
  const [moveError, setMoveError] = useState<string | null>(null);
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
        const [dashboardResponse, staffResponse, configResponse] = await Promise.all([
          fetch('/api/operations/dashboard', requestInit),
          fetch('/api/staff?canReceiveAppointments=true', requestInit),
          fetch('/api/scheduler-config', requestInit),
        ]);

        const dashboard = dashboardResponse.ok
          ? ((await dashboardResponse.json()) as OperationsDashboard)
          : null;
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

        setAppointments(dashboard ? loadedAppointments : createFallbackAppointments(anchorDate));
        setGeneratedAt(dashboard?.generatedAt ?? new Date().toISOString());
        setProviders(staff);
        setSchedulerConfig(config);
      } catch (caught) {
        if (!(caught instanceof DOMException && caught.name === 'AbortError')) {
          setAppointments(createFallbackAppointments(anchorDate));
          setGeneratedAt(new Date().toISOString());
          setSchedulerConfig(FALLBACK_SCHEDULER_CONFIG);
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

  async function handleAppointmentMove(appointmentId: string, slot: SelectedSlot) {
    const appointment = appointments.find((candidate) => candidate.id === appointmentId);
    if (!appointment) return;

    const movedAppointment: SchedulerAppointment = {
      ...appointment,
      scheduledAt: slot.startsAt.toISOString(),
    };
    setMoveError(null);

    if (isFallbackAppointment(appointment)) {
      setAppointments((current) =>
        uniqueAppointments(
          current.map((candidate) =>
            candidate.id === appointmentId ? movedAppointment : candidate,
          ),
        ),
      );
      return;
    }

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
          expectedDurationMinutes: appointment.expectedDurationMinutes ?? 30,
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
      </div>
      {selectedSlot && (
        <NewAppointmentSlotModal
          slot={selectedSlot}
          providers={providers}
          appointmentTypes={schedulerConfig.appointmentTypes}
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
          appointmentTypes={schedulerConfig.appointmentTypes}
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
          className="scheduler-slot-template"
          style={slotTemplateStyle(template)}
          aria-hidden="true"
        >
          <span>{template.label}</span>
          {template.room ? <small>{template.room}</small> : null}
        </div>
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

function NewAppointmentSlotModal({
  slot,
  providers,
  appointmentTypes,
  onClose,
  onCreated,
}: {
  slot: SelectedSlot;
  providers: StaffMember[];
  appointmentTypes: AppointmentTypeSetting[];
  onClose: () => void;
  onCreated: (appointment: SchedulerAppointment) => void;
}) {
  const activeAppointmentTypes = useMemo(
    () =>
      appointmentTypes
        .filter((setting) => setting.isActive && setting.appointmentType)
        .sort((a, b) => a.sortOrder - b.sortOrder),
    [appointmentTypes],
  );
  const defaultAppointmentType =
    activeAppointmentTypes[0]?.appointmentType ?? 'WellnessPreventiveCare';
  const [patientQuery, setPatientQuery] = useState('');
  const [patientResults, setPatientResults] = useState<PatientSearchResult[]>([]);
  const [selectedPatient, setSelectedPatient] = useState<PatientSearchResult | null>(null);
  const [patientSearchLoading, setPatientSearchLoading] = useState(false);
  const [appointmentType, setAppointmentType] =
    useState<AppointmentTypeValue>(defaultAppointmentType);
  const [visitReason, setVisitReason] = useState(
    configuredAppointmentTypeLabel(defaultAppointmentType, appointmentTypes),
  );
  const [durationMinutes, setDurationMinutes] = useState(
    String(Math.max(15, Math.round((slot.endsAt.getTime() - slot.startsAt.getTime()) / 60_000))),
  );
  const [assignedProviderId, setAssignedProviderId] = useState(
    providers.length === 1 ? providers[0]!.id : '',
  );
  const [manualColorOverride, setManualColorOverride] = useState<string | null>(null);
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
        .then((response) =>
          response.ok ? (response.json() as Promise<PatientSearchResult[]>) : [],
        )
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
    setVisitReason((current) =>
      current.trim() ? current : configuredAppointmentTypeLabel(value, appointmentTypes),
    );
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
          colorKey: manualColorOverride ?? undefined,
        }),
      });

      if (!response.ok) {
        setError('Could not create the appointment. Check the fields and try again.');
        return;
      }

      const created = (await response.json()) as CreatedAppointmentResponse;
      const selectedProvider =
        providers.find((provider) => provider.id === (created.providerId ?? assignedProviderId)) ??
        null;

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
  const selectedTypeSetting = appointmentTypes.find(
    (setting) => setting.appointmentType === appointmentType,
  );
  const previewColor =
    manualColorOverride ?? selectedTypeSetting?.color ?? FALLBACK_APPOINTMENT_COLOR;

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
          {patientSearchLoading ? <p className="scheduler-modal__hint">Searching...</p> : null}
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
                      selectedPatient.primaryClient.phone
                        ? ` · ${selectedPatient.primaryClient.phone}`
                        : ''
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
              {(activeAppointmentTypes.length > 0
                ? activeAppointmentTypes
                : DEFAULT_APPOINTMENT_TYPE_SETTINGS
              )
                .filter(
                  (
                    setting,
                  ): setting is AppointmentTypeSetting & {
                    appointmentType: AppointmentTypeValue;
                  } => Boolean(setting.appointmentType),
                )
                .map((setting) => (
                  <option key={setting.appointmentType} value={setting.appointmentType}>
                    {setting.name}
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
          <legend>Color preview</legend>
          <p>Defaults to the configured appointment type color.</p>
          <div className="scheduler-color-preview">
            <span style={{ backgroundColor: previewColor }} aria-hidden="true" />
            <strong>
              {manualColorOverride
                ? 'Manual override'
                : (selectedTypeSetting?.name ?? 'Type color')}
            </strong>
          </div>
          <details className="scheduler-color-override">
            <summary>Manual color override</summary>
            <div className="scheduler-color-picker__chips">
              {APPOINTMENT_COLOR_OPTIONS.map((option) => (
                <button
                  key={option.key}
                  type="button"
                  className={
                    manualColorOverride === LEGACY_COLOR_HEX[option.key]
                      ? `scheduler-color-chip scheduler-color-chip--selected scheduler-color-chip--${option.key}`
                      : `scheduler-color-chip scheduler-color-chip--${option.key}`
                  }
                  aria-pressed={manualColorOverride === LEGACY_COLOR_HEX[option.key]}
                  onClick={() => setManualColorOverride(LEGACY_COLOR_HEX[option.key])}
                >
                  <span aria-hidden="true" />
                  {option.label}
                </button>
              ))}
              {manualColorOverride ? (
                <button
                  type="button"
                  className="scheduler-color-chip"
                  onClick={() => setManualColorOverride(null)}
                >
                  Use type color
                </button>
              ) : null}
            </div>
          </details>
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
  appointmentTypes,
  onClose,
}: {
  appointment: SchedulerAppointment;
  appointmentTypes: AppointmentTypeSetting[];
  onClose: () => void;
}) {
  const color = appointmentColor(appointment, appointmentTypes);
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
          <dd>{configuredAppointmentTypeLabel(appointment.type, appointmentTypes)}</dd>
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
            <span
              className="scheduler-color-readout"
              style={{ '--scheduler-readout-color': color } as CSSProperties}
            >
              {appointment.colorKey ? appointmentColorLabel(appointment.colorKey) : 'Type color'}
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
