import { generateKeyPairSync, sign } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AppConfigService } from '../../config/app-config.service';
import { TelnyxSmsProvider } from './telnyx-sms.provider';

const { publicKey, privateKey } = generateKeyPairSync('ed25519');
// Telnyx publishes the raw 32-byte key, base64-encoded: the tail of the DER.
const rawPublicKey = publicKey
  .export({ format: 'der', type: 'spki' })
  .subarray(-32)
  .toString('base64');

function provider(
  telnyx: { apiKey?: string; publicKey?: string } = { apiKey: 'KEY_test', publicKey: rawPublicKey },
) {
  return new TelnyxSmsProvider({ telnyx } as unknown as AppConfigService);
}

function signed(body: string, timestamp: number) {
  return sign(null, Buffer.from(`${timestamp}|${body}`), privateKey).toString('base64');
}

const request = {
  from: '+13125550100',
  to: '+13125550142',
  body: 'Finley is ready to go home.',
  profileId: 'profile-1',
};

function respond(status: number, body: unknown) {
  return vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    }),
  );
}

describe('TelnyxSmsProvider.send', () => {
  afterEach(() => vi.restoreAllMocks());

  it('posts the message and reports acceptance with the provider id and segment count', async () => {
    const fetchMock = respond(200, { data: { id: 'msg-1', parts: 2 } });

    await expect(provider().send(request)).resolves.toEqual({
      outcome: 'accepted',
      providerMessageId: 'msg-1',
      segments: 2,
    });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://api.telnyx.com/v2/messages');
    expect((init!.headers as Record<string, string>).Authorization).toBe('Bearer KEY_test');
    expect(JSON.parse(init!.body as string)).toEqual({
      from: '+13125550100',
      to: '+13125550142',
      text: 'Finley is ready to go home.',
      type: 'SMS',
      messaging_profile_id: 'profile-1',
    });
  });

  it('treats a STOP block as a rejection that means the client opted out', async () => {
    respond(400, {
      errors: [
        { code: '40300', title: 'Blocked due to STOP message', detail: 'Existing block rule.' },
      ],
    });

    await expect(provider().send(request)).resolves.toEqual({
      outcome: 'rejected',
      code: '40300',
      detail: 'Blocked due to STOP message: Existing block rule.',
      recipientOptedOut: true,
    });
  });

  it('treats other client errors as final rejections', async () => {
    respond(422, { errors: [{ code: 40001, title: 'Not Routable' }] });

    await expect(provider().send(request)).resolves.toMatchObject({
      outcome: 'rejected',
      code: '40001',
      recipientOptedOut: false,
    });
  });

  it.each([429, 503])('treats HTTP %s as safe to retry', async (status) => {
    respond(status, { errors: [{ code: '10011', title: 'Too many requests' }] });

    await expect(provider().send(request)).resolves.toMatchObject({ outcome: 'retryable' });
  });

  it('treats other server errors as an unknown outcome, never a retry', async () => {
    respond(500, {});

    await expect(provider().send(request)).resolves.toMatchObject({ outcome: 'unknown' });
  });

  it('treats a timeout as an unknown outcome', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(
      new DOMException('The operation timed out.', 'TimeoutError'),
    );

    await expect(provider().send(request)).resolves.toMatchObject({ outcome: 'unknown' });
  });

  it('treats a connection that never opened as safe to retry', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(
      Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNREFUSED' } }),
    );

    await expect(provider().send(request)).resolves.toMatchObject({
      outcome: 'retryable',
      code: 'ECONNREFUSED',
    });
  });

  it('treats an accepted response with no message id as unknown', async () => {
    respond(200, { data: {} });

    await expect(provider().send(request)).resolves.toMatchObject({ outcome: 'unknown' });
  });

  it('never calls Telnyx without credentials', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');

    await expect(provider({}).send(request)).resolves.toMatchObject({
      outcome: 'rejected',
      code: 'PROVIDER_NOT_CONFIGURED',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('TelnyxSmsProvider.verifyWebhook', () => {
  const body = JSON.stringify({ data: { id: 'evt-1' } });
  const now = new Date('2026-10-02T15:00:00Z');
  const timestamp = Math.floor(now.getTime() / 1000);

  it('accepts a body signed by the configured key', () => {
    expect(
      provider().verifyWebhook(Buffer.from(body), signed(body, timestamp), String(timestamp), now),
    ).toBe(true);
  });

  it('rejects a body that changed after signing', () => {
    expect(
      provider().verifyWebhook(
        Buffer.from(`${body} `),
        signed(body, timestamp),
        String(timestamp),
        now,
      ),
    ).toBe(false);
  });

  it('rejects a signature from another key', () => {
    const other = generateKeyPairSync('ed25519').privateKey;
    const forged = sign(null, Buffer.from(`${timestamp}|${body}`), other).toString('base64');

    expect(provider().verifyWebhook(Buffer.from(body), forged, String(timestamp), now)).toBe(false);
  });

  it('rejects a replay outside the five-minute window', () => {
    const old = timestamp - 301;

    expect(provider().verifyWebhook(Buffer.from(body), signed(body, old), String(old), now)).toBe(
      false,
    );
  });

  it.each([
    ['a missing signature', undefined, String(timestamp)],
    ['a missing timestamp', signed(body, timestamp), undefined],
    ['a non-numeric timestamp', signed(body, timestamp), 'yesterday'],
    ['a malformed signature', 'not-a-signature', String(timestamp)],
  ])('rejects %s', (_label, signature, stamp) => {
    expect(provider().verifyWebhook(Buffer.from(body), signature, stamp, now)).toBe(false);
  });

  it('rejects everything when no public key is configured', () => {
    expect(
      provider({ apiKey: 'KEY_test' }).verifyWebhook(
        Buffer.from(body),
        signed(body, timestamp),
        String(timestamp),
        now,
      ),
    ).toBe(false);
  });
});

describe('TelnyxSmsProvider.parseWebhook', () => {
  // Payload shapes follow Telnyx's documented messaging webhooks.
  const envelope = (eventType: string, payload: Record<string, unknown>) => ({
    data: {
      id: `evt-${eventType}`,
      event_type: eventType,
      occurred_at: '2026-10-02T15:00:00.000+00:00',
      payload,
      record_type: 'event',
    },
    meta: { attempt: 1 },
  });

  it('reads an inbound message with its photo', () => {
    const event = provider().parseWebhook(
      envelope('message.received', {
        id: 'in-1',
        direction: 'inbound',
        from: { phone_number: '+13125550142', carrier: 'T-Mobile USA' },
        to: [{ phone_number: '+13125550100', status: 'webhook_delivered' }],
        text: 'Here is the incision',
        type: 'MMS',
        parts: 1,
        media: [
          { url: 'https://media.example.test/a.jpg', content_type: 'image/jpeg', size: 2048 },
        ],
        errors: [],
      }),
    );

    expect(event).toEqual({
      kind: 'inbound',
      eventId: 'evt-message.received',
      type: 'message.received',
      providerMessageId: 'in-1',
      from: '+13125550142',
      to: ['+13125550100'],
      body: 'Here is the incision',
      segments: 1,
      media: [
        { url: 'https://media.example.test/a.jpg', contentType: 'image/jpeg', sizeBytes: 2048 },
      ],
    });
  });

  it('reads message.sent as SENT', () => {
    const event = provider().parseWebhook(
      envelope('message.sent', {
        id: 'out-1',
        from: { phone_number: '+13125550100' },
        to: [{ phone_number: '+13125550142', status: 'sent' }],
        text: 'Hello',
        parts: 1,
      }),
    );

    expect(event).toMatchObject({
      kind: 'status',
      providerMessageId: 'out-1',
      status: 'SENT',
      to: '+13125550142',
    });
  });

  it.each([
    ['delivered', 'DELIVERED'],
    ['delivery_unconfirmed', 'DELIVERY_UNCONFIRMED'],
    ['delivery_failed', 'FAILED'],
    ['sending_failed', 'FAILED'],
    ['expired', 'FAILED'],
  ])('reads message.finalized %s as %s', (reported, status) => {
    const event = provider().parseWebhook(
      envelope('message.finalized', {
        id: 'out-1',
        from: { phone_number: '+13125550100' },
        to: [{ phone_number: '+13125550142', status: reported }],
        text: 'Hello',
        errors: [{ code: '40001', title: 'Not Routable', detail: 'Landline.' }],
      }),
    );

    expect(event).toMatchObject({ kind: 'status', status });
    if (status === 'FAILED') {
      expect(event).toMatchObject({ errorCode: '40001', errorDetail: 'Not Routable: Landline.' });
    } else {
      expect(event).toMatchObject({ errorCode: null, errorDetail: null });
    }
  });

  it('ignores event types and statuses it does not use', () => {
    expect(provider().parseWebhook(envelope('10dlc.campaign.status', { id: 'c-1' }))).toMatchObject(
      { kind: 'ignored' },
    );
    expect(
      provider().parseWebhook(
        envelope('message.finalized', {
          id: 'out-1',
          to: [{ phone_number: '+13125550142', status: 'queued' }],
        }),
      ),
    ).toMatchObject({ kind: 'ignored' });
  });

  it('returns null for a body that is not a Telnyx event', () => {
    expect(provider().parseWebhook({ hello: 'world' })).toBeNull();
    expect(provider().parseWebhook(null)).toBeNull();
  });
});
