export interface PrimaryClientSummary {
  id: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  email: string | null;
  preferredContactMethod: string | null;
}

export interface PatientSearchResult {
  id: string;
  name: string;
  species: string;
  breed: string | null;
  sex: string | null;
  dateOfBirth: string | null;
  weight: number | null;
  color: string | null;
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
  operationalRank: number;
}

export interface WorkspaceClient {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  preferredContactMethod: string | null;
  isPrimary: boolean;
}

export function clientDisplayName(client: { firstName: string; lastName: string }): string {
  return `${client.firstName} ${client.lastName}`;
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

export type WorkspaceSection = UnavailableWorkspaceSection;

export interface UpcomingAppointment {
  id: string;
  type: string;
  reason: string;
  scheduledAt: string;
  expectedDurationMinutes: number | null;
  state: string;
}

export interface PatientWorkspace {
  patient: {
    id: string;
    name: string;
    species: string;
    breed: string | null;
    sex: string | null;
    dateOfBirth: string | null;
    weight: number | null;
    color: string | null;
    status: string;
    sourceSystem: string | null;
    sourceConfidence: number | null;
  };
  clients: WorkspaceClient[];
  upcomingAppointments: UpcomingAppointment[];
  sections: {
    currentVisit: CurrentVisitSection;
    workItems: WorkspaceSection;
    timeline: WorkspaceSection;
    communication: WorkspaceSection;
    financial: WorkspaceSection;
    attachments: WorkspaceSection;
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
  } | null;
  intake: {
    id: string;
    chiefComplaint: string | null;
    historyNotes: string | null;
    weight: number | null;
    temperature: number | null;
    heartRate: number | null;
    respiratoryRate: number | null;
    appetite: string | null;
    vomiting: boolean;
    diarrhea: boolean;
    medicationsAllergies: string | null;
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
 *  keeps intake unblocked for clinics that see additional species. */
export const SPECIES_OPTIONS = ['Dog', 'Cat', 'Other'] as const;

export const SEX_OPTIONS = [
  'Male',
  'Female',
  'Male (Neutered)',
  'Female (Spayed)',
  'Unknown',
] as const;

/** Mirrors Clinic Provisioning v1's communication defaults (Phone default). */
export const CONTACT_METHOD_OPTIONS = ['Phone', 'Text', 'Email'] as const;
