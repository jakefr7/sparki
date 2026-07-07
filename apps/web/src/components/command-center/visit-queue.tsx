'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { appointmentTypeLabel, type DashboardVisitSummary } from '../../lib/patient-types';
import { enumLabel } from '../../lib/format';
import { LONG_WAIT_MINUTES, STARTABLE_STATES } from '../../lib/command-center-states';
import {
  blockedReason,
  clientLabel,
  isBlockedVisit,
  ownerLabel,
  visitActionLabel,
  visitMatchesStaff,
  visitNextAction,
  visitOwner,
  visitTone,
} from './card-helpers';
import { EmptyQueue } from './empty-states';
import { SectionShell } from './section-shell';

export function ExamReadyVisitCard({
  visit,
  onExamStarted,
  highlight,
  focusStaffId,
}: {
  visit: DashboardVisitSummary;
  onExamStarted: () => void;
  highlight?: string;
  focusStaffId?: string | null | undefined;
}) {
  const router = useRouter();
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const href = `/visits/${visit.id}?from=command-center`;
  const blocked = isBlockedVisit(visit);
  const isMine = Boolean(focusStaffId && visitMatchesStaff(visit, focusStaffId));

  async function handleStartExam() {
    setStarting(true);
    setError(null);
    try {
      const response = await fetch(`/api/visits/${visit.id}/exam/start`, { method: 'POST' });
      if (!response.ok) {
        const payload = (await response.json()) as { message?: string };
        throw new Error(payload.message ?? `Could not start exam (${response.status})`);
      }
      onExamStarted();
      router.push(href);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not start exam.');
      setStarting(false);
    }
  }

  return (
    <button
      type="button"
      onClick={() => void handleStartExam()}
      disabled={starting}
      className={[
        'ops-work-card',
        'ops-work-card--exam',
        blocked && 'ops-work-card--blocked',
        isMine && 'ops-work-card--mine',
      ]
        .filter(Boolean)
        .join(' ')}
      aria-label={
        blocked
          ? `Start Exam for ${visit.patient.name}, blocked: ${blockedReason(visit)}`
          : `Start Exam for ${visit.patient.name}`
      }
    >
      {highlight && <p className="ops-work-card__priority-tag">{highlight}</p>}
      <div className="ops-work-card__topline">
        <span className="ops-pill">Ready for Doctor</span>
        <span>{visit.elapsedMinutes} min</span>
      </div>
      {blocked && <span className="ops-tag ops-tag--danger">Blocked · {blockedReason(visit)}</span>}
      {isMine && <span className="ops-tag ops-tag--accent">For You</span>}
      <strong>{visit.patient.name}</strong>
      <dl>
        <div>
          <dt>Provider</dt>
          <dd>{visit.primaryVeterinarian?.displayName ?? 'Unassigned provider'}</dd>
        </div>
        <div>
          <dt>Tech</dt>
          <dd>{visit.assignedTechnician?.displayName ?? 'Unassigned technician'}</dd>
        </div>
        <div>
          <dt>Reason</dt>
          <dd>{visit.reason || appointmentTypeLabel(visit.visitType)}</dd>
        </div>
        <div>
          <dt>Intake</dt>
          <dd>{visit.intakeSummaryAvailable ? 'Summary available' : 'No summary yet'}</dd>
        </div>
      </dl>
      <p>{clientLabel(visit.client)}</p>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <span className="ops-card-action">{starting ? 'Starting Exam...' : 'Start Exam'}</span>
    </button>
  );
}

