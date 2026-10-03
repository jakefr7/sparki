import { ForbiddenException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { AuthenticatedUser } from '../../auth/types';
import type { AppointmentNotificationSettingsService } from './appointment-notification-settings.service';
import type { AppointmentNotificationStatusService } from './appointment-notification-status.service';
import { AppointmentNotificationsController } from './appointment-notifications.controller';
import { automatedTextsAllowed } from './notification-constants';
import {
  formatAppointmentDate,
  formatAppointmentTime,
  PLACEHOLDERS,
  renderTemplate,
  STARTING_TEMPLATES,
  templateProblems,
} from './notification-templates';
import { localMinuteOfDay, nextTimeInWindow } from './send-window';

const values = {
  clinic_name: 'Lakeview Animal Clinic',
  clinic_phone: '(312) 555-0100',
  client_first_name: 'Jordan',
  patient_name: 'Finley',
  appointment_date: 'Fri, Oct 9',
  appointment_time: '2:00 PM',
};

describe('templateProblems', () => {
  it('accepts every starting template', () => {
    for (const kind of Object.keys(STARTING_TEMPLATES) as Array<keyof typeof STARTING_TEMPLATES>) {
      expect(templateProblems(kind, STARTING_TEMPLATES[kind])).toEqual([]);
    }
  });

  it('rejects a placeholder that does not exist or does not belong to the message', () => {
    expect(templateProblems('REMINDER', 'See you {appointment_type}')).toEqual([
      '{appointment_type} is not available for this message.',
    ]);
    expect(templateProblems('REMINDER', 'Was {previous_time}')).toHaveLength(1);
    expect(templateProblems('RESCHEDULED', 'Was {previous_time}')).toEqual([]);
  });

  it('never offers anything clinical as a placeholder', () => {
    const all = Object.values(PLACEHOLDERS).flat();
    expect(all).not.toContain('appointment_type');
    expect(all).not.toContain('reason');
  });

  it('rejects empty, overlong, and stray-bracket wording', () => {
    expect(templateProblems('REMINDER', '   ')).toContain('Write the message.');
    expect(templateProblems('REMINDER', 'a'.repeat(481))).toHaveLength(1);
    expect(templateProblems('REMINDER', 'Hello {Patient Name}')).toHaveLength(1);
    expect(templateProblems('REMINDER', 'Hello {patient_name')).toHaveLength(1);
  });
});

describe('renderTemplate', () => {
  it('fills placeholders and adds the opt-out line', () => {
    expect(renderTemplate(STARTING_TEMPLATES.REMINDER, values)).toBe(
      'Lakeview Animal Clinic: a reminder that Finley has an appointment on Fri, Oct 9 at 2:00 PM. Call (312) 555-0100 to make a change. Reply STOP to opt out.',
    );
  });

  it('adds the clinic name when the clinic left it out', () => {
    expect(renderTemplate('See you {appointment_date}!', values)).toBe(
      'Lakeview Animal Clinic: See you Fri, Oct 9! Reply STOP to opt out.',
    );
  });

  it('does not repeat opt-out wording the clinic already wrote', () => {
    const text = renderTemplate('{clinic_name}: see you soon. Text STOP to end.', values);
    expect(text).toBe('Lakeview Animal Clinic: see you soon. Text STOP to end.');
  });

  it('does not mistake "stopping by" for opt-out wording', () => {
    expect(renderTemplate('{clinic_name}: thanks for stopping by.', values)).toMatch(
      /Reply STOP to opt out\.$/,
    );
  });
});

describe('appointment date and time', () => {
  it("uses the clinic's time zone, not the server's", () => {
    const start = new Date('2026-10-10T00:30:00Z'); // 7:30 PM on the 9th in Chicago
    expect(formatAppointmentDate(start, 'America/Chicago')).toBe('Fri, Oct 9');
    expect(formatAppointmentTime(start, 'America/Chicago')).toBe('7:30 PM');
    expect(formatAppointmentDate(start, 'UTC')).toBe('Sat, Oct 10');
  });
});

describe('nextTimeInWindow', () => {
  const zone = 'America/Chicago';
  const [start, end] = [8 * 60, 20 * 60];

  it('returns now when already inside sending hours', () => {
    const now = new Date('2026-10-09T15:00:00Z'); // 10:00 AM
    expect(nextTimeInWindow(now, zone, start, end)).toBe(now);
  });

  it('waits until opening the same morning', () => {
    const now = new Date('2026-10-09T10:00:30Z'); // 5:00 AM
    expect(nextTimeInWindow(now, zone, start, end).toISOString()).toBe('2026-10-09T13:00:00.000Z');
  });

  it('waits until the next morning after closing', () => {
    const now = new Date('2026-10-10T02:15:00Z'); // 9:15 PM on the 9th
    const next = nextTimeInWindow(now, zone, start, end);
    expect(next.toISOString()).toBe('2026-10-10T13:00:00.000Z');
    expect(localMinuteOfDay(next, zone)).toBe(start);
  });

  it('treats the closing minute as outside', () => {
    const now = new Date('2026-10-10T01:00:00Z'); // 8:00 PM exactly
    expect(nextTimeInWindow(now, zone, start, end).toISOString()).toBe('2026-10-10T13:00:00.000Z');
  });

  it('still lands on the opening time across a daylight-saving change', () => {
    // Clocks go back at 2 AM on Nov 1, 2026: 9 PM Oct 31 is 13 hours before 8 AM Nov 1.
    const now = new Date('2026-11-01T02:00:00Z'); // 9:00 PM CDT on Oct 31
    const next = nextTimeInWindow(now, zone, start, end);
    expect(localMinuteOfDay(next, zone)).toBe(start);
    expect(next.toISOString()).toBe('2026-11-01T14:00:00.000Z'); // 8:00 AM CST
  });
});

describe('automatedTextsAllowed', () => {
  it("follows the clinic's explicit choice for a type", () => {
    expect(automatedTextsAllowed({ 'type-1': false }, 'type-1', 'WellnessPreventiveCare')).toBe(
      false,
    );
    expect(automatedTextsAllowed({ 'type-1': true }, 'type-1', 'Euthanasia')).toBe(true);
  });

  it('sends for every type by default except euthanasia', () => {
    expect(automatedTextsAllowed({}, 'type-1', 'SickVisit')).toBe(true);
    expect(automatedTextsAllowed({}, 'type-1', null)).toBe(true);
    expect(automatedTextsAllowed({}, 'type-1', 'Euthanasia')).toBe(false);
    expect(automatedTextsAllowed({ 'another-type': true }, 'type-1', 'Euthanasia')).toBe(false);
  });
});

describe('AppointmentNotificationsController roles', () => {
  const user = (role: AuthenticatedUser['role']) => ({ role }) as AuthenticatedUser;
  const settings = {
    get: vi.fn().mockResolvedValue({}),
    update: vi.fn().mockResolvedValue({}),
    preview: vi.fn(),
  };
  const status = { forAppointment: vi.fn().mockResolvedValue({ notifications: [] }) };
  const controller = new AppointmentNotificationsController(
    settings as unknown as AppointmentNotificationSettingsService,
    status as unknown as AppointmentNotificationStatusService,
  );
  const input = { sendWindow: { startMinute: 0, endMinute: 1440 }, rules: [] };

  it.each(['RECEPTIONIST', 'VETERINARIAN', 'TECHNICIAN', 'ASSISTANT', 'CLIENT'] as const)(
    "does not let %s read or change the clinic's automated texts",
    (role) => {
      expect(() => controller.getSettings(user(role))).toThrow(ForbiddenException);
      expect(() => controller.updateSettings(user(role), input)).toThrow(ForbiddenException);
      expect(() => controller.preview(user(role), { kind: 'REMINDER', template: 'x' })).toThrow(
        ForbiddenException,
      );
      expect(settings.update).not.toHaveBeenCalled();
    },
  );

  it.each(['OWNER', 'PRACTICE_MANAGER'] as const)('lets %s change them', async (role) => {
    await expect(controller.updateSettings(user(role), input)).resolves.toEqual({});
  });

  it('lets any staff member see what was sent for an appointment, but not a client account', async () => {
    await expect(controller.forAppointment(user('RECEPTIONIST'), 'appointment-1')).resolves.toEqual(
      { notifications: [] },
    );
    expect(() => controller.forAppointment(user('CLIENT'), 'appointment-1')).toThrow(
      ForbiddenException,
    );
  });
});
