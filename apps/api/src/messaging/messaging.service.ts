import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, prisma } from '@sparki/db';
import type { AuthenticatedUser } from '../auth/types';
import type { CreateConversationInput, CreateMessageInput, UpdateMembershipInput, UpdateMessageInput } from './dto/messaging.schema';
import { ALLOWED_ATTACHMENT_TYPES, AttachmentStorageService, MAX_ATTACHMENT_BYTES } from './attachment-storage.service';

const staffRoles = ['OWNER', 'PRACTICE_MANAGER', 'RECEPTIONIST', 'VETERINARIAN', 'TECHNICIAN', 'ASSISTANT'] as const;
const personSelect = { id: true, firstName: true, lastName: true, displayName: true, avatarUrl: true, statusEmoji: true, statusText: true, role: true, staffProfile: { select: { jobTitle: true, color: true } } } as const;
const messageInclude = { sender: { select: personSelect }, replyTo: { select: { id: true, body: true, sender: { select: personSelect } } }, reactions: { include: { user: { select: personSelect } } }, mentions: { select: { userId: true } }, attachments: true } as const;

function cleanBody(body: string) { return body.replace(/<[^>]*>/g, '').split(String.fromCharCode(0)).join('').trim(); }
function nameOf(user: { firstName: string; lastName: string; displayName: string | null }) { return user.displayName ?? `${user.firstName} ${user.lastName}`; }

@Injectable()
export class MessagingService {
  constructor(private readonly attachmentStorage: AttachmentStorageService) {}
  async directory(user: AuthenticatedUser, search?: string) {
    const people = await prisma.user.findMany({
      where: { organizationId: user.organizationId, isActive: true, role: { in: [...staffRoles] }, id: { not: user.id },
        OR: [{ clinicLocationAccess: { some: { clinicLocationId: user.locationId, isActive: true } } }, { locations: { some: { id: user.locationId } } }],
        ...(search?.trim() ? { AND: [{ OR: [{ firstName: { contains: search.trim(), mode: 'insensitive' } }, { lastName: { contains: search.trim(), mode: 'insensitive' } }, { displayName: { contains: search.trim(), mode: 'insensitive' } }] }] } : {}),
      }, select: { ...personSelect, clinicLocationAccess: { where: { isActive: true }, select: { clinicLocation: { select: { id: true, name: true } } } } }, orderBy: [{ role: 'asc' }, { firstName: 'asc' }], take: 100,
    });
    return people.map((person) => ({ ...person, name: nameOf(person), locations: person.clinicLocationAccess.map((access) => access.clinicLocation) }));
  }

  async list(user: AuthenticatedUser, archived = false, search?: string) {
    const term = search?.trim();
    const conversationWhere: Prisma.MessagingConversationWhereInput = {
      organizationId: user.organizationId,
      AND: [
        { OR: [{ locationId: null }, { locationId: user.locationId }] },
        ...(term ? [{ OR: [
          { name: { contains: term, mode: Prisma.QueryMode.insensitive } },
          { members: { some: { user: { OR: [
            { firstName: { contains: term, mode: Prisma.QueryMode.insensitive } },
            { lastName: { contains: term, mode: Prisma.QueryMode.insensitive } },
          ] } } } },
        ] } satisfies Prisma.MessagingConversationWhereInput] : []),
      ],
    };
    const memberships = await prisma.messagingConversationMember.findMany({
      where: { organizationId: user.organizationId, userId: user.id, isArchived: archived, conversation: conversationWhere },
      include: {
        conversation: {
          include: {
            members: { include: { user: { select: personSelect } } },
            messages: { where: { deletedAt: null }, orderBy: { createdAt: 'desc' }, take: 1, include: messageInclude },
          },
        },
      },
      orderBy: [{ isPinned: 'desc' }, { updatedAt: 'desc' }],
      take: 100,
    });
    return Promise.all(memberships.map(async (membership) => {
      const unread = membership.markedUnread || !membership.lastReadAt ? await prisma.messagingMessage.count({ where: { conversationId: membership.conversationId, senderId: { not: user.id }, deletedAt: null, ...(membership.lastReadAt ? { createdAt: { gt: membership.lastReadAt } } : {}) } }) : 0;
      return { ...membership.conversation, messages: membership.conversation.messages.map((message) => this.withPrivateAttachmentLinks(message)), membership: { id: membership.id, notificationLevel: membership.notificationLevel, isPinned: membership.isPinned, isArchived: membership.isArchived, markedUnread: membership.markedUnread, draft: membership.draft, drawerOpen: membership.drawerOpen, drawerMinimized: membership.drawerMinimized, lastReadAt: membership.lastReadAt }, unreadCount: unread };
    }));
  }

