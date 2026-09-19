import { z } from 'zod';

export const updateMedicationPermissionSchema = z.object({
  canManageMedications: z.boolean(),
});

export type UpdateMedicationPermissionInput = z.infer<typeof updateMedicationPermissionSchema>;
