import { z } from 'zod';
import { dateOfBirthSchema, ESTIMATED_DATE_OF_BIRTH_REQUIRES_DATE } from './date-of-birth.schema';

const clientLinkSchema = z.object({
  clientId: z.string().min(1),
  isPrimary: z.boolean(),
});

export const createPatientSchema = z
  .object({
    name: z.string().min(1).max(200),
    species: z.string().min(1).max(100),
    breed: z.string().min(1).max(100).optional(),
    sex: z.string().min(1).max(50).optional(),
    dateOfBirth: dateOfBirthSchema.optional(),
    dateOfBirthEstimated: z.boolean().optional(),
    estimatedAge: z.string().min(1).max(50).optional(),
    weight: z.coerce.number().positive().optional(),
    color: z.string().min(1).max(200).optional(),
    imageUrl: z.string().url().max(2000).optional(),
    alerts: z.string().min(1).max(2000).optional(),
    // Patient<->Client is many-to-many with a primary flag (PatientClient),
    // per docs/specs/modules/01-patient-workspace-mvp.md's "Client Context".
    clients: z.array(clientLinkSchema).min(1),
  })
  .refine((data) => data.clients.filter((client) => client.isPrimary).length === 1, {
    message: 'Exactly one client must be marked isPrimary',
    path: ['clients'],
  })
  .refine(
    (data) => new Set(data.clients.map((client) => client.clientId)).size === data.clients.length,
    { message: 'clientId values must be unique', path: ['clients'] },
  )
  .refine((data) => !data.dateOfBirthEstimated || data.dateOfBirth !== undefined, {
    message: ESTIMATED_DATE_OF_BIRTH_REQUIRES_DATE,
    path: ['dateOfBirth'],
  });

export type CreatePatientInput = z.infer<typeof createPatientSchema>;
