import { z } from 'zod';

export const updateRecordSignoffPermissionSchema = z.object({
  canFinalizeRecordsForOthers: z.boolean(),
});

export type UpdateRecordSignoffPermissionInput = z.infer<typeof updateRecordSignoffPermissionSchema>;
