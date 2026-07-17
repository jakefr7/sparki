import { describe, expect, it } from 'vitest';
import { createConversationSchema, createMessageSchema, updateMembershipSchema } from './messaging.schema';

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
});
