'use client';
import { BreedField } from './breed-field';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { AddressAutocompleteField, type AddressAutofillResult } from './address-autocomplete-field';
import { DateOfBirthField } from './date-of-birth-field';
import { useLockBodyScroll } from '../hooks/use-lock-body-scroll';
import { dateOfBirthPayload, initialDateOfBirthValue, type DateOfBirthValue } from '../lib/date-of-birth';
import { SEX_OPTIONS, SPECIES_OPTIONS } from '../lib/patient-types';

export interface EditablePatient {
  id: string;
  name: string;
  species: string;
  breed: string | null;
  sex: string | null;
  dateOfBirth: string | null;
  dateOfBirthEstimated: boolean;
  estimatedAge: string | null;
  color: string | null;
  imageUrl: string | null;
}

export interface EditablePrimaryClient {
  id: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  alternatePhone: string | null;
  email: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  country: string | null;
}

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

interface FormState {
  name: string;
  species: string;
  breed: string;
  sex: string;
  dateOfBirth: DateOfBirthValue;
  color: string;
  clientFirstName: string;
  clientLastName: string;
  clientPhone: string;
  clientAlternatePhone: string;
  clientEmail: string;
  clientAddressLine1: string;
  clientAddressLine2: string;
  clientCity: string;
  clientState: string;
  clientPostalCode: string;
  clientCountry: string;
}

function initialFormState(
  patient: EditablePatient,
  client: EditablePrimaryClient | null,
): FormState {
  return {
    name: patient.name,
    species: patient.species,
    breed: patient.breed ?? '',
    sex: patient.sex ?? '',
    // A legacy free-text estimate opens on Estimated age so it can become a date.
    dateOfBirth: initialDateOfBirthValue(
      patient.dateOfBirth,
      patient.dateOfBirthEstimated,
      patient.estimatedAge ? 'estimated' : 'exact',
    ),
    color: patient.color ?? '',
    clientFirstName: client?.firstName ?? '',
    clientLastName: client?.lastName ?? '',
    clientPhone: client?.phone ?? '',
    clientAlternatePhone: client?.alternatePhone ?? '',
    clientEmail: client?.email ?? '',
    clientAddressLine1: client?.addressLine1 ?? '',
    clientAddressLine2: client?.addressLine2 ?? '',
    clientCity: client?.city ?? '',
    clientState: client?.state ?? '',
    clientPostalCode: client?.postalCode ?? '',
    clientCountry: client?.country ?? '',
  };
}

