'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useLockBodyScroll } from '../hooks/use-lock-body-scroll';
import { clientDisplayName } from '../lib/patient-types';
import { visitStateLabel } from '../lib/format';

interface ActiveVisitSummaryForModal {
  id: string;
  state: string;
  visitType: string;
  reason: string;
  createdAt: string;
  client: {
    id: string;
    firstName: string;
    lastName: string;
  } | null;
  appointment: {
    id: string;
    scheduledAt: string;
    type: string;
  } | null;
  location?: {
    id: string;
    name: string;
  } | null;
  primaryVeterinarian?: {
    id: string;
    firstName: string;
    lastName: string;
    displayName: string | null;
  } | null;
  assignedTechnician?: {
    id: string;
    firstName: string;
    lastName: string;
    displayName: string | null;
  } | null;
}

function visitDateTime(value: string): string {
  return new Date(value).toLocaleString([], {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function ActiveVisitDetailsModal({
  visit,
  onClose,
}: {
  visit: ActiveVisitSummaryForModal;
  onClose: () => void;
}) {
  useLockBodyScroll(true);
  const doctor = visit.primaryVeterinarian
    ? visit.primaryVeterinarian.displayName ?? `Dr. ${visit.primaryVeterinarian.firstName} ${visit.primaryVeterinarian.lastName}`
    : null;
  const technician = visit.assignedTechnician
    ? visit.assignedTechnician.displayName ?? `${visit.assignedTechnician.firstName} ${visit.assignedTechnician.lastName}`
    : null;

  return (
    <div className="patient-profile-modal-overlay" role="presentation" onClick={onClose}>
      <section
        className="patient-profile-modal active-visit-details-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="active-visit-details-heading"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="patient-profile-modal-header">
          <button
            type="button"
            className="patient-profile-modal-close"
            onClick={onClose}
            aria-label="Close active visit details"
          >
            ×
          </button>
          <div>
            <p className="eyebrow">Current Visit</p>
            <h2 id="active-visit-details-heading">{visit.reason}</h2>
            <div className="active-visit-details__header-line">
              <span className="status-badge status-badge--active">{visitStateLabel(visit.state)}</span>
              <span className="active-visit-details__visit-type">{visit.visitType}</span>
            </div>
          </div>
        </div>

        <div className="active-visit-details">
          <dl className="active-visit-details__grid">
            <div>
              <dt>Client</dt>
              <dd>{visit.client ? clientDisplayName(visit.client) : 'No client linked'}</dd>
            </div>
            <div>
              <dt>Started</dt>
              <dd>{visitDateTime(visit.createdAt)}</dd>
            </div>
            <div>
              <dt>Appointment</dt>
              <dd>{visit.appointment ? visitDateTime(visit.appointment.scheduledAt) : 'Walk-in / no appointment'}</dd>
            </div>
            <div>
              <dt>Doctor</dt>
              <dd>{doctor ?? 'Unassigned'}</dd>
            </div>
            <div>
              <dt>Technician</dt>
              <dd>{technician ?? 'Unassigned'}</dd>
            </div>
            <div>
              <dt>Room / location</dt>
              <dd>{visit.location?.name ?? 'Not assigned'}</dd>
            </div>
          </dl>

          <div className="active-visit-details__actions">
            <button type="button" className="button-secondary" onClick={onClose}>
              Close
            </button>
            <Link href={`/visits/${visit.id}`} className="button-primary" onClick={onClose}>
              Open Full Visit
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}

export function ActiveVisitDetailsButton({
  visit,
  className = 'button-primary',
  label = 'View Visit',
}: {
  visit: ActiveVisitSummaryForModal;
  className?: string | undefined;
  label?: string | undefined;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button type="button" className={className} onClick={() => setOpen(true)}>
        {label}
      </button>
      {open ? <ActiveVisitDetailsModal visit={visit} onClose={() => setOpen(false)} /> : null}
    </>
  );
}
