'use client';

import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { useLockBodyScroll } from '../hooks/use-lock-body-scroll';
import {
  SEX_OPTIONS,
  SPECIES_OPTIONS,
  appointmentTypeLabel,
  clientDisplayName,
  type AppointmentTypeValue,
  type ClientSearchResult,
  type PatientSearchResult,
  type PrimaryClientSummary,
  type StaffMember,
} from '../lib/patient-types';

const CLIENT_DUPLICATE_DEBOUNCE_MS = 220;

export interface AppointmentTypeSetting {
  id: string;
  appointmentType: AppointmentTypeValue | null;
  name: string;
  description?: string | null;
  defaultDurationMinutes: number;
  color: string;
  isActive: boolean;
  sortOrder: number;
  providers?: Array<{ id: string; displayName: string; role: string; isActive: boolean }>;
  isBookable?: boolean;
}

export interface NewAppointmentCreatedSummary {
  id: string;
  type: string;
  reason: string;
  state: string;
  scheduledAt: string;
  expectedDurationMinutes: number | null;
  colorKey: string | null;
  patient: { id: string; name: string; species: string } | null;
  client: { id: string; firstName: string; lastName: string } | null;
  provider: { id: string; displayName: string; role: string } | null;
  room: string | null;
  appointmentType: AppointmentTypeValue;
  appointmentTypeSettingId: string;
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

interface AvailabilitySlot {
  start: string;
  end: string;
  providerId: string | null;
  room: string | null;
  blockId: string;
  recommended: boolean;
}

interface AvailabilityResponse {
  durationMinutes: number;
  slotIntervalMinutes: number;
  slots: AvailabilitySlot[];
  configurationError?: 'NO_ASSIGNED_PROVIDERS' | 'PROVIDER_NOT_ASSIGNED' | 'APPOINTMENT_TYPE_UNAVAILABLE';
}

/** Shape returned by POST /appointments/new-patient — the created Appointment
 *  plus the linked Patient/Client the transaction just created, so the
 *  scheduler can refresh without a second round trip. */
interface CreatedAppointmentWithNewPatientResponse {
  id: string;
  type: string;
  reason: string;
  state: string;
  scheduledAt: string;
  expectedDurationMinutes: number | null;
  colorKey: string | null;
  providerId: string | null;
  patient: { id: string; name: string; species: string };
  client: { id: string; firstName: string; lastName: string };
}

interface InitialPatient {
  id: string;
  name: string;
  species: string;
  breed?: string | null;
  sex?: string | null;
  dateOfBirth?: string | null;
  weight?: number | null;
  color?: string | null;
  primaryClient: PrimaryClientSummary | null;
}

type PatientMode = 'existing' | 'new';

function formatDateInput(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatTimeInput(date: Date): string {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function dateFromParts(dateValue: string, timeValue: string): Date | null {
  if (!dateValue || !timeValue) return null;
  const parsed = new Date(`${dateValue}T${timeValue}`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
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
  const dialogRef = useRef<HTMLElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const dialog = dialogRef.current;
    dialog?.querySelector<HTMLElement>('button, input, select, textarea')?.focus();
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeRef.current();
        return;
      }
      if (event.key !== 'Tab' || !dialog) return;
      const focusable = [...dialog.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])')];
      if (focusable.length === 0) return;
      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      opener?.focus();
    };
  }, []);

  return (
    <div className="scheduler-modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        ref={dialogRef}
        className="scheduler-modal scheduler-modal--appointment"
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

export function NewAppointmentModal({
  initialPatient,
  initialDate,
  initialStartTime,
  initialProviderId,
  initialAppointmentTypeId,
  providers,
  appointmentTypes,
  onClose,
  onCreated,
  editingAppointmentId,
  initialVisitReason,
}: {
  initialPatient?: InitialPatient | null;
  initialDate?: string | Date | null;
  initialStartTime?: string | Date | null;
  initialDurationMinutes?: number | null;
  initialProviderId?: string | null;
  initialAppointmentTypeId?: AppointmentTypeValue | null;
  providers: StaffMember[];
  appointmentTypes?: AppointmentTypeSetting[];
  onClose: () => void;
  onCreated: (appointment: NewAppointmentCreatedSummary) => void;
  editingAppointmentId?: string | null;
  initialVisitReason?: string | null;
}) {
  const settings = useMemo(() => appointmentTypes ?? [], [appointmentTypes]);
  const activeAppointmentTypes = useMemo(
    () =>
      settings
        .filter((setting) => setting.isActive && setting.isBookable !== false)
        .sort((a, b) => a.sortOrder - b.sortOrder),
    [settings],
  );
  const defaultSetting = initialAppointmentTypeId
    ? activeAppointmentTypes.find((setting) => setting.appointmentType === initialAppointmentTypeId)
    : undefined;
  const defaultAppointmentType = defaultSetting?.appointmentType ?? 'WellnessPreventiveCare';
  const initialStartDate = useMemo(() => {
    if (initialStartTime instanceof Date) return initialStartTime;
    if (typeof initialStartTime === 'string') return new Date(initialStartTime);
    if (initialDate instanceof Date) return initialDate;
    if (typeof initialDate === 'string') return new Date(initialDate);
    const next = new Date();
    next.setMinutes(next.getMinutes() < 30 ? 30 : 0, 0, 0);
    if (next.getMinutes() === 0) next.setHours(next.getHours() + 1);
    return next;
  }, [initialDate, initialStartTime]);

  const initialSelectedPatient = initialPatient
    ? ({
        id: initialPatient.id,
        name: initialPatient.name,
        species: initialPatient.species,
        breed: initialPatient.breed ?? null,
        sex: initialPatient.sex ?? null,
        dateOfBirth: initialPatient.dateOfBirth ?? null,
        weight: initialPatient.weight ?? null,
        color: initialPatient.color ?? null,
        imageUrl: null,
        status: 'Active',
        primaryClient: initialPatient.primaryClient,
        activeVisit: null,
        nextAppointment: null,
      } satisfies PatientSearchResult)
    : null;

  const [patientMode, setPatientMode] = useState<PatientMode>(initialPatient ? 'existing' : 'existing');
  const [patientQuery, setPatientQuery] = useState(initialPatient?.name ?? '');
  const [patientResults, setPatientResults] = useState<PatientSearchResult[]>([]);
  const [selectedPatient, setSelectedPatient] = useState<PatientSearchResult | null>(
    initialSelectedPatient,
  );
  const [patientSearchLoading, setPatientSearchLoading] = useState(false);
  const [appointmentDate, setAppointmentDate] = useState(formatDateInput(initialStartDate));
  const [startTime, setStartTime] = useState(defaultSetting ? formatTimeInput(initialStartDate) : '');
  const [durationMinutes, setDurationMinutes] = useState(String(defaultSetting?.defaultDurationMinutes ?? ''));
  const [appointmentType, setAppointmentType] =
    useState<AppointmentTypeValue>(defaultAppointmentType);
  const [appointmentTypeSettingId, setAppointmentTypeSettingId] = useState(defaultSetting?.id ?? '');
  const [visitReason, setVisitReason] = useState(initialVisitReason ?? '');
  const [assignedProviderId, setAssignedProviderId] = useState(initialProviderId ?? '');
  const [selectedSlotProviderId, setSelectedSlotProviderId] = useState('');
  const [clientFirstName, setClientFirstName] = useState('');
  const [clientLastName, setClientLastName] = useState('');
  const [clientPhone, setClientPhone] = useState('');
  const [clientEmail, setClientEmail] = useState('');
  const [clientAddressLine1, setClientAddressLine1] = useState('');
  const [clientAddressLine2, setClientAddressLine2] = useState('');
  const [clientCity, setClientCity] = useState('');
  const [clientState, setClientState] = useState('');
  const [clientPostalCode, setClientPostalCode] = useState('');
  const [clientCountry, setClientCountry] = useState('');
  const [clientDuplicateHint, setClientDuplicateHint] = useState<string | null>(null);
  const [patientName, setPatientName] = useState('');
  const [species, setSpecies] = useState('Dog');
  const [breed, setBreed] = useState('');
  const [sex, setSex] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [estimatedAge, setEstimatedAge] = useState('');
  const [color, setColor] = useState('');
  const [weight, setWeight] = useState('');
  const [primaryCareVetName, setPrimaryCareVetName] = useState('');
  const [previousClinicName, setPreviousClinicName] = useState('');
  const [previousRecordsSource, setPreviousRecordsSource] = useState('');
  const [lastSeenAt, setLastSeenAt] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [availability, setAvailability] = useState<AvailabilitySlot[]>([]);
  const [availabilityLoading, setAvailabilityLoading] = useState(true);
  const [availabilityError, setAvailabilityError] = useState(false);
  const [configurationError, setConfigurationError] = useState<AvailabilityResponse['configurationError']>();
  const [availabilityVersion, setAvailabilityVersion] = useState(0);
  const [selectedDate, setSelectedDate] = useState(formatDateInput(initialStartDate));
  const todayValue = formatDateInput(new Date());
  const [dateStripStart, setDateStripStart] = useState(() => {
    const date = new Date();
    if (date.getDay() === 6) date.setDate(date.getDate() + 2);
    if (date.getDay() === 0) date.setDate(date.getDate() + 1);
    return formatDateInput(date);
  });
  const [dateStripMotion, setDateStripMotion] = useState<{ direction: 'previous' | 'next'; key: number }>({ direction: 'next', key: 0 });
  const bookingLimit = useMemo(() => { const date = new Date(); date.setFullYear(date.getFullYear() + 1); return formatDateInput(date); }, []);
  const selectedTypeSetting = settings.find((setting) => setting.id === appointmentTypeSettingId);
  const eligibleProviders = providers.filter((provider) => selectedTypeSetting?.providers?.some((assigned) => assigned.id === provider.id));

  useEffect(() => {
    setAvailability([]);
    setStartTime('');
    setSelectedSlotProviderId('');
  }, [appointmentTypeSettingId, assignedProviderId]);

  useEffect(() => {
    const controller = new AbortController();
    const start = new Date(`${dateStripStart}T00:00:00`);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 6);
    const maximum = new Date(`${bookingLimit}T23:59:59`);
    if (end > maximum) end.setTime(maximum.getTime());
    const query = new URLSearchParams({
      appointmentTypeId: appointmentTypeSettingId,
      startDate: start.toISOString(),
      endDate: end.toISOString(),
    });
    if (assignedProviderId) query.set('providerId', assignedProviderId);
    setAvailabilityLoading(true);
    setAvailabilityError(false);
    setConfigurationError(undefined);
    if (!appointmentTypeSettingId) {
      setAvailability([]);
      setAvailabilityLoading(false);
      return;
    }
    fetch(`/api/appointments/availability?${query}`, { signal: controller.signal, cache: 'no-store' })
      .then(async (response) => {
        if (!response.ok) throw new Error('availability');
        return (await response.json()) as AvailabilityResponse;
      })
      .then((result) => {
        setAvailability((current) => {
          const merged = new Map(current.map((slot) => [`${slot.start}:${slot.providerId}`, slot]));
          for (const slot of result.slots) merged.set(`${slot.start}:${slot.providerId}`, slot);
          return [...merged.values()].sort((a, b) => a.start.localeCompare(b.start));
        });
        setConfigurationError(result.configurationError);
        setDurationMinutes(String(result.durationMinutes));
        const initialSlot = result.slots.find(
          (slot) =>
            slot.start === initialStartDate.toISOString() &&
            (!initialProviderId || slot.providerId === initialProviderId),
        );
        if (initialSlot) {
          const date = new Date(initialSlot.start);
          setAppointmentDate(formatDateInput(date));
          setStartTime(formatTimeInput(date));
          setAssignedProviderId(initialSlot.providerId ?? '');
        }
      })
      .catch((caught: unknown) => {
        if (!(caught instanceof DOMException && caught.name === 'AbortError')) {
          setAvailability([]);
          setAvailabilityError(true);
        }
      })
      .finally(() => setAvailabilityLoading(false));
    return () => controller.abort();
  }, [appointmentTypeSettingId, assignedProviderId, availabilityVersion, initialProviderId, initialStartDate, dateStripStart, bookingLimit]);

  useEffect(() => {
    const trimmed = patientQuery.trim();
    if (patientMode !== 'existing' || selectedPatient?.name === trimmed || trimmed.length < 2) {
      setPatientResults([]);
      setPatientSearchLoading(false);
      return;
    }

    const controller = new AbortController();
    setPatientSearchLoading(true);
    const timeout = window.setTimeout(() => {
      fetch(`/api/patients/search?query=${encodeURIComponent(trimmed)}&limit=7`, {
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
  }, [patientMode, patientQuery, selectedPatient?.name]);

  // Best-effort duplicate-client advisory for the "New Patient" path —
  // mirrors the hint in new-patient-modal.tsx, reusing the same client
  // search endpoint. Non-blocking: it only warns, never prevents submission,
  // and there is still no hard backend uniqueness constraint.
  useEffect(() => {
    if (patientMode !== 'new') {
      setClientDuplicateHint(null);
      return;
    }
    const name = `${clientFirstName.trim()} ${clientLastName.trim()}`.trim();
    const phone = clientPhone.trim();
    const email = clientEmail.trim();
    const query = phone || email || name;
    if (!query) {
      setClientDuplicateHint(null);
      return;
    }

    const controller = new AbortController();
    const timeout = window.setTimeout(() => {
      fetch(`/api/clients/search?query=${encodeURIComponent(query)}`, { signal: controller.signal })
        .then((response) => (response.ok ? (response.json() as Promise<ClientSearchResult[]>) : []))
        .then((data) => {
          const match = data[0];
          setClientDuplicateHint(
            match ? `${clientDisplayName(match)} · ${match.phone ?? match.email ?? 'no contact on file'}` : null,
          );
        })
        .catch((caught: unknown) => {
          if (!(caught instanceof DOMException && caught.name === 'AbortError')) {
            setClientDuplicateHint(null);
          }
        });
    }, CLIENT_DUPLICATE_DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [patientMode, clientFirstName, clientLastName, clientPhone, clientEmail]);

  const startsAt = dateFromParts(appointmentDate, startTime);
  const endTime = startsAt
    ? new Date(startsAt.getTime() + Number(durationMinutes || 0) * 60_000)
    : null;
  const nearbyDates = useMemo(() => Array.from({ length: 7 }, (_, offset) => {
    const date = new Date(`${dateStripStart}T12:00:00`); date.setDate(date.getDate() + offset); return formatDateInput(date);
  }).filter((date) => date <= bookingLimit), [dateStripStart, bookingLimit]);
  const visibleSlots = availability.filter(
    (slot) => formatDateInput(new Date(slot.start)) === selectedDate,
  );
  const slotGroups = [
    { label: 'Morning', slots: visibleSlots.filter((slot) => new Date(slot.start).getHours() < 12) },
    { label: 'Afternoon', slots: visibleSlots.filter((slot) => { const hour = new Date(slot.start).getHours(); return hour >= 12 && hour < 17; }) },
    { label: 'Evening', slots: visibleSlots.filter((slot) => new Date(slot.start).getHours() >= 17) },
  ].filter((group) => group.slots.length > 0);

  function chooseDate(date: string) {
    setSelectedDate(date);
    setAppointmentDate(date);
    setStartTime('');
    setSelectedSlotProviderId('');
  }

  function jumpToDate(date: string) {
    chooseDate(date);
    const selected = new Date(`${date}T12:00:00`);
    const mondayOffset = selected.getDay() === 0 ? -6 : 1 - selected.getDay();
    selected.setDate(selected.getDate() + mondayOffset);
    const weekStart = formatDateInput(selected);
    setDateStripStart(weekStart < todayValue ? todayValue : weekStart);
  }

  function moveDateStrip(direction: -1 | 1) {
    const date = new Date(`${dateStripStart}T12:00:00`);
    date.setDate(date.getDate() + direction * 7);
    const next = formatDateInput(date);
    const bounded = next < todayValue ? todayValue : next > bookingLimit ? bookingLimit : next;
    setDateStripMotion((current) => ({ direction: direction < 0 ? 'previous' : 'next', key: current.key + 1 }));
    setDateStripStart(bounded);
  }

  function findNextAvailable() {
    const next = availability.find((slot) => slot.start > new Date().toISOString());
    if (next) {
      chooseDate(formatDateInput(new Date(next.start)));
      return;
    }
    const date = new Date(`${selectedDate}T12:00:00`);
    date.setDate(date.getDate() + 7);
    const nextDate = formatDateInput(date);
    if (nextDate <= bookingLimit) chooseDate(nextDate);
  }

  function selectSlot(slot: AvailabilitySlot) {
    const date = new Date(slot.start);
    setAppointmentDate(formatDateInput(date));
    setStartTime(formatTimeInput(date));
    setSelectedSlotProviderId(slot.providerId ?? '');
    setError(null);
  }

  function validate(): boolean {
    const nextErrors: Record<string, string> = {};
    if (!appointmentDate) nextErrors.appointmentDate = 'Choose an appointment date.';
    if (!startTime) nextErrors.startTime = 'Choose a start time.';
    if (!startsAt) nextErrors.startTime = 'Enter a valid date and time.';
    if (!durationMinutes || Number(durationMinutes) <= 0) {
      nextErrors.durationMinutes = 'Choose a duration.';
    }
    if (!appointmentTypeSettingId) nextErrors.appointmentType = 'Choose an appointment type.';

    if (patientMode === 'existing') {
      if (!selectedPatient) nextErrors.patientSearch = 'Choose an existing patient.';
    } else {
      if (!clientFirstName.trim()) nextErrors.clientFirstName = 'First name is required.';
      if (!clientLastName.trim()) nextErrors.clientLastName = 'Last name is required.';
      if (clientEmail.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clientEmail.trim())) {
        nextErrors.clientEmail = 'Enter a valid email address.';
      }
      if (!patientName.trim()) nextErrors.patientName = 'Patient name is required.';
      if (!species.trim()) nextErrors.species = 'Species is required.';
      if (weight.trim() && Number(weight) <= 0) nextErrors.weight = 'Weight must be positive.';
    }

    setFieldErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }

  function handleAppointmentTypeChange(id: string) {
    const setting = settings.find((candidate) => candidate.id === id);
    if (!setting) return;
    setAppointmentTypeSettingId(id);
    setSelectedSlotProviderId('');
    setAppointmentType(setting.appointmentType ?? 'WellnessPreventiveCare');
    setDurationMinutes(String(setting.defaultDurationMinutes));
    if (assignedProviderId && !setting.providers?.some((provider) => provider.id === assignedProviderId)) {
      setAssignedProviderId('');
      setError('That doctor is not assigned to this appointment type. Choose an available doctor.');
    }
    setStartTime('');
  }

  /** The "New Patient" path — one request to the transactional endpoint,
   *  which creates Client + Patient + PatientClient + Appointment together
   *  (see AppointmentsService.createWithNewPatient). Replaces the old
   *  three-separate-fetches sequence so a failure can never leave an
   *  orphaned client/patient with no appointment. */
  async function createAppointmentWithNewPatient(
    startsAtDate: Date,
  ): Promise<CreatedAppointmentWithNewPatientResponse> {
    const response = await fetch('/api/appointments/new-patient', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client: {
          firstName: clientFirstName.trim(),
          lastName: clientLastName.trim(),
          phone: clientPhone.trim() || undefined,
          email: clientEmail.trim() || undefined,
          addressLine1: clientAddressLine1.trim() || undefined,
          addressLine2: clientAddressLine2.trim() || undefined,
          city: clientCity.trim() || undefined,
          state: clientState.trim() || undefined,
          postalCode: clientPostalCode.trim() || undefined,
          country: clientCountry.trim() || undefined,
        },
        patient: {
          name: patientName.trim(),
          species,
          breed: breed.trim() || undefined,
          sex: sex || undefined,
          dateOfBirth: dateOfBirth || undefined,
          estimatedAge: estimatedAge.trim() || undefined,
          color: color.trim() || undefined,
          weight: weight.trim() ? Number(weight) : undefined,
        },
        appointment: {
          appointmentType,
          appointmentTypeId: appointmentTypeSettingId,
          visitReason: visitReason.trim() || selectedTypeSetting?.name || appointmentTypeLabel(appointmentType),
          startTime: startsAtDate.toISOString(),
          expectedDurationMinutes: Number(durationMinutes),
          assignedProviderId: selectedSlotProviderId || assignedProviderId || undefined,
          primaryCareVetName: primaryCareVetName.trim() || undefined,
          previousClinicName: previousClinicName.trim() || undefined,
          previousRecordsSource: previousRecordsSource.trim() || undefined,
          lastSeenAt: lastSeenAt || undefined,
        },
      }),
    });

    if (response.status === 409) {
      setAvailabilityVersion((current) => current + 1);
      throw new Error('slot-conflict');
    }
    if (!response.ok) {
      throw new Error('new-patient-appointment-create');
    }

    return (await response.json()) as CreatedAppointmentWithNewPatientResponse;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (!validate() || !startsAt) return;

    setSubmitting(true);

    try {
      if (editingAppointmentId && selectedPatient) {
        const response = await fetch(`/api/appointments/${encodeURIComponent(editingAppointmentId)}/move`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            startTime: startsAt.toISOString(),
            expectedDurationMinutes: Number(durationMinutes),
            assignedProviderId: selectedSlotProviderId || assignedProviderId || null,
          }),
        });
        if (response.status === 409) {
          setAvailabilityVersion((current) => current + 1);
          setError('That time was just taken. Choose another available time.');
          return;
        }
        if (!response.ok) throw new Error('appointment-update');
        const updated = (await response.json()) as CreatedAppointmentResponse;
        const selectedProvider = providers.find((provider) => provider.id === updated.providerId) ?? null;
        onCreated({
          id: updated.id,
          type: selectedTypeSetting?.name ?? updated.type,
          reason: visitReason.trim() || selectedTypeSetting?.name || appointmentTypeLabel(appointmentType),
          state: updated.state,
          scheduledAt: updated.scheduledAt,
          expectedDurationMinutes: updated.expectedDurationMinutes,
          colorKey: updated.colorKey ?? selectedTypeSetting?.color ?? null,
          patient: { id: selectedPatient.id, name: selectedPatient.name, species: selectedPatient.species },
          client: selectedPatient.primaryClient ? { id: selectedPatient.primaryClient.id, firstName: selectedPatient.primaryClient.firstName, lastName: selectedPatient.primaryClient.lastName } : null,
          provider: selectedProvider ? { id: selectedProvider.id, displayName: selectedProvider.displayName, role: selectedProvider.role } : null,
          room: null,
          appointmentType,
          appointmentTypeSettingId,
        });
        return;
      }

      if (patientMode === 'new') {
        const created = await createAppointmentWithNewPatient(startsAt);
        const selectedProvider =
          providers.find((provider) => provider.id === (created.providerId || selectedSlotProviderId || assignedProviderId)) ??
          null;

        onCreated({
          id: created.id,
          type: selectedTypeSetting?.name ?? created.type,
          reason: created.reason,
          state: created.state,
          scheduledAt: created.scheduledAt,
          expectedDurationMinutes: created.expectedDurationMinutes,
          colorKey: created.colorKey ?? selectedTypeSetting?.color ?? null,
          patient: created.patient,
          client: created.client,
          provider: selectedProvider
            ? {
                id: selectedProvider.id,
                displayName: selectedProvider.displayName,
                role: selectedProvider.role,
              }
            : null,
          room: null,
          appointmentType,
          appointmentTypeSettingId,
        });
        return;
      }

      if (!selectedPatient) {
        setError('Choose a patient before booking the appointment.');
        return;
      }

      const appointmentResponse = await fetch('/api/appointments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patientId: selectedPatient.id,
          clientId: selectedPatient.primaryClient?.id,
          appointmentType,
          appointmentTypeId: appointmentTypeSettingId,
          visitReason: visitReason.trim() || selectedTypeSetting?.name || appointmentTypeLabel(appointmentType),
          startTime: startsAt.toISOString(),
          expectedDurationMinutes: Number(durationMinutes),
          assignedProviderId: selectedSlotProviderId || assignedProviderId || undefined,
        }),
      });

      if (appointmentResponse.status === 409) {
        setAvailabilityVersion((current) => current + 1);
        setError('That time was just taken. Your details are still here—choose another available time.');
        return;
      }
      if (!appointmentResponse.ok) {
        throw new Error('appointment-create');
      }

      const created = (await appointmentResponse.json()) as CreatedAppointmentResponse;
      const selectedProvider =
        providers.find((provider) => provider.id === (created.providerId || selectedSlotProviderId || assignedProviderId)) ??
        null;

      onCreated({
        id: created.id,
        type: selectedTypeSetting?.name ?? created.type,
        reason: created.reason,
        state: created.state,
        scheduledAt: created.scheduledAt,
        expectedDurationMinutes: created.expectedDurationMinutes,
        colorKey: created.colorKey ?? selectedTypeSetting?.color ?? null,
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
        appointmentType,
        appointmentTypeSettingId,
      });
    } catch (caught) {
      setError(
        caught instanceof Error && caught.message === 'slot-conflict'
          ? 'That time was just taken. Your details are still here—choose another available time.'
          : patientMode === 'new'
          ? 'We could not create this appointment. No new patient was saved. Please try again.'
          : 'We could not create this appointment. Please check the fields and try again.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ModalFrame
      title={editingAppointmentId ? 'Edit Appointment' : 'New Appointment'}
      subtitle={editingAppointmentId ? 'Choose a corrected date, time, or provider.' : 'Book an appointment for an existing patient, or start a New Patient visit without leaving the flow.'}
      onClose={onClose}
    >
      <form className="scheduler-booking-form new-appointment-form" onSubmit={handleSubmit}>
        <section className="new-appointment-section new-appointment-visit" aria-labelledby="appointment-details-heading">
          <div className="new-appointment-section__header">
            <div>
              <h3 id="appointment-details-heading">Visit details</h3>
              <p className="scheduler-modal__hint">Choose what they need, then pick a valid Scheduler time.</p>
            </div>
            {durationMinutes ? <span className="new-appointment-duration">{durationMinutes} min</span> : null}
          </div>
          <div className="new-appointment-preferences">
            <FieldError label="Appointment type" error={fieldErrors.appointmentType}>
              <select value={appointmentTypeSettingId} onChange={(event) => handleAppointmentTypeChange(event.target.value)} required disabled={Boolean(editingAppointmentId)}>
                <option value="" disabled>Select appointment type</option>
                {activeAppointmentTypes.map((setting) => <option key={setting.id} value={setting.id}>{setting.name} · {setting.defaultDurationMinutes} min</option>)}
              </select>
            </FieldError>
            <FieldError label="Preferred provider" error={fieldErrors.assignedProviderId}>
              <select value={assignedProviderId} onChange={(event) => { setAssignedProviderId(event.target.value); setSelectedSlotProviderId(''); setStartTime(''); }} disabled={providers.length === 0}>
                <option value="">Any available provider</option>
                {eligibleProviders.map((provider) => <option key={provider.id} value={provider.id}>{provider.displayName}</option>)}
              </select>
            </FieldError>
          </div>

          <div className="new-appointment-availability" aria-live="polite">
            <div className="new-appointment-section__header">
              <div>
                <h3>Available times</h3>
                <p className="scheduler-modal__hint">Times fit completely inside active Scheduler blocks.</p>
              </div>
              {availability.length > 0 ? <span className="new-appointment-next">Next available</span> : null}
            </div>
            {availabilityLoading && availability.length === 0 ? <div className="new-appointment-loading">Finding the soonest openings…</div> : null}
            {!availabilityLoading && availabilityError ? (
              <div className="new-appointment-empty" role="alert">
                <strong>We couldn’t load the Scheduler.</strong>
                <span>Try again before booking.</span>
                <button type="button" onClick={() => setAvailabilityVersion((value) => value + 1)}>Try again</button>
              </div>
            ) : null}
            {!availabilityLoading && !availabilityError && configurationError === 'NO_ASSIGNED_PROVIDERS' ? (
              <div className="new-appointment-empty">
                <strong>No doctors are assigned to this appointment type.</strong>
                <span>Update Appointment Types in Settings before booking.</span>
              </div>
            ) : null}
            {!appointmentTypeSettingId ? (
              <div className="new-appointment-empty">
                <strong>Select an appointment type to see available times.</strong>
                <span>Duration and eligible doctors are set by the appointment type.</span>
              </div>
            ) : null}
            {appointmentTypeSettingId && !availabilityLoading && !availabilityError && !configurationError && availability.length === 0 ? (
              <div className="new-appointment-empty">
                <strong>No times in this date range.</strong>
                <span>Try another date or provider.</span>
                <div className="new-appointment-empty__actions"><button type="button" onClick={findNextAvailable}>Find Next Available</button>{assignedProviderId ? <button type="button" onClick={() => setAssignedProviderId('')}>Choose Any Provider</button> : null}</div>
              </div>
            ) : null}
            {appointmentTypeSettingId && !availabilityLoading && !availabilityError && !configurationError && availability.length > 0 && visibleSlots.length === 0 ? <div className="new-appointment-empty"><strong>No times on this date.</strong><span>Choose another nearby date.</span><button type="button" onClick={findNextAvailable}>View Next Date With Availability</button></div> : null}
            {appointmentTypeSettingId ? <div className="new-appointment-date-tools">
              <button type="button" onClick={() => { setDateStripStart(todayValue); chooseDate(todayValue); }}>Today</button>
              <button type="button" onClick={findNextAvailable}>Next Available</button>
              <label><span>Select Date</span><input type="date" min={todayValue} max={bookingLimit} value={selectedDate} onChange={(event) => jumpToDate(event.target.value)} /></label>
            </div> : null}
            {nearbyDates.length > 0 && appointmentTypeSettingId ? (
              <div className="new-appointment-date-navigation"><button type="button" className="new-appointment-date-arrow" aria-label="Previous week" disabled={dateStripStart <= todayValue} onClick={() => moveDateStrip(-1)}>‹</button><div key={dateStripMotion.key} className={`new-appointment-date-strip${dateStripMotion.key > 0 ? ` new-appointment-date-strip--${dateStripMotion.direction}` : ''}`} aria-label="Available dates">
                {nearbyDates.map((date) => {
                  const value = new Date(`${date}T12:00:00`);
                  const hasTimes = availability.some((slot) => formatDateInput(new Date(slot.start)) === date);
                  const isSelected = selectedDate === date;
                  return <button type="button" key={date} aria-pressed={isSelected} aria-label={`${value.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })}${hasTimes ? ', times available' : ', no times available'}`} disabled={!hasTimes} onClick={() => chooseDate(date)}><span>{value.toLocaleDateString([], { weekday: 'short' })}</span><strong>{value.toLocaleDateString([], { month: 'short', day: 'numeric' })}</strong>{isSelected ? <small>✓ Selected</small> : hasTimes ? <small>Times</small> : <small>No times</small>}</button>;
                })}
              </div><button type="button" className="new-appointment-date-arrow" aria-label="Next week" disabled={nearbyDates[nearbyDates.length - 1] === bookingLimit} onClick={() => moveDateStrip(1)}>›</button></div>
            ) : null}
            {slotGroups.length > 0 ? (
              <div className="new-appointment-slot-scroll">
              {slotGroups.map((group) => <section key={group.label} className="new-appointment-slot-group"><h4>{group.label}</h4><div className="new-appointment-slots">
                {group.slots.map((slot) => {
                  const start = new Date(slot.start);
                  const selected = startsAt?.toISOString() === slot.start && selectedSlotProviderId === (slot.providerId ?? '');
                  const provider = providers.find((item) => item.id === slot.providerId);
                  return <button type="button" key={`${slot.start}-${slot.providerId}`} className={selected ? 'new-appointment-slot new-appointment-slot--selected' : 'new-appointment-slot'} aria-pressed={selected} onClick={() => selectSlot(slot)}><strong>{selected ? '✓ ' : ''}{formatTime(start)}</strong>{!assignedProviderId && provider ? <span>{provider.displayName}</span> : null}</button>;
                })}
              </div></section>)}</div>
            ) : null}
          </div>
        </section>

        <section className={`new-appointment-section new-appointment-patient${editingAppointmentId ? ' new-appointment-section--locked' : ''}`} aria-labelledby="client-patient-heading">
          <div className="new-appointment-section__header">
            <h3 id="client-patient-heading">Patient</h3>
            <div className="new-appointment-toggle" aria-label="Patient mode">
              <button
                type="button"
                className={patientMode === 'existing' ? 'new-appointment-toggle__button--active' : undefined}
                onClick={() => setPatientMode('existing')}
              >
                Existing Patient
              </button>
              <button
                type="button"
                className={patientMode === 'new' ? 'new-appointment-toggle__button--active' : undefined}
                onClick={() => {
                  setPatientMode('new');
                  setSelectedPatient(null);
                }}
              >
                New Patient
              </button>
            </div>
          </div>

          {patientMode === 'existing' ? (
            <fieldset className="scheduler-booking-fieldset">
              <FieldError label="Search existing patient" error={fieldErrors.patientSearch}>
                <input
                  type="search"
                  value={patientQuery}
                  onChange={(event) => {
                    setPatientQuery(event.target.value);
                    setSelectedPatient(null);
                  }}
                  placeholder="Search pet or owner name"
                  autoFocus={!initialPatient}
                />
              </FieldError>
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
                        setPatientResults([]);
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
                <SelectedPatientSummary selectedPatient={selectedPatient} />
              ) : (
                <p className="scheduler-modal__hint">Pet not found? Use New Patient.</p>
              )}
            </fieldset>
          ) : (
            <div className="new-appointment-new-patient-form">
              <h4 className="new-appointment-subheading">Owner Information</h4>
              <div className="new-appointment-inline-form">
                <FieldError label="First name" error={fieldErrors.clientFirstName}>
                  <input value={clientFirstName} onChange={(event) => setClientFirstName(event.target.value)} />
                </FieldError>
                <FieldError label="Last name" error={fieldErrors.clientLastName}>
                  <input value={clientLastName} onChange={(event) => setClientLastName(event.target.value)} />
                </FieldError>
                <FieldError label="Phone number" error={fieldErrors.clientPhone}>
                  <input value={clientPhone} onChange={(event) => setClientPhone(event.target.value)} />
                </FieldError>
                <FieldError label="Email" error={fieldErrors.clientEmail}>
                  <input
                    type="email"
                    value={clientEmail}
                    onChange={(event) => setClientEmail(event.target.value)}
                  />
                </FieldError>
                <FieldError label="Address line 1" error={fieldErrors.clientAddressLine1}>
                  <input
                    value={clientAddressLine1}
                    onChange={(event) => setClientAddressLine1(event.target.value)}
                    placeholder="Street address"
                  />
                </FieldError>
                <FieldError label="Address line 2" error={fieldErrors.clientAddressLine2}>
                  <input
                    value={clientAddressLine2}
                    onChange={(event) => setClientAddressLine2(event.target.value)}
                    placeholder="Apartment, suite, unit"
                  />
                </FieldError>
                <FieldError label="City" error={fieldErrors.clientCity}>
                  <input value={clientCity} onChange={(event) => setClientCity(event.target.value)} />
                </FieldError>
                <FieldError label="State" error={fieldErrors.clientState}>
                  <input value={clientState} onChange={(event) => setClientState(event.target.value)} />
                </FieldError>
                <FieldError label="ZIP/postal code" error={fieldErrors.clientPostalCode}>
                  <input
                    value={clientPostalCode}
                    onChange={(event) => setClientPostalCode(event.target.value)}
                  />
                </FieldError>
                <FieldError label="Country" error={fieldErrors.clientCountry}>
                  <input value={clientCountry} onChange={(event) => setClientCountry(event.target.value)} />
                </FieldError>
              </div>
              {clientDuplicateHint ? (
                <p className="scheduler-modal__hint new-appointment-duplicate-hint" role="status">
                  Possible existing client found: {clientDuplicateHint}. Review before creating a new client.
                </p>
              ) : null}

              <h4 className="new-appointment-subheading">Patient Information</h4>
              <div className="new-appointment-inline-form">
                <FieldError label="Patient name" error={fieldErrors.patientName}>
                  <input value={patientName} onChange={(event) => setPatientName(event.target.value)} />
                </FieldError>
                <FieldError label="Species" error={fieldErrors.species}>
                  <select value={species} onChange={(event) => setSpecies(event.target.value)}>
                    {SPECIES_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </FieldError>
                <FieldError label="Breed" error={fieldErrors.breed}>
                  <input value={breed} onChange={(event) => setBreed(event.target.value)} />
                </FieldError>
                <FieldError label="Sex" error={fieldErrors.sex}>
                  <select value={sex} onChange={(event) => setSex(event.target.value)}>
                    <option value="">Unknown</option>
                    {SEX_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </FieldError>
                <FieldError label="Date of birth" error={fieldErrors.dateOfBirth}>
                  <input
                    type="date"
                    value={dateOfBirth}
                    onChange={(event) => setDateOfBirth(event.target.value)}
                  />
                </FieldError>
                <FieldError label="Age estimate" error={fieldErrors.estimatedAge}>
                  <input
                    value={estimatedAge}
                    onChange={(event) => setEstimatedAge(event.target.value)}
                    placeholder="e.g. 4 years"
                  />
                </FieldError>
                <FieldError label="Color / description" error={fieldErrors.color}>
                  <input value={color} onChange={(event) => setColor(event.target.value)} />
                </FieldError>
                <FieldError label="Weight" error={fieldErrors.weight}>
                  <input
                    type="number"
                    min="0"
                    step="0.1"
                    value={weight}
                    onChange={(event) => setWeight(event.target.value)}
                  />
                </FieldError>
              </div>

              <h4 className="new-appointment-subheading">Records Request</h4>
              <p className="new-appointment-subheading__helper">
                Optional — only needed if this clinic hasn&apos;t seen this pet before.
              </p>
              <div className="new-appointment-inline-form">
                <FieldError label="Primary care vet" error={fieldErrors.primaryCareVetName}>
                  <input
                    value={primaryCareVetName}
                    onChange={(event) => setPrimaryCareVetName(event.target.value)}
                    placeholder="Optional"
                  />
                </FieldError>
                <FieldError label="Previous clinic" error={fieldErrors.previousClinicName}>
                  <input
                    value={previousClinicName}
                    onChange={(event) => setPreviousClinicName(event.target.value)}
                    placeholder="Optional"
                  />
                </FieldError>
                <FieldError label="Records source" error={fieldErrors.previousRecordsSource}>
                  <input
                    value={previousRecordsSource}
                    onChange={(event) => setPreviousRecordsSource(event.target.value)}
                    placeholder="e.g. will fax records"
                  />
                </FieldError>
                <FieldError label="Date/time last seen" error={fieldErrors.lastSeenAt}>
                  <input
                    type="datetime-local"
                    value={lastSeenAt}
                    onChange={(event) => setLastSeenAt(event.target.value)}
                  />
                </FieldError>
              </div>
            </div>
          )}
        </section>

        <section className={`new-appointment-section new-appointment-notes${editingAppointmentId ? ' new-appointment-section--locked' : ''}`} aria-labelledby="appointment-notes-heading">
          <h3 id="appointment-notes-heading">Notes</h3>
          <FieldError label="Scheduling note (optional)" error={fieldErrors.visitReason}>
            <textarea
              value={visitReason}
              onChange={(event) => setVisitReason(event.target.value)}
              maxLength={500}
              placeholder="Reason for visit or scheduling notes"
            />
          </FieldError>
        </section>

        {error ? (
          <p className="scheduler-modal__error" role="alert">
            {error}
          </p>
        ) : null}

        <div className="scheduler-modal__actions new-appointment-actions">
          <div className="new-appointment-footer-summary">
            {startsAt && endTime ? `${startsAt.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })} · ${formatTime(startsAt)}–${formatTime(endTime)}${selectedSlotProviderId || assignedProviderId ? ` · ${providers.find((provider) => provider.id === (selectedSlotProviderId || assignedProviderId))?.displayName ?? ''}` : ''}` : 'Choose an available time to continue'}
          </div>
          <button type="button" className="scheduler-secondary-action" onClick={onClose} disabled={submitting}>
            Cancel
          </button>
          <button type="submit" className="scheduler-primary-action" disabled={submitting || !startsAt || (patientMode === 'existing' && !selectedPatient)}>
            {submitting ? (editingAppointmentId ? 'Saving…' : 'Scheduling…') : (editingAppointmentId ? 'Save Changes' : 'Schedule Appointment')}
          </button>
        </div>
      </form>
    </ModalFrame>
  );
}

