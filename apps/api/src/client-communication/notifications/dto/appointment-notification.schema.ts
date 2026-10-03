import { z } from 'zod';
import {
  MAX_REMINDER_OFFSET_MINUTES,
  MAX_REMINDERS,
  MIN_REMINDER_OFFSET_MINUTES,
} from '../notification-constants';

const kind = z.enum(['CONFIRMATION', 'REMINDER', 'RESCHEDULED', 'CANCELLED']);

const ruleSchema = z.object({
  // Present when editing a saved rule; omitted to add one.
  id: z.string().min(1).max(100).optional(),
  kind,
  enabled: z.boolean(),
  // REMINDER only: minutes before the appointment starts.
  offsetMinutes: z
    .number()
    .int()
    .min(MIN_REMINDER_OFFSET_MINUTES)
    .max(MAX_REMINDER_OFFSET_MINUTES)
    .nullable()
    .optional(),
  // Length and placeholders are checked in the service, which can answer
  // with wording a manager can act on.
  template: z.string().max(2000),
});

/**
 * The whole of a clinic location's automated-text settings. Sent as a
 * complete replacement: a saved rule that is left out is removed.
 */
export const updateNotificationSettingsSchema = z
  .object({
    sendWindow: z
      .object({
        startMinute: z.number().int().min(0).max(1439),
        endMinute: z.number().int().min(1).max(1440),
      })
      .refine(
        (window) => window.startMinute < window.endMinute,
        'Sending hours must end after they start',
      ),
    rules: z.array(ruleSchema).max(MAX_REMINDERS + 3),
    appointmentTypes: z
      .array(z.object({ id: z.string().min(1).max(100), automatedMessages: z.boolean() }))
      .max(200)
      .optional(),
  })
  .superRefine((input, context) => {
    const reminders = input.rules.filter((rule) => rule.kind === 'REMINDER');
    if (reminders.length > MAX_REMINDERS) {
      context.addIssue({
        code: 'custom',
        path: ['rules'],
        message: `A clinic can have up to ${MAX_REMINDERS} reminders`,
      });
    }
    for (const single of ['CONFIRMATION', 'RESCHEDULED', 'CANCELLED'] as const) {
      if (input.rules.filter((rule) => rule.kind === single).length > 1) {
        context.addIssue({
          code: 'custom',
          path: ['rules'],
          message: `Only one ${single.toLowerCase()} message is allowed`,
        });
      }
    }
    input.rules.forEach((rule, index) => {
      if (
        rule.kind === 'REMINDER' &&
        (rule.offsetMinutes === undefined || rule.offsetMinutes === null)
      ) {
        context.addIssue({
          code: 'custom',
          path: ['rules', index, 'offsetMinutes'],
          message: 'Choose how long before the appointment the reminder sends',
        });
      }
    });
    const offsets = reminders.map((rule) => rule.offsetMinutes);
    if (new Set(offsets).size !== offsets.length) {
      context.addIssue({
        code: 'custom',
        path: ['rules'],
        message: 'Two reminders cannot send at the same time',
      });
    }
  });
export type UpdateNotificationSettingsInput = z.infer<typeof updateNotificationSettingsSchema>;

export const previewNotificationSchema = z.object({ kind, template: z.string().max(2000) });
export type PreviewNotificationInput = z.infer<typeof previewNotificationSchema>;
