import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { prisma, type AppointmentType, type UserRole, type VisitState, type VisitType } from '@sparki/db';
import { defaultAllowedTransitionKeys, workflowStatusKey } from '@sparki/config';
import { AppointmentsService } from '../appointments/appointments.service';
import { assertBelongsToOrganization } from '../common/assert-organization-scope';
import { PatientsService } from '../patients/patients.service';
import type { CreateVisitInput } from './dto/create-visit.schema';
import type { SaveExamFindingsInput } from './dto/save-exam-findings.schema';
import type { SaveVisitIntakeInput } from './dto/save-visit-intake.schema';
import type { SetDashboardStatusInput } from './dto/set-dashboard-status.schema';
import { VISIT_LIFECYCLE_INCLUDE, VisitLifecycleService } from './visit-lifecycle.service';
import { VisitRecordsService } from './visit-records.service';
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
const visitInclude = VISIT_LIFECYCLE_INCLUDE;

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
    private readonly lifecycle: VisitLifecycleService,
    private readonly records: VisitRecordsService,
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
        where: { patientId, organizationId, locationId, state: { notIn: TERMINAL_VISIT_STATES } },
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

      const initialWorkflowStep = await tx.dashboardStatusColorSetting.findFirst({
        where: { organizationId, locationId, lifecyclePhase: 'Arrived', isEnabled: true },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
        select: { id: true },
      });
      const created = await tx.visit.create({
        data: {
          organizationId,
          locationId,
          patientId,
          clientId,
          appointmentId,
          visitType,
          reason,
          state: 'Arrived',
          phase: 'Arrived',
          arrivedAt: new Date(),
          currentOwnerId: createdById,
          nextAction: 'Begin intake',
          primaryVeterinarianId,
          assignedTechnicianId: input.assignedTechnicianId ?? null,
          createdById,
          lastUpdatedById: createdById,
          workflowStepId: initialWorkflowStep?.id ?? null,
        },
        include: visitInclude,
      });

      await tx.visitTransition.create({
        data: {
          organizationId,
          locationId,
          visitId: created.id,
          actorId: createdById,
          source: 'User',
          fromPhase: 'Arrived',
          toPhase: 'Arrived',
          fromState: 'Arrived',
          toState: 'Arrived',
          reason: appointmentId ? 'Created from arrived appointment' : 'Created as walk-in visit',
          metadata: { action: 'VisitCreated', appointmentId },
        },
      });
      await tx.visitWorkItem.create({
        data: {
          organizationId,
          locationId,
          visitId: created.id,
          type: 'IntakeCompletion',
          title: 'Complete patient intake',
          assigneeRole: 'TECHNICIAN',
        },
      });

      return tx.visit.findUniqueOrThrow({ where: { id: created.id }, include: visitInclude });
    });
  }

  async findById(id: string, organizationId: string, locationId: string) {
    const visit = await prisma.visit.findFirst({
      where: { id, organizationId, locationId },
      include: visitInclude,
    });
    if (!visit) {
      throw new NotFoundException(`Visit ${id} not found`);
    }
    return {
      ...visit,
      clinicalAttachments: visit.clinicalAttachments.map((attachment) => ({
        ...attachment,
        href: `/clinical-attachments/${attachment.id}/content`,
      })),
    };
  }

  /** All non-terminal Visits for the organization — the Command Center's
   *  live floor view. */
  async listActiveForOrganization(organizationId: string, locationId: string) {
    return prisma.visit.findMany({
      where: { organizationId, locationId, state: { notIn: TERMINAL_VISIT_STATES } },
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
  async start(id: string, organizationId: string, locationId: string, lastUpdatedById: string, actorRole: UserRole) {
    const visit = await this.findById(id, organizationId, locationId);

    if (TERMINAL_VISIT_STATES.includes(visit.state)) {
      throw new ConflictException(
        `Visit ${id} is in a terminal state (${visit.state}) and cannot be started`,
      );
    }

    if (!STARTABLE_VISIT_STATES.includes(visit.state)) {
      // A technician may have opened an intake that was started before
      // technician auto-claiming was enabled. Let Start intake repair that
      // existing ownership gap without advancing the workflow again.
      if (visit.state === INTAKE_IN_PROGRESS_STATE && actorRole === 'TECHNICIAN' && !visit.assignedTechnicianId) {
        return prisma.visit.update({
          where: { id },
          data: { assignedTechnicianId: lastUpdatedById, lastUpdatedById },
          include: visitInclude,
        });
      }
      return visit;
    }

    return this.lifecycle.transition({
      visitId: id,
      organizationId,
      locationId,
      actorId: lastUpdatedById,
      actorRole,
      expectedStates: [visit.state],
      toState: INTAKE_IN_PROGRESS_STATE,
      toPhase: 'Intake',
      currentOwnerId: lastUpdatedById,
      // Starting intake is the technician's first ownership action. Claim an
      // unassigned technician slot so the visit header and downstream queue
      // reflect who is actively handling the intake.
      ...(actorRole === 'TECHNICIAN' && !visit.assignedTechnicianId
        ? { assignedTechnicianId: lastUpdatedById }
        : {}),
      nextAction: 'Complete intake',
      timestamps: { intakeStartedAt: new Date() },
      createWorkItems: [{ type: 'IntakeCompletion', title: 'Complete patient intake', assigneeId: lastUpdatedById }],
    });
  }

  async saveIntake(
    id: string,
    organizationId: string,
    locationId: string,
    lastUpdatedById: string,
    input: SaveVisitIntakeInput,
  ) {
    await this.findById(id, organizationId, locationId);

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

  async completeIntake(id: string, organizationId: string, locationId: string, lastUpdatedById: string, actorRole: UserRole) {
    const visit = await this.findById(id, organizationId, locationId);

    if (TERMINAL_VISIT_STATES.includes(visit.state)) {
      throw new ConflictException(
        `Visit ${id} is in a terminal state (${visit.state}) and cannot complete intake`,
      );
    }

    const completingDeferredEmergency = visit.visitType === 'Emergency'
      && visit.state === 'TreatmentPending'
      && visit.exceptions.some((exception) => exception.type === 'EmergencyIntakeDeferred');
    const isTechnicianVisit = visit.visitType === 'TechnicianAppointment';
    const technicianId = visit.assignedTechnicianId ?? lastUpdatedById;

    if (visit.state !== INTAKE_IN_PROGRESS_STATE && !completingDeferredEmergency) {
      return visit;
    }

    assertIntakeReadyForCompletion(visit.intake);

    return this.lifecycle.transition({
        visitId: id,
        organizationId,
        locationId,
        actorId: lastUpdatedById,
        actorRole,
        expectedStates: [visit.state],
        toState: completingDeferredEmergency ? EXAM_IN_PROGRESS_STATE : isTechnicianVisit ? 'TreatmentPending' : EXAM_READY_STATE,
        toPhase: isTechnicianVisit ? 'CareInProgress' : 'Exam',
        currentOwnerId: completingDeferredEmergency ? (visit.primaryVeterinarianId ?? lastUpdatedById) : isTechnicianVisit ? technicianId : visit.primaryVeterinarianId,
        ...(isTechnicianVisit ? { assignedTechnicianId: technicianId } : {}),
        nextAction: completingDeferredEmergency ? 'Complete veterinarian exam' : isTechnicianVisit ? 'Document technician care' : 'Start veterinarian exam',
        ...(completingDeferredEmergency ? { timestamps: { examStartedAt: visit.examStartedAt ?? new Date() } } : {}),
        completeWorkItemTypes: ['IntakeCompletion'],
        createWorkItems: isTechnicianVisit ? [{ type: 'RecordSignoff', title: 'Finalize technician visit record', assigneeId: technicianId }] : [],
        resolveExceptionTypes: completingDeferredEmergency ? ['EmergencyIntakeDeferred'] : [],
        ...(!completingDeferredEmergency && !isTechnicianVisit ? { handoff: {
          toUserId: visit.primaryVeterinarianId,
          toRole: 'VETERINARIAN',
          summary: visit.intake?.chiefComplaint ?? visit.reason,
        } } : {}),
        prepare: async (tx) => {
          await tx.visitIntake.upsert({
            where: { visitId: id },
            create: { visitId: id, completedAt: new Date() },
            update: { completedAt: new Date() },
          });
          if (isTechnicianVisit) {
            await this.records.ensureDraftForVisitTx(tx, id, organizationId, locationId, technicianId);
          }
        },
    });
  }

  async deferEmergencyIntake(
    id: string,
    organizationId: string,
    locationId: string,
    actorId: string,
    actorRole: UserRole,
    reason: string,
  ) {
    const visit = await this.findById(id, organizationId, locationId);
    if (visit.visitType !== 'Emergency') {
      throw new ConflictException('Intake may only be deferred for a life-threatening emergency.');
    }
    if (!['Arrived', 'IntakeInProgress'].includes(visit.state)) {
      throw new ConflictException('Emergency intake cannot be deferred from the current visit step.');
    }
    return this.lifecycle.transition({
      visitId: id,
      organizationId,
      locationId,
      actorId,
      actorRole,
      expectedStates: [visit.state],
      toState: 'TreatmentPending',
      toPhase: 'CareInProgress',
      currentOwnerId: visit.primaryVeterinarianId ?? actorId,
      nextAction: 'Stabilize patient; complete intake when stable',
      reason,
      createException: {
        type: 'EmergencyIntakeDeferred',
        severity: 'Critical',
        reason,
        nextAction: 'Complete structured intake after stabilization',
        ownerId: visit.assignedTechnicianId ?? actorId,
      },
    });
  }

  async startExam(id: string, organizationId: string, locationId: string, lastUpdatedById: string, actorRole: UserRole) {
    const visit = await this.findById(id, organizationId, locationId);

    if (TERMINAL_VISIT_STATES.includes(visit.state)) {
      throw new ConflictException(
        `Visit ${id} is in a terminal state (${visit.state}) and cannot start exam`,
      );
    }

    if (visit.state !== EXAM_READY_STATE) {
      return visit;
    }

    return this.lifecycle.transition({
      visitId: id,
      organizationId,
      locationId,
      actorId: lastUpdatedById,
      actorRole,
      expectedStates: [visit.state],
      toState: EXAM_IN_PROGRESS_STATE,
      toPhase: 'Exam',
      currentOwnerId: lastUpdatedById,
      nextAction: 'Complete veterinarian exam',
      timestamps: { examStartedAt: new Date() },
    });
  }

  async saveExamFindings(
    id: string,
    organizationId: string,
    locationId: string,
    lastUpdatedById: string,
    input: SaveExamFindingsInput,
  ) {
    await this.findById(id, organizationId, locationId);

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

  async completeExam(id: string, organizationId: string, locationId: string, lastUpdatedById: string, actorRole: UserRole) {
    const visit = await this.findById(id, organizationId, locationId);

    if (TERMINAL_VISIT_STATES.includes(visit.state)) {
      throw new ConflictException(
        `Visit ${id} is in a terminal state (${visit.state}) and cannot complete exam`,
      );
    }

    if (visit.state !== EXAM_IN_PROGRESS_STATE) {
      return visit;
    }

    return this.lifecycle.transition({
        visitId: id,
        organizationId,
        locationId,
        actorId: lastUpdatedById,
        actorRole,
        expectedStates: [visit.state],
        toState: 'PlanDrafted',
        toPhase: 'PlanAndApproval',
        currentOwnerId: lastUpdatedById,
        nextAction: 'Review and approve care plan',
        createWorkItems: [
          { type: 'RecordSignoff', title: 'Finalize medical record', assigneeId: visit.primaryVeterinarianId ?? lastUpdatedById },
        ],
        prepare: async (tx) => {
          await tx.visitExamFindings.upsert({
            where: { visitId: id },
            create: { visitId: id, completedAt: new Date() },
            update: { completedAt: new Date() },
          });
          await this.records.ensureDraftForVisitTx(tx, id, organizationId, locationId, lastUpdatedById);
        },
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
    locationId: string,
    lastUpdatedById: string,
    actorRole: UserRole,
    target: SetDashboardStatusInput['statusKey'],
  ) {
    const visit = await this.findById(id, organizationId, locationId);

    if (TERMINAL_VISIT_STATES.includes(visit.state)) {
      throw new ConflictException(
        `Visit ${id} is in a terminal state (${visit.state}) and has no dashboard status to change`,
      );
    }

    const current = visit.workflowStep?.status ?? workflowStatusKey('visit', visit.state);
    if (!current) {
      throw new ConflictException(`Visit ${id} has no configured dashboard status for state ${visit.state}`);
    }
    const normalizedTarget = target === 'InRoom'
      ? (current === 'Discharge' ? 'Treatment' : current === 'Treatment' ? 'Exam' : 'BeginIntake')
      : target;
    const configured = await prisma.dashboardStatusColorSetting.findFirst({
      where: { organizationId, locationId: visit.locationId, status: current, isEnabled: true },
    });
    const allowedTransitionKeys = [...new Set([
      ...(configured?.allowedTransitionKeys ?? []),
      ...defaultAllowedTransitionKeys(current),
    ])];
    if (!configured || !allowedTransitionKeys.includes(normalizedTarget)) {
      throw new ConflictException(`Visit ${id} cannot transition from its configured status to "${normalizedTarget}"`);
    }
    const targetStep = await prisma.dashboardStatusColorSetting.findFirst({
      where: { organizationId, locationId: visit.locationId, status: normalizedTarget, isEnabled: true },
    });
    if (!targetStep) throw new ConflictException(`The requested workflow step is not available at this location.`);
    assertRoleCanMoveToPhase(actorRole, targetStep.lifecyclePhase);
    assertWorkflowPhaseChangeAllowed(visit, targetStep.lifecyclePhase);
    const nextState = representativeStateForPhase(targetStep.lifecyclePhase, visit.state);

    return this.lifecycle.transition({
      visitId: id,
      organizationId,
      locationId,
      actorId: lastUpdatedById,
      actorRole,
      expectedStates: [visit.state],
      toState: nextState,
      toPhase: targetStep.lifecyclePhase,
      workflowStepId: targetStep.id,
      currentOwnerId: ownerForPhase(visit, targetStep.lifecyclePhase, lastUpdatedById),
      nextAction: nextActionForState(nextState),
    });
  }
}

const PHASE_ORDER = ['Arrived', 'Intake', 'Exam', 'PlanAndApproval', 'CareInProgress', 'Discharge', 'RecordClosure', 'Closed'];

function assertRoleCanMoveToPhase(role: UserRole, phase: string) {
  if (role === 'OWNER') return;
  const allowed: Partial<Record<UserRole, string[]>> = {
    PRACTICE_MANAGER: ['Arrived', 'Intake', 'Discharge', 'RecordClosure'],
    RECEPTIONIST: ['Arrived', 'Intake', 'Discharge', 'RecordClosure'],
    VETERINARIAN: ['Intake', 'Exam', 'PlanAndApproval', 'CareInProgress', 'Discharge', 'RecordClosure'],
    TECHNICIAN: ['Intake', 'CareInProgress', 'Discharge'],
    ASSISTANT: ['Intake', 'CareInProgress', 'Discharge'],
  };
  if (!allowed[role]?.includes(phase)) {
    throw new ConflictException(`Your role cannot move a visit into the ${phase} phase.`);
  }
}

function assertWorkflowPhaseChangeAllowed(
  visit: { phase: string; checkout: unknown | null; soapNotes: Array<{ status: string }> },
  targetPhase: string,
) {
  const currentIndex = PHASE_ORDER.indexOf(visit.phase);
  const targetIndex = PHASE_ORDER.indexOf(targetPhase);
  const recordLocked = visit.soapNotes.some((note) => ['Locked', 'Amended'].includes(note.status));
  if (targetIndex < currentIndex && (currentIndex >= PHASE_ORDER.indexOf('Discharge') || visit.checkout || recordLocked)) {
    throw new ConflictException('This visit has reached discharge or record closure. Use an audited correction instead of moving it backward.');
  }
}

function ownerForPhase(
  visit: { primaryVeterinarianId: string | null; assignedTechnicianId: string | null },
  phase: string,
  actorId: string,
) {
  if (phase === 'Intake' || phase === 'Discharge') return visit.assignedTechnicianId ?? actorId;
  if (['Exam', 'PlanAndApproval', 'CareInProgress', 'RecordClosure'].includes(phase)) return visit.primaryVeterinarianId ?? actorId;
  return actorId;
}

function representativeStateForPhase(phase: string, current: VisitState): VisitState {
  if (phase === 'Arrived') return 'Waiting';
  if (phase === 'Intake') return INTAKE_IN_PROGRESS_STATE;
  if (phase === 'Exam') return current === EXAM_IN_PROGRESS_STATE ? EXAM_IN_PROGRESS_STATE : EXAM_READY_STATE;
  if (phase === 'PlanAndApproval') return 'PlanDrafted';
  if (phase === 'CareInProgress') return TREATMENT_READY_STATE;
  if (phase === 'Discharge') return CHECKOUT_READY_STATE;
  if (phase === 'RecordClosure') return 'RecordCompletionPending';
  throw new ConflictException('Closed visits must use an explicit completion, cancellation, or no-show action.');
}

function nextActionForState(state: VisitState) {
  if (state === 'IntakeInProgress') return 'Complete intake';
  if (state === 'VeterinarianExamReady') return 'Start veterinarian exam';
  if (state === 'VeterinarianExamInProgress') return 'Complete veterinarian exam';
  if (state === 'CheckoutReady') return 'Begin discharge and checkout';
  if (state === 'PaymentComplete') return 'Finalize medical record';
  return null;
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
    vaccinationHistory: input.vaccinationHistory ?? null,
    recentTravel: input.recentTravel ?? null,
    specialDiet: input.specialDiet ?? null,
    supplements: input.supplements ?? null,
    attitude: input.attitude ?? null,
    appearance: input.appearance ?? null,
    allergies: input.allergies ?? null,
    sedationIssues: input.sedationIssues ?? null,
    pastSurgeries: input.pastSurgeries ?? null,
    currentMedications: input.currentMedications ?? null,
    sneezing: input.sneezing ?? false,
    systemicConcerns: input.systemicConcerns ?? null,
    painScore: input.painScore ?? null,
    painScale: input.painScale ?? null,
  };
}

function assertIntakeReadyForCompletion(intake: {
  historyNotes: string | null;
  weight: number | null;
  temperature: number | null;
  heartRate: number | null;
  respiratoryRate: number | null;
  crtSeconds: number | null;
  gumColor: string | null;
} | null) {
  const missing = [
    ['medical history', intake?.historyNotes],
    ['weight', intake?.weight],
    ['temperature', intake?.temperature],
    ['heart rate', intake?.heartRate],
    ['respiratory rate', intake?.respiratoryRate],
    ['capillary refill time', intake?.crtSeconds],
    ['gum color', intake?.gumColor],
  ].filter(([, value]) => value === null || value === undefined || value === '');
  if (missing.length) {
    throw new ConflictException(
      `Complete intake before handoff. Missing: ${missing.map(([label]) => label).join(', ')}.`,
    );
  }
}

function normalizeExamFindingsInput(input: SaveExamFindingsInput) {
  return {
    subjective: input.subjective ?? null,
    objective: input.objective ?? null,
    assessment: input.assessment ?? null,
    plan: input.plan ?? null,
  };
}