  async createConversation(user: AuthenticatedUser, input: CreateConversationInput) {
    const memberIds = [...new Set([user.id, ...input.memberIds])];
    const allowed = await prisma.user.count({ where: { id: { in: memberIds }, organizationId: user.organizationId, isActive: true, role: { in: [...staffRoles] }, OR: [{ id: user.id }, { clinicLocationAccess: { some: { clinicLocationId: user.locationId, isActive: true } } }, { locations: { some: { id: user.locationId } } }] } });
    if (allowed !== memberIds.length) throw new ForbiddenException('One or more staff members are unavailable at this clinic location.');
    if (input.type === 'DIRECT' && memberIds.length !== 2) throw new BadRequestException('Direct messages require exactly two staff members.');
    if (input.type === 'DIRECT') {
      const existing = await prisma.messagingConversation.findFirst({ where: { organizationId: user.organizationId, type: 'DIRECT', members: { every: { userId: { in: memberIds } } }, AND: memberIds.map((id) => ({ members: { some: { userId: id } } })) }, include: { members: true } });
      if (existing?.members.length === 2) return existing;
    }
    return prisma.messagingConversation.create({ data: { organizationId: user.organizationId, locationId: input.type === 'CLINIC_CHANNEL' || input.type === 'LOCATION_CHANNEL' ? user.locationId : null, type: input.type, name: input.name ?? null, isPrivate: input.type === 'PRIVATE_CHANNEL', createdById: user.id, members: { create: memberIds.map((userId) => ({ organizationId: user.organizationId, userId, drawerOpen: userId === user.id })) } }, include: { members: true } });
  }

