import { z } from 'zod';
import { AppointmentType } from '@sparki/db';

export const ALLOWED_SLOT_INTERVALS = [15, 20, 30, 45, 60] as const;

const colorSchema = z
  .string()
  .regex(/^#[0-9A-Fa-f]{6}$/, 'Color must be a hex color, for example #2563EB');

const timeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Time must use HH:mm format');

export const updateSchedulerSettingsSchema = z.object({
  slotIntervalMinutes: z.union([
    z.literal(15),
    z.literal(20),
    z.literal(30),
    z.literal(45),
    z.literal(60),
  ]),
});

export type UpdateSchedulerSettingsInput = z.infer<typeof updateSchedulerSettingsSchema>;

export const upsertAppointmentTypeSettingSchema = z.object({
  appointmentType: z.nativeEnum(AppointmentType),
  name: z.string().min(1).max(80),
  color: colorSchema,
  isActive: z.boolean(),
  sortOrder: z.coerce.number().int().min(0).max(500),
});

export type UpsertAppointmentTypeSettingInput = z.infer<typeof upsertAppointmentTypeSettingSchema>;

export const upsertSlotTemplateSchema = z
  .object({
    id: z.string().min(1).optional(),
    dayOfWeek: z.coerce.number().int().min(0).max(6),
    startTime: timeSchema,
    endTime: timeSchema,
    label: z.string().min(1).max(80),
    color: colorSchema,
    staffId: z.string().min(1).optional().nullable(),
    room: z.string().max(80).optional().nullable(),
    isActive: z.boolean(),
  })
  .refine((value) => value.startTime < value.endTime, {
    message: 'End time must be after start time',
    path: ['endTime'],
  });

export type UpsertSlotTemplateInput = z.infer<typeof upsertSlotTemplateSchema>;

export const setSlotTemplateVisibilitySchema = z.object({
  isActive: z.boolean(),
});

export type SetSlotTemplateVisibilityInput = z.infer<typeof setSlotTemplateVisibilitySchema>;
