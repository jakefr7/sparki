import { z } from 'zod';

export const updateClientSchema = z
  .object({
    firstName: z.string().min(1).max(100).optional(),
    lastName: z.string().min(1).max(100).optional(),
    email: z.string().email().nullable().optional(),
    phone: z.string().min(1).max(50).nullable().optional(),
    alternatePhone: z.string().min(1).max(50).nullable().optional(),
    preferredContactMethod: z.string().min(1).max(50).nullable().optional(),

    // Structured address — see prisma/schema.prisma's Client model comment.
    addressLine1: z.string().min(1).max(200).nullable().optional(),
    addressLine2: z.string().min(1).max(200).nullable().optional(),
    city: z.string().min(1).max(100).nullable().optional(),
    state: z.string().min(1).max(100).nullable().optional(),
    postalCode: z.string().min(1).max(20).nullable().optional(),
    country: z.string().min(1).max(100).nullable().optional(),
    formattedAddress: z.string().min(1).max(500).nullable().optional(),
    addressPlaceId: z.string().min(1).max(300).nullable().optional(),
    addressLatitude: z.coerce.number().min(-90).max(90).nullable().optional(),
    addressLongitude: z.coerce.number().min(-180).max(180).nullable().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be provided',
  });

export type UpdateClientInput = z.infer<typeof updateClientSchema>;
