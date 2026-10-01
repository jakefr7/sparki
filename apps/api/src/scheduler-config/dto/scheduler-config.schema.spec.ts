import { describe, expect, it } from 'vitest';
import { canManageSchedulerSettings, MANAGE_SCHEDULER_SETTINGS } from '../../auth/permissions';
import { ROLE_PERMISSIONS } from '../../auth/role-permissions';
import {
  createDateExceptionSchema,
  updateSchedulerSettingsSchema,
  upsertAppointmentTypeSettingSchema,
  upsertSlotTemplateSchema,
} from './scheduler-config.schema';

describe('scheduler config schemas', () => {
  it('accepts supported scheduler slot intervals', () => {
    for (const slotIntervalMinutes of [15, 20, 30, 45, 60]) {
      expect(updateSchedulerSettingsSchema.safeParse({ slotIntervalMinutes }).success).toBe(true);
    }
  });

  it('rejects unsupported scheduler slot intervals', () => {
    expect(updateSchedulerSettingsSchema.safeParse({ slotIntervalMinutes: 10 }).success).toBe(
      false,
    );
    expect(updateSchedulerSettingsSchema.safeParse({ slotIntervalMinutes: 90 }).success).toBe(
      false,
    );
  });

  it('accepts appointment type colors as configurable hex values', () => {
    const result = upsertAppointmentTypeSettingSchema.safeParse({
      appointmentType: 'SurgeryProcedure',
      name: 'Surgery',
      description: null,
      defaultDurationMinutes: 60,
      color: '#16A34A',
      isActive: true,
      sortOrder: 30,
      providerIds: ['provider-1'],
    });

    expect(result.success).toBe(true);
  });

  it('requires every appointment style to declare its canonical category', () => {
    const result = upsertAppointmentTypeSettingSchema.safeParse({
      name: 'Orthopedic Surgery',
      defaultDurationMinutes: 120,
      color: '#2563EB',
      isActive: true,
      sortOrder: 40,
      providerIds: ['provider-1'],
    });

    expect(result.success).toBe(false);
  });

  it('rejects slot templates whose end time is not after the start time', () => {
    const result = upsertSlotTemplateSchema.safeParse({
      dayOfWeek: 2,
      startTime: '13:00',
      endTime: '12:00',
      label: 'Post-op block',
      color: '#FEF3C7',
      isActive: true,
    });

    expect(result.success).toBe(false);
  });
});

describe('scheduler settings permissions', () => {
  it('grants scheduler settings mutation to elevated existing roles', () => {
    expect(canManageSchedulerSettings({ role: 'OWNER' })).toBe(true);
    expect(canManageSchedulerSettings({ role: 'PRACTICE_MANAGER' })).toBe(true);
    expect(canManageSchedulerSettings({ role: 'RECEPTIONIST' })).toBe(true);
    expect(canManageSchedulerSettings({ role: 'VETERINARIAN' })).toBe(false);
  });

  it('surfaces the scheduler settings capability without adding an Admin role', () => {
    expect(ROLE_PERMISSIONS.OWNER).toContain(MANAGE_SCHEDULER_SETTINGS);
    expect(ROLE_PERMISSIONS.PRACTICE_MANAGER).toContain(MANAGE_SCHEDULER_SETTINGS);
    expect(ROLE_PERMISSIONS.RECEPTIONIST).toContain(MANAGE_SCHEDULER_SETTINGS);
    expect(Object.keys(ROLE_PERMISSIONS)).not.toContain('ADMIN');
  });
});

describe('date exceptions', () => {
  it('accepts real leap dates and full-day clinic closures', () => {
    expect(createDateExceptionSchema.parse({ date: '2028-02-29', reason: 'Holiday' })).toMatchObject({ startTime: null, endTime: null, providerId: null });
  });
  it.each(['2027-02-29', '2026-02-30', '2026-13-01'])('rejects impossible date %s', (date) => {
    expect(createDateExceptionSchema.safeParse({ date, reason: 'Closed' }).success).toBe(false);
  });
  it('rejects partial, overnight and zero-length intervals', () => {
    for (const times of [{ startTime: '09:00' }, { startTime: '17:00', endTime: '09:00' }, { startTime: '09:00', endTime: '09:00' }])
      expect(createDateExceptionSchema.safeParse({ date: '2026-10-02', reason: 'Closed', ...times }).success).toBe(false);
  });
});
