import { z } from 'zod';

export const updateVisitPolicySchema = z.object({
  allowCheckoutWithOutstandingBalance: z.boolean(),
});
export type UpdateVisitPolicyInput = z.infer<typeof updateVisitPolicySchema>;
