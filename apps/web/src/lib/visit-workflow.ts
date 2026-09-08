import type { VisitDetail } from './patient-types';

/** The patient-facing clinical journey. Check-in and intake are prerequisite
 * context, not clinical stages, and deliberately stay out of this projection. */
export const VISIT_WORKFLOW_STAGES = [
  'Exam',
  'Plan',
  'Client Decision',
  'Care',
  'Discharge',
  'Record',
] as const;

export type VisitWorkflowStage = (typeof VISIT_WORKFLOW_STAGES)[number];

export function visitWorkflowStageLabel(stage: VisitWorkflowStage): string {
  return stage;
}

const PLAN_STATES = new Set(['PlanDrafted', 'EstimateNeeded', 'EstimatePrepared']);
const DECISION_STATES = new Set(['ClientApprovalPending', 'Approved', 'PartiallyApproved', 'Declined']);
const CARE_STATES = new Set([
  'DiagnosticsPending', 'DiagnosticsInProgress', 'ResultsPending', 'ResultsReady',
  'VeterinarianReviewPending', 'TreatmentPending', 'TreatmentInProgress',
  'TreatmentComplete', 'MedicationPending', 'ClientCommunicationPending', 'FollowUpPending',
]);
const DISCHARGE_STATES = new Set(['CheckoutReady', 'CheckoutInProgress', 'PaymentPending', 'PaymentComplete']);
const RECORD_STATES = new Set([
  'RecordCompletionPending', 'RecordComplete', 'VisitClosing', 'VisitClosingWithExceptions',
  'Archived', 'ArchivedWithExceptions', 'Cancelled', 'CancelledAfterArrival', 'NoShow',
  'Rescheduled', 'Referred', 'Deferred',
]);

export function visitWorkflowStageIndex(state: string): number {
  if (RECORD_STATES.has(state)) return 5;
  if (DISCHARGE_STATES.has(state)) return 4;
  if (CARE_STATES.has(state)) return 3;
  if (DECISION_STATES.has(state)) return 2;
  if (PLAN_STATES.has(state)) return 1;
  return 0;
}

export interface VisitJourneyProjection {
  stage: VisitWorkflowStage;
  owner: string;
  recordState: 'Not started' | 'Draft' | 'Finalized' | 'Amended';
  blockers: string[];
  allowedActions: string[];
}

function personLabel(person: VisitDetail['currentOwner']): string {
  if (!person) return 'Unassigned';
  return person.displayName || `${person.firstName} ${person.lastName}`;
}

/** A read-only projection over authoritative visit data. It never creates a
 * second lifecycle state and never exposes the raw state enum to clinic users. */
export function projectVisitJourney(visit: VisitDetail): VisitJourneyProjection {
  const stage = VISIT_WORKFLOW_STAGES[visitWorkflowStageIndex(visit.state)]!;
  const latestRecord = visit.soapNotes[0];
  const blockers: string[] = [];
  if (!visit.intake?.completedAt) blockers.push('Intake is incomplete. Complete intake before continuing the clinical visit.');
  const openRequiredCare = visit.workItems.filter((item) =>
    ['Pending', 'InProgress'].includes(item.status) && ['Treatment', 'Medication', 'Diagnostic'].includes(item.type),
  );
  if (openRequiredCare.length) blockers.push(`${openRequiredCare.length} care item${openRequiredCare.length === 1 ? '' : 's'} still open`);
  if (stage === 'Discharge' && !visit.discharge) blockers.push('Discharge instructions are not complete');
  if (visit.checkout?.completedAt && !latestRecord?.lockedAt) blockers.push('Record completion pending');

  let recordState: VisitJourneyProjection['recordState'] = 'Not started';
  if (latestRecord?.amendmentReason) recordState = 'Amended';
  else if (latestRecord?.lockedAt || latestRecord?.signedAt) recordState = 'Finalized';
  else if (latestRecord) recordState = 'Draft';

  const actions: Record<VisitWorkflowStage, string[]> = {
    Exam: ['Document exam findings'],
    Plan: ['Build care plan'],
    'Client Decision': ['Record client decision'],
    Care: ['Complete authorized care'],
    Discharge: ['Prepare discharge'],
    Record: recordState === 'Finalized' ? ['Review medical record'] : ['Finish medical record'],
  };

  return { stage, owner: personLabel(visit.currentOwner), recordState, blockers, allowedActions: actions[stage] };
}

export interface VisitNextAction { headline: string; steps: string[] }

export function nextActionForState(state: string): VisitNextAction {
  const stage = VISIT_WORKFLOW_STAGES[visitWorkflowStageIndex(state)]!;
  const copy: Record<VisitWorkflowStage, VisitNextAction> = {
    Exam: { headline: 'Complete the clinical exam.', steps: ['Review intake.', 'Document findings.'] },
    Plan: { headline: 'Build the care plan.', steps: ['Review abnormal findings.', 'Order recommended care.'] },
    'Client Decision': { headline: 'Confirm the client decision.', steps: ['Discuss each item.', 'Attest the decision.'] },
    Care: { headline: 'Complete authorized care.', steps: ['Perform approved items.', 'Document outcomes.'] },
    Discharge: { headline: 'Prepare the patient for departure.', steps: ['Complete instructions.', 'Hand off to reception.'] },
    Record: { headline: 'Finish the medical record.', steps: ['Review attribution.', 'Finalize when complete.'] },
  };
  return copy[stage];
}