export function VisitCard({
  visit,
  onVisitStarted,
  highlight,
  focusStaffId,
}: {
  visit: DashboardVisitSummary;
  onVisitStarted: () => void;
  highlight?: string;
  focusStaffId?: string | null | undefined;
}) {
  const router = useRouter();
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const owner = visitOwner(visit);
  const tone = visitTone(visit);
  const href = `/visits/${visit.id}?from=command-center`;
  const startable = STARTABLE_STATES.has(visit.state);
  const overdue = tone === 'waiting' && visit.elapsedMinutes >= LONG_WAIT_MINUTES;
  const blocked = isBlockedVisit(visit);
  const isMine = Boolean(focusStaffId && visitMatchesStaff(visit, focusStaffId));

  async function handleActivate() {
    if (!startable) {
      router.push(href);
      return;
    }

    setStarting(true);
    setError(null);
    try {
      const response = await fetch(`/api/visits/${visit.id}/start`, { method: 'POST' });
      if (!response.ok) {
        throw new Error(`Could not start visit (${response.status})`);
      }
      onVisitStarted();
      router.push(href);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not start visit.');
      setStarting(false);
    }
  }

  return (
    <button
      type="button"
      onClick={() => void handleActivate()}
      disabled={starting}
      className={[
        'ops-work-card',
        `ops-work-card--${tone}`,
        overdue && 'ops-work-card--overdue',
        blocked && 'ops-work-card--blocked',
        isMine && 'ops-work-card--mine',
      ]
        .filter(Boolean)
        .join(' ')}
      aria-label={
        blocked
          ? `${visitActionLabel(visit)} for ${visit.patient.name}, blocked: ${blockedReason(visit)}`
          : overdue
            ? `${visitActionLabel(visit)} for ${visit.patient.name}, waiting ${visit.elapsedMinutes} minutes`
            : `${visitActionLabel(visit)} for ${visit.patient.name}`
      }
    >
      {highlight && <p className="ops-work-card__priority-tag">{highlight}</p>}
      <div className="ops-work-card__topline">
        <span className={overdue ? 'ops-pill ops-pill--overdue' : 'ops-pill'}>{enumLabel(visit.state)}</span>
        <span>{visit.elapsedMinutes} min</span>
      </div>
      {blocked && <span className="ops-tag ops-tag--danger">Blocked · {blockedReason(visit)}</span>}
      {isMine && <span className="ops-tag ops-tag--accent">For You</span>}
      <strong>{visit.patient.name}</strong>
      <dl>
        <div>
          <dt>Client</dt>
          <dd>{clientLabel(visit.client)}</dd>
        </div>
        <div>
          <dt>State</dt>
          <dd>{enumLabel(visit.state)}</dd>
        </div>
        <div>
          <dt>Owner</dt>
          <dd>{ownerLabel(owner)}</dd>
        </div>
        <div>
          <dt>Next</dt>
          <dd>{visitNextAction(visit)}</dd>
        </div>
      </dl>
      <p>{visit.reason || appointmentTypeLabel(visit.visitType)}</p>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <span className="ops-card-action">{starting ? 'Starting…' : visitActionLabel(visit)}</span>
    </button>
  );
}

export function VisitQueue({
  title,
  tone,
  visits,
  emptyLabel,
  onVisitStarted,
  cardVariant = 'default',
  focusStaffId,
}: {
  title: string;
  tone: 'waiting' | 'exam' | 'active' | 'checkout';
  visits: DashboardVisitSummary[];
  emptyLabel: string;
  onVisitStarted: () => void;
  cardVariant?: 'default' | 'exam-ready';
  focusStaffId?: string | null | undefined;
}) {
  const attentionCount =
    tone === 'waiting'
      ? visits.filter((visit) => isBlockedVisit(visit) || visit.elapsedMinutes >= LONG_WAIT_MINUTES).length
      : tone === 'exam'
        ? visits.filter(isBlockedVisit).length
        : undefined;

  return (
    <SectionShell title={title} count={visits.length} tone={tone} attentionCount={attentionCount}>
      {visits.length > 0 ? (
        <div className="ops-card-grid">
          {visits.map((visit) =>
            cardVariant === 'exam-ready' ? (
              <ExamReadyVisitCard
                key={visit.id}
                visit={visit}
                onExamStarted={onVisitStarted}
                focusStaffId={focusStaffId}
              />
            ) : (
              <VisitCard key={visit.id} visit={visit} onVisitStarted={onVisitStarted} focusStaffId={focusStaffId} />
            ),
          )}
        </div>
      ) : (
        <EmptyQueue label={emptyLabel} />
      )}
    </SectionShell>
  );
}
