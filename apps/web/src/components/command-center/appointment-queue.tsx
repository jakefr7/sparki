'use client';

import { useState } from 'react';
import Link from 'next/link';
import { appointmentStatusLabel, timeLabel } from '../../lib/format';
import { CHECK_IN_STATES } from '../../lib/command-center-states';
import { appointmentTypeLabel, type DashboardAppointmentSummary } from '../../lib/patient-types';
import { appointmentHref, appointmentMatchesStaff, appointmentNextAction, clientLabel } from './card-helpers';
import { EmptyQueue } from './empty-states';
import { SectionShell } from './section-shell';

function AppointmentCard({
  appointment,
  onAppointmentCheckedIn,
  actionLabel = 'Open Patient',
  tone = 'upcoming',
  focusStaffId,
}: {
  appointment: DashboardAppointmentSummary;
  onAppointmentCheckedIn?: (() => void) | undefined;
  actionLabel?: string | undefined;
  tone?: 'completed' | 'upcoming' | undefined;
  focusStaffId?: string | null | undefined;
}) {
  const href = appointmentHref(appointment);
  const [checkingIn, setCheckingIn] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canCheckIn = Boolean(
    onAppointmentCheckedIn && appointment.patient && CHECK_IN_STATES.has(appointment.state),
  );
  const isMine = Boolean(focusStaffId && appointmentMatchesStaff(appointment, focusStaffId));

  async function handleCheckIn() {
    if (!appointment.patient) return;

    setCheckingIn(true);
    setError(null);

    try {
      const arriveResponse = await fetch(`/api/appointments/${appointment.id}/arrive`, {
        method: 'POST',
      });
      const arrivePayload = (await arriveResponse.json()) as { message?: string };
      if (!arriveResponse.ok) {
        throw new Error(arrivePayload.message ?? 'Could not check in appointment.');
      }

      const visitResponse = await fetch('/api/visits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ appointmentId: appointment.id }),
      });
      const visitPayload = (await visitResponse.json()) as { message?: string };
      if (!visitResponse.ok) {
        throw new Error(visitPayload.message ?? 'Could not create visit.');
      }

      onAppointmentCheckedIn?.();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not check in appointment.');
    } finally {
      setCheckingIn(false);
    }
  }

  const card = (
    <>
      <div className="ops-work-card__topline">
        <span className="ops-pill">{timeLabel(appointment.scheduledAt)}</span>
        <span>{appointment.expectedDurationMinutes ?? 30} min</span>
      </div>
      {isMine && <span className="ops-tag ops-tag--accent">For You</span>}
      <strong>{appointment.patient?.name ?? 'Unlinked patient'}</strong>
      <dl>
        <div>
          <dt>Client</dt>
          <dd>{clientLabel(appointment.client)}</dd>
        </div>
        <div>
          <dt>State</dt>
          <dd>{appointmentStatusLabel(appointment.state)}</dd>
        </div>
        <div>
          <dt>Owner</dt>
          <dd>{appointment.provider?.displayName ?? 'Unassigned provider'}</dd>
        </div>
        <div>
          <dt>Next</dt>
          <dd>{appointmentNextAction(appointment)}</dd>
        </div>
      </dl>
      <p>{appointmentTypeLabel(appointment.type)} · {appointment.reason}</p>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {canCheckIn ? (
        <button
          type="button"
          className="ops-card-action ops-card-action--button"
          onClick={() => void handleCheckIn()}
          disabled={checkingIn}
        >
          {checkingIn ? 'Checking In…' : 'Check In'}
        </button>
      ) : (
        <span className="ops-card-action">{href ? actionLabel : 'No Patient Link'}</span>
      )}
    </>
  );

  const mineClass = isMine ? ' ops-work-card--mine' : '';

  if (canCheckIn) {
    return <div className={`ops-work-card ops-work-card--${tone}${mineClass}`}>{card}</div>;
  }

  return href ? (
    <Link
      href={href}
      className={`ops-work-card ops-work-card--${tone}${mineClass}`}
      aria-label={`${actionLabel} for ${appointment.patient?.name ?? 'appointment'}`}
    >
      {card}
    </Link>
  ) : (
    <div className={`ops-work-card ops-work-card--static ops-work-card--${tone}${mineClass}`}>{card}</div>
  );
}

export function AppointmentQueue({
  title,
  tone,
  appointments,
  emptyLabel,
  layout = 'grid',
  displayLimit,
  actionLabel,
  cardTone,
  onAppointmentCheckedIn,
  focusStaffId,
}: {
  title: string;
  tone: 'completed' | 'upcoming';
  appointments: DashboardAppointmentSummary[];
  emptyLabel: string;
  layout?: 'grid' | 'stack';
  displayLimit?: number;
  actionLabel?: string;
  cardTone?: 'completed' | 'upcoming';
  onAppointmentCheckedIn?: () => void;
  focusStaffId?: string | null | undefined;
}) {
  const visible = displayLimit ? appointments.slice(0, displayLimit) : appointments;
  const listClassName = layout === 'stack' ? 'ops-card-stack' : 'ops-card-grid';

  return (
    <SectionShell title={title} count={appointments.length} tone={tone}>
      {appointments.length > 0 ? (
        <div className={listClassName}>
          {visible.map((appointment) => (
            <AppointmentCard
              key={appointment.id}
              appointment={appointment}
              actionLabel={actionLabel}
              tone={cardTone}
              onAppointmentCheckedIn={onAppointmentCheckedIn}
              focusStaffId={focusStaffId}
            />
          ))}
        </div>
      ) : (
        <EmptyQueue label={emptyLabel} />
      )}
    </SectionShell>
  );
}
