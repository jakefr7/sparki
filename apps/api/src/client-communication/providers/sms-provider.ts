/**
 * The boundary between Sparki's conversation model and whoever carries the
 * text. Swap or add an implementation here, never at the call sites: every
 * caller knows only these shapes, so changing provider does not touch the
 * conversation history, the API, or the UI.
 */

export interface SmsSendRequest {
  /** The clinic location's sender number, E.164. */
  from: string;
  /** The client's number, E.164. */
  to: string;
  body: string;
  /** Provider-side grouping for the clinic location, when it has one. */
  profileId: string | null;
}

/**
 * What happened to a send attempt. The four outcomes are deliberately
 * distinct because they demand different handling:
 * - accepted: the provider has it. Delivery is reported later by webhook.
 * - rejected: the provider refused; trying again cannot help.
 * - retryable: the provider said it did not take the message (rate limit,
 *   its own outage); trying again later is safe.
 * - unknown: no answer came back. The message may have gone out, so it must
 *   never be retried automatically — that is how a client gets two texts.
 */
export type SmsSendResult =
  | { outcome: 'accepted'; providerMessageId: string; segments: number | null }
  | { outcome: 'rejected'; code: string; detail: string; recipientOptedOut: boolean }
  | { outcome: 'retryable'; code: string; detail: string }
  | { outcome: 'unknown'; detail: string };

export type ProviderDeliveryStatus = 'SENT' | 'DELIVERED' | 'DELIVERY_UNCONFIRMED' | 'FAILED';

interface ProviderEventBase {
  /** The provider's own id for this webhook delivery (dedupe key). */
  eventId: string;
  type: string;
}

export interface ProviderInboundEvent extends ProviderEventBase {
  kind: 'inbound';
  providerMessageId: string;
  /** The client's number, E.164. */
  from: string;
  /** Every destination on the message; one of them is a clinic number. */
  to: string[];
  body: string;
  segments: number | null;
  media: Array<{ url: string; contentType: string | null; sizeBytes: number | null }>;
}

export interface ProviderStatusEvent extends ProviderEventBase {
  kind: 'status';
  providerMessageId: string;
  status: ProviderDeliveryStatus;
  /** The clinic's sender number, E.164. */
  from: string | null;
  /** The client's number, E.164. */
  to: string | null;
  body: string | null;
  segments: number | null;
  errorCode: string | null;
  errorDetail: string | null;
}

export interface ProviderIgnoredEvent extends ProviderEventBase {
  kind: 'ignored';
}

export type ProviderEvent = ProviderInboundEvent | ProviderStatusEvent | ProviderIgnoredEvent;
