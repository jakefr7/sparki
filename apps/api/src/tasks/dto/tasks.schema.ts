import { z } from 'zod';

export const createTaskSchema = z.object({
  title: z.string().min(1).max(300),
  assignee: z.string().min(1).max(100),
  // Who is actually allowed to complete this task (see TasksService.update) —
  // "assignee" above is just the display-name snapshot shown in the list.
  assigneeId: z.string().min(1),
  assignedBy: z.string().min(1).max(100),
  dueAt: z.coerce.date().optional(),
});

export type CreateTaskInput = z.infer<typeof createTaskSchema>;

export const updateTaskSchema = z
  .object({
    status: z.enum(['Pending', 'Completed']).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be provided',
  });

export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;
