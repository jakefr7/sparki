'use client';

import { useEffect, useMemo, useState } from 'react';
import { DashboardCard, DashboardShell } from './dashboard-shell';
import { NewPatientModal, type NewPatientCreationResult } from './new-patient-modal';
import {
  PatientProfileModal,
  type PatientProfileData,
  type PatientProfileEditPatch,
} from './patient-profile-modal';
import { PetPhotoPlaceholder } from './pet-photo-placeholder';
import { formatAge } from '../lib/format';
import { clientDisplayName, type PatientSearchResult } from '../lib/patient-types';

const SHOW_DEV_FALLBACK_ROWS = process.env.NODE_ENV !== 'production';
const DEBOUNCE_MS = 150;

/** Pure identity/contact info only — no visit state, appointment state, or
 *  clinic-flow status belongs on this directory. That lives on the Patient
 *  Profile, Today, or Scheduler pages instead. */
interface DirectoryPatient {
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
  clientContact?: string | null | undefined;
  clientPhone?: string | null | undefined;
  clientEmail?: string | null | undefined;
  nextAppointment?: PatientProfileData['nextAppointment'];
  activeVisit?: PatientProfileData['activeVisit'];
  /** Dev-only fixture with no real backend record — the schedule link
   *  degrades to a disabled action instead of hitting a 404, and editing
   *  is disabled too since there's no patient/client id to PATCH. */
  isFallback: boolean;
}

const DEV_DIRECTORY_PATIENTS: DirectoryPatient[] = [
  {
    id: 'dev-bella',
    patientName: 'Bella',
    species: 'Dog',
    breed: 'Golden Retriever',
    clientName: 'Sarah Johnson',
    isFallback: true,
  },
  {
    id: 'dev-max',
    patientName: 'Max',
    species: 'Cat',
    breed: 'Domestic Shorthair',
    clientName: 'Michael Lee',
    isFallback: true,
  },
  {
    id: 'dev-luna',
    patientName: 'Luna',
    species: 'Dog',
    breed: 'Border Collie',
    clientName: 'Emily Davis',
    isFallback: true,
  },
  {
    id: 'dev-cooper',
    patientName: 'Cooper',
    species: 'Dog',
    breed: 'English Bulldog',
    clientName: 'David Wilson',
    isFallback: true,
  },
  {
    id: 'dev-charlie',
    patientName: 'Charlie',
    species: 'Dog',
    breed: 'Labrador Retriever',
    clientName: 'Jessica Martinez',
    isFallback: true,
  },
  {
    id: 'dev-penny',
    patientName: 'Penny',
    species: 'Cat',
    breed: 'Siamese',
    clientName: 'Robert Chen',
    isFallback: true,
  },
  {
    id: 'dev-rocky',
    patientName: 'Rocky',
    species: 'Dog',
    breed: 'German Shepherd',
    clientName: 'Amanda Torres',
    isFallback: true,
  },
  {
    id: 'dev-jasper',
    patientName: 'Jasper',
    species: 'Cat',
    breed: 'Maine Coon',
    clientName: 'Kevin Park',
    isFallback: true,
  },
  {
    id: 'dev-sadie',
    patientName: 'Sadie',
    species: 'Dog',
    breed: 'Beagle',
    clientName: 'Laura Bennett',
    isFallback: true,
  },
  {
    id: 'dev-oliver',
    patientName: 'Oliver',
    species: 'Cat',
    breed: 'British Shorthair',
    clientName: 'Daniel Kim',
    isFallback: true,
  },
  {
    id: 'dev-buddy',
    patientName: 'Buddy',
    species: 'Dog',
    breed: 'Boxer',
    clientName: 'Rachel Green',
    isFallback: true,
  },
  {
    id: 'dev-chloe',
    patientName: 'Chloe',
    species: 'Cat',
    breed: 'Ragdoll',
    clientName: 'Thomas Nguyen',
    isFallback: true,
  },
  {
    id: 'dev-zeus',
    patientName: 'Zeus',
    species: 'Dog',
    breed: 'Rottweiler',
    clientName: 'Melissa Scott',
    isFallback: true,
  },
  {
    id: 'dev-lily',
    patientName: 'Lily',
    species: 'Cat',
    breed: 'Persian',
    clientName: 'Brian Foster',
    isFallback: true,
  },
  {
    id: 'dev-duke',
    patientName: 'Duke',
    species: 'Dog',
    breed: 'Great Dane',
    clientName: 'Nicole Adams',
    isFallback: true,
  },
  {
    id: 'dev-sophie',
    patientName: 'Sophie',
    species: 'Cat',
    breed: 'Russian Blue',
    clientName: 'James Whitfield',
    isFallback: true,
  },
  {
    id: 'dev-bear',
    patientName: 'Bear',
    species: 'Dog',
    breed: 'Bernese Mountain Dog',
    clientName: 'Christina Ruiz',
    isFallback: true,
  },
  {
    id: 'dev-nala',
    patientName: 'Nala',
    species: 'Cat',
    breed: 'Bengal',
    clientName: 'Marcus Bell',
    isFallback: true,
  },
  {
    id: 'dev-tucker',
    patientName: 'Tucker',
    species: 'Dog',
    breed: 'Australian Shepherd',
    clientName: 'Karen Ortiz',
    isFallback: true,
  },
  {
    id: 'dev-mia',
    patientName: 'Mia',
    species: 'Cat',
    breed: 'Sphynx',
    clientName: 'Steven Baker',
    isFallback: true,
  },
  {
    id: 'dev-winston',
    patientName: 'Winston',
    species: 'Dog',
    breed: 'Bulldog',
    clientName: 'Diane Sullivan',
    isFallback: true,
  },
  {
    id: 'dev-ginger',
    patientName: 'Ginger',
    species: 'Cat',
    breed: 'Abyssinian',
    clientName: 'Patrick Reyes',
    isFallback: true,
  },
  {
    id: 'dev-rusty',
    patientName: 'Rusty',
    species: 'Dog',
    breed: 'Dachshund',
    clientName: 'Heather Collins',
    isFallback: true,
  },
  {
    id: 'dev-willow',
    patientName: 'Willow',
    species: 'Cat',
    breed: 'Norwegian Forest Cat',
    clientName: 'Gregory Hayes',
    isFallback: true,
  },
];

