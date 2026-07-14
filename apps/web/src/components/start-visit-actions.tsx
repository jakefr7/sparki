'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { useCurrentUser } from '../lib/use-current-user';

interface VisitResponse {
  id?: string;
  message?: string;
}

function activeVisitIdFromMessage(message: string | undefined): string | null {
  if (!message) return null;
  return message.match(/active Visit \(([^)]+)\)/)?.[1] ?? null;
}

async function createVisit(body: Record<string, string>): Promise<VisitResponse> {
  const response = await fetch('/api/visits', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const payload = (await response.json()) as VisitResponse;

  if (!response.ok) {
    throw new Error(payload.message ?? 'Could not create the visit.');
  }

  return payload;
}

function conflictMessage(message: string): string {
  return activeVisitIdFromMessage(message) ? 'Active visit already exists.' : message;
}

async function markAppointmentArrived(appointmentId: string): Promise<void> {
  const response = await fetch(`/api/appointments/${appointmentId}/arrive`, {
    method: 'POST',
  });
  const payload = (await response.json()) as VisitResponse;

  if (!response.ok) {
    throw new Error(payload.message ?? 'Could not mark appointment arrived.');
  }
}

export function StartAppointmentVisitButton({
  appointmentId,
  appointmentState,
  disabled = false,
  className = 'button-secondary',
  label = 'Begin Intake',
}: {
  appointmentId: string;
  appointmentState: string;
  disabled?: boolean;
  className?: string;
  label?: string;
}) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { user, loading } = useCurrentUser();
  const canBeginIntake = user?.role === 'TECHNICIAN' || user?.role === 'ASSISTANT';

  if (loading || !canBeginIntake) return null;

  async function handleClick() {
    setSubmitting(true);
    setError(null);

    try {
      if (appointmentState !== 'Arrived') {
        await markAppointmentArrived(appointmentId);
      }
      const visit = await createVisit({ appointmentId });
      if (visit.id) {
        const startResponse = await fetch(`/api/visits/${visit.id}/start`, { method: 'POST' });
        if (!startResponse.ok) {
          const payload = (await startResponse.json()) as VisitResponse;
          throw new Error(payload.message ?? 'Could not begin intake.');
        }
        router.push(`/visits/${visit.id}`);
        router.refresh();
        return;
      }
      setError('Visit was created, but no visit ID was returned.');
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'Could not begin intake.';
      const activeVisitId = activeVisitIdFromMessage(message);
      if (activeVisitId) {
        router.push(`/visits/${activeVisitId}`);
        router.refresh();
        return;
      }
      setError(conflictMessage(message));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="visit-action">
      <button
        type="button"
        className={className}
        onClick={handleClick}
        disabled={disabled || submitting}
    >
        {submitting ? 'Starting…' : label}
      </button>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

export function StartWalkInVisitForm({
  patientId,
  activeVisitId,
  compact = false,
  submitLabel = 'Start Walk-In',
}: {
  patientId: string;
  activeVisitId?: string;
  compact?: boolean;
  submitLabel?: string;
}) {
  const router = useRouter();
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (activeVisitId) {
    return (
      <Link
        href={`/visits/${activeVisitId}`}
        className={compact ? 'button-secondary' : 'button-primary'}
      >
        Resume Visit
      </Link>
    );
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const visit = await createVisit({ patientId, reason });
      if (visit.id) {
        router.push(`/visits/${visit.id}`);
        router.refresh();
        return;
      }
      setError('Visit was created, but no visit ID was returned.');
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'Could not start walk-in visit.';
      const activeVisitId = activeVisitIdFromMessage(message);
      if (activeVisitId) {
        router.push(`/visits/${activeVisitId}`);
        router.refresh();
        return;
      }
      setError(conflictMessage(message));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className={compact ? 'walk-in-form walk-in-form--compact' : 'walk-in-form'}
    >
      <label htmlFor="walk-in-reason">Walk-in reason</label>
      <input
        id="walk-in-reason"
        type="text"
        value={reason}
        onChange={(event) => setReason(event.target.value)}
        required
        maxLength={500}
      />
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <button
        type="submit"
        className={compact ? 'button-secondary' : 'button-primary'}
        disabled={submitting}
      >
        {submitting ? 'Creating…' : submitLabel}
      </button>
    </form>
  );
}

export function QuickWalkInVisitAction({ patientId }: { patientId: string }) {
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const visit = await createVisit({ patientId, reason });
      if (visit.id) {
        router.push(`/visits/${visit.id}`);
        router.refresh();
        return;
      }
      setError('Visit was created, but no visit ID was returned.');
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'Could not create walk-in visit.';
      const activeVisitId = activeVisitIdFromMessage(message);
      if (activeVisitId) {
        router.push(`/visits/${activeVisitId}`);
        router.refresh();
        return;
      }
      setError(conflictMessage(message));
    } finally {
      setSubmitting(false);
    }
  }

  if (!expanded) {
    return (
      <button
        type="button"
        className="button-secondary"
        onClick={(event) => {
          event.stopPropagation();
          setExpanded(true);
        }}
      >
        Create Walk-In Visit
      </button>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="quick-visit-form"
      onClick={(event) => event.stopPropagation()}
    >
      <label htmlFor={`quick-walk-in-reason-${patientId}`}>Reason</label>
      <input
        id={`quick-walk-in-reason-${patientId}`}
        type="text"
        value={reason}
        onChange={(event) => setReason(event.target.value)}
        required
        maxLength={500}
        placeholder="Walk-in reason"
      />
      <button type="submit" className="button-secondary" disabled={submitting}>
        {submitting ? 'Creating…' : 'Create'}
      </button>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}
