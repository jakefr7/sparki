import { appointmentHref, clientLabel } from '../components/command-center/card-helpers';
import type { DashboardAppointmentSummary, DashboardVisitSummary } from './patient-types';
import type { DashboardStatusKey } from './use-dashboard-status-colors';

/**
 * Shared status-transition model for every place a status pill appears
 * (dashboard "Currently in Clinic" / "Today's Schedule" widgets and the
 * standalone Today page) — kept in one file so the adjacent-move rules and
 * row-building logic can never drift between them. Pair with
 * ../components/status-transition-menu.tsx for the shared UI.
 */
export type ReceptionStatus = 'Upcoming' | 'Checked In' | 'In Room' | 'Ready for Checkout' | 'Completed';

/** Maps the display-facing ReceptionStatus to the API's DashboardStatus key
 *  (see useDashboardStatusColors) so a configured admin color can be looked
 *  up for a given pill. */
export const RECEPTION_STATUS_KEY: Record<ReceptionStatus, DashboardStatusKey> = {
  Upcoming: 'Upcoming',
  'Checked In': 'CheckedIn',
  'In Room': 'InRoom',
  'Ready for Checkout': 'ReadyForCheckout',
  Completed: 'Completed',
};

export type StatusSubjectKind = 'appointment' | 'visit' | 'dev';

export interface StatusAction {
  label: ReceptionStatus;
  description: string;
  endpoint?: string;
  body?: Record<string, unknown>;
}

export interface ClinicDisplayRow {
  id: string;
  patientName: string;
  species?: string | undefined;
  clientName: string;
  location: string;
  status: ReceptionStatus;
  state: string;
  kind: StatusSubjectKind;
  statusDetail?: string | undefined;
  href?: string;
}

export interface ScheduleDisplayRow {
  id: string;
  time: string;
  patientName: string;
  species?: string | undefined;
  clientName: string;
  status: ReceptionStatus;
  state: string;
  kind: StatusSubjectKind;
  location?: string | undefined;
  statusDetail?: string | undefined;
  href?: string;
}

export function patientHref(patientId?: string | null) {
  return patientId ? `/patients/${patientId}` : '/patients';
}

