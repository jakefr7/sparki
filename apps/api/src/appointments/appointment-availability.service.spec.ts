import { beforeEach, describe, expect, it, vi } from 'vitest';
import { prisma } from '@sparki/db';
import { AppointmentAvailabilityService } from './appointment-availability.service';

vi.mock('@sparki/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@sparki/db')>();
  return {
    ...actual,
    prisma: {
      appointmentTypeSetting: { findFirst: vi.fn() },
      schedulerSettings: { findUnique: vi.fn() },
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
    vi.mocked(prisma.user.findMany).mockResolvedValue([provider] as never);
    vi.mocked(prisma.appointment.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.appointmentTypeSetting.findFirst).mockResolvedValue({
      id: 'type-1', defaultDurationMinutes: 30, providers: [{ providerId: provider.id }],
    } as never);
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
});
