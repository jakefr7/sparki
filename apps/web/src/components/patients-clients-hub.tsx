'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { DashboardCard, DashboardShell } from './dashboard-shell';
import { NewPatientModal, type NewPatientCreationResult } from './new-patient-modal';
// PatientProfileModal (the quick-card popup preview) is intentionally not
// wired up anymore — clicking a card now navigates straight to the full
// Patient Profile page instead. The component is left in place in
// patient-profile-modal.tsx in case the popup gets reintroduced later.
import type { PatientProfileData } from './patient-profile-modal';
import { PetPhotoPlaceholder } from './pet-photo-placeholder';
import { formatAge } from '../lib/format';
import { clientDisplayName, type PatientSearchResult } from '../lib/patient-types';

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
  imageUrl?: string | null | undefined;
  clientId?: string | null | undefined;
  clientName: string;
  clientFirstName?: string | null | undefined;
  clientLastName?: string | null | undefined;
  clientContact?: string | null | undefined;
  clientPhone?: string | null | undefined;
  clientEmail?: string | null | undefined;
  nextAppointment?: PatientProfileData['nextAppointment'];
  activeVisit?: PatientProfileData['activeVisit'];
}

function searchResultToDirectoryPatient(result: PatientSearchResult): DirectoryPatient {
  return {
    id: result.id,
    patientName: result.name,
    species: result.species,
    breed: result.breed,
    sex: result.sex,
    age: formatAge(result.dateOfBirth, 'short'),
    dateOfBirth: result.dateOfBirth,
    imageUrl: result.imageUrl,
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
    imageUrl: result.imageUrl,
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

function PatientDirectoryCardBody({ patient }: { patient: DirectoryPatient }) {
  const details = [patient.species, patient.breed, patient.sex, patient.age]
    .filter((part): part is string => Boolean(part))
    .join(' · ');

  return (
    <>
      {patient.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={patient.imageUrl}
          alt={patient.patientName}
          className="pet-photo-placeholder patient-directory-card__avatar"
        />
      ) : (
        <PetPhotoPlaceholder
          name={patient.patientName}
          species={patient.species}
          className="pet-photo-placeholder patient-directory-card__avatar"
        />
      )}
      <div className="patient-directory-card__body">
        <strong>{patient.patientName}</strong>
        {details && <span className="patient-directory-card__details">{details}</span>}
        <span className="patient-directory-card__client">{patient.clientName}</span>
        {patient.clientContact && (
          <span className="patient-directory-card__contact">{patient.clientContact}</span>
        )}
      </div>
    </>
  );
}

/** Quick-card is a lightweight preview only — clicking it navigates
 *  straight to the full Patient Profile page (/patients/[id]). No popup. */
function PatientDirectoryCard({ patient }: { patient: DirectoryPatient }) {
  return (
    <Link
      href={`/patients/${patient.id}`}
      className="patient-directory-card"
      aria-label={`Open ${patient.patientName}'s profile`}
    >
      <PatientDirectoryCardBody patient={patient} />
    </Link>
  );
}

function PatientDirectoryEmptyState({ hasQuery }: { hasQuery: boolean }) {
  return (
    <div className="patient-directory-empty">
      <p>{hasQuery ? 'No matching patients or clients found.' : 'No patients yet — create one to get started.'}</p>
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
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PatientSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  // Plain directory listing (GET /api/patients, no query) — what the tab
  // shows before the user types a search, so it's never empty just because
  // nobody's searched yet.
  const [listing, setListing] = useState<PatientSearchResult[]>([]);
  const [listingLoading, setListingLoading] = useState(true);
  const [isNewPatientModalOpen, setIsNewPatientModalOpen] = useState(false);

  const loadListing = useMemo(
    () => (signal: AbortSignal) => {
      setListingLoading(true);
      return fetch('/api/patients?limit=50', { signal })
        .then((response) => response.json() as Promise<PatientSearchResult[]>)
        .then((data) => setListing(data))
        .catch((error: unknown) => {
          if (!(error instanceof DOMException && error.name === 'AbortError')) {
            setListing([]);
          }
        })
        .finally(() => setListingLoading(false));
    },
    [],
  );

  useEffect(() => {
    const controller = new AbortController();
    void loadListing(controller.signal);
    return () => controller.abort();
  }, [loadListing]);

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

  const baseDirectoryPatients = useMemo(() => {
    if (hasSearched) return results.map(searchResultToDirectoryPatient);
    return listing.map(searchResultToDirectoryPatient);
  }, [hasSearched, results, listing]);

  const trimmedQuery = query.trim();
  const isLoading = hasSearched ? loading : listingLoading;

  // Instant visual filtering over whatever's already loaded (the last
  // server response), so the grid narrows on every keystroke rather than
  // waiting on the debounced server round-trip above. The debounced fetch
  // still runs and replaces `results` with authoritative data once it lands.
  const directoryPatients = useMemo(() => {
    if (!trimmedQuery) return baseDirectoryPatients;
    const needle = trimmedQuery.toLowerCase();
    return baseDirectoryPatients.filter(
      (patient) =>
        patient.patientName.toLowerCase().includes(needle) ||
        patient.clientName.toLowerCase().includes(needle) ||
        (patient.clientContact?.toLowerCase().includes(needle) ?? false),
    );
  }, [baseDirectoryPatients, trimmedQuery]);

  function handlePatientCreated(result: NewPatientCreationResult) {
    // Show the new patient immediately in the default (no-query) listing —
    // no need to force the user into a "search results" view for it.
    setListing((current) => [newPatientResultToSearchResult(result), ...current]);
  }

  function handleOpenCreatedProfile(result: NewPatientCreationResult) {
    setIsNewPatientModalOpen(false);
    router.push(`/patients/${result.id}`);
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
        {isLoading ? (
          <p className="patient-search__status">{hasSearched ? 'Searching…' : 'Loading patients…'}</p>
        ) : directoryPatients.length > 0 ? (
          <div className="patient-directory-grid">
            {directoryPatients.map((patient) => (
              <PatientDirectoryCard key={patient.id} patient={patient} />
            ))}
          </div>
        ) : (
          <PatientDirectoryEmptyState hasQuery={hasSearched} />
        )}
      </DashboardCard>
      <NewPatientModal
        open={isNewPatientModalOpen}
        onClose={() => setIsNewPatientModalOpen(false)}
        onCreated={handlePatientCreated}
        onOpenProfile={handleOpenCreatedProfile}
      />
    </DashboardShell>
  );
}
