import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { prisma, type AppointmentType, type VisitState, type VisitType } from '@sparki/db';
import { workflowStatusKey } from '@sparki/config';
import { AppointmentsService } from '../appointments/appointments.service';
import { assertBelongsToOrganization } from '../common/assert-organization-scope';
import { PatientsService } from '../patients/patients.service';
import type { CreateVisitInput } from './dto/create-visit.schema';
import type { SaveExamFindingsInput } from './dto/save-exam-findings.schema';
import type { SaveVisitIntakeInput } from './dto/save-visit-intake.schema';
import type { SetDashboardStatusInput } from './dto/set-dashboard-status.schema';
import {
  CHECKOUT_READY_STATE,
  EXAM_IN_PROGRESS_STATE,
  EXAM_READY_STATE,
  INTAKE_IN_PROGRESS_STATE,
  STARTABLE_VISIT_STATES,
  TERMINAL_VISIT_STATES,
  TREATMENT_READY_STATE,
} from './visit-states';

/**
 * The Command Center dashboard shows a coarse 5-status view (Upcoming,
 * Checked In, In Room, Ready for Checkout, Completed) over the Visit's much
 * finer-grained workflow state. `setDashboardStatus` lets reception move a
 * Visit exactly one coarse step forward or backward without forcing it
 * through the fine-grained intake/exam endpoints above — this map is the
 * only place that defines what "one step" means at the coarse level, keyed
 * by `${currentBucket}->${requestedBucket}`. Deliberately excludes
 * `Appointment` (that's an Appointment-level, not Visit-level, concept).
 * Checkout intentionally maps to a visible payment/checkout workflow state;
 * dashboard status changes never archive the medical record.
 */
const DASHBOARD_TRANSITIONS: Record<string, VisitState> = {
  'CheckIn->BeginIntake': INTAKE_IN_PROGRESS_STATE,
  'BeginIntake->CheckIn': 'Arrived',
  'BeginIntake->ReadyForVeterinarian': EXAM_READY_STATE,
  'ReadyForVeterinarian->BeginIntake': INTAKE_IN_PROGRESS_STATE,
  'ReadyForVeterinarian->Exam': EXAM_IN_PROGRESS_STATE,
  'Exam->ReadyForVeterinarian': EXAM_READY_STATE,
  'Exam->Treatment': TREATMENT_READY_STATE,
  'Treatment->Exam': EXAM_IN_PROGRESS_STATE,
  'Treatment->Discharge': CHECKOUT_READY_STATE,
  'Discharge->Treatment': TREATMENT_READY_STATE,
  // Dashboard Checkout remains visible in Today's flow. Archival belongs to
  // the explicit visit-closing workflow, not a reception status selection.
  'Discharge->Checkout': 'PaymentComplete',
  'Checkout->Discharge': CHECKOUT_READY_STATE,
};

const visitInclude = {
  patient: true,
  client: true,
  appointment: true,
  primaryVeterinarian: true,
  assignedTechnician: true,
  currentOwner: true,
  intake: true,
  examFindings: true,
};

/**
 * Default Visit type per Appointment type when the caller doesn't override
 * it. docs/specs/modules/02-visit-lifecycle-mvp.md's variant list (Emergency,
 * Surgery, Technician, Telemedicine, Drop-off, ...) doesn't define this
 * mapping explicitly — it's an engineering default pending product
 * confirmation (see task summary).
 */
const APPOINTMENT_TYPE_TO_VISIT_TYPE: Record<AppointmentType, VisitType> = {
  WellnessPreventiveCare: 'Scheduled',
  SickVisit: 'Scheduled',
  Recheck: 'Scheduled',
  TechnicianAppointment: 'TechnicianAppointment',
  Vaccination: 'Scheduled',
  SurgeryProcedure: 'SurgeryAdmission',
  DropOff: 'DropOff',
  EmergencyUrgent: 'Emergency',
  Telemedicine: 'Telemedicine',
  Euthanasia: 'Scheduled',
  BoardingNonMedical: 'Scheduled',
};

