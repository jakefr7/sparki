/**
 * Visual-only progress model for the Visit workspace — maps the ~40-state
 * VisitState enum onto six coarse stages a technician can scan at a glance.
 * Purely presentational: no backend state is introduced or read back from
 * this, it just buckets the existing `visit.state` string.
 */
export const VISIT_WORKFLOW_STAGES = [
  'Checked In',
  'Arrived',
  'Intake',
  'Exam',
  'Treatment',
  'Checkout',
] as const;

export type VisitWorkflowStage = (typeof VISIT_WORKFLOW_STAGES)[number];

const STAGE_STATES: Record<Exclude<VisitWorkflowStage, 'Checked In'>, string[]> = {
  Arrived: [
    'Arrived',
    'CheckInInProgress',
    'ArrivedWithExceptions',
    'Triaged',
    'Waiting',
    'ReadyForIntake',
  ],
  Intake: ['IntakeInProgress'],
  Exam: [
    'VeterinarianExamReady',
    'VeterinarianExamInProgress',
    'PlanDrafted',
    'EstimateNeeded',
    'EstimatePrepared',
    'ClientApprovalPending',
    'Approved',
    'PartiallyApproved',
    'Declined',
    'DiagnosticsPending',
    'DiagnosticsInProgress',
    'ResultsPending',
    'ResultsReady',
    'VeterinarianReviewPending',
  ],
  Treatment: [
    'TreatmentPending',
    'TreatmentInProgress',
    'TreatmentComplete',
    'MedicationPending',
    'ClientCommunicationPending',
    'FollowUpPending',
  ],
  Checkout: [
    'CheckoutReady',
    'CheckoutInProgress',
    'PaymentPending',
    'PaymentComplete',
    'RecordCompletionPending',
    'RecordComplete',
    'VisitClosing',
    'VisitClosingWithExceptions',
    // Closed episodes — nothing left to do, so shown as "done" (last stage).
    'Archived',
    'ArchivedWithExceptions',
    'Cancelled',
    'CancelledAfterArrival',
    'NoShow',
    'Rescheduled',
    'Referred',
    'Deferred',
  ],
};

/** Index into VISIT_WORKFLOW_STAGES for the given Visit state. A Visit row
 *  only ever exists once the patient has arrived, so "Checked In" is never
 *  the current stage — it's shown as already-done groundwork. */
export function visitWorkflowStageIndex(state: string): number {
  for (let i = VISIT_WORKFLOW_STAGES.length - 1; i >= 1; i--) {
    const stage = VISIT_WORKFLOW_STAGES[i] as Exclude<VisitWorkflowStage, 'Checked In'>;
    if (STAGE_STATES[stage].includes(state)) return i;
  }
  return 0;
}

export interface VisitNextAction {
  headline: string;
  steps: string[];
}

/** Concrete, actionable copy for the "Next Action" card — what a technician
 *  or provider should do right now, not just the state's raw name. */
export function nextActionForState(state: string): VisitNextAction {
  const stageIndex = visitWorkflowStageIndex(state);

  if (STAGE_STATES.Checkout.includes(state) && stageIndex === VISIT_WORKFLOW_STAGES.length - 1) {
    const closed = [
      'Archived',
      'ArchivedWithExceptions',
      'Cancelled',
      'CancelledAfterArrival',
      'NoShow',
      'Rescheduled',
      'Referred',
      'Deferred',
    ];
    if (closed.includes(state)) {
      return { headline: 'This visit is closed.', steps: ['No further action needed.'] };
    }
    return {
      headline: 'Ready for checkout.',
      steps: ['Review charges.', 'Collect payment.', 'Close the visit.'],
    };
  }

  switch (VISIT_WORKFLOW_STAGES[stageIndex]) {
    case 'Arrived':
      return {
        headline: 'Get the patient into a room.',
        steps: ['Room the patient.', 'Confirm intake context.', 'Start technician intake.'],
      };
    case 'Intake':
      return {
        headline: 'Complete technician intake.',
        steps: ['Capture vitals and history.', 'Review findings.', 'Send patient to veterinarian.'],
      };
    case 'Exam':
      return {
        headline: 'Veterinarian exam in progress.',
        steps: ['Complete the exam.', 'Draft a plan.', 'Share findings with the client.'],
      };
    case 'Treatment':
      return {
        headline: 'Carry out the treatment plan.',
        steps: ['Administer treatment.', 'Document outcomes.', 'Prepare for checkout.'],
      };
    default:
      return {
        headline: 'Continue the visit workflow.',
        steps: ['Continue from the current visit state.'],
      };
  }
}