export function PatientProfileEditPanel({
  patient,
  primaryClient,
}: {
  patient: EditablePatient;
  primaryClient: EditablePrimaryClient | null;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  useLockBodyScroll(editing);
  const [form, setForm] = useState<FormState>(() => initialFormState(patient, primaryClient));
  const [addressAutofill, setAddressAutofill] = useState<AddressAutofillResult | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasDraft, setHasDraft] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const wasEditing = useRef(false);

  useEffect(() => {
    if (editing) dialogRef.current?.querySelector<HTMLInputElement>('input')?.focus();
    else if (wasEditing.current) triggerRef.current?.focus();
    wasEditing.current = editing;
  }, [editing]);

  function closeEditor(discard = false) {
    if (saving) return;
    if (discard) setHasDraft(false);
    setEditing(false);
  }

  function updateField<K extends keyof FormState>(field: K, value: FormState[K]) {
    setHasDraft(true);
    if (
      [
        'clientAddressLine1',
        'clientCity',
        'clientState',
        'clientPostalCode',
        'clientCountry',
      ].includes(field)
    ) {
      setAddressAutofill(null);
    }
    setForm((current) => ({ ...current, [field]: value }));
  }

  function openEditor() {
    if (!hasDraft) {
      setForm(initialFormState(patient, primaryClient));
      setAddressAutofill(null);
    }
    setError(null);
    setEditing(true);
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const name = form.name.trim();
    const species = form.species.trim();
    const clientFirstName = form.clientFirstName.trim();
    const clientLastName = form.clientLastName.trim();
    const clientEmail = form.clientEmail.trim();

    if (!name) {
      setError('Patient name is required.');
      return;
    }
    if (!species) {
      setError('Species is required.');
      return;
    }
    if (primaryClient && (!clientFirstName || !clientLastName)) {
      setError('Owner name is required.');
      return;
    }
    if (clientEmail && !isValidEmail(clientEmail)) {
      setError('Enter a valid email address.');
      return;
    }

    setSaving(true);
    let patientSaved = false;
    try {
      const patientResponse = await fetch(`/api/patients/${patient.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          species,
          breed: form.breed.trim() || null,
          sex: form.sex.trim() || null,
          ...dateOfBirthPayload(form.dateOfBirth),
          // A saved date supersedes the legacy free-text estimate.
          ...(form.dateOfBirth.date ? { estimatedAge: null } : {}),
          color: form.color.trim() || null,
        }),
      });
      if (!patientResponse.ok) {
        throw new Error('patient update failed');
      }
      patientSaved = true;

      if (primaryClient) {
        const initial = initialFormState(patient, primaryClient);
        const addressChanged = (
          [
            'clientAddressLine1',
            'clientAddressLine2',
            'clientCity',
            'clientState',
            'clientPostalCode',
            'clientCountry',
          ] as const
        ).some((field) => form[field].trim() !== initial[field].trim());
        const clientResponse = await fetch(`/api/clients/${primaryClient.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            firstName: clientFirstName,
            lastName: clientLastName,
            phone: form.clientPhone.trim() || null,
            alternatePhone: form.clientAlternatePhone.trim() || null,
            email: clientEmail || null,
            addressLine1: form.clientAddressLine1.trim() || null,
            addressLine2: form.clientAddressLine2.trim() || null,
            city: form.clientCity.trim() || null,
            state: form.clientState.trim() || null,
            postalCode: form.clientPostalCode.trim() || null,
            country: form.clientCountry.trim() || null,
            ...(addressChanged || addressAutofill
              ? {
                  formattedAddress: addressAutofill?.formattedAddress || null,
                  addressPlaceId: addressAutofill?.placeId || null,
                  addressLatitude: addressAutofill?.latitude ?? null,
                  addressLongitude: addressAutofill?.longitude ?? null,
                }
              : {}),
          }),
        });
        if (!clientResponse.ok) {
          throw new Error('client update failed');
        }
      }

      setHasDraft(false);
      setEditing(false);
      router.refresh();
    } catch {
      setError(
        patientSaved
          ? 'Patient details saved, but owner details could not be saved. Your edits are still here; try again.'
          : 'Could not save patient details. Your edits are still here; try again.',
      );
      if (patientSaved) router.refresh();
    } finally {
      setSaving(false);
    }
  }

  if (!editing) {
    return (
      <button ref={triggerRef} type="button" className="button-secondary" onClick={openEditor}>
        Edit Profile
      </button>
    );
  }

  return (
    <div
      className="patient-profile-modal-overlay"
      role="presentation"
      onClick={() => closeEditor()}
    >
      <div
        ref={dialogRef}
        className="patient-profile-modal patient-profile-edit-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="patient-profile-edit-heading"
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault();
            closeEditor();
          }
          if (event.key === 'Tab') {
            const controls = Array.from(
              dialogRef.current?.querySelectorAll<HTMLElement>(
                'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href]',
              ) ?? [],
            ).filter((element) => element.getClientRects().length > 0);
            const first = controls[0];
            const last = controls[controls.length - 1];
            if (event.shiftKey && document.activeElement === first) {
              event.preventDefault();
              last?.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
              event.preventDefault();
              first?.focus();
            }
          }
        }}
      >
        <div className="patient-profile-modal-header patient-profile-edit-modal__header">
          <button
            type="button"
            className="patient-profile-modal-close"
            onClick={() => closeEditor()}
            disabled={saving}
            aria-label="Close edit form"
          >
            <span aria-hidden="true">×</span>
          </button>
          <h2 id="patient-profile-edit-heading">Edit Profile</h2>
        </div>
        <div className="patient-profile-modal-body patient-profile-edit-modal__body">
          <p className="patient-section-description">
            Closing keeps your edits while this profile stays open. Cancel discards them.
          </p>
          <form className="front-desk-form patient-profile-modal-edit-form" onSubmit={handleSubmit}>
            <fieldset className="front-desk-section" disabled={saving}>
              <legend>Patient</legend>
              <div className="front-desk-grid">
                <label>
                  Patient name
                  <input
                    value={form.name}
                    onChange={(event) => updateField('name', event.target.value)}
                    required
                  />
                </label>
                <label>
                  Species
                  <select
                    value={form.species}
                    onChange={(event) => updateField('species', event.target.value)}
                    required
                  >
                    {!SPECIES_OPTIONS.includes(form.species as (typeof SPECIES_OPTIONS)[number]) &&
                      form.species && <option value={form.species}>{form.species}</option>}
                    {SPECIES_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Breed
                  <BreedField species={form.species} value={form.breed} onChange={(value) => updateField('breed', value)} />
                </label>
                <label>
                  Sex
                  <select
                    value={form.sex}
                    onChange={(event) => updateField('sex', event.target.value)}
                  >
                    <option value="">Unspecified</option>
                    {SEX_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Coat color
                  <input
                    value={form.color}
                    onChange={(event) => updateField('color', event.target.value)}
                  />
                </label>
                <div className="front-desk-grid__field--full">
                  <DateOfBirthField
                    idPrefix="edit-patient"
                    value={form.dateOfBirth}
                    onChange={(value) => updateField('dateOfBirth', value)}
                    legacyEstimate={patient.estimatedAge}
                  />
                </div>
              </div>
            </fieldset>

            <fieldset className="front-desk-section" disabled={saving}>
              <legend>Owner</legend>
              <div className="front-desk-grid front-desk-grid--spaced">
                <label>
                  First name
                  <input
                    value={form.clientFirstName}
                    onChange={(event) => updateField('clientFirstName', event.target.value)}
                    required={Boolean(primaryClient)}
                    disabled={!primaryClient}
                  />
                </label>
                <label>
                  Last name
                  <input
                    value={form.clientLastName}
                    onChange={(event) => updateField('clientLastName', event.target.value)}
                    required={Boolean(primaryClient)}
                    disabled={!primaryClient}
                  />
                </label>
                <label>
                  Cell phone
                  <input
                    value={form.clientPhone}
                    onChange={(event) => updateField('clientPhone', event.target.value)}
                    disabled={!primaryClient}
                  />
                </label>
                <label>
                  Home/work phone
                  <input
                    value={form.clientAlternatePhone}
                    onChange={(event) => updateField('clientAlternatePhone', event.target.value)}
                    disabled={!primaryClient}
                  />
                </label>
                <label>
                  Email
                  <input
                    type="email"
                    value={form.clientEmail}
                    onChange={(event) => updateField('clientEmail', event.target.value)}
                    disabled={!primaryClient}
                  />
                </label>
                <div className="front-desk-grid__field--full">
                  <AddressAutocompleteField
                    id="patient-profile-edit-address"
                    label="Street address"
                    value={form.clientAddressLine1}
                    disabled={!primaryClient}
                    onChange={(value) => updateField('clientAddressLine1', value)}
                    onAddressSelected={(result) => {
                      updateField('clientAddressLine1', result.addressLine1);
                      updateField('clientCity', result.city);
                      updateField('clientState', result.state);
                      updateField('clientPostalCode', result.postalCode);
                      updateField('clientCountry', result.country);
                      setAddressAutofill(result);
                    }}
                  />
                </div>
                <label>
                  Address line 2 (apt/suite)
                  <input
                    value={form.clientAddressLine2}
                    onChange={(event) => updateField('clientAddressLine2', event.target.value)}
                    disabled={!primaryClient}
                  />
                </label>
                <label>
                  City
                  <input
                    value={form.clientCity}
                    onChange={(event) => updateField('clientCity', event.target.value)}
                    disabled={!primaryClient}
                  />
                </label>
                <label>
                  State
                  <input
                    value={form.clientState}
                    onChange={(event) => updateField('clientState', event.target.value)}
                    disabled={!primaryClient}
                  />
                </label>
                <label>
                  ZIP/postal code
                  <input
                    value={form.clientPostalCode}
                    onChange={(event) => updateField('clientPostalCode', event.target.value)}
                    disabled={!primaryClient}
                  />
                </label>
                <label>
                  Country
                  <input
                    value={form.clientCountry}
                    onChange={(event) => updateField('clientCountry', event.target.value)}
                    disabled={!primaryClient}
                  />
                </label>
              </div>
              {!primaryClient && (
                <p className="patient-profile-modal-card__line">
                  No owner is linked to this patient, so owner details can&rsquo;t be edited here.
                </p>
              )}
            </fieldset>

            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}

            <div className="front-desk-actions">
              <button
                type="button"
                className="button-secondary"
                onClick={() => closeEditor(true)}
                disabled={saving}
              >
                Cancel
              </button>
              <button type="submit" className="button-primary" disabled={saving}>
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
