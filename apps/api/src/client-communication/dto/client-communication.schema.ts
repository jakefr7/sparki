import { z } from 'zod';
import { MAX_MESSAGE_LENGTH } from '../sms-text';

const id = z.string().min(1).max(100);

export const THREAD_VIEWS = [
  'all',
  'unread',
  'open',
  'waiting',
  'closed',
  'mine',
  'unassigned',
  'problems',
] as const;
export type ThreadView = (typeof THREAD_VIEWS)[number];

export const listThreadsQuerySchema = z.object({
  view: z.enum(THREAD_VIEWS).default('all'),
  search: z.string().trim().max(100).optional(),
  clientId: id.optional(),
  patientId: id.optional(),
  cursor: z.string().max(300).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});
export type ListThreadsQuery = z.infer<typeof listThreadsQuerySchema>;

export const listMessagesQuerySchema = z
  .object({
    before: z.string().max(300).optional(),
    changedSince: z.string().datetime().optional(),
    limit: z.coerce.number().int().min(1).max(200).default(50),
  })
  .refine(
    (query) => !(query.before && query.changedSince),
    'Use either before or changedSince, not both',
  );
export type ListMessagesQuery = z.infer<typeof listMessagesQuerySchema>;

export const openThreadSchema = z.object({
  clientId: id,
  phone: z.enum(['PRIMARY', 'ALTERNATE']).default('PRIMARY'),
});
export type OpenThreadInput = z.infer<typeof openThreadSchema>;

export const sendMessageSchema = z.object({
  body: z.string().trim().min(1).max(MAX_MESSAGE_LENGTH),
  // Chosen by the caller once per message the user composes, and reused on
  // every retry of that same message.
  idempotencyKey: z.string().min(8).max(120),
  patientId: id.optional(),
  appointmentId: id.optional(),
});
export type SendMessageInput = z.infer<typeof sendMessageSchema>;

export const updateThreadSchema = z
  .object({
    expectedVersion: z.number().int().positive(),
    status: z.enum(['OPEN', 'WAITING', 'CLOSED']).optional(),
    assignedToId: id.nullable().optional(),
    clientId: id.nullable().optional(),
  })
  .refine(
    (input) =>
      input.status !== undefined ||
      input.assignedToId !== undefined ||
      input.clientId !== undefined,
    'Provide a status, an assignee, or a client',
  );
export type UpdateThreadInput = z.infer<typeof updateThreadSchema>;

export const recordConsentSchema = z
  .object({
    status: z.enum(['GRANTED', 'OPTED_OUT']),
    // How the client agreed. Required for GRANTED: "agreed" with no record of
    // how is not something the clinic could stand behind later.
    method: z.enum(['VERBAL', 'WRITTEN_FORM', 'ONLINE_FORM', 'OTHER']).optional(),
    note: z.string().trim().max(500).optional(),
  })
  .refine((input) => input.status !== 'GRANTED' || input.method !== undefined, {
    message: 'Say how the client agreed',
    path: ['method'],
  });
export type RecordConsentInput = z.infer<typeof recordConsentSchema>;

export const simulatedReplySchema = z.object({
  body: z.string().trim().min(1).max(MAX_MESSAGE_LENGTH),
});
export type SimulatedReplyInput = z.infer<typeof simulatedReplySchema>;
