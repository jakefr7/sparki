'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import {
  communicationRequest,
  communicationError,
  deliveryLabel,
  type ClientMessage,
} from '../lib/client-communication';
import './appointment-text-status.css';

interface AppointmentTexts {
  planning: { upToDate: boolean; pendingSince: string | null };
  automatedTexts: { anyEnabled: boolean; allowedForAppointmentType: boolean };
  recipient: {
    threadId: string | null;
    canReceiveAutomatedTexts: boolean;
    reason: { message: string } | null;
  };
  notifications: {
    id: string;
    kind: string;
    status: string;
    expectedSendAt: string | null;
    dueAt: string;
    skipped: { message: string } | null;
    message: ClientMessage | null;
  }[];
}
const names: Record<string, string> = {
  CONFIRMATION: 'Booking confirmation',
  REMINDER: 'Reminder',
  RESCHEDULED: 'Rescheduled notice',
  CANCELLED: 'Cancellation notice',
};
export function AppointmentTextStatus({ appointmentId }: { appointmentId: string }) {
  const [result, setResult] = useState<AppointmentTexts | null>(null);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setResult(null);
    setError('');
    let fetching = false;
    const load = async () => {
      if (fetching) return;
      fetching = true;
      try {
        const response = await communicationRequest<AppointmentTexts>(
          `appointments/${encodeURIComponent(appointmentId)}/notifications`,
          { signal: controller.signal },
        );
        if (!controller.signal.aborted) {
          setResult(response);
          setError('');
        }
      } catch (issue) {
        if (!controller.signal.aborted) setError(communicationError(issue));
      } finally {
        fetching = false;
      }
    };
    void load();
    const timer = setInterval(() => {
      if (!document.hidden) void load();
    }, 4000);
    return () => {
      controller.abort();
      clearInterval(timer);
    };
  }, [appointmentId, retry]);
  return (
    <section className="appointment-text-status" aria-label="Appointment texts">
      <h3>Client texts</h3>
      {error && (
        <p role="alert">
          Booking remains saved. Text status couldn’t refresh.{' '}
          <button type="button" onClick={() => setRetry((n) => n + 1)}>
            Retry
          </button>
        </p>
      )}
      {!result && !error && <p role="status">Checking text status…</p>}
      {result && (
        <>
          {!result.planning.upToDate && <p role="status">Preparing messages…</p>}
          {!result.recipient.canReceiveAutomatedTexts && (
            <p>
              {result.recipient.reason?.message ?? 'This client cannot receive automated texts.'}
            </p>
          )}
          {!result.automatedTexts.anyEnabled && (
            <p>Automated appointment texts are off for this clinic.</p>
          )}
          {result.automatedTexts.anyEnabled && !result.automatedTexts.allowedForAppointmentType && (
            <p>Automated texts are off for this appointment type.</p>
          )}
          {result.notifications.map((notice) => (
            <div className="appointment-text-status__row" key={notice.id}>
              <strong>{names[notice.kind] ?? 'Appointment notice'}</strong>
              <span>
                {notice.message
                  ? deliveryLabel(notice.message)
                  : notice.status === 'SKIPPED'
                    ? 'Skipped'
                    : notice.status === 'SCHEDULED'
                      ? `Scheduled · ${new Date(notice.expectedSendAt ?? notice.dueAt).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}`
                      : notice.status === 'DISPATCHED'
                        ? 'Queued'
                        : 'Not sent'}
              </span>
              {notice.skipped && <small>{notice.skipped.message}</small>}
              {notice.message?.failure && <small>{notice.message.failure.message}</small>}
            </div>
          ))}
          {result.recipient.threadId && (
            <Link href={`/communication?thread=${encodeURIComponent(result.recipient.threadId)}`}>
              Open client conversation →
            </Link>
          )}
          <small>A text reply does not automatically confirm attendance.</small>
        </>
      )}
    </section>
  );
}
