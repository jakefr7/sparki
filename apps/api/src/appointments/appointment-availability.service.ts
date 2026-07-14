import { Injectable } from '@nestjs/common';
import { prisma, type Prisma } from '@sparki/db';
import type { AppointmentAvailabilityInput } from './dto/appointment-availability.schema';

const BOOKED_STATES = ['Scheduled', 'PreVisitPending', 'Confirmed', 'Arrived', 'VisitCreated'] as const;

type DbClient = typeof prisma | Prisma.TransactionClient;

export interface AppointmentAvailabilitySlot {
  start: string;
  end: string;
  providerId: string | null;
  room: string | null;
  blockId: string;
  recommended: boolean;
}

function minutes(value: string) {
  const [hours, mins] = value.split(':').map(Number);
  return hours! * 60 + mins!;
}

function atLocalMinutes(day: Date, value: number) {
  const result = new Date(day);
  result.setHours(Math.floor(value / 60), value % 60, 0, 0);
  return result;
}

function overlaps(start: Date, end: Date, otherStart: Date, otherEnd: Date) {
  return start < otherEnd && end > otherStart;
}

@Injectable()
export class AppointmentAvailabilityService {
  async find(
    organizationId: string,
    locationId: string,
    input: AppointmentAvailabilityInput,
    db: DbClient = prisma,
  ) {
    const rangeStart = new Date(input.startDate);
    rangeStart.setHours(0, 0, 0, 0);
    const rangeEnd = new Date(input.endDate);
    rangeEnd.setHours(23, 59, 59, 999);

    const appointmentType = await db.appointmentTypeSetting.findFirst({
      where: { id: input.appointmentTypeId, organizationId, locationId, isActive: true },
      include: { providers: true },
    });
    if (!appointmentType) return { durationMinutes: 0, slotIntervalMinutes: 30, providers: [], slots: [], configurationError: 'APPOINTMENT_TYPE_UNAVAILABLE' };
    const durationMinutes = appointmentType.defaultDurationMinutes;
    const assignedProviderIds = appointmentType.providers.map((assignment) => assignment.providerId);
    if (assignedProviderIds.length === 0) return { durationMinutes, slotIntervalMinutes: 30, providers: [], slots: [], configurationError: 'NO_ASSIGNED_PROVIDERS' };
    if (input.providerId && !assignedProviderIds.includes(input.providerId)) return { durationMinutes, slotIntervalMinutes: 30, providers: [], slots: [], configurationError: 'PROVIDER_NOT_ASSIGNED' };

    const [settings, templates, appointments, providers] = await Promise.all([
      db.schedulerSettings.findUnique({ where: { locationId } }),
      db.schedulerSlotTemplate.findMany({
        where: {
          organizationId,
          locationId,
          isActive: true,
          deletedAt: null,
          ...(input.providerId
            ? { OR: [{ staffId: input.providerId }, { staffId: null }] }
            : {}),
        },
        orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
      }),
      db.appointment.findMany({
        where: {
          organizationId,
          locationId,
          scheduledAt: { gte: rangeStart, lte: rangeEnd },
          state: { in: [...BOOKED_STATES] },
        },
        select: { scheduledAt: true, expectedDurationMinutes: true, providerId: true, appointmentTypeSetting: { select: { defaultDurationMinutes: true } } },
      }),
      db.user.findMany({
        where: {
          organizationId,
          isActive: true,
          staffProfile: { canReceiveAppointments: true },
          organizationMemberships: { some: { organizationId, isActive: true } },
          clinicLocationAccess: { some: { organizationId, clinicLocationId: locationId, isActive: true } },
          id: input.providerId ?? { in: assignedProviderIds },
        },
        select: { id: true, displayName: true, firstName: true, lastName: true, role: true },
      }),
    ]);

    const interval = settings?.slotIntervalMinutes ?? 30;
    const providerIds = new Set(providers.map((provider) => provider.id));
    const slots: AppointmentAvailabilitySlot[] = [];
    const now = new Date();

    for (const template of templates) {
      const day = new Date(rangeStart);
      while (day <= rangeEnd) {
        if (day.getDay() === template.dayOfWeek) {
          const eligibleProviders = template.staffId
            ? providerIds.has(template.staffId)
              ? [template.staffId]
              : []
            : input.providerId
              ? providerIds.has(input.providerId)
                ? [input.providerId]
                : []
              : [...providerIds];

          for (const providerId of eligibleProviders) {
            for (
              let cursor = minutes(template.startTime);
              cursor + durationMinutes <= minutes(template.endTime);
              cursor += interval
            ) {
              const start = atLocalMinutes(day, cursor);
              const end = new Date(start.getTime() + durationMinutes * 60_000);
              if (start <= now) continue;
              const conflict = appointments.some((appointment) => {
                if (appointment.providerId && appointment.providerId !== providerId) return false;
                const appointmentEnd = new Date(
                  appointment.scheduledAt.getTime() +
                    (appointment.expectedDurationMinutes ?? appointment.appointmentTypeSetting?.defaultDurationMinutes ?? 0) * 60_000,
                );
                return overlaps(start, end, appointment.scheduledAt, appointmentEnd);
              });
              if (!conflict) {
                slots.push({
                  start: start.toISOString(),
                  end: end.toISOString(),
                  providerId,
                  room: template.room,
                  blockId: template.id,
                  recommended: false,
                });
              }
            }
          }
        }
        day.setDate(day.getDate() + 1);
      }
    }

    const unique = [...new Map(slots.map((slot) => [`${slot.start}:${slot.providerId}`, slot])).values()]
      .sort((a, b) => a.start.localeCompare(b.start));
    if (unique[0]) unique[0].recommended = true;
    return { durationMinutes, slotIntervalMinutes: interval, providers, slots: unique };
  }

  async isAvailable(
    organizationId: string,
    locationId: string,
    appointmentTypeId: string,
    startTime: Date,
    providerId: string | undefined,
    db: DbClient = prisma,
  ) {
    const result = await this.find(
      organizationId,
      locationId,
      {
        appointmentTypeId,
        providerId,
        startDate: startTime,
        endDate: startTime,
      },
      db,
    );
    return result.slots.some(
      (slot) => slot.start === startTime.toISOString() && (!providerId || slot.providerId === providerId),
    );
  }
}
