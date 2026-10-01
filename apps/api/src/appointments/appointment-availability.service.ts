import { Injectable } from '@nestjs/common';
import { prisma, type Prisma } from '@sparki/db';
import type { AppointmentAvailabilityInput } from './dto/appointment-availability.schema';

const BOOKED_STATES = [
  'Scheduled',
  'PreVisitPending',
  'Confirmed',
  'Arrived',
  'VisitCreated',
] as const;

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

function zonedParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value);
  return {
    year: value('year'),
    month: value('month'),
    day: value('day'),
    hour: value('hour'),
    minute: value('minute'),
  };
}

function atZonedMinutes(day: Date, value: number, timeZone: string) {
  const desired = Date.UTC(
    day.getUTCFullYear(),
    day.getUTCMonth(),
    day.getUTCDate(),
    Math.floor(value / 60),
    value % 60,
  );
  let result = new Date(desired);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const actual = zonedParts(result, timeZone);
    const actualClock = Date.UTC(
      actual.year,
      actual.month - 1,
      actual.day,
      actual.hour,
      actual.minute,
    );
    result = new Date(result.getTime() + desired - actualClock);
  }
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
    excludeAppointmentId?: string,
  ) {
    const queryStart = new Date(input.startDate.getTime() - 24 * 60 * 60 * 1000);
    const queryEnd = new Date(input.endDate.getTime() + 24 * 60 * 60 * 1000);

    const appointmentType = await db.appointmentTypeSetting.findFirst({
      where: { id: input.appointmentTypeId, organizationId, locationId, isActive: true },
      include: { providers: true },
    });
    if (!appointmentType)
      return {
        durationMinutes: 0,
        slotIntervalMinutes: 30,
        providers: [],
        slots: [],
        configurationError: 'APPOINTMENT_TYPE_UNAVAILABLE',
      };
    const durationMinutes = appointmentType.defaultDurationMinutes;
    const assignedProviderIds = appointmentType.providers.map(
      (assignment) => assignment.providerId,
    );
    if (assignedProviderIds.length === 0)
      return {
        durationMinutes,
        slotIntervalMinutes: 30,
        providers: [],
        slots: [],
        configurationError: 'NO_ASSIGNED_PROVIDERS',
      };
    if (input.providerId && !assignedProviderIds.includes(input.providerId))
      return {
        durationMinutes,
        slotIntervalMinutes: 30,
        providers: [],
        slots: [],
        configurationError: 'PROVIDER_NOT_ASSIGNED',
      };

    const restrictionCount = await db.appointmentTypeSlotTemplate.count({
      where: { appointmentTypeId: appointmentType.id },
    });
    const hasBlockRestrictions = restrictionCount > 0;
    if (hasBlockRestrictions) {
      const activeBlockCount = await db.appointmentTypeSlotTemplate.count({
        where: {
          appointmentTypeId: appointmentType.id,
          slotTemplate: { organizationId, locationId, isActive: true, deletedAt: null },
        },
      });
      if (activeBlockCount === 0) {
        return {
          durationMinutes,
          slotIntervalMinutes: 30,
          providers: [],
          slots: [],
          configurationError: 'NO_ACTIVE_ASSIGNED_BLOCKS',
        };
      }
    }

    const [settings, location, templates, appointments, providers, dateExceptions] =
      await Promise.all([
        db.schedulerSettings.findUnique({ where: { locationId } }),
        db.location.findFirst({
          where: { id: locationId, organizationId },
          select: { timeZone: true },
        }),
        db.schedulerSlotTemplate.findMany({
          where: {
            organizationId,
            locationId,
            isActive: true,
            deletedAt: null,
            ...(hasBlockRestrictions
              ? {
                  isGeneralAvailability: false,
                  appointmentTypes: { some: { appointmentTypeId: appointmentType.id } },
                }
              : { isGeneralAvailability: true }),
            ...(input.providerId ? { OR: [{ staffId: input.providerId }, { staffId: null }] } : {}),
          },
          orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
        }),
        db.appointment.findMany({
          where: {
            organizationId,
            locationId,
            ...(excludeAppointmentId ? { id: { not: excludeAppointmentId } } : {}),
            scheduledAt: { gte: queryStart, lte: queryEnd },
            state: { in: [...BOOKED_STATES] },
          },
          select: {
            scheduledAt: true,
            expectedDurationMinutes: true,
            providerId: true,
            room: true,
            appointmentTypeSetting: { select: { defaultDurationMinutes: true } },
          },
        }),
        db.user.findMany({
          where: {
            organizationId,
            isActive: true,
            staffProfile: { canReceiveAppointments: true },
            organizationMemberships: { some: { organizationId, isActive: true } },
            clinicLocationAccess: {
              some: { organizationId, clinicLocationId: locationId, isActive: true },
            },
            id: input.providerId ?? { in: assignedProviderIds },
          },
          select: { id: true, displayName: true, firstName: true, lastName: true, role: true },
        }),
        db.schedulerDateException.findMany({
          where: {
            organizationId,
            locationId,
            deletedAt: null,
            date: {
              gte: queryStart.toISOString().slice(0, 10),
              lte: queryEnd.toISOString().slice(0, 10),
            },
          },
        }),
      ]);

    const interval = settings?.slotIntervalMinutes ?? 30;
    const timeZone = location?.timeZone ?? 'America/Chicago';
    const first = zonedParts(input.startDate, timeZone);
    const last = zonedParts(input.endDate, timeZone);
    const firstDay = new Date(Date.UTC(first.year, first.month - 1, first.day, 12));
    const lastDay = new Date(Date.UTC(last.year, last.month - 1, last.day, 12));
    const providerIds = new Set(providers.map((provider) => provider.id));
    const slots: AppointmentAvailabilitySlot[] = [];
    const now = new Date();

    for (const template of templates) {
      const day = new Date(firstDay);
      while (day <= lastDay) {
        if (day.getUTCDay() === template.dayOfWeek) {
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
              const start = atZonedMinutes(day, cursor, timeZone);
              const end = new Date(start.getTime() + durationMinutes * 60_000);
              if (start <= now) continue;
              const dateKey = day.toISOString().slice(0, 10);
              if (
                dateExceptions.some((exception) => {
                  if (
                    exception.date !== dateKey ||
                    (exception.providerId && exception.providerId !== providerId)
                  )
                    return false;
                  if (!exception.startTime || !exception.endTime) return true;
                  return overlaps(
                    start,
                    end,
                    atZonedMinutes(day, minutes(exception.startTime), timeZone),
                    atZonedMinutes(day, minutes(exception.endTime), timeZone),
                  );
                })
              )
                continue;
              const conflict = appointments.some((appointment) => {
                const providerConflict =
                  !appointment.providerId || appointment.providerId === providerId;
                const roomConflict = Boolean(template.room && appointment.room === template.room);
                if (!providerConflict && !roomConflict) return false;
                const appointmentEnd = new Date(
                  appointment.scheduledAt.getTime() +
                    (appointment.expectedDurationMinutes ??
                      appointment.appointmentTypeSetting?.defaultDurationMinutes ??
                      0) *
                      60_000,
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
        day.setUTCDate(day.getUTCDate() + 1);
      }
    }

    const unique = [
      ...new Map(slots.map((slot) => [`${slot.start}:${slot.providerId}`, slot])).values(),
    ].sort((a, b) => a.start.localeCompare(b.start));
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
    excludeAppointmentId?: string,
  ) {
    return Boolean(
      await this.resolveBooking(
        organizationId,
        locationId,
        appointmentTypeId,
        startTime,
        providerId,
        undefined,
        db,
        excludeAppointmentId,
      ),
    );
  }

  async resolveBooking(
    organizationId: string,
    locationId: string,
    appointmentTypeId: string,
    startTime: Date,
    providerId?: string,
    blockId?: string,
    db: DbClient = prisma,
    excludeAppointmentId?: string,
  ): Promise<AppointmentAvailabilitySlot | null> {
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
      excludeAppointmentId,
    );
    return (
      result.slots.find(
        (slot) =>
          slot.start === startTime.toISOString() &&
          (!providerId || slot.providerId === providerId) &&
          (!blockId || slot.blockId === blockId),
      ) ?? null
    );
  }
}
