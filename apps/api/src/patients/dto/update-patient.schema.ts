import { z } from 'zod';

export const updatePatientSchema = z
  .object({
    name: z.string().min(1).max(200).optional(),
    species: z.string().min(1).max(100).optional(),
    breed: z.string().min(1).max(100).nullable().optional(),
    sex: z.string().min(1).max(50).nullable().optional(),
    dateOfBirth: z.coerce.date().nullable().optional(),
    estimatedAge: z.string().min(1).max(50).nullable().optional(),
    weight: z.coerce.number().positive().nullable().optional(),
    color: z.string().min(1).max(200).nullable().optional(),
    imageUrl: z.string().url().max(2000).nullable().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be provided',
  });

export type UpdatePatientInput = z.infer<typeof updatePatientSchema>;