  async messages(user: AuthenticatedUser, conversationId: string, cursor?: string) {
    await this.member(user, conversationId);
    const rows = await prisma.messagingMessage.findMany({ where: { organizationId: user.organizationId, conversationId }, include: messageInclude, orderBy: { createdAt: 'desc' }, take: 40, ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}) });
    return { messages: rows.reverse().map((message) => this.withPrivateAttachmentLinks(message)), nextCursor: rows.length === 40 ? rows[rows.length - 1]?.id : null };
  }

  async createMessage(user: AuthenticatedUser, conversationId: string, input: CreateMessageInput) {
    await this.member(user, conversationId);
    const body = cleanBody(input.body);
    const mentions = await prisma.user.findMany({ where: { id: { in: input.mentionIds }, organizationId: user.organizationId, isActive: true }, select: { id: true } });
    if (mentions.length !== new Set(input.mentionIds).size) throw new ForbiddenException('Invalid mention recipient.');
    if (input.replyToId) {
      const reply = await prisma.messagingMessage.findFirst({ where: { id: input.replyToId, organizationId: user.organizationId, conversationId }, select: { id: true } });
      if (!reply) throw new BadRequestException('Reply target is not in this conversation.');
    }
    const linked = await Promise.all(input.linkedRecords.map((record) => this.linkedRecord(user, record.recordType, record.recordId)));
    const uploaded = await Promise.all(input.uploadedAttachments.map(async ({ storageKey }) => {
      if (!this.attachmentStorage.belongsTo(storageKey, user.organizationId, user.locationId)) throw new ForbiddenException('Attachment is unavailable in this organization or clinic location.');
      const stored = await this.attachmentStorage.get(storageKey);
      return { storageKey, mimeType: stored.contentType, sizeBytes: stored.sizeBytes, fileName: stored.fileName, previewLabel: stored.fileName };
    }));
    let message;
    try { message = await prisma.$transaction(async (tx) => {
      const created = await tx.messagingMessage.upsert({ where: { conversationId_clientNonce: { conversationId, clientNonce: input.clientNonce } }, update: {}, create: { organizationId: user.organizationId, conversationId, senderId: user.id, clientNonce: input.clientNonce, body, replyToId: input.replyToId ?? null, mentions: { create: mentions.map(({ id }) => ({ organizationId: user.organizationId, userId: id })) }, attachments: { create: [...linked.map((entry) => ({ organizationId: user.organizationId, ...entry })), ...uploaded.map((entry) => ({ organizationId: user.organizationId, ...entry }))] } }, include: messageInclude });
      await tx.messagingConversation.update({ where: { id: conversationId }, data: { lastMessageAt: created.createdAt } });
      await tx.messagingConversationMember.update({ where: { conversationId_userId: { conversationId, userId: user.id } }, data: { draft: '', lastReadAt: new Date(), markedUnread: false } });
      return created;
    }); } catch (error) { await Promise.allSettled(uploaded.map(({ storageKey }) => this.attachmentStorage.remove(storageKey))); throw error; }
    return this.withPrivateAttachmentLinks(message);
  }

  async uploadAttachment(user: AuthenticatedUser, input: { fileName: string; mimeType: string; contentBase64: string }) {
    if (!ALLOWED_ATTACHMENT_TYPES.has(input.mimeType)) throw new BadRequestException('This attachment type is not allowed.');
    const body = Buffer.from(input.contentBase64, 'base64');
    if (!body.length || body.length > MAX_ATTACHMENT_BYTES || body.toString('base64').replace(/=+$/, '') !== input.contentBase64.replace(/=+$/, '')) throw new BadRequestException('Attachment content is invalid or exceeds the 10 MB limit.');
    const storageKey = this.attachmentStorage.key(user.organizationId, user.locationId);
    await this.attachmentStorage.put(storageKey, body, input.mimeType, input.fileName);
    return { storageKey, fileName: input.fileName, mimeType: input.mimeType, sizeBytes: body.length };
  }

  async downloadAttachment(user: AuthenticatedUser, id: string) {
    const attachment = await prisma.messagingAttachment.findFirst({ where: { id, organizationId: user.organizationId, storageKey: { not: null }, message: { conversation: { members: { some: { userId: user.id, organizationId: user.organizationId } }, OR: [{ locationId: null }, { locationId: user.locationId }] } } } });
    if (!attachment?.storageKey || !this.attachmentStorage.belongsTo(attachment.storageKey, user.organizationId, user.locationId)) throw new NotFoundException('Attachment not found.');
    const stored = await this.attachmentStorage.get(attachment.storageKey);
    return { ...stored, mimeType: attachment.mimeType ?? stored.contentType, fileName: attachment.fileName ?? 'attachment' };
  }

  private withPrivateAttachmentLinks<T extends { attachments: Array<{ id: string; storageKey: string | null; href: string | null }> }>(message: T): T {
    return { ...message, attachments: message.attachments.map((attachment) => attachment.storageKey ? { ...attachment, href: `/api/messaging/attachments/${attachment.id}` } : attachment) };
  }

  async updateMembership(user: AuthenticatedUser, conversationId: string, input: UpdateMembershipInput) {
    await this.member(user, conversationId);
    const data: Prisma.MessagingConversationMemberUpdateInput = {};
    if (input.notificationLevel !== undefined) data.notificationLevel = input.notificationLevel;
    if (input.isPinned !== undefined) data.isPinned = input.isPinned;
    if (input.isArchived !== undefined) data.isArchived = input.isArchived;
    if (input.markedUnread !== undefined) data.markedUnread = input.markedUnread;
    if (input.draft !== undefined) data.draft = input.draft;
    if (input.drawerOpen !== undefined) data.drawerOpen = input.drawerOpen;
    if (input.drawerMinimized !== undefined) data.drawerMinimized = input.drawerMinimized;
    if (input.markRead) { data.lastReadAt = new Date(); data.markedUnread = false; }
    return prisma.messagingConversationMember.update({ where: { conversationId_userId: { conversationId, userId: user.id } }, data });
  }

  async updateMessage(user: AuthenticatedUser, id: string, input: UpdateMessageInput) {
    const message = await prisma.messagingMessage.findFirst({ where: { id, organizationId: user.organizationId, senderId: user.id }, select: { id: true, body: true, conversationId: true, deletedAt: true } });
    if (!message) throw new NotFoundException('Message not found.');
    await this.member(user, message.conversationId);
    const action = input.deleted ? 'DELETED' : 'EDITED';
    const body = input.body === undefined ? message.body : cleanBody(input.body);
    return prisma.$transaction(async (tx) => {
      await tx.messagingMessageEdit.create({ data: { organizationId: user.organizationId, messageId: id, editorId: user.id, previousBody: message.body, action } });
      return tx.messagingMessage.update({ where: { id }, data: input.deleted ? { deletedAt: new Date(), body: '' } : { body, editedAt: new Date() }, include: messageInclude });
    });
  }

  async toggleReaction(user: AuthenticatedUser, messageId: string, emoji: string) {
    const message = await this.messageForMember(user, messageId);
    return prisma.messagingReaction.upsert({ where: { messageId_userId_emoji: { messageId, userId: user.id, emoji } }, update: {}, create: { organizationId: user.organizationId, messageId: message.id, userId: user.id, emoji } });
  }
  async removeReaction(user: AuthenticatedUser, messageId: string, emoji: string) { await this.messageForMember(user, messageId); await prisma.messagingReaction.deleteMany({ where: { messageId, userId: user.id, emoji, organizationId: user.organizationId } }); return { id: messageId, emoji }; }

  private async member(user: AuthenticatedUser, conversationId: string) {
    const membership = await prisma.messagingConversationMember.findFirst({ where: { conversationId, userId: user.id, organizationId: user.organizationId, conversation: { organizationId: user.organizationId, OR: [{ locationId: null }, { locationId: user.locationId }] } } });
    if (!membership) throw new NotFoundException('Conversation not found.');
    return membership;
  }
  private async messageForMember(user: AuthenticatedUser, id: string) { const message = await prisma.messagingMessage.findFirst({ where: { id, organizationId: user.organizationId }, select: { id: true, conversationId: true } }); if (!message) throw new NotFoundException('Message not found.'); await this.member(user, message.conversationId); return message; }

  private async linkedRecord(user: AuthenticatedUser, type: CreateMessageInput['linkedRecords'][number]['recordType'], id: string): Promise<{ recordType: typeof type; recordId: string; previewLabel: string; previewDetail: string | null; href: string }> {
    if (type === 'PATIENT') { const row = await prisma.patient.findFirst({ where: { id, organizationId: user.organizationId }, select: { name: true, species: true, breed: true } }); if (row) return { recordType: type, recordId: id, previewLabel: row.name, previewDetail: [row.species, row.breed].filter(Boolean).join(' · '), href: `/patients/${id}` }; }
    if (type === 'CLIENT') { const row = await prisma.client.findFirst({ where: { id, organizationId: user.organizationId }, select: { firstName: true, lastName: true } }); if (row) return { recordType: type, recordId: id, previewLabel: `${row.firstName} ${row.lastName}`, previewDetail: 'Client', href: `/clients/${id}` }; }
    if (type === 'APPOINTMENT') { const row = await prisma.appointment.findFirst({ where: { id, organizationId: user.organizationId, locationId: user.locationId }, include: { patient: { select: { name: true } } } }); if (row) return { recordType: type, recordId: id, previewLabel: row.patient?.name ?? 'Appointment', previewDetail: `${row.type} · ${row.state}`, href: `/scheduler?appointment=${id}` }; }
    if (type === 'VISIT') { const row = await prisma.visit.findFirst({ where: { id, organizationId: user.organizationId, locationId: user.locationId }, include: { patient: { select: { name: true } } } }); if (row) return { recordType: type, recordId: id, previewLabel: row.patient.name, previewDetail: `Visit · ${row.state}`, href: `/visits/${id}` }; }
    if (type === 'TASK') { const row = await prisma.task.findFirst({ where: { id, organizationId: user.organizationId, locationId: user.locationId } }); if (row) return { recordType: type, recordId: id, previewLabel: row.title, previewDetail: `Task · ${row.status}`, href: '/today' }; }
    if (type === 'MEDICAL_RECORD') { const row = await prisma.medicalRecord.findFirst({ where: { id, patient: { organizationId: user.organizationId } }, include: { patient: { select: { id: true, name: true } } } }); if (row) return { recordType: type, recordId: id, previewLabel: row.patient.name, previewDetail: 'Medical record', href: `/patients/${row.patient.id}` }; }
    throw new ForbiddenException('Linked record is unavailable in this organization or clinic location.');
  }
}
