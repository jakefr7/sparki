import type { VisitState } from '@sparki/db';

/**
 * States that represent a closed episode of care (see
 * docs/specs/modules/02-visit-lifecycle-mvp.md "Terminal States"). Anything
 * not in this set counts as "active" — shared by VisitsService,
 * PatientsService, and OperationsService so the definition of "active" never
 * drifts between them.
 */
export const TERMINAL_VISIT_STATES: VisitState[] = [
  'Archived',
  'ArchivedWithExceptions',
  'Cancelled',
  'CancelledAfterArrival',
  'NoShow',
  'Rescheduled',
  'Referred',
  'Deferred',
];

/**
 * Active states where the patient has physically arrived and is waiting on
 * (or between) the next operational step — used to populate the Command
 * Center's "arrived/waiting" queue.
 */
export const ARRIVED_OR_WAITING_STATES: VisitState[] = [
  'Arrived',
  'CheckInInProgress',
  'ArrivedWithExceptions',
  'Triaged',
  'Waiting',
  'ReadyForIntake',
];

/**
 * States `POST /visits/:id/start` will actually transition out of — the
 * arrival/pre-intake states where "start" means something concrete
 * (begin intake). Any other active state is already past that point, so
 * starting from there is a no-op rather than an error.
 */
export const STARTABLE_VISIT_STATES: VisitState[] = ['Arrived', 'ReadyForIntake'];

/** The single next state `start` moves a Visit into. */
export const INTAKE_IN_PROGRESS_STATE: VisitState = 'IntakeInProgress';

export const EXAM_READY_STATE: VisitState = 'VeterinarianExamReady';
export const EXAM_IN_PROGRESS_STATE: VisitState = 'VeterinarianExamInProgress';

/**
 * Where `POST /visits/:id/exam/complete` moves a Visit to. This build
 * doesn't implement the estimate/diagnostics/approval chain between an exam
 * and treatment, so it jumps straight to the closest existing state that
 * means "exam is done, patient is ready for treatment/checkout".
 */
export const TREATMENT_READY_STATE: VisitState = 'TreatmentPending';

/** Representative state for the dashboard's coarse "Ready for Checkout" bucket. */
export const CHECKOUT_READY_STATE: VisitState = 'CheckoutReady';

/**
 * Representative state for the dashboard's coarse "Completed" bucket. Reuses
 * the existing `Archived` terminal state rather than adding a new one — a
 * Visit marked Completed from the dashboard is, in workflow terms, a closed
 * episode of care per docs/specs/modules/02-visit-lifecycle-mvp.md.
 */
export const COMPLETED_STATE: VisitState = 'Archived';

/**
 * The Command Center's Currently-in-Clinic card only ever renders one of
 * three coarse statuses for an active Visit (Completed/Archived visits are
 * filtered out of the active list — see `listActiveForOrganization` — so
 * they never appear as a row to click "back" from). These buckets mirror
 * `visitReceptionStatus` in apps/web's operations-command-center.tsx; keep
 * the two in sync if either changes.
 */
export const CHECKOUT_BUCKET_STATES: VisitState[] = [
  'CheckoutReady',
  'CheckoutInProgress',
  'PaymentPending',
  'PaymentComplete',
];

export const IN_ROOM_BUCKET_STATES: VisitState[] = [
  'IntakeInProgress',
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
  'TreatmentPending',
  'TreatmentInProgress',
  'TreatmentComplete',
  'MedicationPending',
  'ClientCommunicationPending',
  'FollowUpPending',
];

export type DashboardVisitStatus = 'Checked In' | 'In Room' | 'Ready for Checkout';

export function dashboardStatusForVisitState(state: VisitState): DashboardVisitStatus {
  if (CHECKOUT_BUCKET_STATES.includes(state)) return 'Ready for Checkout';
  if (IN_ROOM_BUCKET_STATES.includes(state)) return 'In Room';
  return 'Checked In';
}
