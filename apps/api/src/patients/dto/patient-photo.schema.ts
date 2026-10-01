import { z } from 'zod';

export const uploadPatientPhotoSchema = z.object({
  fileName: z.string().trim().min(1).max(255),
  mimeType: z.enum(['image/jpeg', 'image/png', 'image/webp', 'image/gif']),
  contentBase64: z.string().min(1),
});

export type UploadPatientPhotoInput = z.infer<typeof uploadPatientPhotoSchema>;
