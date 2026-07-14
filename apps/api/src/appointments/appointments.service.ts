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
    return this.appointmentAvailability.find(organizationId, locationId, input);
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
    return prisma.$transaction(async (tx) => {
      const available = await this.appointmentAvailability.isAvailable(
        organizationId,
        locationId,
        appointmentTypeSetting.id,
        input.startTime,
        input.assignedProviderId,
        tx,
      );
      if (!available) {
        throw new ConflictException('That appointment time is no longer available.');
      }
      return tx.appointment.create({ data: {
        organizationId,
        locationId,
        patientId: patient.id,
        clientId,
        type: input.appointmentType,
        appointmentTypeSettingId: appointmentTypeSetting.id,
        reason: input.visitReason,
        source: DEFAULT_SOURCE,
        state: DEFAULT_STATE,
        scheduledAt: input.startTime,
        expectedDurationMinutes: duration,
        colorKey: input.colorKey ?? null,
        providerId: input.assignedProviderId ?? null,
        primaryCareVetName: input.primaryCareVetName ?? null,
        previousClinicName: input.previousClinicName ?? null,
        previousRecordsSource: input.previousRecordsSource ?? null,
        lastSeenAt: input.lastSeenAt ?? null,
        createdById,
      } });
    }, { isolationLevel: 'Serializable' });
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
    return prisma.$transaction(async (tx) => {
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

      const available = await this.appointmentAvailability.isAvailable(
        organizationId,
        locationId,
        selectedType.id,
        input.appointment.startTime,
        input.appointment.assignedProviderId,
        tx,
      );
      if (!available) {
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

      return tx.appointment.create({
        data: {
          organizationId,
          locationId,
          patientId: patient.id,
          clientId: client.id,
          type: input.appointment.appointmentType,
          appointmentTypeSettingId: selectedType.id,
          reason: input.appointment.visitReason,
          source: DEFAULT_SOURCE,
          state: DEFAULT_STATE,
          scheduledAt: input.appointment.startTime,
          expectedDurationMinutes: selectedType.defaultDurationMinutes,
          colorKey: input.appointment.colorKey ?? null,
          providerId: input.appointment.assignedProviderId ?? null,
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
    }, { isolationLevel: 'Serializable' });
  }

  async findById(id: string, organizationId: string) {
    const appointment = await prisma.appointment.findFirst({ where: { id, organizationId } });
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
    input: UpdateRecordsPrepStatusInput,
  ) {
    await this.findById(id, organizationId);
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
    input: UpdateConfirmationStatusInput,
  ) {
    await this.findById(id, organizationId);
    return prisma.appointment.update({
      where: { id },
      data: { confirmationStatus: input.confirmationStatus },
    });
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
      include: { patient: true, client: true, provider: true, appointmentTypeSetting: true },
    });
  }

  async updateNote(id: string, organizationId: string, locationId: string, input: UpdateAppointmentNoteInput) {
    const appointment = await prisma.appointment.findFirst({ where: { id, organizationId, locationId } });
    if (!appointment) throw new NotFoundException(`Appointment ${id} not found`);
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
      include: { patient: true, client: true, provider: true, appointmentTypeSetting: true },
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