function searchResultToDirectoryPatient(result: PatientSearchResult): DirectoryPatient {
  return {
    id: result.id,
    patientName: result.name,
    species: result.species,
    breed: result.breed,
    sex: result.sex,
    age: formatAge(result.dateOfBirth, 'short'),
    dateOfBirth: result.dateOfBirth,
    clientId: result.primaryClient?.id ?? null,
    clientName: result.primaryClient ? clientDisplayName(result.primaryClient) : 'Client not linked',
    clientFirstName: result.primaryClient?.firstName ?? null,
    clientLastName: result.primaryClient?.lastName ?? null,
    clientContact: result.primaryClient?.phone ?? result.primaryClient?.email ?? null,
    clientPhone: result.primaryClient?.phone ?? null,
    clientEmail: result.primaryClient?.email ?? null,
    nextAppointment: result.nextAppointment
      ? {
          type: result.nextAppointment.type,
          reason: result.nextAppointment.reason,
          scheduledAt: result.nextAppointment.scheduledAt,
        }
      : null,
    activeVisit: result.activeVisit
      ? {
          id: result.activeVisit.id,
          state: result.activeVisit.state,
          reason: result.activeVisit.reason,
        }
      : null,
    isFallback: false,
  };
}

function newPatientResultToSearchResult(result: NewPatientCreationResult): PatientSearchResult {
  return {
    id: result.id,
    name: result.name,
    species: result.species,
    breed: result.breed,
    sex: result.sex,
    dateOfBirth: result.dateOfBirth,
    weight: null,
    color: null,
    status: 'Active',
    primaryClient: {
      id: result.clientId,
      firstName: result.clientFirstName,
      lastName: result.clientLastName,
      phone: result.clientPhone,
      email: result.clientEmail,
      preferredContactMethod: null,
    },
    activeVisit: null,
    nextAppointment: null,
  };
}

