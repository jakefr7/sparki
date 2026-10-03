import { ClinicApiError } from './clinic-api';
import { recoverFromInvalidSession } from './session-recovery';

export interface Person {
  id: string;
  name: string;
}
export interface ClientContact {
  id: string;
  firstName: string;
  lastName: string;
}
export interface TextingReadiness {
  mode: 'NOT_SET_UP' | 'SIMULATED' | 'LIVE' | 'UNAVAILABLE';
  visible: boolean;
  reason: string | null;
  senderPhoneDisplay: string | null;
  location: { id: string; name: string };
  organization: { id: string; name: string };
  capabilities: { simulateClientReply: boolean; sendFiles: boolean; receiveFiles: boolean };
  limits: { maxMessageLength: number };
}
export interface ClientMessage {
  id: string;
  threadId: string;
  direction: 'INBOUND' | 'OUTBOUND';
  source: 'STAFF' | 'CLIENT' | 'AUTOMATED';
  status: string;
  simulated: boolean;
  body: string;
  sender: Person | null;
  patientId: string | null;
  appointmentId: string | null;
  createdAt: string;
  updatedAt: string;
  nextAttemptAt: string | null;
  failure: { code: string | null; message: string; detail: string | null } | null;
  canResend: boolean;
  attachments: {
    id: string;
    status: 'PENDING' | 'STORED' | 'FAILED';
    mimeType: string;
    href: string | null;
  }[];
}
export interface ClientThread {
  id: string;
  version: number;
  status: 'OPEN' | 'WAITING' | 'CLOSED';
  contactPhone: string;
  contactPhoneDisplay: string;
  client: ClientContact | null;
  matchState: string;
  assignedTo: Person | null;
  unread: boolean;
  unreadCount: number;
  deliveryProblemSince: string | null;
  lastMessageAt: string;
  lastMessage: ClientMessage | null;
}
export interface ClientThreadDetail extends ClientThread {
  contact: {
    phone: string | null;
    alternatePhone: string | null;
    email: string | null;
    preferredContactMethod: string | null;
  };
  patients: { id: string; name: string; species: string; breed: string | null }[];
  clientCandidates: ClientContact[];
  consent: {
    status: string;
    basis: string | null;
    staffMayGrant: boolean;
    automatedTextsAllowed: boolean;
    recordedAt: string | null;
    recordedBy: Person | null;
  };
  sendEligibility: { canSend: boolean; code: string | null; message: string | null };
  events: { id: string; type: string; actor: Person | null; createdAt: string }[];
}
export type QueueView =
  'all' | 'unread' | 'open' | 'waiting' | 'closed' | 'mine' | 'unassigned' | 'problems';
export interface ThreadPage {
  threads: ClientThread[];
  nextCursor: string | null;
  counts: Partial<Record<QueueView, number>> | null;
}
export interface MessagePage {
  messages: ClientMessage[];
  olderCursor: string | null;
  asOf: string;
}
export async function communicationRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api/client-communication/${path}`, {
    cache: 'no-store',
    ...init,
    headers: { ...(init?.body ? { 'Content-Type': 'application/json' } : {}), ...init?.headers },
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    if (response.status === 401) void recoverFromInvalidSession();
    const issue = body as {
      code?: string;
      message?: string | string[];
      rules?: { index: number; problems: string[] }[];
    } | null;
    const wording = issue?.rules
      ?.map((rule) => `Message ${rule.index + 1}: ${rule.problems.join(' ')}`)
      .join(' ');
    const message =
      wording ||
      (Array.isArray(issue?.message) ? issue.message.join(' ') : issue?.message) ||
      'That request could not be completed.';
    throw new ClinicApiError(response.status, issue?.code ?? null, message);
  }
  return body as T;
}
export function communicationError(error: unknown): string {
  if (error instanceof ClinicApiError) {
    if (error.code === 'THREAD_CHANGED')
      return 'Someone updated this conversation. The latest details are shown; review them before trying again.';
    if (error.status === 403) return 'Your role does not have access to client texting.';
    return error.message;
  }
  return 'Connection interrupted. Your draft is still here. Try again.';
}
export function contactName(thread: ClientThread): string {
  return thread.client
    ? `${thread.client.firstName} ${thread.client.lastName}`
    : thread.contactPhoneDisplay;
}
export function deliveryLabel(message: ClientMessage): string {
  if (message.status === 'CANCELLED') return 'Not sent';
  if (message.simulated || message.status === 'SIMULATED') return 'Simulated · not sent externally';
  const labels: Record<string, string> = {
    QUEUED: 'Queued',
    SENDING: 'Sending',
    SENT: 'Sent',
    DELIVERED: 'Delivered',
    DELIVERY_UNCONFIRMED: 'Delivery unconfirmed',
    FAILED: 'Failed',
    OUTCOME_UNKNOWN: 'Delivery unknown',
    RECEIVED: 'Received',
  };
  return labels[message.status] ?? 'Status unavailable';
}
export function mergeMessages(
  existing: ClientMessage[],
  incoming: ClientMessage[],
): ClientMessage[] {
  const byId = new Map(existing.map((message) => [message.id, message]));
  incoming.forEach((message) => byId.set(message.id, message));
  return [...byId.values()].sort(
    (a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id),
  );
}
