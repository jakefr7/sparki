import type { VisitDetail } from '../lib/patient-types';
import { projectVisitJourney } from '../lib/visit-workflow';
import { VisitWorkflowProgress } from './visit-workflow-progress';

export function VisitJourneyStatus({ visit }: { visit: VisitDetail }) {
  const journey = projectVisitJourney(visit);
  return (
    <section className="visit-journey-status" aria-labelledby="visit-journey-heading">
      <div>
        <p className="eyebrow">Clinical journey</p>
        <h2 id="visit-journey-heading">{journey.stage}</h2>
      </div>
      <VisitWorkflowProgress state={visit.state} compact />
      <dl>
        <div><dt>Current owner</dt><dd>{journey.owner}</dd></div>
        <div><dt>Record</dt><dd>{journey.recordState}</dd></div>
        <div><dt>Next action</dt><dd>{journey.allowedActions[0]}</dd></div>
      </dl>
      {journey.blockers.length ? (
        <div role="status" className="visit-journey-status__blockers">
          <strong>Needs attention</strong>
          <ul>{journey.blockers.map((blocker) => <li key={blocker}>{blocker}</li>)}</ul>
        </div>
      ) : null}
    </section>
  );
}
