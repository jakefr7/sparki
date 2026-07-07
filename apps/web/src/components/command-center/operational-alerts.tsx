import {
  CHECKOUT_BACKLOG_THRESHOLD,
  EXAM_QUEUE_DEPTH_THRESHOLD,
  LONG_WAIT_MINUTES,
} from '../../lib/command-center-states';
import { isBlockedVisit } from './card-helpers';
import type { OperationsDashboardGroups } from '../../lib/use-operations-dashboard';

interface OperationalAlert {
  id: string;
  tone: 'warning' | 'danger';
  message: string;
}

function buildAlerts(groups: OperationsDashboardGroups): OperationalAlert[] {
  const alerts: OperationalAlert[] = [];

  // waitingVisits and inProgressVisits overlap (a waiting state is still
  // "not exam-ready, not checkout-ready"), so dedupe by visit id or a
  // blocked ArrivedWithExceptions visit gets counted twice.
  const blocked = new Map(
    [...groups.waitingVisits, ...groups.examReadyVisits, ...groups.inProgressVisits]
      .filter(isBlockedVisit)
      .map((visit) => [visit.id, visit]),
  );
  if (blocked.size > 0) {
    alerts.push({
      id: 'blocked',
      tone: 'danger',
      message: `${blocked.size} patient${blocked.size === 1 ? '' : 's'} blocked and need${blocked.size === 1 ? 's' : ''} attention`,
    });
  }

  const longWaiting = groups.waitingVisits.filter((visit) => visit.elapsedMinutes >= LONG_WAIT_MINUTES);
  if (longWaiting.length > 0) {
    alerts.push({
      id: 'long-wait',
      tone: 'danger',
      message: `${longWaiting.length} patient${longWaiting.length === 1 ? '' : 's'} waiting ${LONG_WAIT_MINUTES}+ min`,
    });
  }

  if (groups.checkoutVisits.length >= CHECKOUT_BACKLOG_THRESHOLD) {
    alerts.push({
      id: 'checkout-backlog',
      tone: 'warning',
      message: `${groups.checkoutVisits.length} visits backed up at checkout`,
    });
  }

  if (groups.examReadyVisits.length >= EXAM_QUEUE_DEPTH_THRESHOLD) {
    alerts.push({
      id: 'exam-queue-depth',
      tone: 'warning',
      message: `${groups.examReadyVisits.length} patients ready for the doctor`,
    });
  }

  return alerts;
}

/**
 * Surfaces dashboard-load loading/error states, plus attention signals
 * derived from the already-fetched dashboard (long waits, checkout backlog,
 * exam queue depth) — no separate alerting data source exists yet.
 */
export function OperationalAlerts({
  loading,
  error,
  groups,
}: {
  loading: boolean;
  error: string | null;
  groups: OperationsDashboardGroups;
}) {
  if (loading) {
    return (
      <section className="ops-panel-state ops-panel-state--loading" aria-live="polite">
        <span className="ops-status-badge__dot" aria-hidden="true" />
        Loading clinic operations...
      </section>
    );
  }

  if (error) {
    return (
      <section className="ops-panel-state ops-panel-state--error" role="alert">
        <strong>Could not load the operations dashboard.</strong>
        <span>{error}</span>
      </section>
    );
  }

  const alerts = buildAlerts(groups);
  if (alerts.length === 0) return null;

  return (
    <section className="ops-alerts" aria-label="Operational alerts" aria-live="polite">
      {alerts.map((alert) => (
        <div key={alert.id} className={`ops-alert ops-alert--${alert.tone}`} role="status">
          <span className="ops-alert__dot" aria-hidden="true" />
          <span>{alert.message}</span>
        </div>
      ))}
    </section>
  );
}
