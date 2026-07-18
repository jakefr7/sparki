import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { prisma, type AppointmentSource, type AppointmentState, type Prisma } from '@sparki/db';
import { assertBelongsToOrganization } from '../common/assert-organization-scope';
import type {
  CreateAppointmentInput,
  CreateAppointmentWithNewPatientInput,
  LinkAppointmentPatientInput,
  MoveAppointmentInput,
  UpdateAppointmentNoteInput,
  UpdateConfirmationStatusInput,
  UpdateRecordsPrepStatusInput,
} from './dto/create-appointment.schema';
import { SchedulerConfigService } from '../scheduler-config/scheduler-config.service';
import { AppointmentAvailabilityService } from './appointment-availability.service';
import type { AppointmentAvailabilityInput } from './dto/appointment-availability.schema';
import type { DashboardAppointmentSummary } from '../operations/dto/operations-dashboard.dto';

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
  constructor(
    private readonly schedulerConfig: SchedulerConfigService,
    private readonly appointmentAvailability: AppointmentAvailabilityService,
  ) {}

  availability(organizationId: string, locationId: string, input: AppointmentAvailabilityInput) {
    return this.appointmentAvailability.find(
      organizationId,
      locationId,
      input,
      prisma,
      input.excludeAppointmentId,
    );
  }

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
      const patientClient = await prisma.patientClient.findUnique({
        where: { patientId_clientId: { patientId: patient.id, clientId: input.clientId } },
      });
      if (!patientClient) {
        throw new BadRequestException('The selected client is not linked to this patient.');
      }
    }

    if (input.assignedProviderId) {
      await assertBelongsToOrganization(
        prisma.user,
        'Provider',
        input.assignedProviderId,
        organizationId,
      );
    }

    const appointmentTypeSetting = await prisma.appointmentTypeSetting.findFirst({
      where: {
        organizationId,
        locationId,
        isActive: true,
        ...(input.appointmentTypeId ? { id: input.appointmentTypeId } : { appointmentType: input.appointmentType }),
      },
      include: { providers: true },
    });
    if (!appointmentTypeSetting) throw new BadRequestException('Choose an active appointment type.');
    if (input.assignedProviderId && !appointmentTypeSetting.providers.some((assignment) => assignment.providerId === input.assignedProviderId)) {
      throw new ConflictException(`The selected doctor is not assigned to ${appointmentTypeSetting.name}. Choose another doctor or appointment type.`);
    }
    const duration = appointmentTypeSetting.defaultDurationMinutes;
    return serializableTransaction(async (tx) => {
      const reservation = await this.appointmentAvailability.resolveBooking(
        organizationId,
        locationId,
        appointmentTypeSetting.id,
        input.startTime,
        input.assignedProviderId,
        input.scheduleBlockId,
        tx,
      );
      if (!reservation?.providerId) {
        throw new ConflictException('That appointment time is no longer available.');
      }
      const created = await tx.appointment.create({ data: {
        organizationId,
        locationId,
        patientId: patient.id,
        clientId,
        type: appointmentTypeSetting.appointmentType ?? input.appointmentType,
        appointmentTypeSettingId: appointmentTypeSetting.id,
        reason: input.visitReason,
        source: input.source ?? DEFAULT_SOURCE,
        state: DEFAULT_STATE,
        scheduledAt: input.startTime,
        expectedDurationMinutes: duration,
        colorKey: input.colorKey ?? null,
        providerId: reservation.providerId,
        schedulerSlotTemplateId: reservation.blockId,
        room: reservation.room,
        primaryCareVetName: input.primaryCareVetName ?? null,
        previousClinicName: input.previousClinicName ?? null,
        previousRecordsSource: input.previousRecordsSource ?? null,
        lastSeenAt: input.lastSeenAt ?? null,
        createdById,
      } });
      await tx.appointmentChange.create({
        data: {
          organizationId,
          locationId,
          appointmentId: created.id,
          actorId: createdById,
          action: 'Created',
          before: {},
          after: appointmentChangeSnapshot(created),
        },
      });
      return created;
    });
  }

  /**
   * Anna's receptionist "New Patient" workflow: the scheduler form submits
   * owner + patient + appointment details together, and the clinic has never
   * seen this pet before. Client, Patient, PatientClient, and Appointment are
   * created inside one transaction so a failure anywhere (most commonly the
   * Appointment insert) can never leave an orphaned Client/Patient behind —
   * the previous three-separate-fetches approach could.
   */
  async createWithNewPatient(
    organizationId: string,
    locationId: string,
    createdById: string,
    input: CreateAppointmentWithNewPatientInput,
  ) {
    return serializableTransaction(async (tx) => {
      // Checked inside the transaction (not before it, unlike the plain
      // create() above) so a bad provider rolls back the Client/Patient this
      // same call just created, instead of only guarding writes that hadn't
      // happened yet.
      if (input.appointment.assignedProviderId) {
        await assertBelongsToOrganization(
          tx.user,
          'Provider',
          input.appointment.assignedProviderId,
          organizationId,
        );
      }

      const selectedType = await tx.appointmentTypeSetting.findFirst({
        where: input.appointment.appointmentTypeId
          ? { id: input.appointment.appointmentTypeId, organizationId, locationId, isActive: true }
          : { organizationId, locationId, appointmentType: input.appointment.appointmentType, isActive: true },
        include: { providers: true },
      });
      if (!selectedType) throw new BadRequestException('Choose an active appointment type.');
      if (input.appointment.assignedProviderId && !selectedType.providers.some((assignment) => assignment.providerId === input.appointment.assignedProviderId)) {
        throw new ConflictException(`The selected doctor is not assigned to ${selectedType.name}. Choose another doctor or appointment type.`);
      }

      const reservation = await this.appointmentAvailability.resolveBooking(
        organizationId,
        locationId,
        selectedType.id,
        input.appointment.startTime,
        input.appointment.assignedProviderId,
        input.appointment.scheduleBlockId,
        tx,
      );
      if (!reservation?.providerId) {
        throw new ConflictException('That appointment time is no longer available.');
      }

      const client = await tx.client.create({
        data: {
          organizationId,
          firstName: input.client.firstName,
          lastName: input.client.lastName,
          email: input.client.email ?? null,
          phone: input.client.phone ?? null,
          alternatePhone: input.client.alternatePhone ?? null,
          preferredContactMethod: input.client.preferredContactMethod ?? null,
          addressLine1: input.client.addressLine1 ?? null,
          addressLine2: input.client.addressLine2 ?? null,
          city: input.client.city ?? null,
          state: input.client.state ?? null,
          postalCode: input.client.postalCode ?? null,
          country: input.client.country ?? null,
          formattedAddress: input.client.formattedAddress ?? null,
          addressPlaceId: input.client.addressPlaceId ?? null,
          addressLatitude: input.client.addressLatitude ?? null,
          addressLongitude: input.client.addressLongitude ?? null,
        },
      });

      // Pet last name is inherited from the owner, same as PatientsService.create.
      const patient = await tx.patient.create({
        data: {
          organizationId,
          name: input.patient.name,
          lastName: client.lastName,
          species: input.patient.species,
          breed: input.patient.breed ?? null,
          sex: input.patient.sex ?? null,
          dateOfBirth: input.patient.dateOfBirth ?? null,
          estimatedAge: input.patient.estimatedAge ?? null,
          weight: input.patient.weight ?? null,
          color: input.patient.color ?? null,
        },
      });

      await tx.patientClient.create({
        data: { patientId: patient.id, clientId: client.id, isPrimary: true },
      });

      const created = await tx.appointment.create({
        data: {
          organizationId,
          locationId,
          patientId: patient.id,
          clientId: client.id,
          type: selectedType.appointmentType ?? input.appointment.appointmentType,
          appointmentTypeSettingId: selectedType.id,
          reason: input.appointment.visitReason,
          source: input.appointment.source ?? DEFAULT_SOURCE,
          state: DEFAULT_STATE,
          scheduledAt: input.appointment.startTime,
          expectedDurationMinutes: selectedType.defaultDurationMinutes,
          colorKey: input.appointment.colorKey ?? null,
          providerId: reservation.providerId,
          schedulerSlotTemplateId: reservation.blockId,
          room: reservation.room,
          primaryCareVetName: input.appointment.primaryCareVetName ?? null,
          previousClinicName: input.appointment.previousClinicName ?? null,
          previousRecordsSource: input.appointment.previousRecordsSource ?? null,
          lastSeenAt: input.appointment.lastSeenAt ?? null,
          createdById,
        },
        include: {
          patient: { select: { id: true, name: true, species: true } },
          client: { select: { id: true, firstName: true, lastName: true } },
        },
      });
      await tx.appointmentChange.create({
        data: {
          organizationId,
          locationId,
          appointmentId: created.id,
          actorId: createdById,
          action: 'Created',
          before: {},
          after: appointmentChangeSnapshot(created),
        },
      });
      return created;
    });
  }

  async findById(id: string, organizationId: string, locationId: string) {
    const appointment = await prisma.appointment.findFirst({ where: { id, organizationId, locationId } });
    if (!appointment) {
      throw new NotFoundException(`Appointment ${id} not found`);
    }
    return appointment;
  }

  /** Tech/assistant records-research tracking — see prisma/schema.prisma's
   *  Appointment.recordsPrepStatus comment. */
  async updateRecordsPrepStatus(
    id: string,
    organizationId: string,
    locationId: string,
    input: UpdateRecordsPrepStatusInput,
  ) {
    const appointment = await this.findById(id, organizationId, locationId);
    assertAppointmentNotHistorical(appointment);
    return prisma.appointment.update({
      where: { id },
      data: { recordsPrepStatus: input.recordsPrepStatus },
    });
  }

  /** Manual confirmation/reminder status only — no message is ever actually
   *  sent by this call. See prisma/schema.prisma's Appointment.
   *  confirmationStatus comment. */
  async updateConfirmationStatus(
    id: string,
    organizationId: string,
    locationId: string,
    input: UpdateConfirmationStatusInput,
  ) {
    const appointment = await this.findById(id, organizationId, locationId);
    assertAppointmentNotHistorical(appointment);
    return prisma.appointment.update({
      where: { id },
      data: { confirmationStatus: input.confirmationStatus },
    });
  }

  async linkPatient(id: string, organizationId: string, locationId: string, input: LinkAppointmentPatientInput) {
    const appointment = await this.findById(id, organizationId, locationId);
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

  async move(
    id: string,
    organizationId: string,
    locationId: string,
    actorId: string,
    input: MoveAppointmentInput,
  ) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (input.startTime < today) {
      throw new ConflictException('This appointment can’t be moved to a past date.');
    }
    return serializableTransaction(async (tx) => {
      const appointment = await tx.appointment.findFirst({
        where: { id, organizationId, locationId },
        include: { appointmentTypeSetting: { include: { providers: true } } },
      });
      if (!appointment) throw new NotFoundException(`Appointment ${id} not found`);
      if (!['Scheduled', 'PreVisitPending', 'Confirmed'].includes(appointment.state)) {
        throw new ConflictException(`A ${appointment.state} appointment cannot be rescheduled.`);
      }
      if (appointment.scheduledAt < today) {
        throw new ConflictException('Historical appointments cannot be rescheduled.');
      }

      const setting = input.appointmentTypeId
        ? await tx.appointmentTypeSetting.findFirst({
            where: { id: input.appointmentTypeId, organizationId, locationId, isActive: true },
            include: { providers: true },
          })
        : appointment.appointmentTypeSetting?.isActive
          ? appointment.appointmentTypeSetting
          : await tx.appointmentTypeSetting.findFirst({
              where: { organizationId, locationId, appointmentType: appointment.type, isActive: true },
              include: { providers: true },
            });
      if (!setting) throw new ConflictException('This appointment has no active appointment style and cannot be moved.');

      const providerId = input.assignedProviderId === undefined
        ? appointment.providerId ?? undefined
        : input.assignedProviderId ?? undefined;
      if (!providerId) throw new ConflictException('Assign a provider before moving this appointment.');
      if (!setting.providers.some((assignment) => assignment.providerId === providerId)) {
        throw new ConflictException(`${setting.name} cannot be scheduled with the selected provider.`);
      }

      const reservation = await this.appointmentAvailability.resolveBooking(
        organizationId,
        locationId,
        setting.id,
        input.startTime,
        providerId,
        input.scheduleBlockId,
        tx,
        appointment.id,
      );
      if (!reservation) {
        throw new ConflictException('That time is unavailable because it is outside an eligible block or conflicts with another appointment.');
      }

      const updated = await tx.appointment.update({
        where: { id },
        data: {
          scheduledAt: input.startTime,
          expectedDurationMinutes: appointment.expectedDurationMinutes ?? setting.defaultDurationMinutes,
          providerId,
          appointmentTypeSettingId: setting.id,
          type: setting.appointmentType ?? appointment.type,
          schedulerSlotTemplateId: reservation.blockId,
          room: reservation.room,
          ...(input.note !== undefined ? { reason: input.note || appointment.reason } : {}),
        },
        include: { patient: true, client: true, provider: true, appointmentTypeSetting: true },
      });
      await tx.appointmentChange.create({
        data: {
          organizationId,
          locationId,
          appointmentId: appointment.id,
          actorId,
          action: 'Rescheduled',
          reason: input.reason ?? null,
          before: appointmentChangeSnapshot(appointment),
          after: appointmentChangeSnapshot(updated),
        },
      });
      return updated;
    });
  }

  async updateNote(id: string, organizationId: string, locationId: string, input: UpdateAppointmentNoteInput) {
    const appointment = await prisma.appointment.findFirst({ where: { id, organizationId, locationId } });
    if (!appointment) throw new NotFoundException(`Appointment ${id} not found`);
    assertAppointmentNotHistorical(appointment);
    return prisma.appointment.update({
      where: { id },
      data: { reason: input.note || appointment.type },
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
      include: {
        patient: true,
        client: true,
        provider: true,
        appointmentTypeSetting: { include: { providers: true } },
      },
      orderBy: { scheduledAt: 'asc' },
    });
  }

  /** Complete appointment feed for the scheduler's visible date range. */
  async listForScheduleRange(
    organizationId: string,
    locationId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<DashboardAppointmentSummary[]> {
    const appointments = await prisma.appointment.findMany({
      where: {
        organizationId,
        locationId,
        scheduledAt: { gte: startDate, lt: endDate },
      },
      include: {
        patient: true,
        client: true,
        provider: true,
        appointmentTypeSetting: { include: { providers: true } },
      },
      orderBy: { scheduledAt: 'asc' },
    });

    return appointments.map((appointment) => ({
      id: appointment.id,
      appointmentTypeSettingId: appointment.appointmentTypeSettingId,
      type: appointment.appointmentTypeSetting?.name ?? appointment.type,
      reason: appointment.reason,
      state: appointment.state,
      scheduledAt: appointment.scheduledAt,
      expectedDurationMinutes: appointment.expectedDurationMinutes,
      colorKey: appointment.colorKey ?? appointment.appointmentTypeSetting?.color ?? null,
      patient: appointment.patient
        ? {
            id: appointment.patient.id,
            name: appointment.patient.name,
            species: appointment.patient.species,
            imageUrl: appointment.patient.imageUrl,
          }
        : null,
      client: appointment.client
        ? {
            id: appointment.client.id,
            firstName: appointment.client.firstName,
            lastName: appointment.client.lastName,
          }
        : null,
      provider: appointment.provider
        ? {
            id: appointment.provider.id,
            displayName:
              appointment.provider.displayName ??
              `${appointment.provider.firstName} ${appointment.provider.lastName}`,
            role: appointment.provider.role,
          }
        : null,
      primaryCareVetName: appointment.primaryCareVetName,
      previousClinicName: appointment.previousClinicName,
      previousRecordsSource: appointment.previousRecordsSource,
      lastSeenAt: appointment.lastSeenAt,
      recordsPrepStatus: appointment.recordsPrepStatus,
      confirmationStatus: appointment.confirmationStatus,
      room: appointment.room,
      schedulerSlotTemplateId: appointment.schedulerSlotTemplateId,
      schedulingIssue: schedulingIssueFor(appointment),
    }));
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

  async confirm(id: string, organizationId: string, locationId: string, actorId: string) {
    return this.transitionTo(id, organizationId, locationId, actorId, 'Confirmed');
  }

  async markArrived(id: string, organizationId: string, locationId: string, actorId: string) {
    return this.transitionTo(id, organizationId, locationId, actorId, 'Arrived');
  }

  async cancel(id: string, organizationId: string, locationId: string, actorId: string, reason: string) {
    return this.transitionTo(id, organizationId, locationId, actorId, 'Cancelled', reason);
  }

  async markNoShow(id: string, organizationId: string, locationId: string, actorId: string) {
    return this.transitionTo(id, organizationId, locationId, actorId, 'NoShow');
  }

  async history(id: string, organizationId: string, locationId: string) {
    await this.findById(id, organizationId, locationId);
    return prisma.appointmentChange.findMany({
      where: { appointmentId: id, organizationId, locationId },
      include: {
        actor: { select: { id: true, firstName: true, lastName: true, displayName: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  private async transitionTo(
    id: string,
    organizationId: string,
    locationId: string,
    actorId: string,
    targetState: keyof typeof ALLOWED_PREDECESSORS,
    reason?: string,
  ) {
    const appointment = await this.findById(id, organizationId, locationId);
    assertAppointmentNotHistorical(appointment);
    const allowedPredecessors = ALLOWED_PREDECESSORS[targetState];

    if (!allowedPredecessors.includes(appointment.state)) {
      throw new ConflictException(
        `Appointment ${id} cannot move from ${appointment.state} to ${targetState}`,
      );
    }

    return prisma.$transaction(async (tx) => {
      const changed = await tx.appointment.updateMany({
        where: { id, organizationId, locationId, state: appointment.state },
        data: { state: targetState },
      });
      if (changed.count !== 1) {
        throw new ConflictException('This appointment changed while you were viewing it. Refresh and try again.');
      }
      const updated = await tx.appointment.findUniqueOrThrow({ where: { id } });
      await tx.appointmentChange.create({
        data: {
          organizationId,
          locationId,
          appointmentId: id,
          actorId,
          action: targetState,
          reason: reason ?? null,
          before: appointmentChangeSnapshot(appointment),
          after: appointmentChangeSnapshot(updated),
        },
      });
      return updated;
    });
  }
}

function appointmentChangeSnapshot(appointment: {
  scheduledAt: Date;
  expectedDurationMinutes: number | null;
  providerId: string | null;
  appointmentTypeSettingId: string | null;
  schedulerSlotTemplateId: string | null;
  room: string | null;
  state: string;
}) {
  return {
    scheduledAt: appointment.scheduledAt.toISOString(),
    expectedDurationMinutes: appointment.expectedDurationMinutes,
    providerId: appointment.providerId,
    appointmentTypeSettingId: appointment.appointmentTypeSettingId,
    schedulerSlotTemplateId: appointment.schedulerSlotTemplateId,
    room: appointment.room,
    state: appointment.state,
  };
}

function schedulingIssueFor(appointment: {
  scheduledAt: Date;
  state: string;
  providerId: string | null;
  schedulerSlotTemplateId: string | null;
  appointmentTypeSetting: { isActive: boolean; providers: Array<{ providerId: string }> } | null;
}): string | null {
  if (appointment.scheduledAt < new Date()) return null;
  if (!['Scheduled', 'PreVisitPending', 'Confirmed', 'Arrived', 'VisitCreated'].includes(appointment.state)) return null;
  if (!appointment.appointmentTypeSetting?.isActive) return 'Appointment style is inactive';
  if (!appointment.providerId) return 'Provider is not assigned';
  if (!appointment.appointmentTypeSetting.providers.some(({ providerId }) => providerId === appointment.providerId)) {
    return 'Provider is not eligible for this appointment style';
  }
  if (!appointment.schedulerSlotTemplateId) return 'Schedule block is not assigned';
  return null;
}

async function serializableTransaction<T>(
  work: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await prisma.$transaction(work, { isolationLevel: 'Serializable' });
    } catch (caught) {
      const code = typeof caught === 'object' && caught && 'code' in caught
        ? String((caught as { code?: unknown }).code)
        : null;
      if (code !== 'P2034') throw caught;
    }
  }
  throw new ConflictException('That schedule changed while you were booking. Please choose the time again.');
}

function assertAppointmentNotHistorical(appointment: { scheduledAt: Date }) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (appointment.scheduledAt < today) {
    throw new ConflictException('Historical appointments are read-only.');
  }
}
