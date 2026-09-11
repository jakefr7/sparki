export interface DashboardPersonSummary {
  id: string;
  displayName: string;
  role: string;
}

export interface DashboardPatientSummary {
  id: string;
  name: string;
  species: string;
  imageUrl: string | null;
}

export interface DashboardClientSummary {
  id: string;
  firstName: string;
  lastName: string;
  contactReady?: boolean;
}

export interface DashboardWorkItemSummary {
  id: string;
  type: string;
  status: string;
  title: string;
  assignee: DashboardPersonSummary | null;
  assigneeRole: string | null;
  dueAt: Date | null;
  updatedAt: Date;
}

export interface DashboardExceptionSummary {
  id: string;
  severity: string;
  reason: string;
  nextAction: string;
  owner: DashboardPersonSummary | null;
  dueAt: Date | null;
}

export interface DashboardAppointmentSummary {
  id: string;
  appointmentTypeSettingId: string | null;
  type: string;
  reason: string;
  state: string;
  scheduledAt: Date;
  expectedDurationMinutes: number | null;
  colorKey: string | null;
  patient: DashboardPatientSummary | null;
  client: DashboardClientSummary | null;
  provider: DashboardPersonSummary | null;
  primaryCareVetName: string | null;
  previousClinicName: string | null;
  previousRecordsSource: string | null;
  lastSeenAt: Date | null;
  recordsPrepStatus: string;
  confirmationStatus: string;
  room: string | null;
  schedulerSlotTemplateId: string | null;
  schedulingIssue: string | null;
}

export interface DashboardVisitSummary {
  id: string;
  visitType: string;
  reason: string;
  state: string;
  phase: string;
  createdAt: Date;
  updatedAt: Date;
  /** Minutes since the Visit was created — the Command Center's wait/elapsed clock. */
  elapsedMinutes: number;
  patient: DashboardPatientSummary;
  client: DashboardClientSummary | null;
  appointment: { id: string; scheduledAt: Date; type: string } | null;
  primaryVeterinarian: DashboardPersonSummary | null;
  assignedTechnician: DashboardPersonSummary | null;
  currentOwner: DashboardPersonSummary | null;
  intakeSummaryAvailable: boolean;
  workflowStatusKey: string | null;
  nextAction: string | null;
  dischargeReadyAt: Date | null;
  departedAt: Date | null;
  recordStatus: string | null;
  openWorkItems: DashboardWorkItemSummary[];
  openExceptions: DashboardExceptionSummary[];
}

export interface DashboardStateCount {
  state: string;
  count: number;
}

export interface DashboardSummary {
  scheduledToday: number;
  arrived: number;
  active: number;
  checkoutReady: number;
  completedToday: number;
  totalToday: number;
}

/**
 * Single operational snapshot for the Clinic Command Center. Kept flat and
 * additive (new top-level keys, not restructured ones) so future modules
 * (billing, labs, messaging) can extend this without breaking existing
 * consumers.
 */
export interface OperationsDashboard {
  generatedAt: Date;
  summary: DashboardSummary;
  todaysAppointments: DashboardAppointmentSummary[];
  upcomingAppointments: DashboardAppointmentSummary[];
  activeVisits: DashboardVisitSummary[];
  /** Today's visit records, including closed records for the schedule's
   * patient-flow history. */
  todaysVisits: DashboardVisitSummary[];
  arrivedOrWaiting: DashboardVisitSummary[];
  visitsByState: DashboardStateCount[];
}
