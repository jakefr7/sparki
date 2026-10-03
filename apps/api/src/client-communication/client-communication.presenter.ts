import type { Prisma } from '@sparki/db';
import { formatUsPhone } from '../common/phone';
import { failureMessage, isDeliveryProblem } from './client-communication.constants';
import type { ConsentView } from './client-texting-consent.service';
import { isTextingVisible, type TextingReadiness } from './client-texting-readiness.service';
import { MAX_MESSAGE_LENGTH } from './sms-text';

export const personSelect = {
  id: true,
  firstName: true,
  lastName: true,
  displayName: true,
} as const;

export const clientSelect = {
  id: true,
  firstName: true,
  lastName: true,
  phone: true,
  alternatePhone: true,
  phoneE164: true,
  alternatePhoneE164: true,
  email: true,
  preferredContactMethod: true,
} as const;

export const messageInclude = {
  senderUser: { select: personSelect },
  attachments: { orderBy: { createdAt: 'asc' } },
} satisfies Prisma.ClientCommunicationMessageInclude;

export const threadInclude = {
  client: { select: clientSelect },
  assignedTo: { select: personSelect },
  lastMessage: { include: messageInclude },
} satisfies Prisma.ClientCommunicationThreadInclude;

export type MessageRow = Prisma.ClientCommunicationMessageGetPayload<{
  include: typeof messageInclude;
}>;
export type ThreadRow = Prisma.ClientCommunicationThreadGetPayload<{
  include: typeof threadInclude;
}>;
type Person = { id: string; firstName: string; lastName: string; displayName: string | null };

/**
 * How a conversation's phone number relates to the clinic's client records.
 * - MATCHED: linked to the one client who has this number.
 * - SHARED: linked, but another client record has the same number.
 * - NEEDS_LINK: not linked, and at least one client record has the number.
 * - UNMATCHED: not linked, and no client record has the number.
 * - NUMBER_NOT_ON_CLIENT: linked to a client whose record no longer has it.
 */
export type MatchState = 'MATCHED' | 'SHARED' | 'NEEDS_LINK' | 'UNMATCHED' | 'NUMBER_NOT_ON_CLIENT';

export interface ClientCandidate {
  id: string;
  firstName: string;
  lastName: string;
}

export function matchState(clientId: string | null, candidates: ClientCandidate[]): MatchState {
  if (!clientId) return candidates.length > 0 ? 'NEEDS_LINK' : 'UNMATCHED';
  if (!candidates.some((candidate) => candidate.id === clientId)) return 'NUMBER_NOT_ON_CLIENT';
  return candidates.length > 1 ? 'SHARED' : 'MATCHED';
}

export function presentPerson(person: Person | null) {
  return person
    ? { id: person.id, name: person.displayName ?? `${person.firstName} ${person.lastName}` }
    : null;
}

export function presentMessage(message: MessageRow) {
  const problem = isDeliveryProblem(message.status);
  // Withdrawn by Sparki before sending: says why, but is not offered for resend.
  const notSent = problem || message.status === 'CANCELLED';
  return {
    id: message.id,
    threadId: message.threadId,
    direction: message.direction,
    source: message.source,
    status: message.status,
    // True for anything that never left (or never entered) Sparki.
    simulated: message.provider === 'SIMULATED',
    body: message.body,
    sender: presentPerson(message.senderUser),
    clientId: message.clientId,
    patientId: message.patientId,
    appointmentId: message.appointmentId,
    segments: message.segments,
    createdAt: message.createdAt.toISOString(),
    updatedAt: message.updatedAt.toISOString(),
    sentAt: message.sentAt?.toISOString() ?? null,
    deliveredAt: message.deliveredAt?.toISOString() ?? null,
    failedAt: message.failedAt?.toISOString() ?? null,
    // Set while a retry is scheduled, so "queued" can say when it tries next.
    nextAttemptAt:
      message.status === 'QUEUED' ? (message.nextAttemptAt?.toISOString() ?? null) : null,
    failure: notSent
      ? {
          code: message.failureCode,
          message: failureMessage(message.failureCode),
          detail: message.failureDetail,
        }
      : null,
    // Sending again is always a new message with a new idempotency key — a
    // deliberate staff action, never automatic.
    canResend: message.direction === 'OUTBOUND' && problem,
    attachments: message.attachments.map((attachment) => ({
      id: attachment.id,
      status: attachment.status,
      mimeType: attachment.mimeType,
      sizeBytes: attachment.sizeBytes,
      href:
        attachment.status === 'STORED'
          ? `/client-communication/attachments/${attachment.id}`
          : null,
    })),
  };
}

export function presentThread(
  thread: ThreadRow,
  extras: { candidates: ClientCandidate[]; consentStatus: ConsentView['status'] },
) {
  return {
    id: thread.id,
    version: thread.version,
    status: thread.status,
    contactPhone: thread.contactPhoneE164,
    contactPhoneDisplay: formatUsPhone(thread.contactPhoneE164),
    client: thread.client
      ? {
          id: thread.client.id,
          firstName: thread.client.firstName,
          lastName: thread.client.lastName,
        }
      : null,
    matchState: matchState(thread.clientId, extras.candidates),
    assignedTo: presentPerson(thread.assignedTo),
    unreadCount: thread.unreadCount,
    unread: thread.unreadCount > 0 || thread.markedUnread,
    consentStatus: extras.consentStatus,
    deliveryProblemSince: thread.deliveryProblemSince?.toISOString() ?? null,
    lastMessageAt: thread.lastMessageAt.toISOString(),
    lastInboundAt: thread.lastInboundAt?.toISOString() ?? null,
    lastMessage: thread.lastMessage ? presentMessage(thread.lastMessage) : null,
    createdAt: thread.createdAt.toISOString(),
  };
}

export function presentReadiness(
  readiness: TextingReadiness,
  location: { id: string; name: string; organization: { id: string; name: string } },
) {
  const sender = readiness.channel?.senderPhoneE164 ?? null;
  return {
    mode: readiness.mode,
    // Show the Communication tab only when this is true: texting works here,
    // for real or in simulation. A clinic whose number is not approved yet
    // sees nothing.
    visible: isTextingVisible(readiness),
    reasonCode: readiness.mode === 'UNAVAILABLE' ? readiness.code : null,
    reason: readiness.mode === 'UNAVAILABLE' ? readiness.reason : null,
    senderPhone: sender,
    senderPhoneDisplay: sender ? formatUsPhone(sender) : null,
    location: { id: location.id, name: location.name },
    organization: location.organization,
    capabilities: {
      // Files a client sends are stored; the clinic cannot send files yet.
      receiveFiles: readiness.mode === 'LIVE',
      sendFiles: false,
      simulateClientReply: readiness.mode === 'SIMULATED',
    },
    limits: { maxMessageLength: MAX_MESSAGE_LENGTH },
  };
}
