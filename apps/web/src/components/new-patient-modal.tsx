'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { PetPhotoPlaceholder } from './pet-photo-placeholder';
import { clientDisplayName, SEX_OPTIONS, SPECIES_OPTIONS, type ClientSearchResult, type PatientSearchResult } from '../lib/patient-types';

const DEBOUNCE_MS = 200;

/** What a successful create produces — enough for the parent directory page
 *  to update its list and to open the Patient Profile modal directly,
 *  without a fresh search round-trip. */
export interface NewPatientCreationResult {
  id: string;
  name: string;
  species: string;
  breed: string | null;
  sex: string | null;
  dateOfBirth: string | null;
  clientId: string;
  clientFirstName: string;
  clientLastName: string;
  clientPhone: string | null;
  clientEmail: string | null;
}

type ModalStep = 'form' | 'success';
type DobMode = 'approximate' | 'exact';

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

/** The Client model stores firstName/lastName separately, but a receptionist
 *  creating the owner alongside the pet shouldn't have to think about that
 *  split — one "Owner name" field is friendlier. First word becomes
 *  firstName, the rest becomes lastName; a single word is used for both
 *  rather than blocking. */
function splitClientName(fullName: string): { firstName: string; lastName: string } {
  const normalized = fullName.trim().replace(/\s+/g, ' ');
  const spaceIndex = normalized.indexOf(' ');
  if (spaceIndex === -1) {
    return { firstName: normalized, lastName: normalized };
  }
  return { firstName: normalized.slice(0, spaceIndex), lastName: normalized.slice(spaceIndex + 1) };
}

function computeDateOfBirth(mode: DobMode, exactDate: string, approxAgeYears: string): string | undefined {
  if (mode === 'exact') {
    return exactDate || undefined;
  }
  const years = Number(approxAgeYears);
  if (!approxAgeYears || !Number.isFinite(years) || years <= 0) {
    return undefined;
  }
  const millisecondsOld = years * 365.25 * 24 * 60 * 60 * 1000;
  return new Date(Date.now() - millisecondsOld).toISOString();
}

function NewPatientClientSection({
  ownerNameRef,
  newClientName,
  onNewClientNameChange,
  newPhone,
  onNewPhoneChange,
  newEmail,
  onNewEmailChange,
  clientDuplicateHint,
}: {
  ownerNameRef: React.RefObject<HTMLInputElement>;
  newClientName: string;
  onNewClientNameChange: (value: string) => void;
  newPhone: string;
  onNewPhoneChange: (value: string) => void;
  newEmail: string;
  onNewEmailChange: (value: string) => void;
  clientDuplicateHint: string | null;
}) {
  return (
    <fieldset className="front-desk-section">
      <legend>Owner Information</legend>
      <div className="front-desk-grid front-desk-grid--client">
        <label htmlFor="new-patient-client-name">
          Owner name
          <input
            ref={ownerNameRef}
            id="new-patient-client-name"
            type="text"
            value={newClientName}
            onChange={(event) => onNewClientNameChange(event.target.value)}
            required
            maxLength={200}
          />
        </label>
        <label htmlFor="new-patient-client-phone">
          Phone
          <input
            id="new-patient-client-phone"
            type="tel"
            value={newPhone}
            onChange={(event) => onNewPhoneChange(event.target.value)}
            placeholder="Optional"
            maxLength={50}
          />
        </label>
        <label htmlFor="new-patient-client-email">
          Email
          <input
            id="new-patient-client-email"
            type="email"
            value={newEmail}
            onChange={(event) => onNewEmailChange(event.target.value)}
            placeholder="Optional"
          />
        </label>
      </div>
      {clientDuplicateHint && <p className="form-hint">Possible existing owner: {clientDuplicateHint}</p>}
    </fieldset>
  );
}

