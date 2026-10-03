import { createPublicKey, verify } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { AppConfigService } from '../../config/app-config.service';
import type {
  ProviderDeliveryStatus,
  ProviderEvent,
  SmsSendRequest,
  SmsSendResult,
} from './sms-provider';

const TELNYX_MESSAGES_URL = 'https://api.telnyx.com/v2/messages';
const SEND_TIMEOUT_MS = 10_000;
/** Telnyx's documented replay window for signed webhooks. */
const WEBHOOK_TOLERANCE_SECONDS = 300;
/** Telnyx's error for a number that texted STOP to this messaging profile. */
const OPT_OUT_BLOCK_CODE = '40300';
// DER header that turns a raw 32-byte Ed25519 public key into the SPKI form
// node:crypto loads.
const ED25519_SPKI_PREFIX = Buffer.from('302a300506032b6570032100', 'hex');
// Failures that happen before any request reaches Telnyx.
const NOT_SENT_NETWORK_CODES = new Set(['ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN']);

const errorSchema = z.object({
  code: z.union([z.string(), z.number()]).optional(),
  title: z.string().optional(),
  detail: z.string().optional(),
});

const sendResponseSchema = z.object({
  data: z.object({ id: z.string().min(1), parts: z.number().int().optional() }),
});

const webhookSchema = z.object({
  data: z.object({
    id: z.string().min(1),
    event_type: z.string().min(1),
    payload: z
      .object({
        id: z.string().min(1),
        from: z.object({ phone_number: z.string().optional() }).optional(),
        to: z
          .array(z.object({ phone_number: z.string().optional(), status: z.string().optional() }))
          .optional(),
        text: z.string().nullish(),
        parts: z.number().int().nullish(),
        media: z
          .array(
            z.object({
              url: z.string(),
              content_type: z.string().nullish(),
              size: z.number().int().nullish(),
            }),
          )
          .nullish(),
        errors: z.array(errorSchema).nullish(),
      })
      .optional(),
  }),
});

const FINAL_STATUSES: Record<string, ProviderDeliveryStatus> = {
  sent: 'SENT',
  delivered: 'DELIVERED',
  delivery_unconfirmed: 'DELIVERY_UNCONFIRMED',
  sending_failed: 'FAILED',
  delivery_failed: 'FAILED',
  expired: 'FAILED',
};

function describeError(error: z.infer<typeof errorSchema> | undefined, fallback: string) {
  return {
    code: error?.code !== undefined ? String(error.code) : fallback,
    detail: [error?.title, error?.detail].filter(Boolean).join(': ') || fallback,
  };
}

/**
 * Telnyx Messaging over its HTTP API, no SDK — one POST and one signature
 * check do not justify a dependency (same reasoning as EmailService).
 *
 * Not yet exercised against a live Telnyx account: request and webhook
 * shapes follow Telnyx's published API reference and are covered by unit
 * tests built from its documented payloads.
 */
@Injectable()
export class TelnyxSmsProvider {
  constructor(private readonly config: AppConfigService) {}

  get isConfigured(): boolean {
    const { apiKey, publicKey } = this.config.telnyx;
    return Boolean(apiKey && publicKey);
  }

