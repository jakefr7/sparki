export interface PrimaryClientSummary {
  id: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  email: string | null;
  preferredContactMethod: string | null;
}

export type ClientSearchResult = PrimaryClientSummary;

export interface PatientSearchResult {
  id: string;
  name: string;
  species: string;
  breed: string | null;
  sex: string | null;
  dateOfBirth: string | null;
  weight: number | null;
  color: string | null;
  imageUrl: string | null;
  status: string;
  primaryClient: PrimaryClientSummary | null;
  activeVisit: {
    id: string;
    state: string;
    visitType: string;
    reason: string;
    createdAt: string;
  } | null;
  nextAppointment: {
    id: string;
    type: string;
    reason: string;
    scheduledAt: string;
    state: string;
  } | null;
}

export interface WorkspaceClient {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  alternatePhone: string | null;
  preferredContactMethod: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  country: string | null;
  formattedAddress: string | null;
  isPrimary: boolean;
}

export function clientDisplayName(client: { firstName: string; lastName: string }): string {
  return `${client.firstName} ${client.lastName}`;
}

/** One clean display line for a structured address — never shows dangling
 *  commas/labels for missing parts. Prefers the provider's formattedAddress
 *  (from autocomplete) and falls back to hand-joining the parts so a
 *  manually-typed address still displays properly. */
export function formatClientAddress(client: {
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  country: string | null;
  formattedAddress: string | null;
}): string | null {
  const formattedAddress = client.formattedAddress?.trim();
  const addressLine1 = client.addressLine1?.trim();
  const addressLine2 = client.addressLine2?.trim();

  if (formattedAddress) {
    if (!addressLine2 || formattedAddress.toLowerCase().includes(addressLine2.toLowerCase())) {
      return formattedAddress;
    }

    if (addressLine1 && formattedAddress.toLowerCase().startsWith(addressLine1.toLowerCase())) {
      return `${formattedAddress.slice(0, addressLine1.length)}, ${addressLine2}${formattedAddress.slice(addressLine1.length)}`;
    }

    return `${formattedAddress}, ${addressLine2}`;
  }

  const line1 = [addressLine1, addressLine2].filter(Boolean).join(', ');
  const cityState = [client.city, client.state].filter(Boolean).join(', ');
  const cityStateZip = [cityState, client.postalCode].filter(Boolean).join(' ');
  const parts = [line1, cityStateZip, client.country].filter(Boolean);

  return parts.length > 0 ? parts.join(', ') : null;
}

export interface UnavailableWorkspaceSection {
  status: 'unavailable';
  reason: string;
}

export interface ActiveVisitSummary {
  id: string;
  state: string;
  visitType: string;
  reason: string;
  createdAt: string;
  client: {
    id: string;
    firstName: string;
    lastName: string;
  } | null;
  appointment: {
    id: string;
    scheduledAt: string;
    type: string;
  } | null;
}

export type CurrentVisitSection =
  | UnavailableWorkspaceSection
  | {
      status: 'available';
      visit: ActiveVisitSummary;
    };

export interface MedicationsSummary {
  notes: string;
  recordedAt: string;
  visitId: string;
}

export type MedicationsSection =
  | UnavailableWorkspaceSection
  | ({ status: 'available' } & MedicationsSummary);

export interface RecentVisitSummary {
  id: string;
  visitType: string;
  reason: string;
  state: string;
  createdAt: string;
  primaryVeterinarian: { id: string; firstName: string; lastName: string } | null;
}

export interface UpcomingAppointment {
  id: string;
  type: string;
  reason: string;
  scheduledAt: string;
  expectedDurationMinutes: number | null;
  state: string;
}

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
  scheduledAt: string;
  expectedDurationMinutes: number | null;
  colorKey: string | null;
  patient: DashboardPatientSummary | null;
  client: DashboardClientSummary | null;
  provider: DashboardPersonSummary | null;
  primaryCareVetName: string | null;
  previousClinicName: string | null;
  previousRecordsSource: string | null;
  lastSeenAt: string | null;
  recordsPrepStatus: string;
  confirmationStatus: string;
}

