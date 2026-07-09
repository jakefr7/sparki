import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { prisma, type AppointmentSource, type AppointmentState } from '@sparki/db';
import { assertBelongsToOrganization } from '../common/assert-organization-scope';
import type {
  CreateAppointmentInput,
  LinkAppointmentPatientInput,
  MoveAppointmentInput,
} from './dto/create-appointment.schema';
import { SchedulerConfigService } from '../scheduler-config/scheduler-config.service';

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

/** [start of day, start of next day) in local server time, for "today" queries. */
function dayBoundsFor(date: Date): { start: Date; end: Date } {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start, end };
}

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
  constructor(private readonly schedulerConfig: SchedulerConfigService) {}

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
      await assertBelongsToOrganization(prisma.client, 'Client', input.clientId, organizationId);
    }

    if (input.assignedProviderId) {
      await assertBelongsToOrganization(
        prisma.user,
        'Provider',
        input.assignedProviderId,
        organizationId,
      );
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
        colorKey: input.colorKey ?? null,
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

  async linkPatient(id: string, organizationId: string, input: LinkAppointmentPatientInput) {
    const appointment = await this.findById(id, organizationId);
    const patient = await prisma.patient.findFirst({
      where: { id: input.patientId, organizationId },
      include: { clients: { where: { isPrimary: true }, include: { client: true } } },
    });

    if (!patient) {
      throw new NotFoundException(`Patient ${input.patientId} not found`);
    }

    if (appointment.patientId && appointment.patientId !== patient.id) {
      throw new ConflictException(`Appointment ${id} already has a patient`);
    }

    const clientId = input.clientId ?? patient.clients[0]?.client.id ?? null;
    if (input.clientId) {
      await assertBelongsToOrganization(prisma.client, 'Client', input.clientId, organizationId);
    }

    if (appointment.clientId && clientId && appointment.clientId !== clientId) {
      throw new BadRequestException(`Appointment ${id} belongs to a different client`);
    }

    return prisma.appointment.update({
      where: { id },
      data: {
        patientId: patient.id,
        clientId: appointment.clientId ?? clientId,
      },
    });
  }

  async move(id: string, organizationId: string, locationId: string, input: MoveAppointmentInput) {
    const appointment = await prisma.appointment.findFirst({
      where: { id, organizationId, locationId },
    });
    if (!appointment) {
      throw new NotFoundException(`Appointment ${id} not found`);
    }

    if (input.assignedProviderId) {
      await assertBelongsToOrganization(
        prisma.user,
        'Provider',
        input.assignedProviderId,
        organizationId,
      );
    }

    return prisma.appointment.update({
      where: { id },
      data: {
        scheduledAt: input.startTime,
        expectedDurationMinutes:
          input.expectedDurationMinutes ?? appointment.expectedDurationMinutes,
        providerId:
          input.assignedProviderId === undefined
            ? appointment.providerId
            : input.assignedProviderId || null,
      },
      include: { patient: true, client: true, provider: true },
    });
  }

  resolveColor(
    organizationId: string,
    locationId: string,
    appointmentType: CreateAppointmentInput['appointmentType'],
    manualColor: string | null | undefined,
  ) {
    return this.schedulerConfig.resolveAppointmentColor(
      organizationId,
      locationId,
      appointmentType,
      manualColor,
    );
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

  /** All appointments scheduled for "today" (local server day) across the
   *  organization — the Command Center's day-at-a-glance list. */
  async listTodayForOrganization(organizationId: string) {
    const { start, end } = dayBoundsFor(new Date());
    return prisma.appointment.findMany({
      where: { organizationId, scheduledAt: { gte: start, lt: end } },
      include: { patient: true, client: true, provider: true },
      orderBy: { scheduledAt: 'asc' },
    });
  }

  /** Org-wide sibling of listUpcomingForPatient, for dashboards that aren't
   *  scoped to one Patient. */
  async listUpcomingForOrganization(organizationId: string, limit = 10) {
    return prisma.appointment.findMany({
      where: {
        organizationId,
        scheduledAt: { gte: new Date() },
        state: { notIn: UPCOMING_EXCLUDED_STATES },
      },
      include: { patient: true, client: true, provider: true },
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
