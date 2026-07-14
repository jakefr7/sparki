import { z } from 'zod';
import { AppointmentType, ConfirmationStatus, RecordsPrepStatus } from '@sparki/db';
import { createClientSchema } from '../../clients/dto/create-client.schema';

export const APPOINTMENT_COLOR_KEYS = [
  'teal',
  'blue',
  'purple',
  'amber',
  'orange',
  'green',
  'slate',
  'rose',
] as const;

// Records-request context gathered at booking time — see prisma/schema.prisma's
// Appointment model comment. Optional everywhere; blank values must never
// block appointment creation.
const recordsRequestFields = {
  primaryCareVetName: z.string().min(1).max(200).optional(),
  previousClinicName: z.string().min(1).max(200).optional(),
  previousRecordsSource: z.string().min(1).max(200).optional(),
  lastSeenAt: z.coerce.date().optional(),
};

const appointmentFields = {
  patientId: z.string().min(1),
  // Omitted: defaults to the patient's primary Client (see AppointmentsService).
  clientId: z.string().min(1).optional(),
  appointmentType: z.nativeEnum(AppointmentType),
  // Optional only for compatibility with older API clients during rollout.
  appointmentTypeId: z.string().min(1).optional(),
  visitReason: z.string().min(1).max(500),
  startTime: z.coerce.date(),
  expectedDurationMinutes: z.coerce
    .number()
    .int()
    .positive()
    .max(24 * 60)
    .optional(),
  assignedProviderId: z.string().min(1).optional(),
  colorKey: z
    .union([z.enum(APPOINTMENT_COLOR_KEYS), z.string().regex(/^#[0-9A-Fa-f]{6}$/)])
    .optional(),
  ...recordsRequestFields,
};

function withinBookingHorizon(value: { startTime: Date }) {
  const now = new Date();
  const limit = new Date(now); limit.setFullYear(limit.getFullYear() + 1);
  return value.startTime >= now && value.startTime <= limit;
}

export const createAppointmentSchema = z.object(appointmentFields).refine(withinBookingHorizon, {
  message: 'Appointment time must be within the next year', path: ['startTime'],
});

export type CreateAppointmentInput = z.infer<typeof createAppointmentSchema>;

// New Patient booking (Anna's receptionist workflow): the scheduler's "New
// Patient" form submits Client + Patient + Appointment details together, and
// AppointmentsService.createWithNewPatient creates all three (plus the
// PatientClient link) inside one transaction — see that method for why.
const newPatientDetailsSchema = z.object({
  name: z.string().min(1).max(200),
  species: z.string().min(1).max(100),
  breed: z.string().min(1).max(100).optional(),
  sex: z.string().min(1).max(50).optional(),
  dateOfBirth: z.coerce.date().optional(),
  estimatedAge: z.string().min(1).max(50).optional(),
  weight: z.coerce.number().positive().optional(),
  color: z.string().min(1).max(200).optional(),
});

export const createAppointmentWithNewPatientSchema = z.object({
  client: createClientSchema,
  patient: newPatientDetailsSchema,
  appointment: z.object(appointmentFields).omit({ patientId: true, clientId: true }).refine(withinBookingHorizon, {
    message: 'Appointment time must be within the next year', path: ['startTime'],
  }),
});

export type CreateAppointmentWithNewPatientInput = z.infer<
  typeof createAppointmentWithNewPatientSchema
>;

export const linkAppointmentPatientSchema = z.object({
  patientId: z.string().min(1),
  clientId: z.string().min(1).optional(),
});

export type LinkAppointmentPatientInput = z.infer<typeof linkAppointmentPatientSchema>;

export const moveAppointmentSchema = z.object({
  startTime: z.coerce.date(),
  expectedDurationMinutes: z.coerce
    .number()
    .int()
    .positive()
    .max(24 * 60)
    .optional(),
  assignedProviderId: z.string().min(1).optional().nullable(),
});

export type MoveAppointmentInput = z.infer<typeof moveAppointmentSchema>;

export const updateAppointmentNoteSchema = z.object({
  note: z.string().trim().max(500),
});

export type UpdateAppointmentNoteInput = z.infer<typeof updateAppointmentNoteSchema>;

// Tech/assistant records-research status and receptionist-facing manual
// confirmation/reminder status — see prisma/schema.prisma's Appointment
// model comment. Each is its own small PATCH so the two roles' workflows
// don't need to touch fields that aren't theirs.
export const updateRecordsPrepStatusSchema = z.object({
  recordsPrepStatus: z.nativeEnum(RecordsPrepStatus),
});

export type UpdateRecordsPrepStatusInput = z.infer<typeof updateRecordsPrepStatusSchema>;

export const updateConfirmationStatusSchema = z.object({
  confirmationStatus: z.nativeEnum(ConfirmationStatus),
});

export type UpdateConfirmationStatusInput = z.infer<typeof updateConfirmationStatusSchema>;