export interface DashboardVisitSummary {
  id: string;
  visitType: string;
  reason: string;
  state: string;
  createdAt: string;
  elapsedMinutes: number;
  patient: DashboardPatientSummary;
  client: DashboardClientSummary | null;
  appointment: { id: string; scheduledAt: string; type: string } | null;
  primaryVeterinarian: DashboardPersonSummary | null;
  assignedTechnician: DashboardPersonSummary | null;
  currentOwner: DashboardPersonSummary | null;
  intakeSummaryAvailable: boolean;
}

export interface OperationsDashboard {
  generatedAt: string;
  summary: {
    scheduledToday: number;
    arrived: number;
    active: number;
    checkoutReady: number;
    completedToday: number;
    totalToday: number;
  };
  todaysAppointments: DashboardAppointmentSummary[];
  upcomingAppointments: DashboardAppointmentSummary[];
  activeVisits: DashboardVisitSummary[];
  arrivedOrWaiting: DashboardVisitSummary[];
  visitsByState: { state: string; count: number }[];
}

export interface PatientWorkspace {
  patient: {
    id: string;
    name: string;
    species: string;
    breed: string | null;
    sex: string | null;
    dateOfBirth: string | null;
    estimatedAge: string | null;
    weight: number | null;
    color: string | null;
    imageUrl: string | null;
    status: string;
    alerts: string | null;
    sourceSystem: string | null;
    sourceConfidence: number | null;
  };
  clients: WorkspaceClient[];
  upcomingAppointments: UpcomingAppointment[];
  recentVisits: RecentVisitSummary[];
  sections: {
    currentVisit: CurrentVisitSection;
    medications: MedicationsSection;
    workItems: UnavailableWorkspaceSection;
    communication: UnavailableWorkspaceSection;
    financial: UnavailableWorkspaceSection;
    attachments: UnavailableWorkspaceSection;
  };
}

/** Mirrors AppointmentType in prisma/schema.prisma. No "list types" endpoint
 *  exists yet, so this MVP form hardcodes the fixed enum values directly. */
export const APPOINTMENT_TYPES = [
  'WellnessPreventiveCare',
  'SickVisit',
  'Recheck',
  'TechnicianAppointment',
  'Vaccination',
  'SurgeryProcedure',
  'DropOff',
  'EmergencyUrgent',
  'Telemedicine',
  'Euthanasia',
  'BoardingNonMedical',
] as const;

export type AppointmentTypeValue = (typeof APPOINTMENT_TYPES)[number];

const APPOINTMENT_TYPE_LABELS: Record<AppointmentTypeValue, string> = {
  WellnessPreventiveCare: 'Wellness / Preventive Care',
  SickVisit: 'Sick Visit',
  Recheck: 'Recheck',
  TechnicianAppointment: 'Technician Appointment',
  Vaccination: 'Vaccination',
  SurgeryProcedure: 'Surgery / Procedure',
  DropOff: 'Drop-Off',
  EmergencyUrgent: 'Emergency / Urgent',
  Telemedicine: 'Telemedicine',
  Euthanasia: 'Euthanasia',
  BoardingNonMedical: 'Boarding / Non-medical',
};

export function appointmentTypeLabel(type: string): string {
  return APPOINTMENT_TYPE_LABELS[type as AppointmentTypeValue] ?? type;
}

