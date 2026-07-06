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
