import { z } from 'zod';

export const createConversationSchema = z.object({
  type: z.enum(['DIRECT', 'CLINIC_CHANNEL', 'DEPARTMENT_CHANNEL', 'LOCATION_CHANNEL', 'PRIVATE_CHANNEL']).default('DIRECT'),
  name: z.string().trim().max(120).optional(),
  memberIds: z.array(z.string().min(1)).min(1).max(50),
});
export type CreateConversationInput = z.infer<typeof createConversationSchema>;

const linkedRecordSchema = z.object({
  recordType: z.enum(['PATIENT', 'CLIENT', 'APPOINTMENT', 'VISIT', 'TASK', 'MEDICAL_RECORD', 'DOCUMENT']),
  recordId: z.string().min(1),
});
const uploadedAttachmentSchema = z.object({ fileName: z.string().min(1).max(255), mimeType: z.string().max(120), sizeBytes: z.number().int().nonnegative().max(10 * 1024 * 1024), storageKey: z.string().min(1).max(1000), href: z.string().url().max(2000) });
export const createMessageSchema = z.object({
  body: z.string().trim().max(10000).default(''),
  clientNonce: z.string().min(8).max(120),
  replyToId: z.string().optional(),
  mentionIds: z.array(z.string()).max(50).default([]),
  linkedRecords: z.array(linkedRecordSchema).max(10).default([]),
  uploadedAttachments: z.array(uploadedAttachmentSchema).max(5).default([]),
}).refine((value) => value.body.length > 0 || value.linkedRecords.length > 0 || value.uploadedAttachments.length > 0, 'Message or attachment required');
export type CreateMessageInput = z.infer<typeof createMessageSchema>;

export const updateMembershipSchema = z.object({
  isPinned: z.boolean().optional(), isArchived: z.boolean().optional(), markedUnread: z.boolean().optional(),
  notificationLevel: z.enum(['ALL', 'MENTIONS', 'MUTED']).optional(), draft: z.string().max(10000).optional(),
  drawerOpen: z.boolean().optional(), drawerMinimized: z.boolean().optional(), markRead: z.boolean().optional(),
});
export type UpdateMembershipInput = z.infer<typeof updateMembershipSchema>;

export const updateMessageSchema = z.object({ body: z.string().trim().min(1).max(10000).optional(), deleted: z.boolean().optional() });
export type UpdateMessageInput = z.infer<typeof updateMessageSchema>;
export const reactionSchema = z.object({ emoji: z.string().min(1).max(16) });
export const sendClientMessageSchema = z.object({ body: z.string().trim().min(1).max(1600) });
