import { z } from 'zod';

export const uploadClinicalAttachmentSchema = z.object({
  patientId: z.string().trim().min(1).optional(),
  visitId: z.string().trim().min(1).optional(),
  fileName: z.string().trim().min(1).max(255),
  mimeType: z.enum(['application/pdf', 'image/jpeg', 'image/png']),
  contentBase64: z.string().min(1),
  label: z.string().trim().max(200).optional(),
  replacesAttachmentId: z.string().trim().min(1).optional(),
  correctionReason: z.string().trim().min(1).max(500).optional(),
}).refine((value) => value.patientId || value.visitId, { message: 'Associate the attachment with a patient or visit.' })
  .refine((value) => !value.replacesAttachmentId || value.correctionReason, { message: 'A correction reason is required when replacing an attachment.' });

export const removeClinicalAttachmentSchema = z.object({ reason: z.string().trim().min(1).max(500) });
export type UploadClinicalAttachmentInput = z.infer<typeof uploadClinicalAttachmentSchema>;
export type RemoveClinicalAttachmentInput = z.infer<typeof removeClinicalAttachmentSchema>;
