'use client';
import { BreedField } from './breed-field';

import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { AddressAutocompleteField, type AddressAutofillResult } from './address-autocomplete-field';
import { DateOfBirthField } from './date-of-birth-field';
import { dateOfBirthPayload, initialDateOfBirthValue, type DateOfBirthValue } from '../lib/date-of-birth';
import { timeLabel } from '../lib/format';
import {
  appointmentTypeLabel,
  clientDisplayName,
  SEX_OPTIONS,
  SPECIES_OPTIONS,
  type ClientSearchResult,
  type DashboardAppointmentSummary,
  type OperationsDashboard,
} from '../lib/patient-types';

const DEBOUNCE_MS = 150;

type VisitMode = 'walkin' | 'appointment';

export function FrontDeskIntakeForm() {
  const router = useRouter();

  // Client
  const clientSearchRef = useRef<HTMLInputElement>(null);
  const [clientQuery, setClientQuery] = useState('');
  const [clientResults, setClientResults] = useState<ClientSearchResult[]>([]);
  const [clientActiveIndex, setClientActiveIndex] = useState(0);
  const [selectedClient, setSelectedClient] = useState<ClientSearchResult | null>(null);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [alternatePhone, setAlternatePhone] = useState('');
  const [email, setEmail] = useState('');
  const [addressLine1, setAddressLine1] = useState('');
  const [addressLine2, setAddressLine2] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [country, setCountry] = useState('');
  const [addressAutofill, setAddressAutofill] = useState<AddressAutofillResult | null>(null);

  // Patient
  const patientNameRef = useRef<HTMLInputElement>(null);
  const [patientName, setPatientName] = useState('');
  const [species, setSpecies] = useState<string>(SPECIES_OPTIONS[0]);
  const [otherSpecies, setOtherSpecies] = useState('');
  const [breed, setBreed] = useState('');
  const [sex, setSex] = useState<string>('');
  const [dateOfBirth, setDateOfBirth] = useState<DateOfBirthValue>(() =>
    initialDateOfBirthValue(null, false, 'estimated'),
  );
  const [weight, setWeight] = useState('');
  const [color, setColor] = useState('');

  // Visit
  const [reason, setReason] = useState('');
  const [visitMode, setVisitMode] = useState<VisitMode>('walkin');
  const [todaysAppointments, setTodaysAppointments] = useState<DashboardAppointmentSummary[]>([]);
  const [selectedAppointmentId, setSelectedAppointmentId] = useState('');
  const [appointmentsLoading, setAppointmentsLoading] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Keyboard-first: land in client search immediately.
  useEffect(() => {
    clientSearchRef.current?.focus();
  }, []);

  // Existing-client search appears immediately while typing.
  useEffect(() => {
    if (selectedClient) return;
    const trimmed = clientQuery.trim();
    if (!trimmed) {
      setClientResults([]);
      setClientActiveIndex(0);
      return;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => {
      fetch(`/api/clients/search?query=${encodeURIComponent(trimmed)}`, {
        signal: controller.signal,
      })
        .then((response) => response.json() as Promise<ClientSearchResult[]>)
        .then((data) => {
          setClientResults(data);
          setClientActiveIndex(0);
        })
        .catch((caught: unknown) => {
          if (!(caught instanceof DOMException && caught.name === 'AbortError')) {
            setClientResults([]);
          }
        });
    }, DEBOUNCE_MS);

    return () => {
      controller.abort();
      clearTimeout(timeout);
    };
  }, [clientQuery, selectedClient]);

  useEffect(() => {
    if (visitMode !== 'appointment') return;

    const controller = new AbortController();
    setAppointmentsLoading(true);
    fetch('/api/operations/dashboard', { cache: 'no-store', signal: controller.signal })
      .then((response) => response.json() as Promise<OperationsDashboard>)
      .then((data) => {
        setTodaysAppointments(data.todaysAppointments ?? []);
      })
      .catch((caught: unknown) => {
        if (!(caught instanceof DOMException && caught.name === 'AbortError')) {
          setTodaysAppointments([]);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setAppointmentsLoading(false);
        }
      });

    return () => controller.abort();
  }, [visitMode]);

  const clientIdForAppointments = selectedClient?.id;
  const clientAppointments = useMemo(
    () =>
      clientIdForAppointments
        ? todaysAppointments.filter(
            (appointment) =>
              appointment.client?.id === clientIdForAppointments &&
              !appointment.patient &&
              !['Cancelled', 'NoShow', 'Completed'].includes(appointment.state),
          )
        : [],
    [clientIdForAppointments, todaysAppointments],
  );

  useEffect(() => {
    if (visitMode !== 'appointment') {
      setSelectedAppointmentId('');
      return;
    }

    if (
      selectedAppointmentId &&
      !clientAppointments.some((appointment) => appointment.id === selectedAppointmentId)
    ) {
      setSelectedAppointmentId('');
    }
  }, [clientAppointments, selectedAppointmentId, visitMode]);

  function selectClient(client: ClientSearchResult) {
    setSelectedClient(client);
    setClientQuery('');
    setClientResults([]);
    // Client resolved — jump straight to the next section.
    requestAnimationFrame(() => patientNameRef.current?.focus());
  }

  function changeClient() {
    setSelectedClient(null);
    setVisitMode('walkin');
    requestAnimationFrame(() => clientSearchRef.current?.focus());
  }

  function handleClientSearchKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (clientResults.length === 0) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setClientActiveIndex((index) => Math.min(index + 1, clientResults.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setClientActiveIndex((index) => Math.max(index - 1, 0));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const selected = clientResults[clientActiveIndex];
      if (selected) selectClient(selected);
    } else if (event.key === 'Escape') {
      setClientQuery('');
      setClientResults([]);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      let clientId = selectedClient?.id;

      if (!clientId) {
        const response = await fetch('/api/clients', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            firstName,
            lastName,
            phone: phone || undefined,
            alternatePhone: alternatePhone || undefined,
            email: email || undefined,
            addressLine1: addressLine1 || undefined,
            addressLine2: addressLine2 || undefined,
            city: city || undefined,
            state: state || undefined,
            postalCode: postalCode || undefined,
            country: country || undefined,
            formattedAddress: addressAutofill?.formattedAddress || undefined,
            addressPlaceId: addressAutofill?.placeId || undefined,
            addressLatitude: addressAutofill?.latitude ?? undefined,
            addressLongitude: addressAutofill?.longitude ?? undefined,
          }),
        });
        if (!response.ok) {
          throw new Error('Could not create client. Check the fields and try again.');
        }
        const client: { id: string } = await response.json();
        clientId = client.id;
      }

      const patientResponse = await fetch('/api/patients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: patientName,
          species: species === 'Other' ? otherSpecies : species,
          breed: breed || undefined,
          sex: sex || undefined,
          ...(dateOfBirth.date ? dateOfBirthPayload(dateOfBirth) : {}),
          weight: weight ? Number(weight) : undefined,
          color: color || undefined,
          clients: [{ clientId, isPrimary: true }],
        }),
      });
      if (!patientResponse.ok) {
        throw new Error('Could not create patient. Check the fields and try again.');
      }
      const patient: { id: string } = await patientResponse.json();

      if (visitMode === 'walkin') {
        const visitResponse = await fetch('/api/visits', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ patientId: patient.id, reason }),
        });
        if (!visitResponse.ok) {
          throw new Error('Patient was created, but the walk-in visit could not be started.');
        }
        router.push('/');
      } else {
        if (!selectedClient || !selectedAppointmentId) {
          throw new Error("Choose today's appointment before creating the patient.");
        }
        const appointmentResponse = await fetch(
          `/api/appointments/${selectedAppointmentId}/link-patient`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ patientId: patient.id, clientId }),
          },
        );
        if (!appointmentResponse.ok) {
          throw new Error('Patient was created, but the appointment could not be updated.');
        }
        router.push(`/patients/${patient.id}`);
      }

      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not complete registration.');
      setSubmitting(false);
    }
  }

  const primaryActionLabel = selectedClient ? 'Create Patient' : 'Create Client & Patient';

  return (
    <div className="front-desk-panel">
      <form onSubmit={handleSubmit} className="front-desk-form">
        <fieldset className="front-desk-section">
          <legend>Client</legend>

          {!selectedClient && (
            <>
              <div className="front-desk-search-wrap">
                <label htmlFor="client-search">Search existing client</label>
                <input
                  ref={clientSearchRef}
                  id="client-search"
                  type="text"
                  role="combobox"
                  aria-expanded={clientResults.length > 0}
                  aria-controls="client-search-results"
                  autoComplete="off"
                  placeholder="Phone, last name, or email"
                  value={clientQuery}
                  onChange={(event) => setClientQuery(event.target.value)}
                  onKeyDown={handleClientSearchKeyDown}
                />
                {clientResults.length > 0 && (
                  <ul
                    id="client-search-results"
                    role="listbox"
                    className="front-desk-search-results"
                  >
                    {clientResults.map((result, index) => (
                      <li
                        key={result.id}
                        role="option"
                        aria-selected={index === clientActiveIndex}
                        className={
                          index === clientActiveIndex
                            ? 'front-desk-search-result front-desk-search-result--active'
                            : 'front-desk-search-result'
                        }
                        onMouseEnter={() => setClientActiveIndex(index)}
                        onClick={() => selectClient(result)}
                      >
                        <strong>{clientDisplayName(result)}</strong>
                        <span>{result.phone ?? result.email ?? 'No contact on file'}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="front-desk-grid front-desk-grid--client">
                <label htmlFor="client-first-name">
                  First name
                  <input
                    id="client-first-name"
                    type="text"
                    value={firstName}
                    onChange={(event) => setFirstName(event.target.value)}
                    required
                    maxLength={100}
                  />
                </label>
                <label htmlFor="client-last-name">
                  Last name
                  <input
                    id="client-last-name"
                    type="text"
                    value={lastName}
                    onChange={(event) => setLastName(event.target.value)}
                    required
                    maxLength={100}
                  />
                </label>
                <label htmlFor="client-phone">
                  Cell phone
                  <input
                    id="client-phone"
                    type="tel"
                    value={phone}
                    onChange={(event) => setPhone(event.target.value)}
                    required
                    maxLength={50}
                  />
                </label>
                <label htmlFor="client-alternate-phone">
                  Alternate phone
                  <input
                    id="client-alternate-phone"
                    type="tel"
                    value={alternatePhone}
                    onChange={(event) => setAlternatePhone(event.target.value)}
                    placeholder="Optional"
                    maxLength={50}
                  />
                </label>
                <label htmlFor="client-email">
                  Email
                  <input
                    id="client-email"
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="Optional"
                  />
                </label>
                <div className="front-desk-grid__field--full">
                  <AddressAutocompleteField
                    id="client-address"
                    label="Street address"
                    value={addressLine1}
                    onChange={setAddressLine1}
                    onAddressSelected={(result) => {
                      setAddressLine1(result.addressLine1);
                      setCity(result.city);
                      setState(result.state);
                      setPostalCode(result.postalCode);
                      setCountry(result.country);
                      setAddressAutofill(result);
                    }}
                  />
                </div>
                <label htmlFor="client-address-2">
                  Address line 2 (apt/suite)
                  <input
                    id="client-address-2"
                    type="text"
                    value={addressLine2}
                    onChange={(event) => setAddressLine2(event.target.value)}
                    placeholder="Optional"
                    maxLength={200}
                  />
                </label>
                <label htmlFor="client-city">
                  City
                  <input
                    id="client-city"
                    type="text"
                    value={city}
                    onChange={(event) => setCity(event.target.value)}
                    placeholder="Optional"
                    maxLength={100}
                  />
                </label>
                <label htmlFor="client-state">
                  State
                  <input
                    id="client-state"
                    type="text"
                    value={state}
                    onChange={(event) => setState(event.target.value)}
                    placeholder="Optional"
                    maxLength={100}
                  />
                </label>
                <label htmlFor="client-postal-code">
                  ZIP/postal code
                  <input
                    id="client-postal-code"
                    type="text"
                    value={postalCode}
                    onChange={(event) => setPostalCode(event.target.value)}
                    placeholder="Optional"
                    maxLength={20}
                  />
                </label>
                <label htmlFor="client-country">
                  Country
                  <input
                    id="client-country"
                    type="text"
                    value={country}
                    onChange={(event) => setCountry(event.target.value)}
                    placeholder="Optional"
                    maxLength={100}
                  />
                </label>
              </div>
            </>
          )}

          {selectedClient && (
            <div className="front-desk-selected-client">
              <div>
                <strong>{clientDisplayName(selectedClient)}</strong>
                <span>{selectedClient.phone ?? selectedClient.email ?? 'No contact on file'}</span>
              </div>
              <button type="button" className="button-secondary" onClick={changeClient}>
                Change
              </button>
            </div>
          )}
        </fieldset>

        <fieldset className="front-desk-section">
          <legend>Patient</legend>
          <div className="front-desk-grid">
            <label htmlFor="patient-name">
              Pet first name
              <input
                ref={patientNameRef}
                id="patient-name"
                type="text"
                value={patientName}
                onChange={(event) => setPatientName(event.target.value)}
                required
                maxLength={200}
              />
            </label>
            <label htmlFor="patient-species">
              Species
              <select
                id="patient-species"
                value={species}
                onChange={(event) => setSpecies(event.target.value)}
              >
                {SPECIES_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
            {species === 'Other' && (
              <label htmlFor="patient-species-other">
                Species (other)
                <input
                  id="patient-species-other"
                  type="text"
                  value={otherSpecies}
                  onChange={(event) => setOtherSpecies(event.target.value)}
                  required
                  maxLength={100}
                />
              </label>
            )}
            <label htmlFor="patient-breed">
              Breed
              <BreedField id="patient-breed" species={species === 'Other' ? otherSpecies : species} value={breed} onChange={setBreed} />
            </label>
            <label htmlFor="patient-sex">
              Sex
              <select id="patient-sex" value={sex} onChange={(event) => setSex(event.target.value)}>
                <option value="">Unspecified</option>
                {SEX_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
            <label htmlFor="patient-weight">
              Weight (lb)
              <input
                id="patient-weight"
                type="number"
                min={0}
                step="0.1"
                value={weight}
                onChange={(event) => setWeight(event.target.value)}
                placeholder="Optional"
              />
            </label>
            <label htmlFor="patient-color">
              Coat color
              <input
                id="patient-color"
                type="text"
                value={color}
                onChange={(event) => setColor(event.target.value)}
                placeholder="Optional"
                maxLength={200}
              />
            </label>
          </div>

          <div className="front-desk-grid--spaced">
            <DateOfBirthField idPrefix="patient" value={dateOfBirth} onChange={setDateOfBirth} />
          </div>
        </fieldset>

        <fieldset className="front-desk-section">
          <legend>Today&apos;s Visit</legend>
          <div className="front-desk-grid">
            <label htmlFor="visit-reason">
              Reason for visit
              <input
                id="visit-reason"
                type="text"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                required
                maxLength={500}
              />
            </label>
          </div>

          <div className="front-desk-visit-mode" role="radiogroup" aria-label="Visit type">
            <label>
              <input
                type="radio"
                name="visit-mode"
                disabled={!selectedClient}
                checked={visitMode === 'appointment'}
                onChange={() => setVisitMode('appointment')}
              />
              Link Existing Appointment
            </label>
            <label>
              <input
                type="radio"
                name="visit-mode"
                checked={visitMode === 'walkin'}
                onChange={() => setVisitMode('walkin')}
              />
              Walk-In
            </label>
          </div>

          <div className="front-desk-visit-support">
            <p className="front-desk-muted">
              Use this when the client already has an appointment today.
            </p>
            <button
              type="button"
              className="button-secondary front-desk-schedule-later"
              aria-disabled="true"
              onClick={(event) => event.preventDefault()}
            >
              Schedule for later
              <span>Coming soon</span>
            </button>
          </div>

          {visitMode === 'appointment' && (
            <div className="front-desk-appointments" aria-live="polite">
              {selectedClient && appointmentsLoading && (
                <p className="front-desk-muted">Checking today&apos;s appointments…</p>
              )}
              {selectedClient && !appointmentsLoading && clientAppointments.length === 0 && (
                <p className="front-desk-muted">
                  No appointments found today. Use Walk-In for now.
                </p>
              )}
              {clientAppointments.length > 0 && (
                <div className="front-desk-appointment-list">
                  {clientAppointments.map((appointment) => (
                    <label key={appointment.id} className="front-desk-appointment-option">
                      <input
                        type="radio"
                        name="appointment-id"
                        value={appointment.id}
                        checked={selectedAppointmentId === appointment.id}
                        onChange={() => setSelectedAppointmentId(appointment.id)}
                        required={visitMode === 'appointment'}
                      />
                      <span>
                        <strong>
                          {timeLabel(appointment.scheduledAt)} ·{' '}
                          {appointmentTypeLabel(appointment.type)}
                        </strong>
                        <small>
                          {appointment.reason}
                          {appointment.provider ? ` · ${appointment.provider.displayName}` : ''}
                        </small>
                      </span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          )}
        </fieldset>

        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}

        <div className="front-desk-actions">
          <button type="submit" className="button-primary" disabled={submitting}>
            {submitting ? 'Creating…' : primaryActionLabel}
          </button>
        </div>
      </form>
    </div>
  );
}
