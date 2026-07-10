'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import {
  recordsPrepStatusLabel,
  RECORDS_PREP_STATUSES,
  type VisitDetail,
} from '../lib/patient-types';

/**
 * Tech/assistant records-research surface (Anna: "researches available
 * medical records before the appointment") — shown in the visit workspace
 * ahead of the intake form, tied to the originating Appointment's
 * records-request context from the scheduler's New Patient flow. Renders
 * nothing for a walk-in with no Appointment, since there's no records-
 * request context to prep against.
 */
export function RecordsPrepPanel({
  appointment,
}: {
  appointment: NonNullable<VisitDetail['appointment']>;
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const context = [
    appointment.primaryCareVetName
      ? { label: 'Primary care vet', value: appointment.primaryCareVetName }
      : null,
    appointment.previousClinicName
      ? { label: 'Previous clinic', value: appointment.previousClinicName }
      : null,
    appointment.previousRecordsSource
      ? { label: 'Records source', value: appointment.previousRecordsSource }
      : null,
    appointment.lastSeenAt
      ? { label: 'Last seen', value: new Date(appointment.lastSeenAt).toLocaleString() }
      : null,
  ].filter((item): item is { label: string; value: string } => Boolean(item));

  async function handleStatusChange(nextStatus: string) {
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/appointments/${appointment.id}/records-prep-status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recordsPrepStatus: nextStatus }),
      });
      if (!response.ok) throw new Error('Could not update records-prep status.');
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not update records-prep status.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="records-prep-panel" aria-labelledby="records-prep-heading">
      <div className="records-prep-panel__header">
        <div>
          <p className="eyebrow">Before Intake</p>
          <h2 id="records-prep-heading">Records Prep</h2>
        </div>
        <select
          value={appointment.recordsPrepStatus}
          disabled={saving}
          onChange={(event) => void handleStatusChange(event.target.value)}
          aria-label="Records prep status"
        >
          {RECORDS_PREP_STATUSES.map((status) => (
            <option key={status} value={status}>
              {recordsPrepStatusLabel(status)}
            </option>
          ))}
        </select>
      </div>
      {context.length > 0 ? (
        <dl className="records-prep-panel__context">
          {context.map((item) => (
            <div key={item.label}>
              <dt>{item.label}</dt>
              <dd>{item.value}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="records-prep-panel__empty">
          No records-request context was captured for this appointment.
        </p>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