@Injectable()
export class VisitsService {
  constructor(
    private readonly patients: PatientsService,
    private readonly appointments: AppointmentsService,
  ) {}

  /**
   * Both entry paths converge here: resolve patient/client/reason/visit
   * type (from the Appointment, or directly from the caller for a
   * walk-in), then create the Visit — linking and flipping the Appointment
   * to `VisitCreated` in the same transaction when one was provided.
   *
   * Per docs/specs/modules/04-scheduling-mvp.md, the only in-spec
   * precondition is `Arrived -> Visit Created`, and AppointmentsService now
   * exposes a `markArrived` transition, so this enforces that precondition
   * exactly rather than accepting any not-yet-terminal state.
   */
  async create(
    organizationId: string,
    locationId: string,
    createdById: string,
    input: CreateVisitInput,
  ) {
    let patientId: string;
    let clientId: string | null;
    let reason: string;
    let visitType: VisitType;
    let appointmentId: string | null = null;
    let primaryVeterinarianId: string | null = input.primaryVeterinarianId ?? null;

    if (input.appointmentId) {
      const appointment = await this.appointments.findById(input.appointmentId, organizationId, locationId);

      if (appointment.state !== 'Arrived') {
        throw new ConflictException(
          `Appointment ${appointment.id} must be Arrived before a Visit can be created (current state: ${appointment.state})`,
        );
      }
      if (!appointment.patientId) {
        throw new BadRequestException(
          `Appointment ${appointment.id} has no linked Patient; link a Patient before creating a Visit`,
        );
      }

      appointmentId = appointment.id;
      patientId = appointment.patientId;
      clientId = input.clientId ?? appointment.clientId ?? null;
      reason = input.reason ?? appointment.reason;
      visitType = input.visitType ?? APPOINTMENT_TYPE_TO_VISIT_TYPE[appointment.type];
      // The Appointment's assigned provider carries over as the Visit's
      // primary veterinarian unless the caller explicitly overrides it.
      primaryVeterinarianId = input.primaryVeterinarianId ?? appointment.providerId ?? null;
    } else {
      // Guaranteed present by createVisitSchema's refinements when
      // appointmentId is absent.
      patientId = input.patientId as string;
      reason = input.reason as string;
      clientId = input.clientId ?? null;
      visitType = input.visitType ?? 'WalkIn';
    }

    const patient = await this.patients.findById(patientId, organizationId);

    if (clientId) {
      await assertBelongsToOrganization(prisma.client, 'Client', clientId, organizationId);
    } else {
      const primary =
        patient.clients.find((patientClient) => patientClient.isPrimary) ?? patient.clients[0];
      clientId = primary?.client.id ?? null;
    }

    await Promise.all([
      primaryVeterinarianId
        ? assertBelongsToOrganization(prisma.user, 'Staff member', primaryVeterinarianId, organizationId)
        : null,
      input.assignedTechnicianId
        ? assertBelongsToOrganization(prisma.user, 'Staff member', input.assignedTechnicianId, organizationId)
        : null,
    ]);

    return prisma.$transaction(async (tx) => {
      // Re-checked inside the transaction to narrow (not eliminate — Postgres
      // read-committed doesn't block a concurrent insert here) the race
      // window; a partial unique index would be the airtight fix if this
      // becomes a real contention point.
      const existingActiveVisit = await tx.visit.findFirst({
        where: { patientId, organizationId, state: { notIn: TERMINAL_VISIT_STATES } },
      });
      if (existingActiveVisit) {
        throw new ConflictException(
          `Patient ${patientId} already has an active Visit (${existingActiveVisit.id}); resolve or archive it before starting a new one`,
        );
      }

      // Flip the Appointment first: the Visit create below includes the
      // nested appointment in its response, and that read must reflect
      // VisitCreated, not the pre-transition state.
      if (appointmentId) {
        await tx.appointment.update({
          where: { id: appointmentId },
          data: { state: 'VisitCreated' },
        });
      }

      return tx.visit.create({
        data: {
          organizationId,
          locationId,
          patientId,
          clientId,
          appointmentId,
          visitType,
          reason,
          state: 'Arrived',
          primaryVeterinarianId,
          assignedTechnicianId: input.assignedTechnicianId ?? null,
          createdById,
          lastUpdatedById: createdById,
        },
        include: visitInclude,
      });
    });
  }

