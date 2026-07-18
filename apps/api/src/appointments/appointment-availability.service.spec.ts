import { beforeEach, describe, expect, it, vi } from 'vitest';
import { prisma } from '@sparki/db';
import { AppointmentAvailabilityService } from './appointment-availability.service';

vi.mock('@sparki/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@sparki/db')>();
  return {
    ...actual,
    prisma: {
      appointmentTypeSetting: { findFirst: vi.fn() },
      appointmentTypeSlotTemplate: { count: vi.fn() },
      schedulerSettings: { findUnique: vi.fn() },
      location: { findFirst: vi.fn() },
      schedulerSlotTemplate: { findMany: vi.fn() },
      appointment: { findMany: vi.fn() },
      user: { findMany: vi.fn() },
    },
  };
});

const service = new AppointmentAvailabilityService();
const provider = { id: 'provider-1', displayName: 'Dr. Rivera', firstName: 'Ana', lastName: 'Rivera', role: 'VETERINARIAN' };

describe('AppointmentAvailabilityService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.schedulerSettings.findUnique).mockResolvedValue({ slotIntervalMinutes: 30 } as never);
    vi.mocked(prisma.location.findFirst).mockResolvedValue({ timeZone: 'America/Chicago' } as never);
    vi.mocked(prisma.user.findMany).mockResolvedValue([provider] as never);
    vi.mocked(prisma.appointment.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.appointmentTypeSetting.findFirst).mockResolvedValue({
      id: 'type-1', defaultDurationMinutes: 30, providers: [{ providerId: provider.id }],
    } as never);
    vi.mocked(prisma.appointmentTypeSlotTemplate.count).mockResolvedValue(0);
  });

  it('only searches assigned blocks once an appointment style is restricted', async () => {
    const day = new Date(2099, 0, 5);
    vi.mocked(prisma.appointmentTypeSlotTemplate.count).mockResolvedValue(1);
    vi.mocked(prisma.schedulerSlotTemplate.findMany).mockResolvedValue([]);

    await service.find('org', 'location', {
      appointmentTypeId: 'type-1',
      startDate: day,
      endDate: day,
    });

    expect(prisma.schedulerSlotTemplate.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          appointmentTypes: { some: { appointmentTypeId: 'type-1' } },
        }),
      }),
    );
  });

  it('allows a visit that fits exactly at a block boundary and excludes starts that run past it', async () => {
    const day = new Date(2099, 0, 5);
    vi.mocked(prisma.appointmentTypeSetting.findFirst).mockResolvedValue({
      id: 'type-1', defaultDurationMinutes: 60, providers: [{ providerId: provider.id }],
    } as never);
    vi.mocked(prisma.schedulerSlotTemplate.findMany).mockResolvedValue([
      { id: 'block', dayOfWeek: day.getDay(), startTime: '09:00', endTime: '10:00', staffId: provider.id, room: null },
    ] as never);

    const result = await service.find('org', 'location', {
      appointmentTypeId: 'type-1',
      providerId: provider.id,
      startDate: day,
      endDate: day,
    });

    expect(result.slots.map((slot) => new Date(slot.start).getHours())).toEqual([9]);
    expect(new Date(result.slots[0]!.end).getHours()).toBe(10);
    expect(prisma.schedulerSlotTemplate.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ isGeneralAvailability: true }),
      }),
    );
  });

  it('splits a block around conflicts while allowing back-to-back appointments', async () => {
    const day = new Date(2099, 0, 5);
    const bookedAt = new Date(day);
    bookedAt.setHours(9, 30, 0, 0);
    vi.mocked(prisma.schedulerSlotTemplate.findMany).mockResolvedValue([
      { id: 'block', dayOfWeek: day.getDay(), startTime: '09:00', endTime: '11:00', staffId: provider.id, room: null },
    ] as never);
    vi.mocked(prisma.appointment.findMany).mockResolvedValue([
      { scheduledAt: bookedAt, expectedDurationMinutes: 30, providerId: provider.id },
    ] as never);

    const result = await service.find('org', 'location', {
      appointmentTypeId: 'type-1',
      providerId: provider.id,
      startDate: day,
      endDate: day,
    });

    expect(result.slots.map((slot) => new Date(slot.start).getHours() * 60 + new Date(slot.start).getMinutes())).toEqual([540, 600, 630]);
  });

  it('excludes the appointment being moved from its own conflict search', async () => {
    const day = new Date(2099, 0, 5);
    vi.mocked(prisma.schedulerSlotTemplate.findMany).mockResolvedValue([]);

    await service.find('org', 'location', {
      appointmentTypeId: 'type-1',
      startDate: day,
      endDate: day,
    }, prisma, 'appointment-being-moved');

    expect(prisma.appointment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: { not: 'appointment-being-moved' } }),
      }),
    );
  });

  it('builds block times in the clinic location timezone instead of the API process timezone', async () => {
    const day = new Date('2099-01-05T12:00:00.000Z');
    vi.mocked(prisma.location.findFirst).mockResolvedValue({ timeZone: 'America/New_York' } as never);
    vi.mocked(prisma.schedulerSlotTemplate.findMany).mockResolvedValue([
      { id: 'block', dayOfWeek: 1, startTime: '09:00', endTime: '10:00', staffId: provider.id, room: null },
    ] as never);

    const result = await service.find('org', 'location', {
      appointmentTypeId: 'type-1',
      providerId: provider.id,
      startDate: day,
      endDate: day,
    });

    expect(result.slots[0]?.start).toBe('2099-01-05T14:00:00.000Z');
  });

  it('resolves an any-provider request to the concrete provider, block, and room offered', async () => {
    const day = new Date(2099, 0, 5);
    vi.mocked(prisma.schedulerSlotTemplate.findMany).mockResolvedValue([
      { id: 'block-1', dayOfWeek: day.getDay(), startTime: '09:00', endTime: '10:00', staffId: null, room: 'Surgery 1' },
    ] as never);

    const start = new Date(day); start.setHours(9, 0, 0, 0);
    const reservation = await service.resolveBooking('org', 'location', 'type-1', start);

    expect(reservation).toMatchObject({ providerId: provider.id, blockId: 'block-1', room: 'Surgery 1' });
  });

  it('prevents two providers from occupying the same named room at the same time', async () => {
    const day = new Date(2099, 0, 5);
    const start = new Date(day); start.setHours(9, 0, 0, 0);
    vi.mocked(prisma.schedulerSlotTemplate.findMany).mockResolvedValue([
      { id: 'block-1', dayOfWeek: day.getDay(), startTime: '09:00', endTime: '10:00', staffId: provider.id, room: 'Surgery 1' },
    ] as never);
    vi.mocked(prisma.appointment.findMany).mockResolvedValue([
      { scheduledAt: start, expectedDurationMinutes: 30, providerId: 'another-provider', room: 'Surgery 1' },
    ] as never);

    const result = await service.find('org', 'location', {
      appointmentTypeId: 'type-1', providerId: provider.id, startDate: day, endDate: day,
    });

    expect(result.slots.map((slot) => slot.start)).not.toContain(start.toISOString());
  });
});