function directoryPatientToProfile(patient: DirectoryPatient): PatientProfileData {
  return {
    id: patient.id,
    patientName: patient.patientName,
    species: patient.species,
    breed: patient.breed,
    sex: patient.sex,
    age: patient.age,
    dateOfBirth: patient.dateOfBirth,
    clientId: patient.clientId,
    clientName: patient.clientName,
    clientFirstName: patient.clientFirstName,
    clientLastName: patient.clientLastName,
    clientPhone: patient.clientPhone,
    clientEmail: patient.clientEmail,
    nextAppointment: patient.nextAppointment,
    activeVisit: patient.activeVisit,
    scheduleHref: patient.isFallback ? undefined : `/patients/${patient.id}/schedule`,
    editable: !patient.isFallback,
  };
}

function PatientDirectoryCard({
  patient,
  onOpen,
}: {
  patient: DirectoryPatient;
  onOpen: (patient: DirectoryPatient) => void;
}) {
  const details = [patient.species, patient.breed, patient.sex, patient.age]
    .filter((part): part is string => Boolean(part))
    .join(' · ');

  return (
    <button
      type="button"
      className="patient-directory-card"
      aria-label={`Preview ${patient.patientName}'s profile`}
      onClick={() => onOpen(patient)}
    >
      <PetPhotoPlaceholder
        name={patient.patientName}
        species={patient.species}
        className="pet-photo-placeholder patient-directory-card__avatar"
      />
      <div className="patient-directory-card__body">
        <strong>{patient.patientName}</strong>
        {details && <span className="patient-directory-card__details">{details}</span>}
        <span className="patient-directory-card__client">{patient.clientName}</span>
        {patient.clientContact && (
          <span className="patient-directory-card__contact">{patient.clientContact}</span>
        )}
      </div>
    </button>
  );
}

function PatientDirectoryEmptyState({ hasQuery }: { hasQuery: boolean }) {
  return (
    <div className="patient-directory-empty">
      <p>{hasQuery ? 'No matching patients or clients found.' : 'No patients found yet.'}</p>
    </div>
  );
}

function PatientDirectorySearch({
  query,
  onQueryChange,
}: {
  query: string;
  onQueryChange: (value: string) => void;
}) {
  return (
    <DashboardCard className="patient-directory-search-card" aria-labelledby="patient-directory-search-heading">
      <div className="home-widget__header">
        <div>
          <p className="eyebrow">Directory</p>
          <h2 id="patient-directory-search-heading">Find a Patient or Client</h2>
        </div>
      </div>
      <label className="patient-directory-search" htmlFor="patient-directory-search-input">
        <span className="sr-only">Search the patient directory</span>
        <input
          id="patient-directory-search-input"
          type="search"
          autoComplete="off"
          placeholder="Search by pet name, client name, phone, or email…"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
        />
      </label>
    </DashboardCard>
  );
}

function PatientDirectoryQuickActions({ onNewPatient }: { onNewPatient: () => void }) {
  return (
    <DashboardCard className="patient-directory-actions-card" aria-labelledby="patient-directory-actions-heading">
      <div className="home-widget__header">
        <div>
          <p className="eyebrow">Create</p>
          <h2 id="patient-directory-actions-heading">Quick Actions</h2>
        </div>
      </div>
      <div className="patients-hub-actions">
        <button type="button" data-tone="teal" onClick={onNewPatient}>
          New Patient
        </button>
      </div>
    </DashboardCard>
  );
}