function NewPatientPatientSection({
  patientNameRef,
  patientName,
  onPatientNameChange,
  species,
  onSpeciesChange,
  otherSpecies,
  onOtherSpeciesChange,
  breed,
  onBreedChange,
  sex,
  onSexChange,
  dobMode,
  onDobModeChange,
  exactDate,
  onExactDateChange,
  approxAgeYears,
  onApproxAgeYearsChange,
  patientDuplicateHint,
}: {
  patientNameRef: React.RefObject<HTMLInputElement>;
  patientName: string;
  onPatientNameChange: (value: string) => void;
  species: string;
  onSpeciesChange: (value: string) => void;
  otherSpecies: string;
  onOtherSpeciesChange: (value: string) => void;
  breed: string;
  onBreedChange: (value: string) => void;
  sex: string;
  onSexChange: (value: string) => void;
  dobMode: DobMode;
  onDobModeChange: (mode: DobMode) => void;
  exactDate: string;
  onExactDateChange: (value: string) => void;
  approxAgeYears: string;
  onApproxAgeYearsChange: (value: string) => void;
  patientDuplicateHint: string | null;
}) {
  return (
    <fieldset className="front-desk-section">
      <legend>Pet Details</legend>
      <div className="front-desk-grid">
        <label htmlFor="new-patient-name">
          Pet name
          <input
            ref={patientNameRef}
            id="new-patient-name"
            type="text"
            value={patientName}
            onChange={(event) => onPatientNameChange(event.target.value)}
            required
            maxLength={200}
          />
        </label>
        <label htmlFor="new-patient-species">
          Species
          <select
            id="new-patient-species"
            value={species}
            onChange={(event) => onSpeciesChange(event.target.value)}
          >
            {SPECIES_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
        {species === 'Other' && (
          <label htmlFor="new-patient-species-other">
            Species (other)
            <input
              id="new-patient-species-other"
              type="text"
              value={otherSpecies}
              onChange={(event) => onOtherSpeciesChange(event.target.value)}
              required
              maxLength={100}
            />
          </label>
        )}
        <label htmlFor="new-patient-breed">
          Breed
          <input
            id="new-patient-breed"
            type="text"
            value={breed}
            onChange={(event) => onBreedChange(event.target.value)}
            placeholder="Optional"
            maxLength={100}
          />
        </label>
        <label htmlFor="new-patient-sex">
          Sex
          <select id="new-patient-sex" value={sex} onChange={(event) => onSexChange(event.target.value)}>
            <option value="">Unspecified</option>
            {SEX_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="front-desk-grid front-desk-grid--spaced">
        <div>
          <span className="front-desk-field-label">DOB or estimated age</span>
          <div
            className="front-desk-visit-mode front-desk-visit-mode--nested"
            role="radiogroup"
            aria-label="Age input mode"
          >
            <label>
              <input
                type="radio"
                name="new-patient-dob-mode"
                checked={dobMode === 'approximate'}
                onChange={() => onDobModeChange('approximate')}
              />
              Estimated age
            </label>
            <label>
              <input
                type="radio"
                name="new-patient-dob-mode"
                checked={dobMode === 'exact'}
                onChange={() => onDobModeChange('exact')}
              />
              DOB
            </label>
          </div>
        </div>
        {dobMode === 'approximate' ? (
          <label htmlFor="new-patient-approx-age">
            Age (years)
            <input
              id="new-patient-approx-age"
              type="number"
              min={0}
              step="0.5"
              placeholder="Optional"
              value={approxAgeYears}
              onChange={(event) => onApproxAgeYearsChange(event.target.value)}
            />
          </label>
        ) : (
          <label htmlFor="new-patient-dob">
            Date of birth
            <input
              id="new-patient-dob"
              type="date"
              value={exactDate}
              onChange={(event) => onExactDateChange(event.target.value)}
            />
          </label>
        )}
      </div>

      {patientDuplicateHint && (
        <p className="form-hint">Possible existing pet for this owner: {patientDuplicateHint}</p>
      )}
    </fieldset>
  );
}

function NewPatientNextStep({
  result,
  onOpenProfile,
  onAddAnother,
  onSetAppointmentNavigated,
}: {
  result: NewPatientCreationResult;
  onOpenProfile: () => void;
  onAddAnother: () => void;
  onSetAppointmentNavigated: () => void;
}) {
  return (
    <div className="new-patient-success">
      <PetPhotoPlaceholder
        name={result.name}
        species={result.species}
        className="pet-photo-placeholder new-patient-success__avatar"
      />
      <h3>{result.name} has been added.</h3>
      <p className="patient-profile-modal-header__details">
        Linked to {result.clientFirstName} {result.clientLastName}
      </p>
      <div className="new-patient-success__actions">
        <button type="button" className="new-patient-modal-submit" onClick={onOpenProfile}>
          Open Patient Profile
        </button>
        <Link
          href={`/patients/${result.id}/schedule`}
          className="new-patient-modal-cancel"
          onClick={onSetAppointmentNavigated}
        >
          Set Appointment
        </Link>
        <button type="button" className="new-patient-modal-cancel" onClick={onAddAnother}>
          Add Another Patient
        </button>
      </div>
    </div>
  );
}

const INITIAL_STATE = {
  newClientName: '',
  newPhone: '',
  newEmail: '',
  patientName: '',
  species: SPECIES_OPTIONS[0] as string,
  otherSpecies: '',
  breed: '',
  sex: '',
  dobMode: 'approximate' as DobMode,
  exactDate: '',
  approxAgeYears: '',
};

export function NewPatientModal({
  open,
  onClose,
  onCreated,
  onOpenProfile,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (result: NewPatientCreationResult) => void;
  onOpenProfile: (result: NewPatientCreationResult) => void;
}) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const ownerNameRef = useRef<HTMLInputElement>(null);
  const patientNameRef = useRef<HTMLInputElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  const [step, setStep] = useState<ModalStep>('form');
  const [createdResult, setCreatedResult] = useState<NewPatientCreationResult | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [newClientName, setNewClientName] = useState(INITIAL_STATE.newClientName);
  const [newPhone, setNewPhone] = useState(INITIAL_STATE.newPhone);
  const [newEmail, setNewEmail] = useState(INITIAL_STATE.newEmail);
  const [clientDuplicateHint, setClientDuplicateHint] = useState<string | null>(null);

  const [patientName, setPatientName] = useState(INITIAL_STATE.patientName);
  const [species, setSpecies] = useState<string>(INITIAL_STATE.species);
  const [otherSpecies, setOtherSpecies] = useState(INITIAL_STATE.otherSpecies);
  const [breed, setBreed] = useState(INITIAL_STATE.breed);
  const [sex, setSex] = useState(INITIAL_STATE.sex);
  const [dobMode, setDobMode] = useState<DobMode>(INITIAL_STATE.dobMode);
  const [exactDate, setExactDate] = useState(INITIAL_STATE.exactDate);
  const [approxAgeYears, setApproxAgeYears] = useState(INITIAL_STATE.approxAgeYears);
  const [patientDuplicateHint, setPatientDuplicateHint] = useState<string | null>(null);

  function resetForm() {
    setNewClientName(INITIAL_STATE.newClientName);
    setNewPhone(INITIAL_STATE.newPhone);
    setNewEmail(INITIAL_STATE.newEmail);
    setClientDuplicateHint(null);
    setPatientName(INITIAL_STATE.patientName);
    setSpecies(INITIAL_STATE.species);
    setOtherSpecies(INITIAL_STATE.otherSpecies);
    setBreed(INITIAL_STATE.breed);
    setSex(INITIAL_STATE.sex);
    setDobMode(INITIAL_STATE.dobMode);
    setExactDate(INITIAL_STATE.exactDate);
    setApproxAgeYears(INITIAL_STATE.approxAgeYears);
    setPatientDuplicateHint(null);
    setError(null);
  }

  const isDirty =
    newClientName.trim() !== '' ||
    newPhone.trim() !== '' ||
    newEmail.trim() !== '' ||
    patientName.trim() !== '' ||
    breed.trim() !== '' ||
    otherSpecies.trim() !== '' ||
    exactDate.trim() !== '' ||
    approxAgeYears.trim() !== '';

  function requestClose() {
    if (step === 'form' && isDirty) {
      const confirmed = window.confirm('Discard this new patient? Nothing has been saved yet.');
      if (!confirmed) return;
    }
    onClose();
  }

  useEffect(() => {
    if (!open) return;

    setStep('form');
    setCreatedResult(null);
    resetForm();
    previouslyFocused.current = document.activeElement as HTMLElement | null;
    requestAnimationFrame(() => closeButtonRef.current?.focus());

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') requestClose();
    }
    document.addEventListener('keydown', onKeyDown);

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      previouslyFocused.current?.focus();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Best-effort duplicate hint for the owner — frontend-only, reuses the
  // existing client search endpoint rather than any new backend work.
  useEffect(() => {
    const name = newClientName.trim();
    const phone = newPhone.trim();
    const email = newEmail.trim();
    const query = phone || email || name;
    if (!query) {
      setClientDuplicateHint(null);
      return;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => {
      fetch(`/api/clients/search?query=${encodeURIComponent(query)}`, { signal: controller.signal })
        .then((response) => response.json() as Promise<ClientSearchResult[]>)
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
    }, DEBOUNCE_MS);

    return () => {
      controller.abort();
      clearTimeout(timeout);
    };
  }, [newClientName, newPhone, newEmail]);

  // Best-effort duplicate hint for the pet name — only flags a match tied to
  // the same owner, since the same pet name for a different owner is fine.
  useEffect(() => {
    const trimmedName = patientName.trim();
    const clientLabel = newClientName.trim();

    if (trimmedName.length < 2 || !clientLabel) {
      setPatientDuplicateHint(null);
      return;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => {
      fetch(`/api/patients/search?query=${encodeURIComponent(trimmedName)}`, { signal: controller.signal })
        .then((response) => response.json() as Promise<PatientSearchResult[]>)
        .then((data) => {
          const match = data.find(
            (candidate) =>
              candidate.primaryClient &&
              clientDisplayName(candidate.primaryClient).toLowerCase() === clientLabel.toLowerCase(),
          );
          setPatientDuplicateHint(match ? `"${match.name}"` : null);
        })
        .catch((caught: unknown) => {
          if (!(caught instanceof DOMException && caught.name === 'AbortError')) {
            setPatientDuplicateHint(null);
          }
        });
    }, DEBOUNCE_MS);

    return () => {
      controller.abort();
      clearTimeout(timeout);
    };
  }, [patientName, newClientName]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const trimmedPatientName = patientName.trim();
    const trimmedClientName = newClientName.trim();
    const trimmedEmail = newEmail.trim();

    if (!trimmedPatientName) {
      setError('Pet name is required.');
      return;
    }
    if (!trimmedClientName) {
      setError('Owner name is required.');
      return;
    }
    if (trimmedEmail && !isValidEmail(trimmedEmail)) {
      setError('Enter a valid email address.');
      return;
    }
    if (species === 'Other' && !otherSpecies.trim()) {
      setError('Enter a species.');
      return;
    }

    setSaving(true);
    try {
      const { firstName, lastName } = splitClientName(trimmedClientName);
      const clientResponse = await fetch('/api/clients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstName,
          lastName,
          phone: newPhone.trim() || undefined,
          email: trimmedEmail || undefined,
        }),
      });
      if (!clientResponse.ok) {
        throw new Error('client');
      }
      const client: { id: string; firstName: string; lastName: string; phone: string | null; email: string | null } =
        await clientResponse.json();
      const clientId = client.id;
      const clientFirstName = client.firstName;
      const clientLastName = client.lastName;
      const clientPhone = client.phone;
      const clientEmail = client.email;

      const resolvedSpecies = species === 'Other' ? otherSpecies.trim() : species;
      const patientResponse = await fetch('/api/patients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: trimmedPatientName,
          species: resolvedSpecies,
          breed: breed.trim() || undefined,
          sex: sex || undefined,
          dateOfBirth: computeDateOfBirth(dobMode, exactDate, approxAgeYears),
          clients: [{ clientId, isPrimary: true }],
        }),
      });
      if (!patientResponse.ok) {
        throw new Error('patient');
      }
      const patient: {
        id: string;
        name: string;
        species: string;
        breed: string | null;
        sex: string | null;
        dateOfBirth: string | null;
      } = await patientResponse.json();

      const result: NewPatientCreationResult = {
        id: patient.id,
        name: patient.name,
        species: patient.species,
        breed: patient.breed,
        sex: patient.sex,
        dateOfBirth: patient.dateOfBirth,
        clientId,
        clientFirstName,
        clientLastName,
        clientPhone,
        clientEmail,
      };

      onCreated(result);
      setCreatedResult(result);
      setStep('success');
    } catch {
      setError('Something went wrong creating this patient. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  if (!open) return null;

  return (
    <div className="patient-profile-modal-overlay" role="presentation" onClick={requestClose}>
      <div
        className="patient-profile-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="new-patient-modal-heading"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="patient-profile-modal-header">
          <button
            ref={closeButtonRef}
            type="button"
            className="patient-profile-modal-close"
            onClick={requestClose}
            aria-label="Close new patient form"
          >
            <span aria-hidden="true">×</span>
          </button>
          {step === 'form' && (
            <PetPhotoPlaceholder
              name={patientName.trim() || 'New patient'}
              species={species === 'Other' ? otherSpecies : species}
              className="pet-photo-placeholder patient-profile-modal-header__avatar"
            />
          )}
          <h2 id="new-patient-modal-heading">New Patient</h2>
          <p className="patient-profile-modal-header__details">
            Create a pet profile and connect it to an owner.
          </p>
        </div>

        <div className="patient-profile-modal-body">
          {step === 'form' ? (
            <form id="new-patient-form" className="front-desk-form" onSubmit={handleSubmit}>
              <NewPatientClientSection
                ownerNameRef={ownerNameRef}
                newClientName={newClientName}
                onNewClientNameChange={setNewClientName}
                newPhone={newPhone}
                onNewPhoneChange={setNewPhone}
                newEmail={newEmail}
                onNewEmailChange={setNewEmail}
                clientDuplicateHint={clientDuplicateHint}
              />
              <NewPatientPatientSection
                patientNameRef={patientNameRef}
                patientName={patientName}
                onPatientNameChange={setPatientName}
                species={species}
                onSpeciesChange={setSpecies}
                otherSpecies={otherSpecies}
                onOtherSpeciesChange={setOtherSpecies}
                breed={breed}
                onBreedChange={setBreed}
                sex={sex}
                onSexChange={setSex}
                dobMode={dobMode}
                onDobModeChange={setDobMode}
                exactDate={exactDate}
                onExactDateChange={setExactDate}
                approxAgeYears={approxAgeYears}
                onApproxAgeYearsChange={setApproxAgeYears}
                patientDuplicateHint={patientDuplicateHint}
              />
              {error && (
                <p className="form-error" role="alert">
                  {error}
                </p>
              )}
            </form>
          ) : (
            createdResult && (
              <NewPatientNextStep
                result={createdResult}
                onOpenProfile={() => onOpenProfile(createdResult)}
                onAddAnother={() => {
                  setStep('form');
                  setCreatedResult(null);
                  resetForm();
                  requestAnimationFrame(() => ownerNameRef.current?.focus());
                }}
                onSetAppointmentNavigated={onClose}
              />
            )
          )}
        </div>

        {step === 'form' && (
          <div className="new-patient-modal-footer">
            <button type="button" className="new-patient-modal-cancel" onClick={requestClose} disabled={saving}>
              Cancel
            </button>
            <button type="submit" form="new-patient-form" className="new-patient-modal-submit" disabled={saving}>
              {saving ? 'Creating…' : 'Create New Patient'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
