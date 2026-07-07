'use client';

import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { formatAge } from '../lib/format';
import {
  appointmentTypeLabel,
  clientDisplayName,
  type PatientSearchResult,
} from '../lib/patient-types';
import { QuickWalkInVisitAction, StartAppointmentVisitButton } from './start-visit-actions';

const DEBOUNCE_MS = 150;

function resultSubtitle(result: PatientSearchResult): string {
  const parts = [
    result.species,
    result.breed,
    result.sex,
    formatAge(result.dateOfBirth, 'short'),
  ].filter(
    (part): part is string => Boolean(part),
  );
  return parts.join(' · ');
}

function cleanDisplayName(name: string): string {
  const cleaned = name
    .replace(/\bVisit\s+(Client|Patient)\b/gi, '')
    .replace(/\b\d{8,}\b/g, '')
    .replace(/\bWalkIn\b/g, 'Walk-in')
    .replace(/\s+/g, ' ')
    .trim();

  return cleaned || name;
}

function operationalStatus(result: PatientSearchResult) {
  if (result.activeVisit) {
    return {
      badge: 'In Visit',
      detail: result.activeVisit.state,
      tone: 'active',
    };
  }
  if (result.nextAppointment) {
    return {
      badge: 'Scheduled',
      detail: `${appointmentTypeLabel(result.nextAppointment.type)} · ${new Date(
        result.nextAppointment.scheduledAt,
      ).toLocaleString()}`,
      tone: 'scheduled',
    };
  }
  return {
    badge: 'No Visit Today',
    detail: 'No appointment or active visit on deck',
    tone: 'idle',
  };
}

function resultHeadline(result: PatientSearchResult): string {
  if (result.activeVisit) return 'Active Visit';
  if (result.nextAppointment) return 'Appointment';
  return 'Client';
}

function clientLabel(result: PatientSearchResult): string {
  return result.primaryClient
    ? cleanDisplayName(clientDisplayName(result.primaryClient))
    : 'Client not linked';
}

function clientContact(result: PatientSearchResult): string {
  if (!result.primaryClient) return 'No client contact on file';
  return result.primaryClient.phone ?? result.primaryClient.email ?? 'No contact on file';
}

export function PatientSearch({
  placeholder = 'Client, pet, phone, or email',
}: {
  placeholder?: string;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PatientSearchResult[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  // Keyboard-first: land in the search box immediately.
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Keyboard-first: "/" jumps back to search from anywhere on the page.
  useEffect(() => {
    function onGlobalKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key === '/' && document.activeElement !== inputRef.current) {
        event.preventDefault();
        inputRef.current?.focus();
      }
    }
    window.addEventListener('keydown', onGlobalKeyDown);
    return () => window.removeEventListener('keydown', onGlobalKeyDown);
  }, []);

  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) {
      setResults([]);
      setActiveIndex(0);
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
          setActiveIndex(0);
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

  function openResult(result: PatientSearchResult) {
    router.push(`/patients/${result.id}`);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((index) => Math.min(index + 1, results.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((index) => Math.max(index - 1, 0));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const selected = results[activeIndex];
      if (selected) openResult(selected);
    } else if (event.key === 'Escape') {
      setQuery('');
    }
  }

  return (
    <div className="patient-search">
      <label htmlFor="patient-search-input" className="patient-search__label">
        Search
      </label>
      <input
        ref={inputRef}
        id="patient-search-input"
        type="text"
        role="combobox"
        aria-expanded={results.length > 0}
        aria-controls="patient-search-results"
        aria-activedescendant={results[activeIndex] ? `patient-result-${activeIndex}` : undefined}
        autoComplete="off"
        placeholder={placeholder}
        className="patient-search__input"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        onKeyDown={handleKeyDown}
      />
      {results.length > 0 && (
        <ul id="patient-search-results" role="listbox" className="patient-search__results">
          {results.map((result, index) => {
            const status = operationalStatus(result);
            return (
              <li
                key={result.id}
                id={`patient-result-${index}`}
                role="option"
                aria-selected={index === activeIndex}
                className={
                  index === activeIndex
                    ? 'patient-search__result patient-search__result--active'
                    : 'patient-search__result'
                }
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => openResult(result)}
              >
                <div className="patient-search__identity">
                  <div className="patient-search__result-headline">
                    <span className="patient-search__result-name">{resultHeadline(result)}</span>
                    <span className={`status-badge status-badge--${status.tone}`}>
                      {status.badge}
                    </span>
                  </div>
                  <span className="patient-search__result-client">
                    <span className="patient-search__entity-label">Client</span>
                    {clientLabel(result)} · {clientContact(result)}
                  </span>
                  <span className="patient-search__result-subtitle">
                    <span className="patient-search__entity-label">Patient</span>
                    {cleanDisplayName(result.name)}
                    {resultSubtitle(result) ? ` · ${resultSubtitle(result)}` : ''}
                  </span>
                  <span className="patient-search__operation-detail">
                    <strong>Today:</strong> {status.detail}
                  </span>
                </div>
                <div
                  className="patient-search__actions"
                  onClick={(event) => event.stopPropagation()}
                >
                  <Link href={`/patients/${result.id}`} className="button-primary">
                    Open Workspace
                  </Link>
                  {result.activeVisit ? (
                    <Link href={`/visits/${result.activeVisit.id}`} className="button-secondary">
                      Resume Visit
                    </Link>
                  ) : result.nextAppointment ? (
                    <StartAppointmentVisitButton
                      appointmentId={result.nextAppointment.id}
                      appointmentState={result.nextAppointment.state}
                    />
                  ) : (
                    <QuickWalkInVisitAction patientId={result.id} />
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {loading && <p className="patient-search__status">Searching…</p>}
      {!loading && hasSearched && results.length === 0 && (
        <div className="patient-search__no-results">
          <p className="patient-search__status">No patients match &ldquo;{query.trim()}&rdquo;.</p>
          <Link href="/patients/new" className="button-primary">
            Create New Patient
          </Link>
        </div>
      )}
    </div>
  );
}
