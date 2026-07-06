'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  appointmentTypeLabel,
  clientDisplayName,
  type PatientSearchResult,
} from '../lib/patient-types';

const SNAPSHOT_QUERIES = ['a', 'e', 'i', 'o', 'u'];

function resultRank(result: PatientSearchResult): number {
  if (result.activeVisit) return 0;
  if (result.nextAppointment) return 1;
  return 2;
}

function statusLabel(result: PatientSearchResult): string {
  if (result.activeVisit) return 'In visit';
  if (result.nextAppointment) return 'Scheduled';
  return 'On file';
}

function statusTone(result: PatientSearchResult): string {
  if (result.activeVisit) return 'active';
  if (result.nextAppointment) return 'scheduled';
  return 'idle';
}

function timeLabel(value: string): string {
  return new Date(value).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function enumLabel(value: string): string {
  return value.replace(/([a-z])([A-Z])/g, '$1 $2');
}

function operationDetail(result: PatientSearchResult): string {
  if (result.activeVisit) {
    return `${enumLabel(result.activeVisit.state)} · ${result.activeVisit.reason}`;
  }

  if (result.nextAppointment) {
    return `${timeLabel(result.nextAppointment.scheduledAt)} · ${appointmentTypeLabel(
      result.nextAppointment.type,
    )}`;
  }

  return 'No active visit or appointment today';
}

function clientLabel(result: PatientSearchResult): string {
  return result.primaryClient ? clientDisplayName(result.primaryClient) : 'Client not linked';
}

export function TodayFloorSnapshot() {
  const [results, setResults] = useState<PatientSearchResult[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();

    Promise.all(
      SNAPSHOT_QUERIES.map((query) =>
        fetch(`/api/patients/search?query=${query}&limit=8`, { signal: controller.signal }).then(
          (response) => response.json() as Promise<PatientSearchResult[]>,
        ),
      ),
    )
      .then((groups) => {
        const unique = new Map<string, PatientSearchResult>();
        for (const result of groups.flat()) {
          unique.set(result.id, result);
        }

        setResults(
          Array.from(unique.values())
            .sort((a, b) => resultRank(a) - resultRank(b) || a.name.localeCompare(b.name))
            .slice(0, 6),
        );
      })
      .catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === 'AbortError')) {
          setResults([]);
        }
      })
      .finally(() => setLoading(false));

    return () => controller.abort();
  }, []);

  const activeVisits = results.filter((result) => result.activeVisit).length;
  const scheduled = results.filter(
    (result) => !result.activeVisit && result.nextAppointment,
  ).length;
  const onFile = results.length - activeVisits - scheduled;

  return (
    <section className="floor-snapshot" aria-label="Today floor snapshot">
      <div className="floor-snapshot__header">
        <div>
          <p className="eyebrow">Today&apos;s floor</p>
          <h2>Live care queue</h2>
        </div>
        <span className="status-dot" aria-hidden="true" />
      </div>

      <div className="floor-snapshot__metrics" aria-label="Visible floor counts">
        <div>
          <span>Active</span>
          <strong>{loading ? '...' : activeVisits}</strong>
        </div>
        <div>
          <span>Scheduled</span>
          <strong>{loading ? '...' : scheduled}</strong>
        </div>
        <div>
          <span>On file</span>
          <strong>{loading ? '...' : onFile}</strong>
        </div>
      </div>

      <div className="floor-snapshot__list">
        {loading ? (
          <p className="floor-snapshot__empty">Loading today&apos;s records...</p>
        ) : results.length > 0 ? (
          results.map((result) => (
            <Link key={result.id} href={`/patients/${result.id}`} className="floor-snapshot__row">
              <span className={`status-badge status-badge--${statusTone(result)}`}>
                {statusLabel(result)}
              </span>
              <strong>{result.name}</strong>
              <span>{clientLabel(result)}</span>
              <small>{operationDetail(result)}</small>
            </Link>
          ))
        ) : (
          <p className="floor-snapshot__empty">No visible records yet.</p>
        )}
      </div>
    </section>
  );
}