  async findById(id: string, organizationId: string) {
    const visit = await prisma.visit.findFirst({
      where: { id, organizationId },
      include: visitInclude,
    });
    if (!visit) {
      throw new NotFoundException(`Visit ${id} not found`);
    }
    return visit;
  }

  /** All non-terminal Visits for the organization — the Command Center's
   *  live floor view. */
  async listActiveForOrganization(organizationId: string) {
    return prisma.visit.findMany({
      where: { organizationId, state: { notIn: TERMINAL_VISIT_STATES } },
      include: visitInclude,
      orderBy: { createdAt: 'asc' },
    });
  }

  /**
   * Advances a Visit from an arrival/pre-intake state into
   * IntakeInProgress. Conservative by design: a Visit already past that
   * point (mid-exam, checkout, etc.) is returned unchanged rather than
   * forced through a transition the caller didn't ask for, and a terminal
   * Visit is rejected outright rather than silently reactivated.
   */
  async start(id: string, organizationId: string, lastUpdatedById: string) {
    const visit = await this.findById(id, organizationId);

    if (TERMINAL_VISIT_STATES.includes(visit.state)) {
      throw new ConflictException(
        `Visit ${id} is in a terminal state (${visit.state}) and cannot be started`,
      );
    }

    if (!STARTABLE_VISIT_STATES.includes(visit.state)) {
      return visit;
    }

    return prisma.visit.update({
      where: { id },
      data: { state: INTAKE_IN_PROGRESS_STATE, lastUpdatedById },
      include: visitInclude,
    });
  }

  async saveIntake(
    id: string,
    organizationId: string,
    lastUpdatedById: string,
    input: SaveVisitIntakeInput,
  ) {
    await this.findById(id, organizationId);

    await prisma.visitIntake.upsert({
      where: { visitId: id },
      create: {
        visitId: id,
        ...normalizeIntakeInput(input),
      },
      update: normalizeIntakeInput(input),
    });

    return prisma.visit.update({
      where: { id },
      data: { lastUpdatedById },
      include: visitInclude,
    });
  }

  async completeIntake(id: string, organizationId: string, lastUpdatedById: string) {
    const visit = await this.findById(id, organizationId);

    if (TERMINAL_VISIT_STATES.includes(visit.state)) {
      throw new ConflictException(
        `Visit ${id} is in a terminal state (${visit.state}) and cannot complete intake`,
      );
    }

    if (visit.state !== INTAKE_IN_PROGRESS_STATE) {
      return visit;
    }

    const completedAt = new Date();
    return prisma.$transaction(async (tx) => {
      await tx.visitIntake.upsert({
        where: { visitId: id },
        create: { visitId: id, completedAt },
        update: { completedAt },
      });

      return tx.visit.update({
        where: { id },
        data: {
          state: EXAM_READY_STATE,
          lastUpdatedById,
        },
        include: visitInclude,
      });
    });
  }

  async startExam(id: string, organizationId: string, lastUpdatedById: string) {
    const visit = await this.findById(id, organizationId);

    if (TERMINAL_VISIT_STATES.includes(visit.state)) {
      throw new ConflictException(
        `Visit ${id} is in a terminal state (${visit.state}) and cannot start exam`,
      );
    }

    if (visit.state !== EXAM_READY_STATE) {
      return visit;
    }

    return prisma.visit.update({
      where: { id },
      data: { state: EXAM_IN_PROGRESS_STATE, lastUpdatedById },
      include: visitInclude,
    });
  }

  async saveExamFindings(
    id: string,
    organizationId: string,
    lastUpdatedById: string,
    input: SaveExamFindingsInput,
  ) {
    await this.findById(id, organizationId);

    await prisma.visitExamFindings.upsert({
      where: { visitId: id },
      create: {
        visitId: id,
        ...normalizeExamFindingsInput(input),
      },
      update: normalizeExamFindingsInput(input),
    });

    return prisma.visit.update({
      where: { id },
      data: { lastUpdatedById },
      include: visitInclude,
    });
  }

