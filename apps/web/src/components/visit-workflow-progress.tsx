import { VISIT_WORKFLOW_STAGES, visitWorkflowStageIndex } from '../lib/visit-workflow';

/** Plain function component (no hooks) so it renders identically from the
 *  server-rendered visit page and the client intake panel. */
export function VisitWorkflowProgress({
  state,
  compact,
}: {
  state: string;
  compact?: boolean;
}) {
  const currentIndex = visitWorkflowStageIndex(state);

  return (
    <ol
      className={`visit-workflow-steps${compact ? ' visit-workflow-steps--compact' : ''}`}
      aria-label="Visit workflow progress"
    >
      {VISIT_WORKFLOW_STAGES.map((stage, index) => {
        const status = index < currentIndex ? 'done' : index === currentIndex ? 'current' : 'upcoming';
        return (
          <li key={stage} className={`visit-workflow-step visit-workflow-step--${status}`}>
            <span className="visit-workflow-step__marker" aria-hidden="true">
              {status === 'done' ? '✓' : status === 'current' ? '●' : '○'}
            </span>
            <span className="visit-workflow-step__label">{stage}</span>
          </li>
        );
      })}
    </ol>
  );
}
