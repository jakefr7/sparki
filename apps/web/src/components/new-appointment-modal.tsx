'use client';

import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { useLockBodyScroll } from '../hooks/use-lock-body-scroll';
import {
  APPOINTMENT_TYPES,
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
  color: string;
  isActive: boolean;
  sortOrder: number;
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

const FALLBACK_APPOINTMENT_COLOR = '#475569';

const DEFAULT_APPOINTMENT_TYPE_SETTINGS: AppointmentTypeSetting[] = APPOINTMENT_TYPES.map(
  (appointmentType, index) => ({
    id: `default-${appointmentType}`,
    appointmentType,
    name: appointmentTypeLabel(appointmentType),
    color: FALLBACK_APPOINTMENT_COLOR,
    isActive: true,
    sortOrder: (index + 1) * 10,
  }),
);

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

function configuredAppointmentTypeLabel(
  type: string,
  appointmentTypes: AppointmentTypeSetting[],
): string {
  return appointmentTypes.find((setting) => setting.appointmentType === type)?.name ?? appointmentTypeLabel(type);
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
  initialDurationMinutes,
  initialProviderId,
  providers,
  appointmentTypes,
  onClose,
  onCreated,
}: {
  initialPatient?: InitialPatient | null;
  initialDate?: string | Date | null;
  initialStartTime?: string | Date | null;
  initialDurationMinutes?: number | null;
  initialProviderId?: string | null;
  providers: StaffMember[];
  appointmentTypes?: AppointmentTypeSetting[];
  onClose: () => void;
  onCreated: (appointment: NewAppointmentCreatedSummary) => void;
}) {
  const settings = appointmentTypes?.length ? appointmentTypes : DEFAULT_APPOINTMENT_TYPE_SETTINGS;
  const activeAppointmentTypes = useMemo(
    () =>
      settings
        .filter((setting) => setting.isActive && setting.appointmentType)
        .sort((a, b) => a.sortOrder - b.sortOrder),
    [settings],
  );
  const defaultAppointmentType =
    activeAppointmentTypes[0]?.appointmentType ?? 'WellnessPreventiveCare';
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
  const [startTime, setStartTime] = useState(formatTimeInput(initialStartDate));
  const [durationMinutes, setDurationMinutes] = useState(String(initialDurationMinutes ?? 30));
  const [appointmentType, setAppointmentType] =
    useState<AppointmentTypeValue>(defaultAppointmentType);
  const [visitReason, setVisitReason] = useState(
    configuredAppointmentTypeLabel(defaultAppointmentType, settings),
  );
  const [assignedProviderId, setAssignedProviderId] = useState(initialProviderId ?? '');
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

  useEffect(() => {
    if (!initialProviderId && providers.length === 1) {
      setAssignedProviderId(providers[0]!.id);
    }
  }, [initialProviderId, providers]);

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

  function validate(): boolean {
    const nextErrors: Record<string, string> = {};
    if (!appointmentDate) nextErrors.appointmentDate = 'Choose an appointment date.';
    if (!startTime) nextErrors.startTime = 'Choose a start time.';
    if (!startsAt) nextErrors.startTime = 'Enter a valid date and time.';
    if (!durationMinutes || Number(durationMinutes) <= 0) {
      nextErrors.durationMinutes = 'Choose a duration.';
    }
    if (!appointmentType) nextErrors.appointmentType = 'Choose an appointment type.';
    if (!visitReason.trim()) nextErrors.visitReason = 'Add a reason for the visit.';

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

  function handleAppointmentTypeChange(value: AppointmentTypeValue) {
    setAppointmentType(value);
    setVisitReason((current) =>
      current.trim() ? current : configuredAppointmentTypeLabel(value, settings),
    );
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
          visitReason: visitReason.trim(),
          startTime: startsAtDate.toISOString(),
          expectedDurationMinutes: Number(durationMinutes),
          assignedProviderId: assignedProviderId || undefined,
          primaryCareVetName: primaryCareVetName.trim() || undefined,
          previousClinicName: previousClinicName.trim() || undefined,
          previousRecordsSource: previousRecordsSource.trim() || undefined,
          lastSeenAt: lastSeenAt || undefined,
        },
      }),
    });

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
      if (patientMode === 'new') {
        const created = await createAppointmentWithNewPatient(startsAt);
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
          visitReason: visitReason.trim(),
          startTime: startsAt.toISOString(),
          expectedDurationMinutes: Number(durationMinutes),
          assignedProviderId: assignedProviderId || undefined,
        }),
      });

      if (!appointmentResponse.ok) {
        throw new Error('appointment-create');
      }

      const created = (await appointmentResponse.json()) as CreatedAppointmentResponse;
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
      setError(
        patientMode === 'new'
          ? 'We could not create this appointment. No new patient was saved. Please try again.'
          : 'We could not create this appointment. Please check the fields and try again.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ModalFrame
      title="New Appointment"
      subtitle="Book an appointment for an existing patient, or start a New Patient visit without leaving the flow."
      onClose={onClose}
    >
      <form className="scheduler-booking-form new-appointment-form" onSubmit={handleSubmit}>
        <section className="new-appointment-section" aria-labelledby="appointment-details-heading">
          <div className="new-appointment-section__header">
            <h3 id="appointment-details-heading">Appointment Information</h3>
            <span className="status-badge status-badge--scheduled">Upcoming</span>
          </div>
          <div className="scheduler-booking-grid">
            <FieldError label="Appointment date" error={fieldErrors.appointmentDate}>
              <input
                type="date"
                value={appointmentDate}
                onChange={(event) => setAppointmentDate(event.target.value)}
                required
              />
            </FieldError>
            <FieldError label="Start time" error={fieldErrors.startTime}>
              <input
                type="time"
                value={startTime}
                onChange={(event) => setStartTime(event.target.value)}
                required
              />
            </FieldError>
            <FieldError label="Duration" error={fieldErrors.durationMinutes}>
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
            </FieldError>
            <FieldError label="Appointment type" error={fieldErrors.appointmentType}>
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
            </FieldError>
            <FieldError label="Doctor / Provider" error={fieldErrors.assignedProviderId}>
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
            </FieldError>
            <FieldError label="Location" error={fieldErrors.location}>
              <input type="text" value="Current clinic location" readOnly />
            </FieldError>
          </div>
          <div className="new-appointment-time-summary">
            {startsAt && endTime ? `${formatTime(startsAt)} - ${formatTime(endTime)}` : 'Time not set'}
          </div>
        </section>

        <section className="new-appointment-section" aria-labelledby="client-patient-heading">
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

        <section className="new-appointment-section" aria-labelledby="appointment-notes-heading">
          <h3 id="appointment-notes-heading">Notes</h3>
          <FieldError label="Reason for visit / appointment note" error={fieldErrors.visitReason}>
            <textarea
              value={visitReason}
              onChange={(event) => setVisitReason(event.target.value)}
              maxLength={500}
              required
            />
          </FieldError>
        </section>

        {error ? (
          <p className="scheduler-modal__error" role="alert">
            {error}
          </p>
        ) : null}

        <div className="scheduler-modal__actions new-appointment-actions">
          <button type="button" className="scheduler-secondary-action" onClick={onClose} disabled={submitting}>
            Cancel
          </button>
          <button type="submit" className="scheduler-primary-action" disabled={submitting}>
            {submitting ? 'Booking...' : 'Book appointment'}
          </button>
        </div>
      </form>
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