  async completeExam(id: string, organizationId: string, lastUpdatedById: string) {
    const visit = await this.findById(id, organizationId);

    if (TERMINAL_VISIT_STATES.includes(visit.state)) {
      throw new ConflictException(
        `Visit ${id} is in a terminal state (${visit.state}) and cannot complete exam`,
      );
    }

    if (visit.state !== EXAM_IN_PROGRESS_STATE) {
      return visit;
    }

    const completedAt = new Date();
    return prisma.$transaction(async (tx) => {
      await tx.visitExamFindings.upsert({
        where: { visitId: id },
        create: { visitId: id, completedAt },
        update: { completedAt },
      });

      return tx.visit.update({
        where: { id },
        data: {
          state: TREATMENT_READY_STATE,
          lastUpdatedById,
        },
        include: visitInclude,
      });
    });
  }

  /**
   * Moves a Visit exactly one coarse dashboard status forward or backward
   * (see `DASHBOARD_TRANSITIONS`). Used by the Command Center's status pill
   * — a manual override distinct from the fine-grained intake/exam flow
   * above, so it re-derives the Visit's current coarse bucket from its raw
   * state rather than trusting the caller's idea of "current status".
   */
  async setDashboardStatus(
    id: string,
    organizationId: string,
    lastUpdatedById: string,
    target: SetDashboardStatusInput['statusKey'],
  ) {
    const visit = await this.findById(id, organizationId);

    if (TERMINAL_VISIT_STATES.includes(visit.state)) {
      throw new ConflictException(
        `Visit ${id} is in a terminal state (${visit.state}) and has no dashboard status to change`,
      );
    }

    const current = workflowStatusKey('visit', visit.state);
    if (!current) {
      throw new ConflictException(`Visit ${id} has no configured dashboard status for state ${visit.state}`);
    }
    const normalizedTarget = target === 'InRoom'
      ? (current === 'Discharge' ? 'Treatment' : current === 'Treatment' ? 'Exam' : 'BeginIntake')
      : target;
    const configured = await prisma.dashboardStatusColorSetting.findFirst({
      where: { organizationId, locationId: visit.locationId, status: current, isEnabled: true },
    });
    if (!configured || !configured.allowedTransitionKeys.includes(normalizedTarget)) {
      throw new ConflictException(`Visit ${id} cannot transition from its configured status to "${normalizedTarget}"`);
    }
    const nextState = DASHBOARD_TRANSITIONS[`${current}->${normalizedTarget}`];

    if (!nextState) {
      throw new ConflictException(
        `Visit ${id} cannot move from dashboard status "${current}" directly to "${normalizedTarget}" — only one configured step is allowed`,
      );
    }

    return prisma.visit.update({
      where: { id },
      data: { state: nextState, lastUpdatedById },
      include: visitInclude,
    });
  }
}

function normalizeIntakeInput(input: SaveVisitIntakeInput) {
  return {
    chiefComplaint: input.chiefComplaint ?? null,
    historyNotes: input.historyNotes ?? null,
    weight: input.weight ?? null,
    // Every save carries an explicit unit, defaulting to LB (matching the
    // form's own default and the historical "Weight (lb)" label) rather than
    // leaving it unset — see the WeightUnit migration for why.
    weightUnit: input.weightUnit ?? 'LB',
    temperature: input.temperature ?? null,
    heartRate: input.heartRate ?? null,
    respiratoryRate: input.respiratoryRate ?? null,
    crtSeconds: input.crtSeconds ?? null,
    gumColor: input.gumColor ?? null,
    appetite: input.appetite ?? null,
    vomiting: input.vomiting ?? false,
    diarrhea: input.diarrhea ?? false,
    medicationsAllergies: input.medicationsAllergies ?? null,
  };
}

function normalizeExamFindingsInput(input: SaveExamFindingsInput) {
  return {
    subjective: input.subjective ?? null,
    objective: input.objective ?? null,
    assessment: input.assessment ?? null,
    plan: input.plan ?? null,
  };
}
