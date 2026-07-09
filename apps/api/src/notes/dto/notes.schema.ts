import { z } from 'zod';

export const createNoteSchema = z.object({
  body: z.string().min(1).max(4000),
});

export type CreateNoteInput = z.infer<typeof createNoteSchema>;

export const updateNoteSchema = z
  .object({
    body: z.string().min(1).max(4000).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be provided',
  });

export type UpdateNoteInput = z.infer<typeof updateNoteSchema>;

export const reorderNotesSchema = z.object({
  ids: z.array(z.string().min(1)).min(1),
});

export type ReorderNotesInput = z.infer<typeof reorderNotesSchema>;
