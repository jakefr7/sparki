import { enumLabel } from '../../lib/format';
import {
  BLOCKED_STATE,
  CHECKOUT_BACKLOG_THRESHOLD,
  CHECKOUT_READY_STATE,
  CHECKOUT_STATES,
  EXAM_QUEUE_DEPTH_THRESHOLD,
  EXAM_READY_STATE,
  LONG_WAIT_MINUTES,
  STARTABLE_STATES,
  WAITING_STATES,
} from '../../lib/command-center-states';
import {
  clientDisplayName,
  type DashboardAppointmentSummary,
  type DashboardClientSummary,
  type DashboardPersonSummary,
  type DashboardVisitSummary,
  type OperationsDashboard,
} from '../../lib/patient-types';
import type { OperationsDashboardGroups } from '../../lib/use-operations-dashboard';

export function clientLabel(client: DashboardClientSummary | null): string {
  return client ? clientDisplayName(client) : 'Client not linked';
}

export function visitOwner(visit: DashboardVisitSummary): DashboardPersonSummary | null {
  const clinicalCurrentOwner =
    visit.currentOwner && ['VETERINARIAN', 'TECHNICIAN', 'ASSISTANT'].includes(visit.currentOwner.role)
      ? visit.currentOwner
      : null;

  return visit.primaryVeterinarian ?? visit.assignedTechnician ?? clinicalCurrentOwner ?? visit.currentOwner;
}

export function personRoleLabel(person: DashboardPersonSummary): string {
  return enumLabel(person.role).replace('Clinic ', '');
}

export function ownerLabel(owner: DashboardPersonSummary | null): string {
  if (!owner) return 'Front desk';
  return `${owner.displayName} · ${personRoleLabel(owner)}`;
}

export function visitNextAction(visit: DashboardVisitSummary): string {
  if (visit.state === EXAM_READY_STATE) return 'Ready for doctor';
  if (visit.state === CHECKOUT_READY_STATE) return 'Collect payment and close visit';
  if (WAITING_STATES.has(visit.state)) return 'Room, triage, or assign owner';
  return 'Continue visit workflow';
}

export function appointmentNextAction(appointment: DashboardAppointmentSummary): string {
  if (appointment.state === 'Completed') return 'Review completed appointment';
  if (appointment.state === 'Arrived') return 'Start or resume visit';
  return 'Prepare for arrival';
}

export function visitActionLabel(visit: DashboardVisitSummary): string {
  if (visit.state === EXAM_READY_STATE) return 'Start Exam';
  if (STARTABLE_STATES.has(visit.state)) return 'Start Intake';
  if (CHECKOUT_STATES.has(visit.state)) return 'Open Checkout';
  return 'Open Visit';
}

export function appointmentHref(appointment: DashboardAppointmentSummary): string | null {
  return appointment.patient ? `/patients/${appointment.patient.id}` : null;
}

export function visitTone(visit: DashboardVisitSummary): 'waiting' | 'exam' | 'active' | 'checkout' {
  if (visit.state === CHECKOUT_READY_STATE) return 'checkout';
  if (visit.state === EXAM_READY_STATE) return 'exam';
  if (WAITING_STATES.has(visit.state)) return 'waiting';
  return 'active';
}

/** A visit is "blocked" when it can't move forward without a person
 *  stepping in — either arrival flagged an exception, or a patient reached
 *  the doctor with no intake summary recorded. Both are read directly off
 *  fields the dashboard already returns. */
export function isBlockedVisit(visit: DashboardVisitSummary): boolean {
  if (visit.state === BLOCKED_STATE) return true;
  if (visit.state === EXAM_READY_STATE && !visit.intakeSummaryAvailable) return true;
  return false;
}

export function blockedReason(visit: DashboardVisitSummary): string {
  if (visit.state === EXAM_READY_STATE && !visit.intakeSummaryAvailable) return 'No intake summary on file';
  return 'Arrival flagged an exception';
}

export interface PriorityQueueItem {
  visit: DashboardVisitSummary;
  cardVariant: 'default' | 'exam-ready';
  reasonLabel: string;
}

/**
 * Ranks the single most urgent visits across every queue so the dashboard
 * can answer "what should I work on next" without the user scanning each
 * section. Tiers mirror the thresholds OperationalAlerts already uses, so
 * an item only appears here when it would already have raised an alert.
 */
