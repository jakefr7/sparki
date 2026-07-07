'use client';

import { buildPriorityQueue } from './card-helpers';
import { ExamReadyVisitCard, VisitCard } from './visit-queue';
import type { OperationsDashboardGroups } from '../../lib/use-operations-dashboard';

/**
 * Surfaces the single most urgent visits across every queue — blocked
 * patients, long waits, checkout backlog, then the doctor's exam queue —
 * so "what should I do next" never requires scanning each section below.
 * Renders nothing when the floor has no items that would qualify, rather
 * than padding the panel with routine work.
 */
export function PriorityQueue({
  groups,
  onVisitStarted,
  focusStaffId,
}: {
  groups: OperationsDashboardGroups;
  onVisitStarted: () => void;
  focusStaffId?: string | null | undefined;
}) {
  const items = buildPriorityQueue(groups);
  if (items.length === 0) return null;

  return (
    <section className="ops-priority" aria-label="Priority actions">
      <div className="ops-priority__header">
        <h2>Do Next</h2>
        <span className="ops-priority__count">{items.length}</span>
      </div>
      <div className="ops-card-grid">
        {items.map(({ visit, cardVariant, reasonLabel }) =>
          cardVariant === 'exam-ready' ? (
            <ExamReadyVisitCard
              key={visit.id}
              visit={visit}
              onExamStarted={onVisitStarted}
              highlight={reasonLabel}
              focusStaffId={focusStaffId}
            />
          ) : (
            <VisitCard
              key={visit.id}
              visit={visit}
              onVisitStarted={onVisitStarted}
              highlight={reasonLabel}
              focusStaffId={focusStaffId}
            />
          ),
        )}
      </div>
    </section>
  );
}
