/** Mirrors VisitsService's STARTABLE_VISIT_STATES — the only states where
 *  POST /visits/:id/start does anything (see apps/api/src/visits). */
export const STARTABLE_STATES = new Set(['Arrived', 'ReadyForIntake']);
export const CHECKOUT_STATES = new Set(['CheckoutReady', 'CheckoutInProgress']);
export const UPCOMING_APPOINTMENT_STATES = new Set(['Scheduled', 'PreVisitPending', 'Confirmed']);
export const CHECK_IN_STATES = new Set(['Scheduled', 'PreVisitPending', 'Confirmed']);

export const CHECKOUT_READY_STATE = 'CheckoutReady';
export const EXAM_READY_STATE = 'VeterinarianExamReady';

/** A waiting visit past this many minutes is flagged as needing attention
 *  in the queue card and counted toward the section's attention badge. */
export const LONG_WAIT_MINUTES = 20;
export const CHECKOUT_BACKLOG_THRESHOLD = 3;
export const EXAM_QUEUE_DEPTH_THRESHOLD = 3;
export const WAITING_STATES = new Set([
  'Arrived',
  'CheckInInProgress',
  'ArrivedWithExceptions',
  'Triaged',
  'Waiting',
  'ReadyForIntake',
]);

/** Arrival flagged an exception (missing info, ID mismatch, etc.) that stops
 *  the normal intake flow — the visit needs a person to resolve it, not just
 *  time in queue. This is the only state-based signal for a stuck patient
 *  the dashboard payload currently carries. */
export const BLOCKED_STATE = 'ArrivedWithExceptions';

/** A provider/technician carrying this many concurrent active visits is
 *  flagged as overloaded in the staff snapshot. */
export const STAFF_OVERLOAD_THRESHOLD = 3;