export function formatTime(value: string) {
  return new Date(value).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

export function roomLabelFromLocation(location?: string) {
  const match = location?.match(/(?:Exam\s*)?Room\s*(\d+)/i);
  return match ? `Room ${match[1]}` : undefined;
}

export function visitLocation(visit: DashboardVisitSummary) {
  if (
    ['CheckoutReady', 'CheckoutInProgress', 'PaymentPending', 'PaymentComplete'].includes(visit.state)
  ) {
    return 'Checkout';
  }

  if (
    [
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
    ].includes(visit.state)
  ) {
    return 'Exam Room';
  }

  if (
    [
      'TreatmentPending',
      'TreatmentInProgress',
      'TreatmentComplete',
      'MedicationPending',
      'ClientCommunicationPending',
      'FollowUpPending',
    ].includes(visit.state)
  ) {
    return 'Treatment';
  }

  // Anna: the word "Intake" shouldn't surface in the UI — this is a
  // location label (alongside Lobby/Exam Room/Treatment/Checkout), so
  // "Triage" reads correctly as a place rather than "New Visit" language,
  // which only fits actions/CTAs.
  if (visit.state === 'IntakeInProgress') {
    return 'Triage';
  }

  return 'Lobby';
}

export function visitReceptionStatus(visit: DashboardVisitSummary): ReceptionStatus {
  if (
    ['CheckoutReady', 'CheckoutInProgress', 'PaymentPending', 'PaymentComplete'].includes(visit.state)
  ) {
    return 'Ready for Checkout';
  }
  if (
    [
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
    ].includes(visit.state)
  ) {
    return 'In Room';
  }
  if (
    [
      'TreatmentPending',
      'TreatmentInProgress',
      'TreatmentComplete',
      'MedicationPending',
      'ClientCommunicationPending',
      'FollowUpPending',
    ].includes(visit.state)
  ) {
    return 'In Room';
  }
  return 'Checked In';
}

export function statusTone(status: ReceptionStatus) {
  if (status === 'In Room') return 'blue';
  if (status === 'Ready for Checkout') return 'orange';
  if (status === 'Completed') return 'green';
  if (status === 'Upcoming') return 'gray';
  return 'teal';
}

export function appointmentReceptionStatus(appointment: DashboardAppointmentSummary): ReceptionStatus {
  if (appointment.state === 'Completed') return 'Completed';
  if (appointment.state === 'Arrived' || appointment.state === 'VisitCreated') return 'Checked In';
  if (appointment.state === 'InRoom') return 'In Room';
  if (appointment.state === 'CheckoutReady') return 'Ready for Checkout';
  return 'Upcoming';
}

export function visitToClinicRow(visit: DashboardVisitSummary): ClinicDisplayRow {
  return {
    id: visit.id,
    patientName: visit.patient.name,
    species: visit.patient.species,
    clientName: clientLabel(visit.client),
    location: visitLocation(visit),
    status: visitReceptionStatus(visit),
    state: visit.state,
    kind: 'visit',
    statusDetail: roomLabelFromLocation(visitLocation(visit)),
    href: `/visits/${visit.id}`,
  };
}

export function appointmentToScheduleRow(appointment: DashboardAppointmentSummary): ScheduleDisplayRow {
  const href = appointmentHref(appointment) ?? patientHref(appointment.patient?.id);
  return {
    id: appointment.id,
    time: formatTime(appointment.scheduledAt),
    patientName: appointment.patient?.name ?? 'Unlinked patient',
    species: appointment.patient?.species,
    clientName: clientLabel(appointment.client),
    status: appointmentReceptionStatus(appointment),
    state: appointment.state,
    kind: 'appointment',
    href,
  };
}

/** The dashboard's coarse status sequence — a pill may only move to an adjacent entry. */
export const DASHBOARD_STATUS_ORDER: ReceptionStatus[] = [
  'Upcoming',
  'Checked In',
  'In Room',
  'Ready for Checkout',
  'Completed',
];

/**
 * Resolves the mutation (if any) for moving a `visit`/`appointment` row to
 * one adjacent dashboard status. Visit-kind rows route through the generic
 * `/api/visits/:id/dashboard-status` mutation (backed by
 * `VisitsService.setDashboardStatus`), which understands one-step-forward
 * and one-step-backward moves across Checked In / In Room / Ready for
 * Checkout / Completed. Appointment-kind rows only support the existing
 * arrive mutation (Upcoming -> Checked In) — there's no backend support yet
 * for manually moving an Appointment's own state further.
 */
export function dashboardStatusAction(
  row: Pick<ClinicDisplayRow | ScheduleDisplayRow, 'id' | 'kind' | 'state'>,
  target: ReceptionStatus,
  direction: 'back' | 'forward',
): StatusAction | null {
  if (row.kind === 'appointment') {
    if (
      direction === 'forward' &&
      target === 'Checked In' &&
      ['Scheduled', 'PreVisitPending', 'Confirmed'].includes(row.state)
    ) {
      return {
        label: target,
        description: 'Mark this appointment arrived.',
        endpoint: `/api/appointments/${row.id}/arrive`,
      };
    }
    return null;
  }

  if (row.kind === 'visit') {
    if (target === 'Checked In' || target === 'In Room' || target === 'Ready for Checkout' || target === 'Completed') {
      return {
        label: target,
        description: direction === 'forward' ? `Move forward to ${target}.` : `Move back to ${target}.`,
        endpoint: `/api/visits/${row.id}/dashboard-status`,
        body: { status: target },
      };
    }
  }

  return null;
}

/**
 * Every place a status pill appears (dashboard widgets, Today page) calls
 * this to compute the one-step-back / one-step-forward actions to offer —
 * the single source of truth for "what can this row move to next", so no
 * caller can accidentally allow (or duplicate the logic for) an arbitrary
 * jump.
 */
export function getAdjacentDashboardStatusActions(
  row: Pick<ClinicDisplayRow | ScheduleDisplayRow, 'id' | 'kind' | 'state' | 'status'>,
): StatusAction[] {
  if (row.kind === 'dev') {
    if (row.state === 'Scheduled') {
      return [{ label: 'Checked In', description: 'Demo transition preview.' }];
    }
    if (row.state === 'Arrived') {
      return [{ label: 'In Room', description: 'Demo transition preview.' }];
    }
    return [];
  }

  // Completed visits are archived and immediately drop out of the active-visit
  // list (see the API's TERMINAL_VISIT_STATES filter), so there's no live row
  // to offer a "back" action from — Completed stays terminal in this widget.
  if (row.kind === 'visit' && row.status === 'Completed') {
    return [];
  }

  const currentIndex = DASHBOARD_STATUS_ORDER.indexOf(row.status);
  const prevStatus = currentIndex > 0 ? DASHBOARD_STATUS_ORDER[currentIndex - 1] : undefined;
  const nextStatus =
    currentIndex >= 0 && currentIndex < DASHBOARD_STATUS_ORDER.length - 1
      ? DASHBOARD_STATUS_ORDER[currentIndex + 1]
      : undefined;

  const actions: StatusAction[] = [];
  const back = prevStatus ? dashboardStatusAction(row, prevStatus, 'back') : null;
  if (back) actions.push(back);
  const forward = nextStatus ? dashboardStatusAction(row, nextStatus, 'forward') : null;
  if (forward) actions.push(forward);

  return actions;
}
