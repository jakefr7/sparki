import { describe, expect, it } from 'vitest';
import { uploadClinicalAttachmentSchema } from './clinical-attachment.schema';

const valid = { patientId: 'patient-a', fileName: 'record.pdf', mimeType: 'application/pdf', contentBase64: 'JVBERi0=' };

describe('clinical attachment input', () => {
  it.each(['application/pdf', 'image/jpeg', 'image/png'] as const)('accepts %s', (mimeType) => {
    expect(uploadClinicalAttachmentSchema.safeParse({ ...valid, mimeType }).success).toBe(true);
  });
  it.each(['image/gif', 'text/plain', 'application/octet-stream'])('rejects %s', (mimeType) => {
    expect(uploadClinicalAttachmentSchema.safeParse({ ...valid, mimeType }).success).toBe(false);
  });
  it('requires a patient or visit association', () => {
    expect(uploadClinicalAttachmentSchema.safeParse({ ...valid, patientId: undefined }).success).toBe(false);
  });
  it('requires an audit reason for a correction', () => {
    expect(uploadClinicalAttachmentSchema.safeParse({ ...valid, replacesAttachmentId: 'old' }).success).toBe(false);
  });
});
