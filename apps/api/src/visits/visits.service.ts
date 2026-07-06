import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { prisma, type AppointmentType, type VisitState, type VisitType } from '@sparki/db';
import { AppointmentsService } from '../appointments/appointments.service';
import { PatientsService } from '../patients/patients.service';
import type { CreateVisitInput } from './dto/create-visit.schema';

const visitInclude = { patient: true, client: true, appointment: true };

/**
 * States that represent a closed episode of care (see
 * docs/specs/modules/02-visit-lifecycle-mvp.md "Terminal States"). Anything
 * not in this set counts as "active" for duplicate-Visit prevention.
 */
const TERMINAL_VISIT_STATES: VisitState[] = [
  'Archived',
  'ArchivedWithExceptions',
  'Cancelled',
  'CancelledAfterArrival',
  'NoShow',
  'Rescheduled',
  'Referred',
  'Deferred',
];

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
  async create(organizationId: string, locationId: string, input: CreateVisitInput) {
    let patientId: string;
    let clientId: string | null;
    let reason: string;
    let visitType: VisitType;
    let appointmentId: string | null = null;

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
}
