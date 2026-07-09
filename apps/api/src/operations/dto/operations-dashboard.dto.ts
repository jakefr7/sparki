export interface DashboardPersonSummary {
  id: string;
  displayName: string;
  role: string;
}

export interface DashboardPatientSummary {
  id: string;
  name: string;
  species: string;
}

export interface DashboardClientSummary {
  id: string;
  firstName: string;
  lastName: string;
}

export interface DashboardAppointmentSummary {
  id: string;
  type: string;
  reason: string;
  state: string;
  scheduledAt: Date;
  expectedDurationMinutes: number | null;
  colorKey: string | null;
  patient: DashboardPatientSummary | null;
  client: DashboardClientSummary | null;
  provider: DashboardPersonSummary | null;
}

export interface DashboardVisitSummary {
  id: string;
  visitType: string;
  reason: string;
  state: string;
  createdAt: Date;
  /** Minutes since the Visit was created — the Command Center's wait/elapsed clock. */
  elapsedMinutes: number;
  patient: DashboardPatientSummary;
  client: DashboardClientSummary | null;
  appointment: { id: string; scheduledAt: Date; type: string } | null;
  primaryVeterinarian: DashboardPersonSummary | null;
  assignedTechnician: DashboardPersonSummary | null;
  currentOwner: DashboardPersonSummary | null;
  intakeSummaryAvailable: boolean;
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
  arrivedOrWaiting: DashboardVisitSummary[];
  visitsByState: DashboardStateCount[];
}
