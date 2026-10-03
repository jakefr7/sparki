import type { ClientCommunicationMessageStatus, UserRole } from '@sparki/db';
import { SKIP_REASONS, type SkipReason } from './notifications/notification-constants';

/**
 * Who may read and send client conversations: every clinic staff role.
 * Reception owns client communication (docs/blueprint/
 * 11-permission-and-ownership-v1.md), but technicians follow up after
 * visits and veterinarians answer clinical questions, so none is excluded.
 * CLIENT is: a pet owner's account must never read the clinic's inbox.
 */
export const CLIENT_COMMUNICATION_ROLES: UserRole[] = [
  'OWNER',
  'PRACTICE_MANAGER',
  'RECEPTIONIST',
  'VETERINARIAN',
  'TECHNICIAN',
  'ASSISTANT',
];

/** How many times a message the provider explicitly did not take is tried. */
export const MAX_SEND_ATTEMPTS = 3;
/** Wait before attempt 2 and attempt 3. */
export const RETRY_DELAYS_MS = [20_000, 90_000];
/** A SENDING message older than this lost its dispatcher mid-send. */
export const STALE_SENDING_MS = 2 * 60_000;

export const MAX_INBOUND_ATTACHMENT_BYTES = 10 * 1024 * 1024;
export const MAX_ATTACHMENT_ATTEMPTS = 3;
/** What a client can usefully send a clinic: photos and documents. */
export const INBOUND_ATTACHMENT_TYPES = new Map([
  ['image/jpeg', 'jpg'],
  ['image/png', 'png'],
  ['image/gif', 'gif'],
  ['image/webp', 'webp'],
  ['image/heic', 'heic'],
  ['image/heif', 'heif'],
  ['application/pdf', 'pdf'],
]);

export const FAILURE_OUTCOME_UNKNOWN = 'OUTCOME_UNKNOWN';

// Plain-language explanations for staff. Provider codes are Telnyx's.
const FAILURE_MESSAGES: Record<string, string> = {
  [FAILURE_OUTCOME_UNKNOWN]:
    'Sparki could not confirm whether this text was sent. Check with the client before sending it again.',
  '40300': 'The client opted out of texts from the clinic.',
  '40001': 'This number cannot receive texts. It may be a landline.',
  '40012': 'The carrier rejected this number.',
  '40002': 'The carrier blocked this message as spam.',
  '40003': 'The carrier blocked this message as spam.',
  '40017': 'The carrier blocked this message as spam.',
  '40010': "The clinic's number is not registered for texting yet.",
  '40016': "The clinic reached a carrier's daily texting limit.",
  '40018': "The clinic reached a carrier's daily texting limit.",
};

export function failureMessage(code: string | null): string {
  if (!code) return 'The text could not be delivered.';
  return (
    FAILURE_MESSAGES[code] ?? SKIP_REASONS[code as SkipReason] ?? 'The text could not be delivered.'
  );
}

/**
 * Delivery updates arrive out of order (a "delivered" webhook can beat the
 * "sent" one, or the send request's own response). A status only ever moves
 * to a higher rank, so a late, older fact can never overwrite a newer one.
 */
const STATUS_RANK: Record<ClientCommunicationMessageStatus, number> = {
  QUEUED: 0,
  SENDING: 1,
  OUTCOME_UNKNOWN: 1,
  SENT: 2,
  DELIVERY_UNCONFIRMED: 3,
  DELIVERED: 4,
  FAILED: 4,
  RECEIVED: 5,
  SIMULATED: 5,
  CANCELLED: 5,
};

export function statusAdvances(
  current: ClientCommunicationMessageStatus,
  next: ClientCommunicationMessageStatus,
): boolean {
  return STATUS_RANK[next] > STATUS_RANK[current];
}

/** An outbound message staff may choose to send again as a new message. */
export function isDeliveryProblem(status: ClientCommunicationMessageStatus): boolean {
  return status === 'FAILED' || status === 'OUTCOME_UNKNOWN';
}
