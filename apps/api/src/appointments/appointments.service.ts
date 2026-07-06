import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { prisma, type AppointmentSource, type AppointmentState } from '@sparki/db';
import type { CreateAppointmentInput } from './dto/create-appointment.schema';

/**
 * This slice creates appointments directly as committed bookings from
 * Patient Workspace, not the phone-call Draft flow docs/specs/modules/
 * 04-scheduling-mvp.md also describes — so every appointment created here
 * starts `Scheduled`, not `Draft`.
 */
const DEFAULT_STATE: AppointmentState = 'Scheduled';

/**
 * AppointmentSource has no literal "manual" value; `Phone` is the closest of
 * the two the product spec named, and matches the receptionist phone-booking
 * flow the scheduling spec centers ownership on.
 */
const DEFAULT_SOURCE: AppointmentSource = 'Phone';

const UPCOMING_EXCLUDED_STATES: AppointmentState[] = ['Cancelled', 'NoShow', 'Completed'];

/**
 * The four explicit transition actions this module exposes, mapped to the
 * states each may start from — the subset of docs/specs/modules/
 * 04-scheduling-mvp.md's "Valid State Transitions" those actions need.
 * `Reschedule` is deliberately not included: the spec requires preserving
 * "original appointment reference" and "reschedule history", which needs a
 * new Appointment row linked to this one — there's no such field or
 * creation path yet, so a real reschedule is out of scope here (see task
 * summary).
 */
const ALLOWED_PREDECESSORS: Record<
  'Confirmed' | 'Arrived' | 'Cancelled' | 'NoShow',
  AppointmentState[]
> = {
  Confirmed: ['Scheduled', 'PreVisitPending'],
  Arrived: ['Scheduled', 'PreVisitPending', 'Confirmed'],
  Cancelled: ['Draft', 'Scheduled', 'PreVisitPending', 'Confirmed', 'Arrived', 'VisitCreated'],
  NoShow: ['Scheduled', 'Confirmed', 'Arrived'],
};

@Injectable()
export class AppointmentsService {
  async create(
    organizationId: string,
    locationId: string,
    createdById: string,
    input: CreateAppointmentInput,
  ) {
    const patient = await prisma.patient.findFirst({
      where: { id: input.patientId, organizationId },
      include: { clients: { where: { isPrimary: true }, include: { client: true } } },
    });
    if (!patient) {
      throw new NotFoundException(`Patient ${input.patientId} not found`);
    }

    const clientId = input.clientId ?? patient.clients[0]?.client.id ?? null;
    if (input.clientId) {
      const client = await prisma.client.findFirst({
        where: { id: input.clientId, organizationId },
      });
      if (!client) {
        throw new BadRequestException(
          `Client ${input.clientId} not found in organization ${organizationId}`,
        );
      }
    }

    if (input.assignedProviderId) {
      const provider = await prisma.user.findFirst({
        where: { id: input.assignedProviderId, organizationId },
      });
      if (!provider) {
        throw new BadRequestException(
          `Provider ${input.assignedProviderId} not found in organization ${organizationId}`,
        );
      }
    }

    return prisma.appointment.create({
      data: {
        organizationId,
        locationId,
        patientId: patient.id,
        clientId,
        type: input.appointmentType,
        reason: input.visitReason,
        source: DEFAULT_SOURCE,
        state: DEFAULT_STATE,
        scheduledAt: input.startTime,
        expectedDurationMinutes: input.expectedDurationMinutes ?? null,
        providerId: input.assignedProviderId ?? null,
        createdById,
      },
    });
  }

  async findById(id: string, organizationId: string) {
    const appointment = await prisma.appointment.findFirst({ where: { id, organizationId } });
    if (!appointment) {
      throw new NotFoundException(`Appointment ${id} not found`);
    }
    return appointment;
  }

  async listUpcomingForPatient(patientId: string, organizationId: string, limit = 5) {
    return prisma.appointment.findMany({
      where: {
        patientId,
        organizationId,
        scheduledAt: { gte: new Date() },
        state: { notIn: UPCOMING_EXCLUDED_STATES },
      },
      orderBy: { scheduledAt: 'asc' },
      take: limit,
    });
  }

  async confirm(id: string, organizationId: string) {
    return this.transitionTo(id, organizationId, 'Confirmed');
  }

  async markArrived(id: string, organizationId: string) {
    return this.transitionTo(id, organizationId, 'Arrived');
  }

  async cancel(id: string, organizationId: string) {
    return this.transitionTo(id, organizationId, 'Cancelled');
  }

  async markNoShow(id: string, organizationId: string) {
    return this.transitionTo(id, organizationId, 'NoShow');
  }

  private async transitionTo(
    id: string,
    organizationId: string,
    targetState: keyof typeof ALLOWED_PREDECESSORS,
  ) {
    const appointment = await this.findById(id, organizationId);
    const allowedPredecessors = ALLOWED_PREDECESSORS[targetState];

    if (!allowedPredecessors.includes(appointment.state)) {
      throw new ConflictException(
        `Appointment ${id} cannot move from ${appointment.state} to ${targetState}`,
      );
    }

    return prisma.appointment.update({ where: { id }, data: { state: targetState } });
  }
}
