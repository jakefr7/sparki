import { z } from 'zod';
import { UserRole } from '@sparki/db';

// z.coerce.boolean() would treat the string "false" as truthy (any
// non-empty string coerces to `true`), so query booleans go through this
// literal-string enum instead.
const queryBoolean = z
  .enum(['true', 'false'])
  .transform((value) => value === 'true')
  .optional();

/**
 * Comma-separated role filter (e.g. `?role=VETERINARIAN,TECHNICIAN`) so
 * scheduling/visit-assignment UI can ask for exactly the roles it can
 * assign without a separate endpoint per role.
 */
export const listStaffQuerySchema = z.object({
  role: z
    .string()
    .min(1)
    .transform((value) => value.split(','))
    .pipe(z.array(z.nativeEnum(UserRole)))
    .optional(),
  canReceiveAppointments: queryBoolean,
  canOwnVisits: queryBoolean,
});

export type ListStaffQuery = z.infer<typeof listStaffQuerySchema>;
