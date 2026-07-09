import { describe, expect, it } from 'vitest';
import { canManageSchedulerSettings, MANAGE_SCHEDULER_SETTINGS } from '../../auth/permissions';
import { ROLE_PERMISSIONS } from '../../auth/role-permissions';
import {
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
      color: '#16A34A',
      isActive: true,
      sortOrder: 30,
    });

    expect(result.success).toBe(true);
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
    expect(canManageSchedulerSettings({ role: 'FRONT_DESK' })).toBe(true);
    expect(canManageSchedulerSettings({ role: 'VETERINARIAN' })).toBe(false);
  });

  it('surfaces the scheduler settings capability without adding an Admin role', () => {
    expect(ROLE_PERMISSIONS.OWNER).toContain(MANAGE_SCHEDULER_SETTINGS);
    expect(ROLE_PERMISSIONS.PRACTICE_MANAGER).toContain(MANAGE_SCHEDULER_SETTINGS);
    expect(ROLE_PERMISSIONS.FRONT_DESK).toContain(MANAGE_SCHEDULER_SETTINGS);
    expect(Object.keys(ROLE_PERMISSIONS)).not.toContain('ADMIN');
  });
});