export function buildPriorityQueue(groups: OperationsDashboardGroups): PriorityQueueItem[] {
  const items: PriorityQueueItem[] = [];
  const seen = new Set<string>();

  function add(visit: DashboardVisitSummary, cardVariant: 'default' | 'exam-ready', reasonLabel: string) {
    if (seen.has(visit.id)) return;
    seen.add(visit.id);
    items.push({ visit, cardVariant, reasonLabel });
  }

  const allActive = [...groups.waitingVisits, ...groups.examReadyVisits, ...groups.inProgressVisits];
  const blocked = allActive.filter(isBlockedVisit).sort((a, b) => b.elapsedMinutes - a.elapsedMinutes);
  for (const visit of blocked) {
    add(visit, visit.state === EXAM_READY_STATE ? 'exam-ready' : 'default', blockedReason(visit));
  }

  const longWaiting = groups.waitingVisits
    .filter((visit) => visit.elapsedMinutes >= LONG_WAIT_MINUTES)
    .sort((a, b) => b.elapsedMinutes - a.elapsedMinutes);
  for (const visit of longWaiting) {
    add(visit, 'default', `Waiting ${visit.elapsedMinutes} min`);
  }

  const checkoutWaiting = [...groups.checkoutVisits].sort((a, b) => b.elapsedMinutes - a.elapsedMinutes);
  for (const visit of checkoutWaiting) {
    add(visit, 'default', 'Ready for checkout');
  }

  const examBacklog = [...groups.examReadyVisits].sort((a, b) => b.elapsedMinutes - a.elapsedMinutes);
  for (const visit of examBacklog) {
    add(visit, 'exam-ready', 'Ready for the doctor');
  }

  return items.slice(0, 3);
}

/** Every person who appears anywhere in today's dashboard, deduped, so a
 *  "viewing as" picker can be built with no separate roster fetch. */
export function collectStaffRoster(dashboard: OperationsDashboard | null): DashboardPersonSummary[] {
  if (!dashboard) return [];
  const people = new Map<string, DashboardPersonSummary>();

  function add(person: DashboardPersonSummary | null) {
    if (person) people.set(person.id, person);
  }

  for (const visit of dashboard.activeVisits) {
    add(visit.primaryVeterinarian);
    add(visit.assignedTechnician);
    add(visit.currentOwner);
  }
  for (const visit of dashboard.arrivedOrWaiting) {
    add(visit.primaryVeterinarian);
    add(visit.assignedTechnician);
    add(visit.currentOwner);
  }
  for (const appointment of [...dashboard.todaysAppointments, ...dashboard.upcomingAppointments]) {
    add(appointment.provider);
  }

  return Array.from(people.values()).sort((a, b) => a.displayName.localeCompare(b.displayName));
}

export function visitMatchesStaff(visit: DashboardVisitSummary, staffId: string): boolean {
  return (
    visit.primaryVeterinarian?.id === staffId ||
    visit.assignedTechnician?.id === staffId ||
    visit.currentOwner?.id === staffId
  );
}

export function appointmentMatchesStaff(appointment: DashboardAppointmentSummary, staffId: string): boolean {
  return appointment.provider?.id === staffId;
}

export type ClinicHealth = 'calm' | 'busy' | 'pressure';

/**
 * A single glance answer to "is the clinic healthy" — the same tiers
 * OperationalAlerts already raises, collapsed into one status so it can sit
 * next to the Live badge instead of requiring a scroll through the alerts.
 */
export function computeClinicHealth(groups: OperationsDashboardGroups): ClinicHealth {
  const blocked = [...groups.waitingVisits, ...groups.examReadyVisits, ...groups.inProgressVisits].some(
    isBlockedVisit,
  );
  if (blocked) return 'pressure';

  const signals = [
    groups.waitingVisits.some((visit) => visit.elapsedMinutes >= LONG_WAIT_MINUTES),
    groups.checkoutVisits.length >= CHECKOUT_BACKLOG_THRESHOLD,
    groups.examReadyVisits.length >= EXAM_QUEUE_DEPTH_THRESHOLD,
  ].filter(Boolean).length;

  if (signals >= 2) return 'pressure';
  if (signals === 1) return 'busy';
  return 'calm';
}
