import { NotFoundException } from '@nestjs/common';
import { prisma } from '@sparki/db';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthenticatedUser } from '../auth/types';
import type { AttachmentStorageService } from './attachment-storage.service';
import { MessagingService } from './messaging.service';

vi.mock('@sparki/db', () => ({
  Prisma: { QueryMode: { insensitive: 'insensitive' } },
  prisma: {
    messagingAttachment: { findFirst: vi.fn() },
    messagingConversationMember: { findFirst: vi.fn() },
    user: { findMany: vi.fn() },
    $transaction: vi.fn(),
  },
}));

const user = (id: string, organizationId: string, locationId: string): AuthenticatedUser => ({
  id,
  organizationId,
  locationId,
  email: `${id}@example.test`,
  name: id,
  role: 'VETERINARIAN',
  subscriptionStatus: 'ACTIVE',
  canManageAdminSettings: false,
  canFinalizeRecordsForOthers: false,
});

const createMessageInput = (storageKey: string) => ({
  body: '',
  clientNonce: 'nonce-12345678',
  mentionIds: [],
  linkedRecords: [],
  uploadedAttachments: [{ storageKey }],
});

describe('MessagingService attachment privacy', () => {
  const objects = new Map<string, Buffer>();
  const storage = {
    key: vi.fn((organizationId: string, locationId: string) => `organizations/${organizationId}/locations/${locationId}/messaging/object-a`),
    belongsTo: vi.fn((key: string, organizationId: string, locationId: string) => key.startsWith(`organizations/${organizationId}/locations/${locationId}/messaging/`)),
    put: vi.fn(async (key: string, body: Buffer) => { objects.set(key, body); }),
    get: vi.fn(async (key: string) => ({ body: objects.get(key) ?? Buffer.from('result'), contentType: 'text/plain', sizeBytes: 6, fileName: 'result.txt' })),
    remove: vi.fn(async (key: string) => { objects.delete(key); }),
  } as unknown as AttachmentStorageService;
  const service = new MessagingService(storage);
  const uploader = user('user-a', 'org-a', 'location-a');

  beforeEach(() => {
    objects.clear();
    vi.clearAllMocks();
  });

  it.each([
    ['another organization', user('user-b', 'org-b', 'location-a')],
    ['another clinic location', user('user-b', 'org-a', 'location-b')],
    ['a non-member in the same clinic', user('user-c', 'org-a', 'location-a')],
  ])('does not expose an uploaded attachment to %s', async (_label, requester) => {
    const upload = await service.uploadAttachment(uploader, { fileName: 'result.txt', mimeType: 'text/plain', contentBase64: 'cmVzdWx0' });
    vi.mocked(prisma.messagingAttachment.findFirst).mockResolvedValue(null);

    await expect(service.downloadAttachment(requester, 'attachment-a')).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.messagingAttachment.findFirst).toHaveBeenCalledWith({ where: {
      id: 'attachment-a',
      organizationId: requester.organizationId,
      storageKey: { not: null },
      message: { conversation: {
        members: { some: { userId: requester.id, organizationId: requester.organizationId } },
        OR: [{ locationId: null }, { locationId: requester.locationId }],
      } },
    } });
    expect(objects.get(upload.storageKey)).toEqual(Buffer.from('result'));
    expect(vi.mocked(storage.get)).not.toHaveBeenCalled();
  });

  it('rejects a storage key from another tenant before reading it', async () => {
    vi.mocked(prisma.messagingConversationMember.findFirst).mockResolvedValue({ id: 'membership-a' } as never);
    vi.mocked(prisma.user.findMany).mockResolvedValue([]);

    await expect(service.createMessage(uploader, 'conversation-a', createMessageInput('organizations/org-b/locations/location-a/messaging/object-b'))).rejects.toThrow('Attachment is unavailable');
    expect(vi.mocked(storage.get)).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('removes an uploaded object when message creation fails', async () => {
    const upload = await service.uploadAttachment(uploader, { fileName: 'result.txt', mimeType: 'text/plain', contentBase64: 'cmVzdWx0' });
    vi.mocked(prisma.messagingConversationMember.findFirst).mockResolvedValue({ id: 'membership-a' } as never);
    vi.mocked(prisma.user.findMany).mockResolvedValue([]);
    vi.mocked(prisma.$transaction).mockRejectedValue(new Error('message write failed'));

    await expect(service.createMessage(uploader, 'conversation-a', createMessageInput(upload.storageKey))).rejects.toThrow('message write failed');
    expect(storage.remove).toHaveBeenCalledWith(upload.storageKey);
    expect(objects.has(upload.storageKey)).toBe(false);
  });
});
