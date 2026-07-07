import { LONG_WAIT_MINUTES } from '../../lib/command-center-states';
import type { DashboardVisitSummary, OperationsDashboard } from '../../lib/patient-types';

const CHECKOUT_ATTENTION_THRESHOLD = 3;
const ARRIVED_ATTENTION_THRESHOLD = 5;

function waitStats(waitingVisits: DashboardVisitSummary[]): { longest: number; average: number } {
  if (waitingVisits.length === 0) return { longest: 0, average: 0 };
  const minutes = waitingVisits.map((visit) => visit.elapsedMinutes);
  const longest = Math.max(...minutes);
  const average = Math.round(minutes.reduce((sum, value) => sum + value, 0) / minutes.length);
  return { longest, average };
}

function waitTone(minutes: number): 'neutral' | 'warning' | 'danger' {
  if (minutes >= LONG_WAIT_MINUTES * 2) return 'danger';
  if (minutes >= LONG_WAIT_MINUTES) return 'warning';
  return 'neutral';
}

export function CommandCenterMetrics({
  summary,
  waitingVisits,
  updating,
}: {
  summary: OperationsDashboard['summary'];
  waitingVisits: DashboardVisitSummary[];
  updating: boolean;
}) {
  const { longest, average } = waitStats(waitingVisits);

  return (
    <section
      className={updating ? 'ops-summary-grid ops-summary-grid--updating' : 'ops-summary-grid'}
      aria-label="Today summary counts"
    >
      <div>
        <span>Scheduled Today</span>
        <strong>{summary.scheduledToday}</strong>
      </div>
      <div data-tone="waiting">
        <span>
          Waiting / Arrived
          {summary.arrived >= ARRIVED_ATTENTION_THRESHOLD && (
            <span className="ops-summary-grid__flag" aria-label="Needs attention" title="Needs attention" />
          )}
        </span>
        <strong>{summary.arrived}</strong>
      </div>
      <div data-wait-tone={waitTone(longest)}>
        <span>Longest Wait</span>
        <strong>{summary.arrived > 0 ? `${longest} min` : '—'}</strong>
      </div>
      <div data-wait-tone={waitTone(average)}>
        <span>Avg Wait</span>
        <strong>{summary.arrived > 0 ? `${average} min` : '—'}</strong>
      </div>
      <div data-tone="active">
        <span>Active Visits</span>
        <strong>{summary.active}</strong>
      </div>
      <div data-tone="checkout">
        <span>
          Checkout Ready
          {summary.checkoutReady >= CHECKOUT_ATTENTION_THRESHOLD && (
            <span className="ops-summary-grid__flag" aria-label="Needs attention" title="Needs attention" />
          )}
        </span>
        <strong>{summary.checkoutReady}</strong>
      </div>
      <div data-tone="completed">
        <span>Completed Today</span>
        <strong>{summary.completedToday}</strong>
      </div>
      <div>
        <span>Total Today</span>
        <strong>{summary.totalToday}</strong>
      </div>
    </section>
  );
}
