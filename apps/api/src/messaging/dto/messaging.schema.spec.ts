import { describe, expect, it } from 'vitest';
import { createConversationSchema, createMessageSchema, updateMembershipSchema, uploadAttachmentSchema } from './messaging.schema';

describe('messaging schemas', () => {
  it('requires exactly one recipient for a direct conversation at the service boundary', () => {
    expect(createConversationSchema.parse({ type: 'DIRECT', memberIds: ['staff-1'] })).toEqual({ type: 'DIRECT', memberIds: ['staff-1'] });
    expect(() => createConversationSchema.parse({ type: 'DIRECT', memberIds: [] })).toThrow();
  });
  it('accepts record-only messages and requires an idempotency nonce', () => {
    expect(createMessageSchema.parse({ body: '', clientNonce: 'nonce-1234', linkedRecords: [{ recordType: 'PATIENT', recordId: 'patient-1' }] }).linkedRecords).toHaveLength(1);
    expect(() => createMessageSchema.parse({ body: 'hello', linkedRecords: [] })).toThrow();
  });
  it('validates persisted per-conversation preferences', () => {
    expect(updateMembershipSchema.parse({ notificationLevel: 'MENTIONS', isPinned: true, draft: 'Follow up' })).toMatchObject({ notificationLevel: 'MENTIONS', isPinned: true });
    expect(() => updateMembershipSchema.parse({ notificationLevel: 'LOUD' })).toThrow();
  });
  it('accepts only a server-issued opaque storage key when attaching an upload', () => {
    const parsed = createMessageSchema.parse({ body: '', clientNonce: 'nonce-1234', uploadedAttachments: [{ storageKey: 'organizations/org/locations/location/messaging/opaque' }] });
    expect(parsed.uploadedAttachments).toEqual([{ storageKey: 'organizations/org/locations/location/messaging/opaque' }]);
    expect(() => createMessageSchema.parse({ body: '', clientNonce: 'nonce-1234', uploadedAttachments: [{ storageKey: 'opaque', href: 'https://public.example/file' }] })).toThrow();
    expect(uploadAttachmentSchema.parse({ fileName: 'result.pdf', mimeType: 'application/pdf', contentBase64: 'YQ==' })).toMatchObject({ fileName: 'result.pdf' });
  });
});
