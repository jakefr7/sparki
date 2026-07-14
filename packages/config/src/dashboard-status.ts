export interface ConfiguredDashboardStatus {
  id: string;
  status: string;
  name: string;
  description: string | null;
  color: string;
  sortOrder: number;
  isEnabled: boolean;
  isInClinic: boolean;
  allowedTransitionKeys: string[];
}

const APPOINTMENT_STATUS_KEYS: Record<string, string> = {
  Draft: 'Appointment', Scheduled: 'Appointment', PreVisitPending: 'Appointment', Confirmed: 'Appointment',
  Arrived: 'CheckIn', VisitCreated: 'CheckIn', Completed: 'Checkout',
  Rescheduled: 'Appointment', Cancelled: 'Appointment', NoShow: 'Appointment',
};

const VISIT_STATUS_KEYS: Record<string, string> = {
  IntentCreated: 'Appointment', Scheduled: 'Appointment', PreVisitPending: 'Appointment', Confirmed: 'Appointment',
  Arrived: 'CheckIn', CheckInInProgress: 'CheckIn', ArrivedWithExceptions: 'CheckIn', Triaged: 'CheckIn', Waiting: 'CheckIn', ReadyForIntake: 'CheckIn',
  IntakeInProgress: 'BeginIntake', VeterinarianExamReady: 'ReadyForVeterinarian', VeterinarianExamInProgress: 'Exam',
  PlanDrafted: 'Exam', EstimateNeeded: 'Exam', EstimatePrepared: 'Exam', ClientApprovalPending: 'Exam', Approved: 'Exam', PartiallyApproved: 'Exam', Declined: 'Exam',
  DiagnosticsPending: 'Exam', DiagnosticsInProgress: 'Exam', ResultsPending: 'Exam', ResultsReady: 'Exam', VeterinarianReviewPending: 'Exam',
  TreatmentPending: 'Treatment', TreatmentInProgress: 'Treatment', TreatmentComplete: 'Treatment', MedicationPending: 'Treatment', ClientCommunicationPending: 'Treatment', FollowUpPending: 'Treatment',
  CheckoutReady: 'Discharge', CheckoutInProgress: 'Discharge', PaymentPending: 'Discharge',
  PaymentComplete: 'Checkout', RecordCompletionPending: 'Checkout', RecordComplete: 'Checkout', VisitClosing: 'Checkout', VisitClosingWithExceptions: 'Checkout', Archived: 'Checkout', ArchivedWithExceptions: 'Checkout',
  Cancelled: 'Checkout', CancelledAfterArrival: 'Checkout', NoShow: 'Checkout', Rescheduled: 'Appointment', Referred: 'Checkout', Deferred: 'Checkout',
};

export function workflowStatusKey(kind: 'appointment' | 'visit', state: string): string | undefined {
  return (kind === 'appointment' ? APPOINTMENT_STATUS_KEYS : VISIT_STATUS_KEYS)[state];
}

export function resolveConfiguredStatus(
  statuses: ConfiguredDashboardStatus[], kind: 'appointment' | 'visit', state: string,
): ConfiguredDashboardStatus | undefined {
  const key = workflowStatusKey(kind, state);
  return key ? statuses.find((entry) => entry.status === key) : undefined;
}

export function enabledStatuses(statuses: ConfiguredDashboardStatus[]) {
  return statuses.filter((status) => status.isEnabled).sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
}

export function allowedConfiguredTransitions(statuses: ConfiguredDashboardStatus[], current: ConfiguredDashboardStatus) {
  const byKey = new Map(statuses.map((status) => [status.status, status]));
  return current.allowedTransitionKeys.map((key) => byKey.get(key)).filter((status): status is ConfiguredDashboardStatus => Boolean(status?.isEnabled));
}

export function appointmentsWithoutActiveVisits<T extends { id: string }>(
  appointments: T[], visits: Array<{ appointment: { id: string } | null }>,
): T[] {
  const represented = new Set(visits.map((visit) => visit.appointment?.id).filter((id): id is string => Boolean(id)));
  return appointments.filter((appointment) => !represented.has(appointment.id));
}
