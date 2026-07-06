import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { prisma, type AppointmentType, type VisitType } from '@sparki/db';
import { AppointmentsService } from '../appointments/appointments.service';
import { PatientsService } from '../patients/patients.service';
import type { CreateVisitInput } from './dto/create-visit.schema';
import {
  INTAKE_IN_PROGRESS_STATE,
  STARTABLE_VISIT_STATES,
  TERMINAL_VISIT_STATES,
} from './visit-states';

const visitInclude = {
  patient: true,
  client: true,
  appointment: true,
  primaryVeterinarian: true,
  assignedTechnician: true,
  currentOwner: true,
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
      const appointment = await this.appointments.findById(input.appointmentId, organizationId);

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
      const client = await prisma.client.findFirst({ where: { id: clientId, organizationId } });
      if (!client) {
        throw new BadRequestException(
          `Client ${clientId} not found in organization ${organizationId}`,
        );
      }
    } else {
      const primary =
        patient.clients.find((patientClient) => patientClient.isPrimary) ?? patient.clients[0];
      clientId = primary?.client.id ?? null;
    }

    if (primaryVeterinarianId) {
      await this.assertStaffBelongsToOrganization(primaryVeterinarianId, organizationId);
    }
    if (input.assignedTechnicianId) {
      await this.assertStaffBelongsToOrganization(input.assignedTechnicianId, organizationId);
    }

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

  private async assertStaffBelongsToOrganization(
    userId: string,
    organizationId: string,
  ): Promise<void> {
    const staff = await prisma.user.findFirst({ where: { id: userId, organizationId } });
    if (!staff) {
      throw new BadRequestException(`Staff member ${userId} not found in organization ${organizationId}`);
    }
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
}
