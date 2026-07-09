'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useLockBodyScroll } from '../hooks/use-lock-body-scroll';
import { PetPhotoPlaceholder } from './pet-photo-placeholder';
import { visitStateLabel } from '../lib/format';
import { appointmentTypeLabel, SEX_OPTIONS, SPECIES_OPTIONS } from '../lib/patient-types';

/** Everything the modal needs to render the patient profile workspace.
 *  Sourced from whatever the directory card already has in hand (search
 *  result or dev fallback row) — no dedicated profile-preview endpoint
 *  exists, and a full fetch would just duplicate what /patients/[id] does.
 *  Uploading documents is UI-only — see the Medical Records tab — there is
 *  no file storage/upload backend yet.
 *  `editable` is false for dev-only fallback rows that have no real
 *  patient/client id behind them (see patients-clients-hub.tsx). */
export interface PatientProfileData {
  id: string;
  patientName: string;
  species?: string | null | undefined;
  breed?: string | null | undefined;
  sex?: string | null | undefined;
  age?: string | null | undefined;
  dateOfBirth?: string | null | undefined;
  clientId?: string | null | undefined;
  clientName: string;
  clientFirstName?: string | null | undefined;
  clientLastName?: string | null | undefined;
  clientPhone?: string | null | undefined;
  clientEmail?: string | null | undefined;
  nextAppointment?:
    | {
        type: string;
        reason: string;
        scheduledAt: string;
      }
    | null
    | undefined;
  activeVisit?:
    | {
        id: string;
        state: string;
        reason: string;
      }
    | null
    | undefined;
  scheduleHref?: string | undefined;
  editable?: boolean | undefined;
}

/** What a successful save produces — normalized values the parent directory
 *  page merges back into its own state so the card and modal stay in sync
 *  without a full re-fetch. */
export interface PatientProfileEditPatch {
  patientName: string;
  species: string | null;
  breed: string | null;
  sex: string | null;
  dateOfBirth: string | null;
  clientFirstName: string;
  clientLastName: string;
  clientPhone: string | null;
  clientEmail: string | null;
}

function toDateInputValue(iso: string | null | undefined): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
}

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

type ProfileTab = 'overview' | 'records' | 'visits' | 'client';

const PROFILE_TABS: ReadonlyArray<{ id: ProfileTab; label: string }> = [
  { id: 'overview', label: 'Overview' },
  { id: 'records', label: 'Medical Records' },
  { id: 'visits', label: 'Visit History' },
  { id: 'client', label: 'Client Info' },
];