export function PatientsDirectoryPage() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PatientSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [selectedPatient, setSelectedPatient] = useState<DirectoryPatient | null>(null);
  const [isNewPatientModalOpen, setIsNewPatientModalOpen] = useState(false);

  // Directory search reuses the existing /api/patients/search proxy (same
  // one PatientSearch uses) rather than standing up a new backend endpoint.
  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) {
      setResults([]);
      setHasSearched(false);
      return;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => {
      setLoading(true);
      fetch(`/api/patients/search?query=${encodeURIComponent(trimmed)}`, {
        signal: controller.signal,
      })
        .then((response) => response.json() as Promise<PatientSearchResult[]>)
        .then((data) => {
          setResults(data);
          setHasSearched(true);
        })
        .catch((error: unknown) => {
          if (!(error instanceof DOMException && error.name === 'AbortError')) {
            setResults([]);
            setHasSearched(true);
          }
        })
        .finally(() => setLoading(false));
    }, DEBOUNCE_MS);

    return () => {
      controller.abort();
      clearTimeout(timeout);
    };
  }, [query]);

  const directoryPatients = useMemo(() => {
    if (hasSearched) return results.map(searchResultToDirectoryPatient);
    return SHOW_DEV_FALLBACK_ROWS ? DEV_DIRECTORY_PATIENTS : [];
  }, [hasSearched, results]);

  // Memoized so the modal only sees a new object identity when the selected
  // patient actually changes, not on every unrelated re-render (e.g. typing
  // in search) — that identity drives its focus-management effect.
  const profileData = useMemo(
    () => (selectedPatient ? directoryPatientToProfile(selectedPatient) : null),
    [selectedPatient],
  );

  const trimmedQuery = query.trim();

  function handlePatientSaved(patch: PatientProfileEditPatch) {
    setSelectedPatient((current) => {
      if (!current) return current;
      return {
        ...current,
        patientName: patch.patientName,
        species: patch.species,
        breed: patch.breed,
        sex: patch.sex,
        age: formatAge(patch.dateOfBirth, 'short'),
        dateOfBirth: patch.dateOfBirth,
        clientFirstName: patch.clientFirstName,
        clientLastName: patch.clientLastName,
        clientName: current.clientId ? `${patch.clientFirstName} ${patch.clientLastName}` : current.clientName,
        clientContact: patch.clientPhone ?? patch.clientEmail ?? null,
        clientPhone: patch.clientPhone,
        clientEmail: patch.clientEmail,
      };
    });

    setResults((current) =>
      current.map((result) => {
        if (result.id !== selectedPatient?.id) return result;
        return {
          ...result,
          name: patch.patientName,
          species: patch.species ?? result.species,
          breed: patch.breed,
          sex: patch.sex,
          dateOfBirth: patch.dateOfBirth,
          primaryClient: result.primaryClient
            ? {
                ...result.primaryClient,
                firstName: patch.clientFirstName,
                lastName: patch.clientLastName,
                phone: patch.clientPhone,
                email: patch.clientEmail,
              }
            : result.primaryClient,
        };
      }),
    );
  }

  function handlePatientCreated(result: NewPatientCreationResult) {
    setResults((current) => [newPatientResultToSearchResult(result), ...current]);
    setHasSearched(true);
  }

  function handleOpenCreatedProfile(result: NewPatientCreationResult) {
    setSelectedPatient(searchResultToDirectoryPatient(newPatientResultToSearchResult(result)));
    setIsNewPatientModalOpen(false);
  }

  return (
    <DashboardShell
      activeHref="/patients"
      eyebrow="Patients / Clients"
      title="Patients / Clients"
      subtitle="Search clinic records and open patient profiles."
    >
      <div className="patient-directory-toolbar">
        <PatientDirectorySearch query={query} onQueryChange={setQuery} />
        <PatientDirectoryQuickActions onNewPatient={() => setIsNewPatientModalOpen(true)} />
      </div>
      <DashboardCard className="patient-directory-results-card" aria-labelledby="patient-directory-results-heading">
        <div className="home-widget__header">
          <div>
            <p className="eyebrow">{hasSearched ? 'Search results' : 'All patients'}</p>
            <h2 id="patient-directory-results-heading">
              {hasSearched ? `Results for "${trimmedQuery}"` : 'Clinic Directory'}
            </h2>
          </div>
        </div>
        {loading ? (
          <p className="patient-search__status">Searching…</p>
        ) : directoryPatients.length > 0 ? (
          <div className="patient-directory-grid">
            {directoryPatients.map((patient) => (
              <PatientDirectoryCard key={patient.id} patient={patient} onOpen={setSelectedPatient} />
            ))}
          </div>
        ) : (
          <PatientDirectoryEmptyState hasQuery={hasSearched} />
        )}
      </DashboardCard>
      <PatientProfileModal
        patient={profileData}
        onClose={() => setSelectedPatient(null)}
        onSaved={handlePatientSaved}
      />
      <NewPatientModal
        open={isNewPatientModalOpen}
        onClose={() => setIsNewPatientModalOpen(false)}
        onCreated={handlePatientCreated}
        onOpenProfile={handleOpenCreatedProfile}
      />
    </DashboardShell>
  );
}
