import type { VisitDetail } from '../lib/patient-types';
import { projectVisitJourney } from '../lib/visit-workflow';

export function VisitJourneyStatus({ visit }: { visit: VisitDetail }) {
  const journey = projectVisitJourney(visit);
  if (!journey.blockers.length) return null;

  return (
    <section className="visit-journey-status" aria-label="Visit needs attention">
      <div role="status" className="visit-journey-status__blockers">
        <strong>Needs attention</strong>
        <ul>{journey.blockers.map((blocker) => <li key={blocker}>{blocker}</li>)}</ul>
      </div>
    </section>
  );
}