export function AppointmentConfirmationModal({ appointment, onClose, onEdit }: { appointment: NewAppointmentCreatedSummary; onClose: () => void; onEdit: () => void }) {
  const startsAt = new Date(appointment.scheduledAt);
  const endsAt = new Date(startsAt.getTime() + (appointment.expectedDurationMinutes ?? 0) * 60_000);
  return (
    <ModalFrame title="Appointment Confirmed" subtitle="Everything is booked and ready for the clinic schedule." onClose={onClose}>
      <div className="appointment-confirmation">
        <div className="appointment-confirmation__check" aria-hidden="true">✓</div>
        <div className="appointment-confirmation__heading">
          <h3>{appointment.patient?.name ?? 'Appointment'} is on the schedule</h3>
          <p>{appointment.type}</p>
        </div>
        <dl className="appointment-confirmation__details">
          <div><dt>Date</dt><dd>{startsAt.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}</dd></div>
          <div><dt>Time</dt><dd>{formatTime(startsAt)}–{formatTime(endsAt)}</dd></div>
          <div><dt>Provider</dt><dd>{appointment.provider?.displayName ?? 'Any available provider'}</dd></div>
          <div><dt>Client</dt><dd>{appointment.client ? `${appointment.client.firstName} ${appointment.client.lastName}` : 'Not listed'}</dd></div>
        </dl>
        <p className="appointment-confirmation__note">The appointment was saved successfully. Confirmation messages are managed separately.</p>
        <div className="appointment-confirmation__actions">
          <button type="button" className="scheduler-secondary-action" onClick={onEdit}>Edit Appointment</button>
          <button type="button" className="scheduler-primary-action" onClick={onClose}>Done</button>
        </div>
      </div>
    </ModalFrame>
  );
}

function FieldError({
  label,
  error,
  children,
}: {
  label: string;
  error?: string | undefined;
  children: ReactNode;
}) {
  return (
    <label>
      <span>{label}</span>
      {children}
      {error ? <small className="new-appointment-field-error">{error}</small> : null}
    </label>
  );
}

function SelectedPatientSummary({ selectedPatient }: { selectedPatient: PatientSearchResult }) {
  return (
    <div className="scheduler-selected-patient">
      <strong>{selectedPatient.name}</strong>
      <span>
        {selectedPatient.species}
        {selectedPatient.breed ? ` · ${selectedPatient.breed}` : ''}
      </span>
      <span>
        {selectedPatient.primaryClient
          ? `${clientDisplayName(selectedPatient.primaryClient)}${
              selectedPatient.primaryClient.phone ? ` · ${selectedPatient.primaryClient.phone}` : ''
            }`
          : 'No owner linked'}
      </span>
    </div>
  );
}
