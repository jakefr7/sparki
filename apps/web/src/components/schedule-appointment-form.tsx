'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import {
  APPOINTMENT_TYPES,
  appointmentTypeLabel,
  type AppointmentTypeValue,
} from '../lib/patient-types';

export function ScheduleAppointmentForm({ patientId }: { patientId: string }) {
  const router = useRouter();
  const [appointmentType, setAppointmentType] = useState<AppointmentTypeValue>(
    APPOINTMENT_TYPES[0],
  );
  const [visitReason, setVisitReason] = useState('');
  const [startTime, setStartTime] = useState('');
  const [expectedDurationMinutes, setExpectedDurationMinutes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const response = await fetch('/api/appointments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patientId,
          appointmentType,
          visitReason,
          startTime: new Date(startTime).toISOString(),
          expectedDurationMinutes: expectedDurationMinutes
            ? Number(expectedDurationMinutes)
            : undefined,
        }),
      });

      if (!response.ok) {
        setError('Could not create appointment. Check the fields and try again.');
        setSubmitting(false);
        return;
      }

      router.push(`/patients/${patientId}`);
      router.refresh();
    } catch {
      setError('Could not reach the server. Try again.');
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="appointment-form">
      <label htmlFor="appointment-type">Appointment type</label>
      <select
        id="appointment-type"
        value={appointmentType}
        onChange={(event) => setAppointmentType(event.target.value as AppointmentTypeValue)}
        required
      >
        {APPOINTMENT_TYPES.map((type) => (
          <option key={type} value={type}>
            {appointmentTypeLabel(type)}
          </option>
        ))}
      </select>

      <label htmlFor="visit-reason">Visit reason</label>
      <input
        id="visit-reason"
        type="text"
        value={visitReason}
        onChange={(event) => setVisitReason(event.target.value)}
        required
        maxLength={500}
      />

      <label htmlFor="start-time">Start time</label>
      <input
        id="start-time"
        type="datetime-local"
        value={startTime}
        onChange={(event) => setStartTime(event.target.value)}
        required
      />

      <label htmlFor="expected-duration">Expected duration (minutes)</label>
      <input
        id="expected-duration"
        type="number"
        min={1}
        max={1440}
        value={expectedDurationMinutes}
        onChange={(event) => setExpectedDurationMinutes(event.target.value)}
        placeholder="Optional"
      />

      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}

      <button type="submit" disabled={submitting}>
        {submitting ? 'Scheduling…' : 'Schedule appointment'}
      </button>
    </form>
  );
}
