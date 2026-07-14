'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AddressAutocompleteField, type AddressAutofillResult } from './address-autocomplete-field';
import { useLockBodyScroll } from '../hooks/use-lock-body-scroll';
import { PetPhotoPlaceholder } from './pet-photo-placeholder';
import { clientDisplayName, SEX_OPTIONS, SPECIES_OPTIONS, type ClientSearchResult, type PatientSearchResult } from '../lib/patient-types';

const DEBOUNCE_MS = 200;
const MAX_FILE_BYTES = 8 * 1024 * 1024;

/** What a successful create produces — enough for the parent directory page
 *  to update its list and to navigate straight to the new Patient Profile
 *  page, without a fresh search round-trip. */
export interface NewPatientCreationResult {
  id: string;
  name: string;
  species: string;
  breed: string | null;
  sex: string | null;
  dateOfBirth: string | null;
  imageUrl: string | null;
  clientId: string;
  clientFirstName: string;
  clientLastName: string;
  clientPhone: string | null;
  clientEmail: string | null;
}

type ModalStep = 'form' | 'success';
type DobMode = 'exact' | 'estimated';

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function DraftPatientPhotoActions({
  name,
  species,
  file,
  onFileChange,
}: {
  name: string;
  species: string;
  file: File | null;
  onFileChange: (file: File | null) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const avatarButtonRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState<{ top: number; left: number } | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!file) {
      setPreviewUrl(null);
      return;
    }
    const objectUrl = URL.createObjectURL(file);
    setPreviewUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [file]);

  function updateMenuPosition() {
    const button = avatarButtonRef.current;
    if (!button) return;
    const rect = button.getBoundingClientRect();
    const menuWidth = 280;
    const margin = 12;
    const left = Math.min(
      Math.max(margin, rect.left + rect.width / 2 - menuWidth / 2),
      window.innerWidth - menuWidth - margin,
    );
    setMenuPosition({ top: rect.bottom + 12, left });
  }

  useLayoutEffect(() => {
    if (!open) return;
    updateMenuPosition();
    function handleReposition() {
      updateMenuPosition();
    }
    window.addEventListener('resize', handleReposition);
    window.addEventListener('scroll', handleReposition, true);
    return () => {
      window.removeEventListener('resize', handleReposition);
      window.removeEventListener('scroll', handleReposition, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function handlePointerDown(event: MouseEvent) {
      const target = event.target as Node;
      if (menuRef.current?.contains(target) || avatarButtonRef.current?.contains(target)) return;
      setOpen(false);
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  function handleLocalFile(nextFile: File | undefined) {
    if (!nextFile) return;
    if (nextFile.size > MAX_FILE_BYTES) {
      setMessage('Image is too large. Max size is 8MB.');
      return;
    }
    onFileChange(nextFile);
    setMessage('Photo will be added when the patient is created.');
    setOpen(false);
  }

  return (
    <div className="patient-photo-control new-patient-photo-control">
      <button
        ref={avatarButtonRef}
        type="button"
        className="patient-photo-control__avatar-button"
        onClick={() => setOpen((current) => !current)}
        aria-label={file ? 'Change patient photo' : 'Add patient photo'}
      >
        {previewUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={previewUrl} alt={name} className="pet-photo-placeholder patient-profile-photo" />
        ) : (
          <PetPhotoPlaceholder
            name={name}
            species={species}
            className="pet-photo-placeholder patient-profile-photo"
          />
        )}
        <span className="patient-photo-control__badge" aria-hidden="true">
          +
        </span>
      </button>
      {open &&
        menuPosition &&
        createPortal(
          <div
            ref={menuRef}
            className="patient-photo-menu patient-photo-menu--portal"
            role="dialog"
            aria-label="Patient photo options"
            style={{ top: menuPosition.top, left: menuPosition.left }}
          >
            <div className="patient-photo-menu__header">
              <strong>{file ? 'Change photo' : 'Add photo'}</strong>
              <button type="button" onClick={() => setOpen(false)} aria-label="Close photo options">
                ×
              </button>
            </div>
            <div className="patient-photo-menu__actions">
              <button type="button" onClick={() => fileInputRef.current?.click()}>
                Upload image
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                onChange={(event) => {
                  handleLocalFile(event.target.files?.[0]);
                  event.target.value = '';
                }}
                hidden
              />
              <button type="button" disabled>
                Use webcam <span>Coming soon</span>
              </button>
              {file && (
                <button
                  type="button"
                  onClick={() => {
                    onFileChange(null);
                    setMessage(null);
                    setOpen(false);
                  }}
                >
                  Remove photo
                </button>
              )}
            </div>
            {message && <p>{message}</p>}
          </div>,
          document.body,
        )}
    </div>
  );
}

function NewPatientClientSection({
  ownerFirstNameRef,
  newClientFirstName,
  onNewClientFirstNameChange,
  newClientLastName,
  onNewClientLastNameChange,
  newPhone,
  onNewPhoneChange,
  newAlternatePhone,
  onNewAlternatePhoneChange,
  newEmail,
  onNewEmailChange,
  newAddressLine1,
  onNewAddressLine1Change,
  newAddressLine2,
  onNewAddressLine2Change,
  newCity,
  onNewCityChange,
  newState,
  onNewStateChange,
  newPostalCode,
  onNewPostalCodeChange,
  newCountry,
  onNewCountryChange,
  onAddressAutofill,
  clientDuplicateHint,
}: {
  ownerFirstNameRef: React.RefObject<HTMLInputElement>;
  newClientFirstName: string;
  onNewClientFirstNameChange: (value: string) => void;
  newClientLastName: string;
  onNewClientLastNameChange: (value: string) => void;
  newPhone: string;
  onNewPhoneChange: (value: string) => void;
  newAlternatePhone: string;
  onNewAlternatePhoneChange: (value: string) => void;
  newEmail: string;
  onNewEmailChange: (value: string) => void;
  newAddressLine1: string;
  onNewAddressLine1Change: (value: string) => void;
  newAddressLine2: string;
  onNewAddressLine2Change: (value: string) => void;
  newCity: string;
  onNewCityChange: (value: string) => void;
  newState: string;
  onNewStateChange: (value: string) => void;
  newPostalCode: string;
  onNewPostalCodeChange: (value: string) => void;
  newCountry: string;
  onNewCountryChange: (value: string) => void;
  onAddressAutofill: (result: AddressAutofillResult) => void;
  clientDuplicateHint: string | null;
}) {
  return (
    <fieldset className="front-desk-section new-patient-section">
      <legend>Owner Information</legend>
      <p className="new-patient-section__helper">Primary contact details for reminders and follow-up.</p>
      <div className="new-patient-form-grid new-patient-form-grid--two">
        <label htmlFor="new-patient-client-first-name">
          <span>
            First name <span className="front-desk-required">*</span>
          </span>
          <input
            ref={ownerFirstNameRef}
            id="new-patient-client-first-name"
            type="text"
            value={newClientFirstName}
            onChange={(event) => onNewClientFirstNameChange(event.target.value)}
            required
            maxLength={100}
            autoComplete="new-password"
          />
        </label>
        <label htmlFor="new-patient-client-last-name">
          <span>
            Last name <span className="front-desk-required">*</span>
          </span>
          <input
            id="new-patient-client-last-name"
            type="text"
            value={newClientLastName}
            onChange={(event) => onNewClientLastNameChange(event.target.value)}
            required
            maxLength={100}
            autoComplete="new-password"
          />
        </label>
        <label htmlFor="new-patient-client-phone">
          Cell phone
          <input
            id="new-patient-client-phone"
            type="tel"
            value={newPhone}
            onChange={(event) => onNewPhoneChange(event.target.value)}
            placeholder="Optional"
            maxLength={50}
            autoComplete="new-password"
          />
        </label>
        <label htmlFor="new-patient-client-alternate-phone">
          Home/work phone
          <input
            id="new-patient-client-alternate-phone"
            type="tel"
            value={newAlternatePhone}
            onChange={(event) => onNewAlternatePhoneChange(event.target.value)}
            placeholder="Optional"
            maxLength={50}
            autoComplete="new-password"
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
            autoComplete="new-password"
          />
        </label>
      </div>

      <div className="new-patient-address-panel">
        <div className="new-patient-address-panel__header">
          <h3>Address</h3>
          <p>Search to fill the structured fields, or enter the address manually.</p>
        </div>
        <div className="new-patient-form-grid new-patient-form-grid--address">
          <div className="front-desk-grid__field--full">
            <AddressAutocompleteField
              id="new-patient-client-address"
              label="Street address"
              value={newAddressLine1}
              placeholder="Search address..."
              onChange={onNewAddressLine1Change}
              onAddressSelected={(result) => {
                onNewAddressLine1Change(result.addressLine1);
                onNewCityChange(result.city);
                onNewStateChange(result.state);
                onNewPostalCodeChange(result.postalCode);
                onNewCountryChange(result.country);
                onAddressAutofill(result);
              }}
            />
          </div>
          <label htmlFor="new-patient-client-address-2" className="front-desk-grid__field--full">
            Address line 2
            <input
              id="new-patient-client-address-2"
              type="text"
              value={newAddressLine2}
              onChange={(event) => onNewAddressLine2Change(event.target.value)}
              placeholder="Apartment, suite, unit"
              maxLength={200}
              autoComplete="new-password"
            />
          </label>
          <label htmlFor="new-patient-client-city" className="new-patient-field--city">
            City
            <input
              id="new-patient-client-city"
              type="text"
              value={newCity}
              onChange={(event) => onNewCityChange(event.target.value)}
              placeholder="Optional"
              maxLength={100}
              autoComplete="new-password"
            />
          </label>
          <label htmlFor="new-patient-client-state">
            State
            <input
              id="new-patient-client-state"
              type="text"
              value={newState}
              onChange={(event) => onNewStateChange(event.target.value)}
              placeholder="Optional"
              maxLength={100}
              autoComplete="new-password"
            />
          </label>
          <label htmlFor="new-patient-client-postal-code">
            ZIP/postal code
            <input
              id="new-patient-client-postal-code"
              type="text"
              value={newPostalCode}
              onChange={(event) => onNewPostalCodeChange(event.target.value)}
              placeholder="Optional"
              maxLength={20}
              autoComplete="new-password"
            />
          </label>
          <label htmlFor="new-patient-client-country">
            Country
            <input
              id="new-patient-client-country"
              type="text"
              value={newCountry}
              onChange={(event) => onNewCountryChange(event.target.value)}
              placeholder="Optional"
              maxLength={100}
              autoComplete="new-password"
            />
          </label>
        </div>
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
  color,
  onColorChange,
  dobMode,
  onDobModeChange,
  exactDate,
  onExactDateChange,
  estimatedAge,
  onEstimatedAgeChange,
  alerts,
  onAlertsChange,
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
  color: string;
  onColorChange: (value: string) => void;
  dobMode: DobMode;
  onDobModeChange: (mode: DobMode) => void;
  exactDate: string;
  onExactDateChange: (value: string) => void;
  estimatedAge: string;
  onEstimatedAgeChange: (value: string) => void;
  alerts: string;
  onAlertsChange: (value: string) => void;
  patientDuplicateHint: string | null;
}) {
  return (
    <fieldset className="front-desk-section new-patient-section">
      <legend>Patient Information</legend>
      <p className="new-patient-section__helper">Basic patient details for the medical record.</p>
      <div className="new-patient-form-grid new-patient-form-grid--two new-patient-form-grid--prominent">
        <label htmlFor="new-patient-name">
          <span>
            Pet first name <span className="front-desk-required">*</span>
          </span>
          <input
            ref={patientNameRef}
            id="new-patient-name"
            type="text"
            value={patientName}
            onChange={(event) => onPatientNameChange(event.target.value)}
            required
            maxLength={200}
            autoComplete="new-password"
          />
        </label>
        <label htmlFor="new-patient-species">
          <span>
            Species <span className="front-desk-required">*</span>
          </span>
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
      </div>
      <div className="new-patient-form-grid new-patient-form-grid--three">
        {species === 'Other' && (
          <label htmlFor="new-patient-species-other">
            <span>
              Species (other) <span className="front-desk-required">*</span>
            </span>
            <input
              id="new-patient-species-other"
              type="text"
              value={otherSpecies}
              onChange={(event) => onOtherSpeciesChange(event.target.value)}
              required
              maxLength={100}
              autoComplete="new-password"
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
            autoComplete="new-password"
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
        <label htmlFor="new-patient-color">
          Coat color
          <input
            id="new-patient-color"
            type="text"
            value={color}
            onChange={(event) => onColorChange(event.target.value)}
            placeholder="Optional"
            maxLength={200}
            autoComplete="new-password"
          />
        </label>
      </div>

      <fieldset className="new-patient-age-field">
        <legend>Age</legend>
        <div className="new-patient-age-field__control">
          <div className="new-patient-segmented-control" role="radiogroup" aria-label="Age input mode">
            <label>
              <input
                type="radio"
                name="new-patient-dob-mode"
                checked={dobMode === 'exact'}
                onChange={() => onDobModeChange('exact')}
              />
              <span>Known DOB</span>
            </label>
            <label>
              <input
                type="radio"
                name="new-patient-dob-mode"
                checked={dobMode === 'estimated'}
                onChange={() => onDobModeChange('estimated')}
              />
              <span>Estimated age</span>
            </label>
          </div>
          {dobMode === 'exact' ? (
            <label htmlFor="new-patient-dob">
              Date of birth
              <input
                id="new-patient-dob"
                type="date"
                value={exactDate}
                onChange={(event) => onExactDateChange(event.target.value)}
                autoComplete="new-password"
              />
            </label>
          ) : (
            <label htmlFor="new-patient-estimated-age">
              Estimated age
              <input
                id="new-patient-estimated-age"
                type="text"
                placeholder="e.g. ~3 years"
                value={estimatedAge}
                onChange={(event) => onEstimatedAgeChange(event.target.value)}
                maxLength={50}
                autoComplete="new-password"
              />
            </label>
          )}
        </div>
      </fieldset>

      <label htmlFor="new-patient-alerts">
        Allergies / Alerts
        <textarea
          id="new-patient-alerts"
          value={alerts}
          onChange={(event) => onAlertsChange(event.target.value)}
          placeholder="Optional — e.g. Allergic to penicillin. Muzzle for nail trims."
          maxLength={2000}
          rows={3}
        />
      </label>

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
  onNewAppointment,
}: {
  result: NewPatientCreationResult;
  onOpenProfile: () => void;
  onAddAnother: () => void;
  onNewAppointment: () => void;
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
        <button type="button" className="new-patient-modal-cancel" onClick={onNewAppointment}>
          New Appointment
        </button>
        <button type="button" className="new-patient-modal-cancel" onClick={onAddAnother}>
          Add Another Patient
        </button>
      </div>
    </div>
  );
}

const INITIAL_STATE = {
  newClientFirstName: '',
  newClientLastName: '',
  newPhone: '',
  newAlternatePhone: '',
  newEmail: '',
  newAddressLine1: '',
  newAddressLine2: '',
  newCity: '',
  newState: '',
  newPostalCode: '',
  newCountry: '',
  patientName: '',
  species: SPECIES_OPTIONS[0] as string,
  otherSpecies: '',
  breed: '',
  sex: '',
  color: '',
  dobMode: 'exact' as DobMode,
  exactDate: '',
  estimatedAge: '',
  alerts: '',
};

export function NewPatientModal({
  open,
  onClose,
  onCreated,
  onOpenProfile,
  onNewAppointment,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (result: NewPatientCreationResult) => void;
  onOpenProfile: (result: NewPatientCreationResult) => void;
  onNewAppointment: (result: NewPatientCreationResult) => void;
}) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const ownerFirstNameRef = useRef<HTMLInputElement>(null);
  const patientNameRef = useRef<HTMLInputElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  useLockBodyScroll(open);

  const [step, setStep] = useState<ModalStep>('form');
  const [createdResult, setCreatedResult] = useState<NewPatientCreationResult | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [newClientFirstName, setNewClientFirstName] = useState(INITIAL_STATE.newClientFirstName);
  const [newClientLastName, setNewClientLastName] = useState(INITIAL_STATE.newClientLastName);
  const [newPhone, setNewPhone] = useState(INITIAL_STATE.newPhone);
  const [newAlternatePhone, setNewAlternatePhone] = useState(INITIAL_STATE.newAlternatePhone);
  const [newEmail, setNewEmail] = useState(INITIAL_STATE.newEmail);
  const [newAddressLine1, setNewAddressLine1] = useState(INITIAL_STATE.newAddressLine1);
  const [newAddressLine2, setNewAddressLine2] = useState(INITIAL_STATE.newAddressLine2);
  const [newCity, setNewCity] = useState(INITIAL_STATE.newCity);
  const [newState, setNewState] = useState(INITIAL_STATE.newState);
  const [newPostalCode, setNewPostalCode] = useState(INITIAL_STATE.newPostalCode);
  const [newCountry, setNewCountry] = useState(INITIAL_STATE.newCountry);
  const [addressAutofill, setAddressAutofill] = useState<AddressAutofillResult | null>(null);
  const [clientDuplicateHint, setClientDuplicateHint] = useState<string | null>(null);

  const [patientName, setPatientName] = useState(INITIAL_STATE.patientName);
  const [species, setSpecies] = useState<string>(INITIAL_STATE.species);
  const [otherSpecies, setOtherSpecies] = useState(INITIAL_STATE.otherSpecies);
  const [breed, setBreed] = useState(INITIAL_STATE.breed);
  const [sex, setSex] = useState(INITIAL_STATE.sex);
  const [color, setColor] = useState(INITIAL_STATE.color);
  const [draftPhotoFile, setDraftPhotoFile] = useState<File | null>(null);
  const [dobMode, setDobMode] = useState<DobMode>(INITIAL_STATE.dobMode);
  const [exactDate, setExactDate] = useState(INITIAL_STATE.exactDate);
  const [estimatedAge, setEstimatedAge] = useState(INITIAL_STATE.estimatedAge);
  const [alerts, setAlerts] = useState(INITIAL_STATE.alerts);
  const [patientDuplicateHint, setPatientDuplicateHint] = useState<string | null>(null);

  function resetForm() {
    setNewClientFirstName(INITIAL_STATE.newClientFirstName);
    setNewClientLastName(INITIAL_STATE.newClientLastName);
    setNewPhone(INITIAL_STATE.newPhone);
    setNewAlternatePhone(INITIAL_STATE.newAlternatePhone);
    setNewEmail(INITIAL_STATE.newEmail);
    setNewAddressLine1(INITIAL_STATE.newAddressLine1);
    setNewAddressLine2(INITIAL_STATE.newAddressLine2);
    setNewCity(INITIAL_STATE.newCity);
    setNewState(INITIAL_STATE.newState);
    setNewPostalCode(INITIAL_STATE.newPostalCode);
    setNewCountry(INITIAL_STATE.newCountry);
    setAddressAutofill(null);
    setClientDuplicateHint(null);
    setPatientName(INITIAL_STATE.patientName);
    setSpecies(INITIAL_STATE.species);
    setOtherSpecies(INITIAL_STATE.otherSpecies);
    setBreed(INITIAL_STATE.breed);
    setSex(INITIAL_STATE.sex);
    setColor(INITIAL_STATE.color);
    setDraftPhotoFile(null);
    setDobMode(INITIAL_STATE.dobMode);
    setExactDate(INITIAL_STATE.exactDate);
    setEstimatedAge(INITIAL_STATE.estimatedAge);
    setAlerts(INITIAL_STATE.alerts);
    setPatientDuplicateHint(null);
    setError(null);
  }

  const isDirty =
    newClientFirstName.trim() !== '' ||
    newClientLastName.trim() !== '' ||
    newPhone.trim() !== '' ||
    newAlternatePhone.trim() !== '' ||
    newEmail.trim() !== '' ||
    newAddressLine1.trim() !== '' ||
    newAddressLine2.trim() !== '' ||
    newCity.trim() !== '' ||
    newState.trim() !== '' ||
    newPostalCode.trim() !== '' ||
    newCountry.trim() !== '' ||
    patientName.trim() !== '' ||
    breed.trim() !== '' ||
    otherSpecies.trim() !== '' ||
    color.trim() !== '' ||
    draftPhotoFile !== null ||
    exactDate.trim() !== '' ||
    estimatedAge.trim() !== '' ||
    alerts.trim() !== '';

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
    const name = `${newClientFirstName.trim()} ${newClientLastName.trim()}`.trim();
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
  }, [newClientFirstName, newClientLastName, newPhone, newEmail]);

  // Best-effort duplicate hint for the pet name — only flags a match tied to
  // the same owner, since the same pet name for a different owner is fine.
  useEffect(() => {
    const trimmedName = patientName.trim();
    const clientLabel = `${newClientFirstName.trim()} ${newClientLastName.trim()}`.trim();

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
  }, [patientName, newClientFirstName, newClientLastName]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const trimmedPatientName = patientName.trim();
    const trimmedClientFirstName = newClientFirstName.trim();
    const trimmedClientLastName = newClientLastName.trim();
    const trimmedEmail = newEmail.trim();

    if (!trimmedPatientName) {
      setError('Pet first name is required.');
      return;
    }
    if (!trimmedClientFirstName || !trimmedClientLastName) {
      setError("Owner's first and last name are required.");
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
      const clientResponse = await fetch('/api/clients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstName: trimmedClientFirstName,
          lastName: trimmedClientLastName,
          phone: newPhone.trim() || undefined,
          alternatePhone: newAlternatePhone.trim() || undefined,
          email: trimmedEmail || undefined,
          addressLine1: newAddressLine1.trim() || undefined,
          addressLine2: newAddressLine2.trim() || undefined,
          city: newCity.trim() || undefined,
          state: newState.trim() || undefined,
          postalCode: newPostalCode.trim() || undefined,
          country: newCountry.trim() || undefined,
          formattedAddress: addressAutofill?.formattedAddress || undefined,
          addressPlaceId: addressAutofill?.placeId || undefined,
          addressLatitude: addressAutofill?.latitude ?? undefined,
          addressLongitude: addressAutofill?.longitude ?? undefined,
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
          color: color.trim() || undefined,
          dateOfBirth: dobMode === 'exact' ? exactDate || undefined : undefined,
          estimatedAge: dobMode === 'estimated' ? estimatedAge.trim() || undefined : undefined,
          alerts: alerts.trim() || undefined,
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
      let uploadedImageUrl: string | null = null;

      if (draftPhotoFile) {
        const body = new FormData();
        body.append('file', draftPhotoFile);
        const photoResponse = await fetch(`/api/patients/${patient.id}/photo`, {
          method: 'POST',
          body,
        });
        if (!photoResponse.ok) {
          throw new Error('photo');
        }
        const updatedPatient = (await photoResponse.json()) as { imageUrl: string | null };
        uploadedImageUrl = updatedPatient.imageUrl;
      }

      const result: NewPatientCreationResult = {
        id: patient.id,
        name: patient.name,
        species: patient.species,
        breed: patient.breed,
        sex: patient.sex,
        dateOfBirth: patient.dateOfBirth,
        imageUrl: uploadedImageUrl,
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
        className="patient-profile-modal new-patient-modal"
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
            <DraftPatientPhotoActions
              name={patientName.trim() || 'New patient'}
              species={species === 'Other' ? otherSpecies : species}
              file={draftPhotoFile}
              onFileChange={setDraftPhotoFile}
            />
          )}
          <h2 id="new-patient-modal-heading">New Patient</h2>
          <p className="patient-profile-modal-header__details">
            Create an owner and pet profile.
          </p>
        </div>

        <div className="patient-profile-modal-body">
          {step === 'form' ? (
            <form
              id="new-patient-form"
              className="front-desk-form"
              autoComplete="off"
              onSubmit={handleSubmit}
            >
              <NewPatientClientSection
                ownerFirstNameRef={ownerFirstNameRef}
                newClientFirstName={newClientFirstName}
                onNewClientFirstNameChange={setNewClientFirstName}
                newClientLastName={newClientLastName}
                onNewClientLastNameChange={setNewClientLastName}
                newPhone={newPhone}
                onNewPhoneChange={setNewPhone}
                newAlternatePhone={newAlternatePhone}
                onNewAlternatePhoneChange={setNewAlternatePhone}
                newEmail={newEmail}
                onNewEmailChange={setNewEmail}
                newAddressLine1={newAddressLine1}
                onNewAddressLine1Change={setNewAddressLine1}
                newAddressLine2={newAddressLine2}
                onNewAddressLine2Change={setNewAddressLine2}
                newCity={newCity}
                onNewCityChange={setNewCity}
                newState={newState}
                onNewStateChange={setNewState}
                newPostalCode={newPostalCode}
                onNewPostalCodeChange={setNewPostalCode}
                newCountry={newCountry}
                onNewCountryChange={setNewCountry}
                onAddressAutofill={setAddressAutofill}
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
                color={color}
                onColorChange={setColor}
                dobMode={dobMode}
                onDobModeChange={setDobMode}
                exactDate={exactDate}
                onExactDateChange={setExactDate}
                estimatedAge={estimatedAge}
                onEstimatedAgeChange={setEstimatedAge}
                alerts={alerts}
                onAlertsChange={setAlerts}
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
                  requestAnimationFrame(() => ownerFirstNameRef.current?.focus());
                }}
                onNewAppointment={() => onNewAppointment(createdResult)}
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
              {saving ? 'Creating...' : 'Create Patient'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