  async send(request: SmsSendRequest): Promise<SmsSendResult> {
    const { apiKey } = this.config.telnyx;
    if (!apiKey) {
      return {
        outcome: 'rejected',
        code: 'PROVIDER_NOT_CONFIGURED',
        detail: 'Telnyx credentials are not configured.',
        recipientOptedOut: false,
      };
    }

    let response: Response;
    try {
      response = await fetch(TELNYX_MESSAGES_URL, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: request.from,
          to: request.to,
          text: request.body,
          type: 'SMS',
          ...(request.profileId ? { messaging_profile_id: request.profileId } : {}),
        }),
        signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
      });
    } catch (error) {
      const code = (error as { cause?: { code?: string } }).cause?.code;
      if (code && NOT_SENT_NETWORK_CODES.has(code)) {
        return { outcome: 'retryable', code, detail: 'Could not reach Telnyx.' };
      }
      // A timeout or dropped connection after the request left: Telnyx may
      // have accepted it.
      return { outcome: 'unknown', detail: 'No response from Telnyx.' };
    }

    if (response.ok) {
      const parsed = sendResponseSchema.safeParse(await response.json().catch(() => null));
      if (!parsed.success) {
        return {
          outcome: 'unknown',
          detail: 'Telnyx accepted the request but returned no message id.',
        };
      }
      return {
        outcome: 'accepted',
        providerMessageId: parsed.data.data.id,
        segments: parsed.data.data.parts ?? null,
      };
    }

    const body = (await response.json().catch(() => null)) as { errors?: unknown } | null;
    const errors = z.array(errorSchema).safeParse(body?.errors);
    const { code, detail } = describeError(
      errors.success ? errors.data[0] : undefined,
      `HTTP_${response.status}`,
    );

    // Telnyx explicitly did not take the message; a later attempt is safe.
    if (response.status === 429 || response.status === 503) {
      return { outcome: 'retryable', code, detail };
    }
    // Any other server error could have happened after acceptance.
    if (response.status >= 500) {
      return { outcome: 'unknown', detail };
    }
    return { outcome: 'rejected', code, detail, recipientOptedOut: code === OPT_OUT_BLOCK_CODE };
  }

  /**
   * True only when `rawBody` was signed by Telnyx's account key within the
   * replay window. Telnyx signs `${timestamp}|${rawBody}` with Ed25519, so
   * this must be given the exact request bytes, never re-serialized JSON.
   */
  verifyWebhook(
    rawBody: Buffer,
    signature: string | undefined,
    timestamp: string | undefined,
    now: Date = new Date(),
  ): boolean {
    const { publicKey } = this.config.telnyx;
    if (!publicKey || !signature || !timestamp) return false;
    if (!/^[0-9]+$/.test(timestamp)) return false;
    if (Math.abs(now.getTime() / 1000 - Number(timestamp)) > WEBHOOK_TOLERANCE_SECONDS)
      return false;

    const rawKey = Buffer.from(publicKey, 'base64');
    const signatureBytes = Buffer.from(signature, 'base64');
    if (rawKey.length !== 32 || signatureBytes.length !== 64) return false;
    try {
      const key = createPublicKey({
        key: Buffer.concat([ED25519_SPKI_PREFIX, rawKey]),
        format: 'der',
        type: 'spki',
      });
      return verify(
        null,
        Buffer.concat([Buffer.from(`${timestamp}|`), rawBody]),
        key,
        signatureBytes,
      );
    } catch {
      return false;
    }
  }

  /** Translates a verified webhook body into Sparki's provider-neutral event,
   *  or null when the body is not a Telnyx event at all. */
  parseWebhook(body: unknown): ProviderEvent | null {
    const parsed = webhookSchema.safeParse(body);
    if (!parsed.success) return null;
    const { id: eventId, event_type: type, payload } = parsed.data.data;
    const ignored: ProviderEvent = { kind: 'ignored', eventId, type };
    if (!payload) return ignored;

    const destinations = (payload.to ?? []).flatMap((entry) =>
      entry.phone_number ? [entry.phone_number] : [],
    );

    if (type === 'message.received') {
      const from = payload.from?.phone_number;
      if (!from || destinations.length === 0) return ignored;
      return {
        kind: 'inbound',
        eventId,
        type,
        providerMessageId: payload.id,
        from,
        to: destinations,
        body: payload.text ?? '',
        segments: payload.parts ?? null,
        media: (payload.media ?? []).map((item) => ({
          url: item.url,
          contentType: item.content_type ?? null,
          sizeBytes: item.size ?? null,
        })),
      };
    }

    if (type === 'message.sent' || type === 'message.finalized') {
      const reported = payload.to?.[0]?.status;
      const status =
        type === 'message.sent' ? 'SENT' : reported ? FINAL_STATUSES[reported] : undefined;
      if (!status) return ignored;
      const error =
        status === 'FAILED' ? describeError(payload.errors?.[0], reported ?? 'FAILED') : null;
      return {
        kind: 'status',
        eventId,
        type,
        providerMessageId: payload.id,
        status,
        from: payload.from?.phone_number ?? null,
        to: destinations[0] ?? null,
        body: payload.text ?? null,
        segments: payload.parts ?? null,
        errorCode: error?.code ?? null,
        errorDetail: error?.detail ?? null,
      };
    }

    return ignored;
  }
}
