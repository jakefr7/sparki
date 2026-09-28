import { z } from 'zod';

const optionalTrimmed = (max: number) => z.string().trim().max(max).nullable().optional();

export const updateClinicSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  legalName: optionalTrimmed(200),
  phone: optionalTrimmed(50),
  email: z.string().trim().email().max(200).nullable().optional(),
  addressLine1: optionalTrimmed(200),
  addressLine2: optionalTrimmed(200),
  city: optionalTrimmed(100),
  state: optionalTrimmed(100),
  postalCode: optionalTrimmed(20),
  country: optionalTrimmed(100),
  timezone: optionalTrimmed(100),
});

export type UpdateClinicInput = z.infer<typeof updateClinicSchema>;
