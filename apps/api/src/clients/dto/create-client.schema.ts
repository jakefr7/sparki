import { z } from 'zod';

export const createClientSchema = z.object({
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  email: z.string().email().optional(),
  phone: z.string().min(1).max(50).optional(),
  alternatePhone: z.string().min(1).max(50).optional(),
  preferredContactMethod: z.string().min(1).max(50).optional(),

  // Structured address — see prisma/schema.prisma's Client model comment.
  addressLine1: z.string().min(1).max(200).optional(),
  addressLine2: z.string().min(1).max(200).optional(),
  city: z.string().min(1).max(100).optional(),
  state: z.string().min(1).max(100).optional(),
  postalCode: z.string().min(1).max(20).optional(),
  country: z.string().min(1).max(100).optional(),
  formattedAddress: z.string().min(1).max(500).optional(),
  addressPlaceId: z.string().min(1).max(300).optional(),
  addressLatitude: z.coerce.number().min(-90).max(90).optional(),
  addressLongitude: z.coerce.number().min(-180).max(180).optional(),
});

export type CreateClientInput = z.infer<typeof createClientSchema>;