function appointmentTime(value: string) {
  return new Date(value).toLocaleString([], {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function PatientProfileHeader({
  patient,
  onClose,
  onEdit,
  editDisabled,
  closeButtonRef,
}: {
  patient: PatientProfileData;
  onClose: () => void;
  onEdit: () => void;
  editDisabled: boolean;
  closeButtonRef: React.RefObject<HTMLButtonElement>;
}) {
  const details = [patient.species, patient.breed, patient.sex, patient.age]
    .filter((part): part is string => Boolean(part))
    .join(' · ');

  return (
    <div className="patient-profile-modal-header">
      <button
        ref={closeButtonRef}
        type="button"
        className="patient-profile-modal-close"
        onClick={onClose}
        aria-label="Close patient profile"
      >
        <span aria-hidden="true">×</span>
      </button>
      <button
        type="button"
        className="patient-profile-modal-edit"
        onClick={onEdit}
        disabled={editDisabled}
        title={editDisabled ? 'This is sample data with no real record to edit' : undefined}
      >
        Edit Profile
      </button>
      <PetPhotoPlaceholder
        name={patient.patientName}
        species={patient.species}
        className="pet-photo-placeholder patient-profile-modal-header__avatar"
      />
      <h2 id="patient-profile-modal-heading">{patient.patientName}</h2>
      <p className="patient-profile-modal-header__details">
        {details || 'Patient details not yet captured'}
      </p>
      <p className="patient-profile-modal-header__client">{patient.clientName}</p>
    </div>
  );
}

function PatientProfileTabs({
  activeTab,
  onSelect,
}: {
  activeTab: ProfileTab;
  onSelect: (tab: ProfileTab) => void;
}) {
  return (
    <div className="patient-profile-modal-tabs" role="tablist" aria-label="Patient profile sections">
      {PROFILE_TABS.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          id={`patient-profile-tab-${tab.id}`}
          aria-selected={activeTab === tab.id}
          aria-controls={`patient-profile-panel-${tab.id}`}
          className={
            activeTab === tab.id
              ? 'patient-profile-modal-tab patient-profile-modal-tab--active'
              : 'patient-profile-modal-tab'
          }
          onClick={() => onSelect(tab.id)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

function QuickActions({
  patient,
  medicalRecordHref,
}: {
  patient: PatientProfileData;
  medicalRecordHref: string | undefined;
}) {
  return (
    <div className="patient-profile-modal-quick-actions">
      {patient.scheduleHref ? (
        <Link href={patient.scheduleHref} className="button-secondary">
          Set Appointment
        </Link>
      ) : (
        <button type="button" className="button-secondary" disabled>
          Set Appointment
        </button>
      )}
      <Link href="/patients/new" className="button-secondary">
        New Visit
      </Link>
      {medicalRecordHref ? (
        <Link href={medicalRecordHref} className="button-secondary">
          New Medical Record
        </Link>
      ) : (
        <button type="button" className="button-secondary" disabled>
          New Medical Record
        </button>
      )}
    </div>
  );
}

function OverviewTab({
  patient,
  medicalRecordHref,
}: {
  patient: PatientProfileData;
  medicalRecordHref: string | undefined;
}) {
  return (
    <div
      className="patient-profile-modal-column"
      role="tabpanel"
      id="patient-profile-panel-overview"
      aria-labelledby="patient-profile-tab-overview"
    >
      <section className="patient-profile-modal-card" aria-labelledby="patient-profile-modal-quick-actions-heading">
        <p className="eyebrow" id="patient-profile-modal-quick-actions-heading">
          Quick Actions
        </p>
        <QuickActions patient={patient} medicalRecordHref={medicalRecordHref} />
      </section>

      <section className="patient-profile-modal-card" aria-labelledby="patient-profile-modal-appt-heading">
        <p className="eyebrow" id="patient-profile-modal-appt-heading">
          Upcoming Appointment
        </p>
        {patient.nextAppointment ? (
          <>
            <strong className="patient-profile-modal-card__title">
              {appointmentTypeLabel(patient.nextAppointment.type)}
            </strong>
            <span className="patient-profile-modal-card__line">
              {appointmentTime(patient.nextAppointment.scheduledAt)}
            </span>
          </>
        ) : (
          <span className="patient-profile-modal-card__line">No upcoming appointment</span>
        )}
      </section>

      <section
        className="patient-profile-modal-card"
        aria-labelledby="patient-profile-modal-active-visit-heading"
      >
        <p className="eyebrow" id="patient-profile-modal-active-visit-heading">
          Active Visit
        </p>
        {patient.activeVisit ? (
          <>
            <strong className="patient-profile-modal-card__title">
              {visitStateLabel(patient.activeVisit.state)}
            </strong>
            <span className="patient-profile-modal-card__line">{patient.activeVisit.reason}</span>
          </>
        ) : (
          <span className="patient-profile-modal-card__line">No active visit</span>
        )}
      </section>

      <section
        className="patient-profile-modal-card patient-profile-modal-card--muted"
        aria-labelledby="patient-profile-modal-notes-heading"
      >
        <p className="eyebrow" id="patient-profile-modal-notes-heading">
          Notes / Care Summary
        </p>
        <span className="patient-profile-modal-card__line">
          Profile notes will appear here in a future phase.
        </span>
      </section>
    </div>
  );
}

const ACCEPTED_FILE_TYPES = ['PDF', 'DOC / DOCX', 'Images'] as const;

function MedicalRecordsTab({ medicalRecordHref }: { medicalRecordHref: string | undefined }) {
  return (
    <div
      className="patient-profile-modal-records"
      role="tabpanel"
      id="patient-profile-panel-records"
      aria-labelledby="patient-profile-tab-records"
    >
      <div className="patient-profile-modal-records__toolbar">
        <div>
          <h3>Medical Records</h3>
          <p>Store records, documents, images, and completed visit notes for this patient.</p>
        </div>
        <div className="patient-profile-modal-records__toolbar-actions">
          <button
            type="button"
            className="button-secondary"
            disabled
            title="Document upload is coming in a follow-up phase"
          >
            Upload Record
          </button>
          {medicalRecordHref ? (
            <Link href={medicalRecordHref} className="button-primary">
              New Medical Record
            </Link>
          ) : (
            <button type="button" className="button-primary" disabled>
              New Medical Record
            </button>
          )}
        </div>
      </div>

      <div className="patient-profile-modal-records__filetypes">
        <span>Accepted soon:</span>
        {ACCEPTED_FILE_TYPES.map((type) => (
          <span key={type} className="patient-profile-modal-filetype-chip">
            {type}
          </span>
        ))}
      </div>

      <div className="patient-profile-modal-records__empty">
        <strong>No medical records yet.</strong>
        <p>Upload PDFs, documents, images, or create a new medical record.</p>
      </div>
    </div>
  );
}

function VisitHistoryTab() {
  return (
    <div
      className="patient-profile-modal-column"
      role="tabpanel"
      id="patient-profile-panel-visits"
      aria-labelledby="patient-profile-tab-visits"
    >
      <section className="patient-profile-modal-card" aria-labelledby="patient-profile-modal-visit-history-heading">
        <p className="eyebrow" id="patient-profile-modal-visit-history-heading">
          Visit History
        </p>
        <span className="patient-profile-modal-card__line">No visit history yet.</span>
      </section>
    </div>
  );
}

function ClientInfoTab({
  patient,
  onEdit,
  editDisabled,
}: {
  patient: PatientProfileData;
  onEdit: () => void;
  editDisabled: boolean;
}) {
  return (
    <div
      className="patient-profile-modal-column"
      role="tabpanel"
      id="patient-profile-panel-client"
      aria-labelledby="patient-profile-tab-client"
    >
      <section className="patient-profile-modal-card" aria-labelledby="patient-profile-modal-client-heading">
        <div className="patient-profile-modal-card__header">
          <p className="eyebrow" id="patient-profile-modal-client-heading">
            Client Info
          </p>
          <button
            type="button"
            className="patient-profile-modal-card__action"
            onClick={onEdit}
            disabled={editDisabled}
            title={editDisabled ? 'This is sample data with no real record to edit' : undefined}
          >
            Edit
          </button>
        </div>
        <strong className="patient-profile-modal-card__title">{patient.clientName}</strong>
        <span className="patient-profile-modal-card__line">
          {patient.clientPhone || 'No phone on file'}
        </span>
        <span className="patient-profile-modal-card__line">
          {patient.clientEmail || 'No email on file'}
        </span>
        <span className="patient-profile-modal-card__line">No address on file</span>
      </section>
    </div>
  );
}

interface EditFormState {
  patientName: string;
  species: string;
  breed: string;
  sex: string;
  dateOfBirth: string;
  clientFirstName: string;
  clientLastName: string;
  clientPhone: string;
  clientEmail: string;
}

function editFormStateFromPatient(patient: PatientProfileData): EditFormState {
  return {
    patientName: patient.patientName,
    species: patient.species ?? '',
    breed: patient.breed ?? '',
    sex: patient.sex ?? '',
    dateOfBirth: toDateInputValue(patient.dateOfBirth),
    clientFirstName: patient.clientFirstName ?? '',
    clientLastName: patient.clientLastName ?? '',
    clientPhone: patient.clientPhone ?? '',
    clientEmail: patient.clientEmail ?? '',
  };
}

function EditProfileForm({
  patient,
  onCancel,
  onSaved,
}: {
  patient: PatientProfileData;
  onCancel: () => void;
  onSaved: (patch: PatientProfileEditPatch) => void;
}) {
  const [form, setForm] = useState<EditFormState>(() => editFormStateFromPatient(patient));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function updateField<K extends keyof EditFormState>(field: K, value: EditFormState[K]) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const patientName = form.patientName.trim();
    const species = form.species.trim();
    const clientFirstName = form.clientFirstName.trim();
    const clientLastName = form.clientLastName.trim();
    const clientEmail = form.clientEmail.trim();

    if (!patientName) {
      setError('Pet first name is required.');
      return;
    }
    if (!species) {
      setError('Species is required.');
      return;
    }
    if (patient.clientId && (!clientFirstName || !clientLastName)) {
      setError('Client name is required.');
      return;
    }
    if (clientEmail && !isValidEmail(clientEmail)) {
      setError('Enter a valid email address.');
      return;
    }

    setSaving(true);
    try {
      const patientResponse = await fetch(`/api/patients/${patient.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: patientName,
          species,
          breed: form.breed.trim() || null,
          sex: form.sex.trim() || null,
          dateOfBirth: form.dateOfBirth || null,
        }),
      });
      if (!patientResponse.ok) {
        throw new Error('patient update failed');
      }

      if (patient.clientId) {
        const clientResponse = await fetch(`/api/clients/${patient.clientId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            firstName: clientFirstName,
            lastName: clientLastName,
            phone: form.clientPhone.trim() || null,
            email: clientEmail || null,
          }),
        });
        if (!clientResponse.ok) {
          throw new Error('client update failed');
        }
      }

      onSaved({
        patientName,
        species,
        breed: form.breed.trim() || null,
        sex: form.sex.trim() || null,
        dateOfBirth: form.dateOfBirth || null,
        clientFirstName,
        clientLastName,
        clientPhone: form.clientPhone.trim() || null,
        clientEmail: clientEmail || null,
      });
    } catch {
      setError('Something went wrong saving these changes. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="front-desk-form patient-profile-modal-edit-form" onSubmit={handleSubmit}>
      <div className="front-desk-grid">
        <label>
          Pet first name
          <input
            value={form.patientName}
            onChange={(event) => updateField('patientName', event.target.value)}
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
          <input value={form.breed} onChange={(event) => updateField('breed', event.target.value)} />
        </label>
        <label>
          Sex
          <select value={form.sex} onChange={(event) => updateField('sex', event.target.value)}>
            <option value="">Unspecified</option>
            {SEX_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
        <label>
          Date of birth
          <input
            type="date"
            value={form.dateOfBirth}
            onChange={(event) => updateField('dateOfBirth', event.target.value)}
          />
        </label>
      </div>

      <div className="front-desk-grid front-desk-grid--spaced">
        <label>
          Client first name
          <input
            value={form.clientFirstName}
            onChange={(event) => updateField('clientFirstName', event.target.value)}
            required={Boolean(patient.clientId)}
            disabled={!patient.clientId}
          />
        </label>
        <label>
          Client last name
          <input
            value={form.clientLastName}
            onChange={(event) => updateField('clientLastName', event.target.value)}
            required={Boolean(patient.clientId)}
            disabled={!patient.clientId}
          />
        </label>
        <label>
          Client phone
          <input
            value={form.clientPhone}
            onChange={(event) => updateField('clientPhone', event.target.value)}
            disabled={!patient.clientId}
          />
        </label>
        <label>
          Client email
          <input
            type="email"
            value={form.clientEmail}
            onChange={(event) => updateField('clientEmail', event.target.value)}
            disabled={!patient.clientId}
          />
        </label>
      </div>

      {!patient.clientId && (
        <p className="patient-profile-modal-card__line">
          No client is linked to this patient, so client details can&rsquo;t be edited here.
        </p>
      )}

      {error && <p className="form-error">{error}</p>}

      <div className="front-desk-actions">
        <button type="button" className="button-secondary" onClick={onCancel} disabled={saving}>
          Cancel
        </button>
        <button type="submit" className="button-primary" disabled={saving}>
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </form>
  );
}

export function PatientProfileModal({
  patient,
  onClose,
  onSaved,
}: {
  patient: PatientProfileData | null;
  onClose: () => void;
  onSaved: (patch: PatientProfileEditPatch) => void;
}) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);
  const [activeTab, setActiveTab] = useState<ProfileTab>('overview');
  const [isEditing, setIsEditing] = useState(false);

  useLockBodyScroll(Boolean(patient));

  useEffect(() => {
    if (!patient) return;

    setActiveTab('overview');
    setIsEditing(false);
    previouslyFocused.current = document.activeElement as HTMLElement | null;
    closeButtonRef.current?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKeyDown);

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      previouslyFocused.current?.focus();
    };
  }, [patient, onClose]);

  if (!patient) return null;

  const medicalRecordHref = patient.activeVisit ? `/visits/${patient.activeVisit.id}` : undefined;
  const editDisabled = patient.editable === false;

  function handleSaved(patch: PatientProfileEditPatch) {
    onSaved(patch);
    setIsEditing(false);
  }

  return (
    <div className="patient-profile-modal-overlay" role="presentation" onClick={onClose}>
      <div
        className="patient-profile-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="patient-profile-modal-heading"
        onClick={(event) => event.stopPropagation()}
      >
        <PatientProfileHeader
          patient={patient}
          onClose={onClose}
          onEdit={() => setIsEditing(true)}
          editDisabled={editDisabled || isEditing}
          closeButtonRef={closeButtonRef}
        />
        {isEditing ? (
          <div className="patient-profile-modal-body">
            <EditProfileForm patient={patient} onCancel={() => setIsEditing(false)} onSaved={handleSaved} />
          </div>
        ) : (
          <>
            <PatientProfileTabs activeTab={activeTab} onSelect={setActiveTab} />
            <div className="patient-profile-modal-body">
              {activeTab === 'overview' && (
                <OverviewTab patient={patient} medicalRecordHref={medicalRecordHref} />
              )}
              {activeTab === 'records' && <MedicalRecordsTab medicalRecordHref={medicalRecordHref} />}
              {activeTab === 'visits' && <VisitHistoryTab />}
              {activeTab === 'client' && (
                <ClientInfoTab
                  patient={patient}
                  onEdit={() => setIsEditing(true)}
                  editDisabled={editDisabled}
                />
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