export interface VisitDetail {
  id: string;
  visitType: string;
  reason: string;
  state: string;
  createdAt: string;
  patient: {
    id: string;
    name: string;
    species: string;
    breed: string | null;
  };
  client: {
    id: string;
    firstName: string;
    lastName: string;
  } | null;
  appointment: {
    id: string;
    type: string;
    reason: string;
    scheduledAt: string;
    state: string;
    primaryCareVetName: string | null;
    previousClinicName: string | null;
    previousRecordsSource: string | null;
    lastSeenAt: string | null;
    recordsPrepStatus: string;
    confirmationStatus: string;
  } | null;
  intake: {
    id: string;
    chiefComplaint: string | null;
    historyNotes: string | null;
    weight: number | null;
    weightUnit: 'LB' | 'KG';
    temperature: number | null;
    heartRate: number | null;
    respiratoryRate: number | null;
    crtSeconds: number | null;
    gumColor: string | null;
    appetite: string | null;
    vomiting: boolean;
    diarrhea: boolean;
    medicationsAllergies: string | null;
    completedAt: string | null;
  } | null;
  examFindings: {
    id: string;
    subjective: string | null;
    objective: string | null;
    assessment: string | null;
    plan: string | null;
    completedAt: string | null;
  } | null;
  primaryVeterinarian: {
    id: string;
    displayName: string | null;
    firstName: string;
    lastName: string;
    role: string;
  } | null;
  assignedTechnician: {
    id: string;
    displayName: string | null;
    firstName: string;
    lastName: string;
    role: string;
  } | null;
  currentOwner: {
    id: string;
    displayName: string | null;
    firstName: string;
    lastName: string;
    role: string;
  } | null;
}

/** Mirrors StaffService's response shape (apps/api/src/staff). */
export interface StaffMember {
  id: string;
  firstName: string;
  lastName: string;
  displayName: string;
  role: string;
  jobTitle: string | null;
  canReceiveAppointments: boolean;
  canOwnVisits: boolean;
}

/** Mirrors Clinic Provisioning v1's default species list (Dog, Cat); "Other"
 *  keeps patient creation unblocked for clinics that see additional species. */
export const SPECIES_OPTIONS = ['Dog', 'Cat', 'Other'] as const;

export const SEX_OPTIONS = ['Male', 'Female', 'Spayed Female', 'Neutered Male'] as const;

/** Mirrors Clinic Provisioning v1's communication defaults (Phone default). */
export const CONTACT_METHOD_OPTIONS = ['Phone', 'Text', 'Email'] as const;

/** Mirrors Prisma's RecordsPrepStatus enum — tech/assistant records-research
 *  tracking on an Appointment (Anna: "researches available medical records
 *  before the appointment"). */
export const RECORDS_PREP_STATUSES = [
  'NotStarted',
  'Requested',
  'Received',
  'Reviewed',
  'NotAvailable',
] as const;

export type RecordsPrepStatusValue = (typeof RECORDS_PREP_STATUSES)[number];

const RECORDS_PREP_STATUS_LABELS: Record<RecordsPrepStatusValue, string> = {
  NotStarted: 'Not started',
  Requested: 'Records requested',
  Received: 'Records received',
  Reviewed: 'Records reviewed',
  NotAvailable: 'No prior records available',
};

export function recordsPrepStatusLabel(status: string): string {
  return RECORDS_PREP_STATUS_LABELS[status as RecordsPrepStatusValue] ?? status;
}

/** Mirrors Prisma's ConfirmationStatus enum — manual status tracking only.
 *  No messaging vendor is integrated; "SentManually" and "Confirmed" record
 *  that staff did it by phone/in person, not that Sparki sent anything. */
export const CONFIRMATION_STATUSES = ['NotSent', 'Queued', 'SentManually', 'Confirmed'] as const;

export type ConfirmationStatusValue = (typeof CONFIRMATION_STATUSES)[number];

const CONFIRMATION_STATUS_LABELS: Record<ConfirmationStatusValue, string> = {
  NotSent: 'Not sent',
  Queued: 'Queued',
  SentManually: 'Sent manually',
  Confirmed: 'Confirmed',
};

export function confirmationStatusLabel(status: string): string {
  return CONFIRMATION_STATUS_LABELS[status as ConfirmationStatusValue] ?? status;
}
