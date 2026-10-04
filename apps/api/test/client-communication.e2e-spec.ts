import { generateKeyPairSync, sign } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { resetEnvCacheForTests } from '@sparki/config';
// Fixtures and assertions use the unscoped client on purpose: they write and
// read rows for several clinics and must see exactly what is stored,
// whatever tenant context is bound. tenant-isolation.e2e-spec.ts covers the
// harness itself.
import { prismaUnscoped as prisma } from '@sparki/db';
import { json, raw } from 'express';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../src/app.module';
import {
  DEV_LOCATION_ID,
  DEV_ORGANIZATION_ID,
  DEV_USER_ID,
} from '../src/auth/development-user.service';
import { ClientCommunicationDispatcher } from '../src/client-communication/client-communication-dispatcher.service';
import { TELNYX_WEBHOOK_PATH } from '../src/client-communication/client-communication-webhook.controller';
import { ClientCommunicationInboundService } from '../src/client-communication/client-communication-inbound.service';
import { ClientTextingConsentService } from '../src/client-communication/client-texting-consent.service';
import { normalizeUsPhone } from '../src/common/phone';
import { AttachmentStorageService } from '../src/messaging/attachment-storage.service';
import { InboundMediaDownloader } from '../src/client-communication/inbound-media-downloader';

const { publicKey, privateKey } = generateKeyPairSync('ed25519');
const TELNYX_PUBLIC_KEY = publicKey
  .export({ format: 'der', type: 'spki' })
  .subarray(-32)
  .toString('base64');

const CLINIC_NUMBER = '+13125550100';
const OTHER_CLINIC_NUMBER = '+13125550199';
const OTHER_LOCATION_ID = 'client-communication-e2e-other-location';

/**
 * Client texting end to end against the real database: the staff API, the
 * dispatcher, and the Telnyx webhook with genuine Ed25519 signatures. The
 * network (global fetch) is stubbed and file storage is held in memory, so
 * nothing here can reach Telnyx, a phone, or a real storage bucket — the
 * developer's .env may point attachment storage at a live one.
 */
describe('Client communication (e2e)', () => {
  let app: INestApplication;
  let dispatcher: ClientCommunicationDispatcher;
  let otherOrganizationId: string;
  let otherOrgLocationId: string;
  let phoneCounter = 100;
  let eventCounter = 0;
  const clientIds: string[] = [];
  const patientIds: string[] = [];
  const mediaDownloads: string[] = [];
  const storedFiles = new Map<
    string,
    { body: Buffer; contentType: string; sizeBytes: number; fileName: string }
  >();
  // The real key helpers (tenant-prefixed, pure) with in-memory reads/writes.
  const memoryStorage = Object.assign(
    Object.create(AttachmentStorageService.prototype) as AttachmentStorageService,
    {
      put: async (key: string, body: Buffer, contentType: string, fileName: string) => {
        storedFiles.set(key, { body, contentType, sizeBytes: body.length, fileName });
      },
      get: async (key: string) => {
        const file = storedFiles.get(key);
        if (!file) throw new Error('No such stored file.');
        return file;
      },
      remove: async (key: string) => {
        storedFiles.delete(key);
      },
    },
  );

  const http = () => request(app.getHttpServer());

  /** A fresh fictional number for each scenario, so tests never share a conversation. */
  function nextPhone() {
    phoneCounter += 1;
    const display = `(312) 555-0${phoneCounter}`;
    return { display, e164: normalizeUsPhone(display)! };
  }

  async function makeClient(
    phone: { display: string; e164: string } | null,
    overrides: { organizationId?: string; firstName?: string; lastName?: string } = {},
  ) {
    const client = await prisma.client.create({
      data: {
        organizationId: overrides.organizationId ?? DEV_ORGANIZATION_ID,
        firstName: overrides.firstName ?? 'Jordan',
        lastName: overrides.lastName ?? `Ellis ${phoneCounter}`,
        phone: phone?.display ?? null,
        phoneE164: phone?.e164 ?? null,
      },
    });
    clientIds.push(client.id);
    return client;
  }

  async function openThread(clientId: string) {
    const response = await http().post('/client-communication/threads').send({ clientId });
    expect([200, 201]).toContain(response.status);
    return response.body.thread as { id: string; version: number; contactPhone: string };
  }

  /** A client with a conversation the clinic is allowed to text. */
  async function consentedThread() {
    const phone = nextPhone();
    const client = await makeClient(phone);
    const thread = await openThread(client.id);
    const consent = await http()
      .put(`/client-communication/threads/${thread.id}/consent`)
      .send({ status: 'GRANTED', method: 'VERBAL' });
    expect(consent.status).toBe(200);
    return { phone, client, thread: consent.body as typeof thread };
  }

  function send(threadId: string, body: string, extra: Record<string, unknown> = {}) {
    return http()
      .post(`/client-communication/threads/${threadId}/messages`)
      .send({
        body,
        idempotencyKey: `key-${body}-${Math.random().toString(36).slice(2)}`,
        ...extra,
      });
  }

  function clientReply(threadId: string, body: string) {
    return http()
      .post(`/client-communication/threads/${threadId}/simulated-replies`)
      .send({ body });
  }

  function getThread(threadId: string) {
    return http().get(`/client-communication/threads/${threadId}`);
  }

  function telnyxEvent(eventType: string, payload: Record<string, unknown>, id?: string) {
    eventCounter += 1;
    return {
      data: {
        id: id ?? `evt-${eventCounter}`,
        event_type: eventType,
        payload,
        record_type: 'event',
      },
    };
  }

  function postTelnyx(event: unknown, options: { signature?: string } = {}) {
    // A string body is written verbatim (see billing.e2e-spec.ts), so the
    // bytes the signature covers are the bytes the server receives.
    const body = JSON.stringify(event);
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signature = sign(null, Buffer.from(`${timestamp}|${body}`), privateKey).toString(
      'base64',
    );
    return http()
      .post(TELNYX_WEBHOOK_PATH)
      .set('Content-Type', 'application/json')
      .set('telnyx-signature-ed25519', options.signature ?? signature)
      .set('telnyx-timestamp', timestamp)
      .send(body);
  }

  /** Stands in for Telnyx's send endpoint. Any other fetch fails the test. */
  function stubTelnyxSend(
    respond: (body: Record<string, unknown>) => Response | Promise<Response>,
  ) {
    const calls: Array<Record<string, unknown>> = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      if (String(input) !== 'https://api.telnyx.com/v2/messages')
        throw new Error(`Unexpected fetch: ${String(input)}`);
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      calls.push(body);
      return respond(body);
    });
    return calls;
  }

  const accepted = (id: string) => () =>
    new Response(JSON.stringify({ data: { id, parts: 1 } }), { status: 200 });

  /** How the development clinic texts: not at all, in simulation, or with a real number. */
  async function setChannel(state: 'SIMULATED' | 'ACTIVE' | 'PENDING' | null) {
    await prisma.clientMessagingChannel.deleteMany({ where: { locationId: DEV_LOCATION_ID } });
    if (!state) return;
    const scope = { organizationId: DEV_ORGANIZATION_ID, locationId: DEV_LOCATION_ID };
    await prisma.clientMessagingChannel.create({
      data:
        state === 'SIMULATED'
          ? { ...scope, provider: 'SIMULATED', status: 'ACTIVE' }
          : {
              ...scope,
              provider: 'TELNYX',
              senderPhoneE164: CLINIC_NUMBER,
              providerProfileId: 'profile-dev',
              status: state,
            },
    });
  }

  beforeAll(async () => {
    process.env.TELNYX_API_KEY = 'KEY_isolated_test_placeholder';
    process.env.TELNYX_PUBLIC_KEY = TELNYX_PUBLIC_KEY;
    resetEnvCacheForTests();

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(AttachmentStorageService)
      .useValue(memoryStorage)
      // The real downloader is covered by inbound-media-downloader.spec.ts
      // against a local server; here the provider's file link is never fetched.
      .overrideProvider(InboundMediaDownloader)
      .useValue({
        download: async (url: string) => {
          mediaDownloads.push(url);
          return { body: Buffer.from('photo'), contentType: 'image/jpeg' };
        },
      })
      .compile();
    // Mirrors main.ts: the webhook needs the raw bytes its signature covers.
    app = moduleRef.createNestApplication({ bodyParser: false });
    app.use(TELNYX_WEBHOOK_PATH, raw({ type: 'application/json' }));
    app.use(json({ limit: '35mb' }));
    await app.init();
    dispatcher = app.get(ClientCommunicationDispatcher);

    // Any authenticated request lazily creates the development identity.
    await http().get('/client-communication/readiness');

    await prisma.location.upsert({
      where: { id: OTHER_LOCATION_ID },
      update: {},
      create: {
        id: OTHER_LOCATION_ID,
        organizationId: DEV_ORGANIZATION_ID,
        name: 'Second Location',
      },
    });
    const otherOrganization = await prisma.organization.create({
      data: {
        name: 'Client Communication E2E Org (other)',
        locations: { create: { name: 'Other Clinic' } },
      },
      include: { locations: true },
    });
    otherOrganizationId = otherOrganization.id;
    otherOrgLocationId = otherOrganization.locations[0]!.id;
    await prisma.clientMessagingChannel.create({
      data: {
        organizationId: otherOrganizationId,
        locationId: otherOrgLocationId,
        provider: 'TELNYX',
        senderPhoneE164: OTHER_CLINIC_NUMBER,
        status: 'ACTIVE',
      },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    const organizations = { in: [DEV_ORGANIZATION_ID, otherOrganizationId] };
    await prisma.clientCommunicationThread.deleteMany({ where: { organizationId: organizations } });
    await prisma.clientTextingConsentEvent.deleteMany({ where: { organizationId: organizations } });
    await prisma.clientTextingConsent.deleteMany({ where: { organizationId: organizations } });
    await prisma.clientMessagingChannel.deleteMany({ where: { organizationId: organizations } });
    await prisma.clientCommunicationWebhookEvent.deleteMany({});
    await prisma.patientClient.deleteMany({ where: { patientId: { in: patientIds } } });
    await prisma.patient.deleteMany({ where: { id: { in: patientIds } } });
    await prisma.client.deleteMany({ where: { id: { in: clientIds } } });
    await prisma.location.deleteMany({
      where: { id: { in: [OTHER_LOCATION_ID, otherOrgLocationId] } },
    });
    await prisma.organization.deleteMany({ where: { id: otherOrganizationId } });
    await app.close();
    delete process.env.TELNYX_API_KEY;
    delete process.env.TELNYX_PUBLIC_KEY;
    resetEnvCacheForTests();
  });

  describe('before texting is set up (no channel)', () => {
    it('hides the Communication tab and refuses to send, rather than simulate', async () => {
      await setChannel('SIMULATED');
      const { thread } = await consentedThread();
      await setChannel(null);

      const readiness = await http().get('/client-communication/readiness');
      expect(readiness.body).toMatchObject({
        mode: 'NOT_SET_UP',
        visible: false,
        capabilities: { simulateClientReply: false },
      });

      const blocked = await send(thread.id, 'Hello');
      expect(blocked.status).toBe(409);
      expect(blocked.body.code).toBe('TEXTING_NOT_SET_UP');
      expect((await clientReply(thread.id, 'Hello')).status).toBe(409);
      expect(
        await prisma.clientCommunicationMessage.count({ where: { threadId: thread.id } }),
      ).toBe(0);
    });
  });

  describe('in simulation (a demo or test clinic)', () => {
    beforeAll(() => setChannel('SIMULATED'));

    it('reports that texts are simulated and never sent', async () => {
      const response = await http().get('/client-communication/readiness');

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        mode: 'SIMULATED',
        visible: true,
        senderPhone: null,
        location: { id: DEV_LOCATION_ID },
        organization: { id: DEV_ORGANIZATION_ID },
        capabilities: { sendFiles: false, simulateClientReply: true },
      });
    });

    it('keeps a normalized copy of a client phone wherever the API writes one', async () => {
      const created = await http()
        .post('/clients')
        .send({ firstName: 'Casey', lastName: 'Morgan', phone: '312.555.0177' });
      clientIds.push(created.body.id);
      expect(
        (await prisma.client.findUniqueOrThrow({ where: { id: created.body.id } })).phoneE164,
      ).toBe('+13125550177');

      await http()
        .patch(`/clients/${created.body.id}`)
        .send({ phone: '555-0177', alternatePhone: '(312) 555-0178' });
      const updated = await prisma.client.findUniqueOrThrow({ where: { id: created.body.id } });
      expect(updated.phoneE164).toBeNull();
      expect(updated.alternatePhoneE164).toBe('+13125550178');
    });

    it('starts one conversation per client number and finds it again', async () => {
      const phone = nextPhone();
      const client = await makeClient(phone);

      const first = await http()
        .post('/client-communication/threads')
        .send({ clientId: client.id });
      const second = await http()
        .post('/client-communication/threads')
        .send({ clientId: client.id });

      expect(first.status).toBe(201);
      expect(first.body).toMatchObject({
        created: true,
        thread: {
          contactPhone: phone.e164,
          contactPhoneDisplay: phone.display,
          client: { id: client.id },
          matchState: 'MATCHED',
          status: 'OPEN',
          consent: { status: 'UNKNOWN' },
          sendEligibility: { canSend: false, code: 'CONSENT_REQUIRED' },
        },
      });
      expect(second.status).toBe(200);
      expect(second.body.created).toBe(false);
      expect(second.body.thread.id).toBe(first.body.thread.id);
    });

    it('refuses to start a conversation with a number that cannot be texted', async () => {
      const client = await makeClient({ display: '555-0142', e164: '' });
      await prisma.client.update({ where: { id: client.id }, data: { phoneE164: null } });

      const response = await http()
        .post('/client-communication/threads')
        .send({ clientId: client.id });

      expect(response.status).toBe(422);
      expect(response.body.code).toBe('NUMBER_NOT_TEXTABLE');
    });

    it('keeps a never-used conversation out of the work queues', async () => {
      const client = await makeClient(nextPhone());
      const thread = await openThread(client.id);

      const queue = await http().get('/client-communication/threads');
      const forClient = await http().get(`/client-communication/threads?clientId=${client.id}`);

      expect(queue.body.threads.map((row: { id: string }) => row.id)).not.toContain(thread.id);
      expect(forClient.body.threads.map((row: { id: string }) => row.id)).toEqual([thread.id]);
    });

    it('blocks texting until consent is recorded, then saves a simulated message', async () => {
      const client = await makeClient(nextPhone());
      const thread = await openThread(client.id);

      const blocked = await send(thread.id, 'Finley is ready to go home.');
      expect(blocked.status).toBe(409);
      expect(blocked.body.code).toBe('CONSENT_REQUIRED');
      expect(
        await prisma.clientCommunicationMessage.count({ where: { threadId: thread.id } }),
      ).toBe(0);

      const withoutMethod = await http()
        .put(`/client-communication/threads/${thread.id}/consent`)
        .send({ status: 'GRANTED' });
      expect(withoutMethod.status).toBe(400);

      const consent = await http()
        .put(`/client-communication/threads/${thread.id}/consent`)
        .send({ status: 'GRANTED', method: 'VERBAL', note: 'Agreed at the front desk' });
      expect(consent.status).toBe(200);
      expect(consent.body).toMatchObject({
        consent: {
          status: 'GRANTED',
          basis: 'STAFF_RECORDED',
          method: 'VERBAL',
          recordedBy: { id: DEV_USER_ID },
        },
        sendEligibility: { canSend: true },
      });
      expect(
        await prisma.clientTextingConsentEvent.count({
          where: {
            organizationId: DEV_ORGANIZATION_ID,
            phoneE164: thread.contactPhone,
            actorUserId: DEV_USER_ID,
          },
        }),
      ).toBe(1);

      const sent = await send(thread.id, 'Finley is ready to go home.');
      expect(sent.status).toBe(201);
      expect(sent.body).toMatchObject({
        created: true,
        message: {
          direction: 'OUTBOUND',
          source: 'STAFF',
          status: 'SIMULATED',
          simulated: true,
          sender: { id: DEV_USER_ID },
          sentAt: null,
          deliveredAt: null,
          failure: null,
          canResend: false,
          segments: 1,
        },
      });
      // A simulated message makes no delivery claim of any kind.
      const row = await prisma.clientCommunicationMessage.findUniqueOrThrow({
        where: { id: sent.body.message.id },
      });
      expect(row).toMatchObject({
        provider: 'SIMULATED',
        providerMessageId: null,
        sentAt: null,
        deliveredAt: null,
      });

      const after = await getThread(thread.id);
      expect(after.body).toMatchObject({
        status: 'WAITING',
        lastMessage: { id: sent.body.message.id },
      });
    });

    it('never saves a second message when the same request is retried', async () => {
      const { thread } = await consentedThread();
      const payload = { body: 'See you at 3 PM.', idempotencyKey: 'retry-key-0001' };

      const first = await http()
        .post(`/client-communication/threads/${thread.id}/messages`)
        .send(payload);
      const retry = await http()
        .post(`/client-communication/threads/${thread.id}/messages`)
        .send(payload);

      expect(first.status).toBe(201);
      expect(retry.status).toBe(200);
      expect(retry.body).toMatchObject({ created: false, message: { id: first.body.message.id } });

      // The same key on a different message is refused, not answered with the old one.
      const reused = await http()
        .post(`/client-communication/threads/${thread.id}/messages`)
        .send({ ...payload, body: 'Actually, see you at 4 PM.' });
      expect(reused.status).toBe(409);
      expect(reused.body.code).toBe('IDEMPOTENCY_KEY_REUSED');
      expect(
        await prisma.clientCommunicationMessage.count({ where: { threadId: thread.id } }),
      ).toBe(1);
    });

    it('marks a client reply unread and reopens the conversation, without reading it on open', async () => {
      const { thread } = await consentedThread();
      await send(thread.id, 'How is Daisy today?');
      const waiting = (await getThread(thread.id)).body;
      expect(waiting.status).toBe('WAITING');

      const reply = await clientReply(thread.id, 'Much better, she ate breakfast.');
      expect(reply.status).toBe(201);
      expect(reply.body).toMatchObject({
        direction: 'INBOUND',
        source: 'CLIENT',
        status: 'SIMULATED',
        simulated: true,
      });

      // Loading the conversation must not mark it read.
      await getThread(thread.id);
      const reopened = (await getThread(thread.id)).body;
      expect(reopened).toMatchObject({
        status: 'OPEN',
        unreadCount: 1,
        unread: true,
        version: waiting.version + 1,
      });
      expect(reopened.events[0]).toMatchObject({
        type: 'STATUS_CHANGED',
        actor: null,
        after: { status: 'OPEN' },
      });

      const unread = await http().get('/client-communication/threads?view=unread');
      expect(unread.body.threads.map((row: { id: string }) => row.id)).toContain(thread.id);
      expect(unread.body.counts.unread).toBeGreaterThanOrEqual(1);

      const read = await http().post(`/client-communication/threads/${thread.id}/read`);
      expect(read.body).toMatchObject({ unreadCount: 0, unread: false, status: 'OPEN' });

      const markedUnread = await http().post(`/client-communication/threads/${thread.id}/unread`);
      expect(markedUnread.body).toMatchObject({ unreadCount: 0, unread: true });
    });

    it('records handoffs and refuses to overwrite a change the caller has not seen', async () => {
      const { thread } = await consentedThread();
      await send(thread.id, 'Your refill is ready.');
      const current = (await getThread(thread.id)).body;

      const stale = await http()
        .patch(`/client-communication/threads/${thread.id}`)
        .send({ expectedVersion: current.version - 1, status: 'CLOSED' });
      expect(stale.status).toBe(409);
      expect(stale.body.code).toBe('THREAD_CHANGED');

      const unknownAssignee = await http()
        .patch(`/client-communication/threads/${thread.id}`)
        .send({ expectedVersion: current.version, assignedToId: 'nobody' });
      expect(unknownAssignee.status).toBe(400);
      expect(unknownAssignee.body.code).toBe('ASSIGNEE_UNAVAILABLE');

      const assignees = await http().get('/client-communication/assignees');
      expect(assignees.body.map((person: { id: string }) => person.id)).toContain(DEV_USER_ID);

      const updated = await http()
        .patch(`/client-communication/threads/${thread.id}`)
        .send({ expectedVersion: current.version, assignedToId: DEV_USER_ID, status: 'CLOSED' });
      expect(updated.status).toBe(200);
      expect(updated.body).toMatchObject({
        status: 'CLOSED',
        assignedTo: { id: DEV_USER_ID },
        version: current.version + 1,
      });
      expect(
        updated.body.events
          .slice(0, 2)
          .map((event: { type: string }) => event.type)
          .sort(),
      ).toEqual(['ASSIGNMENT_CHANGED', 'STATUS_CHANGED']);
      expect(updated.body.events[0].actor).toMatchObject({ id: DEV_USER_ID });

      const mine = await http().get('/client-communication/threads?view=closed');
      expect(mine.body.threads.map((row: { id: string }) => row.id)).toContain(thread.id);
    });

    it('honors STOP: blocks the clinic, cannot be overridden by staff, and lifts on START', async () => {
      const { thread } = await consentedThread();
      await send(thread.id, 'Reminder: Cooper is due for a wellness visit.');
      const before = (await getThread(thread.id)).body;

      await clientReply(thread.id, 'STOP');
      const stopped = (await getThread(thread.id)).body;
      expect(stopped.consent).toMatchObject({
        status: 'OPTED_OUT',
        basis: 'KEYWORD',
        staffMayGrant: false,
      });
      expect(stopped.sendEligibility).toMatchObject({ canSend: false, code: 'OPTED_OUT' });
      // An opt-out is not a message that needs a reply.
      expect(stopped).toMatchObject({
        unreadCount: 0,
        status: before.status,
        version: before.version,
      });

      const blocked = await send(thread.id, 'Are you sure?');
      expect(blocked.status).toBe(409);
      expect(blocked.body.code).toBe('OPTED_OUT');

      const override = await http()
        .put(`/client-communication/threads/${thread.id}/consent`)
        .send({ status: 'GRANTED', method: 'VERBAL' });
      expect(override.status).toBe(409);
      expect(override.body.code).toBe('CLIENT_MUST_OPT_IN');

      await clientReply(thread.id, 'Start');
      const restarted = (await getThread(thread.id)).body;
      expect(restarted.consent).toMatchObject({ status: 'GRANTED', basis: 'KEYWORD' });
      expect((await send(thread.id, 'Welcome back.')).status).toBe(201);
    });

    it("keeps a client's own STOP in force when staff record another opt-out", async () => {
      const { thread } = await consentedThread();
      await clientReply(thread.id, 'STOP');

      for (let repeat = 0; repeat < 2; repeat += 1) {
        const again = await http()
          .put(`/client-communication/threads/${thread.id}/consent`)
          .send({ status: 'OPTED_OUT', note: 'Client also asked at the desk' });
        expect(again.status).toBe(200);
        expect(again.body.consent).toMatchObject({
          status: 'OPTED_OUT',
          basis: 'KEYWORD',
          staffMayGrant: false,
        });
      }

      const grant = await http()
        .put(`/client-communication/threads/${thread.id}/consent`)
        .send({ status: 'GRANTED', method: 'VERBAL' });
      expect(grant.status).toBe(409);
      expect(grant.body.code).toBe('CLIENT_MUST_OPT_IN');
      // The staff opt-outs are still in the history.
      expect(
        await prisma.clientTextingConsentEvent.count({
          where: {
            organizationId: DEV_ORGANIZATION_ID,
            phoneE164: thread.contactPhone,
            basis: 'STAFF_RECORDED',
            status: 'OPTED_OUT',
          },
        }),
      ).toBe(2);
    });

    it("never lets a staff agreement recorded at the same moment as a client's STOP win", async () => {
      const consent = app.get(ClientTextingConsentService);
      const inbound = app.get(ClientCommunicationInboundService);
      for (let round = 0; round < 15; round += 1) {
        const { thread, client, phone } = await consentedThread();
        await http()
          .put(`/client-communication/threads/${thread.id}/consent`)
          .send({ status: 'OPTED_OUT' });

        const results = await Promise.allSettled([
          inbound.recordInbound({
            organizationId: DEV_ORGANIZATION_ID,
            locationId: DEV_LOCATION_ID,
            provider: 'SIMULATED',
            contactPhoneE164: phone.e164,
            clinicPhoneE164: null,
            body: 'STOP',
            providerMessageId: null,
            segments: null,
            media: [],
          }),
          prisma.$transaction((tx) =>
            consent.recordByStaff(tx, {
              organizationId: DEV_ORGANIZATION_ID,
              phoneE164: phone.e164,
              status: 'GRANTED',
              method: 'VERBAL',
              clientId: client.id,
              actorUserId: DEV_USER_ID,
            }),
          ),
        ]);

        expect(results[0].status).toBe('fulfilled');
        // Whichever ran first, the client's STOP is what stands.
        const final = await prisma.clientTextingConsent.findUniqueOrThrow({
          where: {
            organizationId_phoneE164: {
              organizationId: DEV_ORGANIZATION_ID,
              phoneE164: phone.e164,
            },
          },
        });
        expect(final).toMatchObject({ status: 'OPTED_OUT', basis: 'KEYWORD' });
      }
    });

    it('treats the carrier refusing a send as the client opting out, even after a staff opt-out', async () => {
      const { thread, phone } = await consentedThread();
      await http()
        .put(`/client-communication/threads/${thread.id}/consent`)
        .send({ status: 'OPTED_OUT' });

      await prisma.$transaction((tx) =>
        app.get(ClientTextingConsentService).recordProviderBlock(tx, {
          organizationId: DEV_ORGANIZATION_ID,
          phoneE164: phone.e164,
          clientId: null,
          messageId: null,
        }),
      );

      const detail = (await getThread(thread.id)).body;
      expect(detail.consent).toMatchObject({
        status: 'OPTED_OUT',
        basis: 'PROVIDER_BLOCK',
        staffMayGrant: false,
      });
    });

    it('distinguishes permission to reply from permission for automated texts', async () => {
      const client = await makeClient(nextPhone());
      const thread = await openThread(client.id);
      await clientReply(thread.id, 'Hi, is Finley due for shots?');

      const replied = (await getThread(thread.id)).body;
      expect(replied.consent).toMatchObject({
        status: 'GRANTED',
        basis: 'CLIENT_INITIATED',
        automatedTextsAllowed: false,
      });
      expect(replied.sendEligibility.canSend).toBe(true);

      const recorded = await http()
        .put(`/client-communication/threads/${thread.id}/consent`)
        .send({ status: 'GRANTED', method: 'VERBAL' });
      expect(recorded.body.consent).toMatchObject({
        basis: 'STAFF_RECORDED',
        automatedTextsAllowed: true,
      });

      await clientReply(thread.id, 'STOP');
      await clientReply(thread.id, 'START');
      const restarted = (await getThread(thread.id)).body;
      // START restores replies; automated texts wait for staff to record agreement again.
      expect(restarted.consent).toMatchObject({
        status: 'GRANTED',
        basis: 'KEYWORD',
        automatedTextsAllowed: false,
      });
      expect(restarted.sendEligibility.canSend).toBe(true);
    });

    it('lets staff record an opt-out and later a fresh agreement', async () => {
      const { thread } = await consentedThread();

      const optedOut = await http()
        .put(`/client-communication/threads/${thread.id}/consent`)
        .send({ status: 'OPTED_OUT', note: 'Asked us to call instead' });
      expect(optedOut.body.consent).toMatchObject({
        status: 'OPTED_OUT',
        basis: 'STAFF_RECORDED',
        staffMayGrant: true,
      });
      expect((await send(thread.id, 'Hello')).body.code).toBe('OPTED_OUT');

      const regranted = await http()
        .put(`/client-communication/threads/${thread.id}/consent`)
        .send({ status: 'GRANTED', method: 'WRITTEN_FORM' });
      expect(regranted.body.sendEligibility.canSend).toBe(true);
    });

    it('pages a long conversation newest-first and reports later changes', async () => {
      const { thread } = await consentedThread();
      const start = Date.now() - 300_000;
      await prisma.clientCommunicationMessage.createMany({
        data: Array.from({ length: 205 }, (_, index) => ({
          organizationId: DEV_ORGANIZATION_ID,
          locationId: DEV_LOCATION_ID,
          threadId: thread.id,
          direction: 'OUTBOUND' as const,
          source: 'STAFF' as const,
          status: 'SIMULATED' as const,
          provider: 'SIMULATED' as const,
          body: `message ${index + 1}`,
          createdAt: new Date(start + index * 1000),
        })),
      });

      const newest = await http().get(`/client-communication/threads/${thread.id}/messages`);
      expect(newest.status).toBe(200);
      expect(newest.body.messages).toHaveLength(50);
      // The 201st message onward used to be unreachable; the newest page must end on the latest.
      expect(newest.body.messages.at(-1).body).toBe('message 205');
      expect(newest.body.messages[0].body).toBe('message 156');

      const seen = [...newest.body.messages];
      let cursor: string | null = newest.body.olderCursor;
      while (cursor) {
        const older = await http().get(
          `/client-communication/threads/${thread.id}/messages?limit=100&before=${encodeURIComponent(cursor)}`,
        );
        seen.unshift(...older.body.messages);
        cursor = older.body.olderCursor;
      }
      expect(seen.map((message: { body: string }) => message.body)).toEqual(
        Array.from({ length: 205 }, (_, index) => `message ${index + 1}`),
      );

      // A delivery change to a message already on screen shows up in the poll.
      const old = await prisma.clientCommunicationMessage.findFirstOrThrow({
        where: { threadId: thread.id, body: 'message 3' },
      });
      await prisma.clientCommunicationMessage.update({
        where: { id: old.id },
        data: { failureDetail: 'touched' },
      });
      const changed = await http().get(
        `/client-communication/threads/${thread.id}/messages?changedSince=${encodeURIComponent(newest.body.asOf)}`,
      );
      expect(changed.body.messages.map((message: { id: string }) => message.id)).toEqual([old.id]);
    });

    it('keeps one conversation for a number two clients share, and never guesses between them', async () => {
      const phone = nextPhone();
      const jordan = await makeClient(phone, { firstName: 'Jordan', lastName: 'Shared' });
      const sam = await makeClient(phone, { firstName: 'Sam', lastName: 'Shared' });
      const stranger = await makeClient(nextPhone(), { firstName: 'Alex', lastName: 'Elsewhere' });

      const first = await http()
        .post('/client-communication/threads')
        .send({ clientId: jordan.id });
      const second = await http().post('/client-communication/threads').send({ clientId: sam.id });

      expect(second.status).toBe(200);
      expect(second.body.thread).toMatchObject({
        id: first.body.thread.id,
        client: { id: jordan.id },
        matchState: 'SHARED',
      });
      expect(
        second.body.thread.clientCandidates.map((candidate: { id: string }) => candidate.id).sort(),
      ).toEqual([jordan.id, sam.id].sort());

      const version = second.body.thread.version;
      const wrongClient = await http()
        .patch(`/client-communication/threads/${first.body.thread.id}`)
        .send({ expectedVersion: version, clientId: stranger.id });
      expect(wrongClient.status).toBe(422);
      expect(wrongClient.body.code).toBe('NUMBER_NOT_ON_CLIENT');

      const relinked = await http()
        .patch(`/client-communication/threads/${first.body.thread.id}`)
        .send({ expectedVersion: version, clientId: sam.id });
      expect(relinked.body).toMatchObject({ client: { id: sam.id }, matchState: 'SHARED' });
      expect(relinked.body.events[0]).toMatchObject({
        type: 'CLIENT_LINK_CHANGED',
        after: { clientId: sam.id },
      });
    });

    it("stops texting a number once it is no longer on the linked client's record", async () => {
      const { thread, client } = await consentedThread();

      await http().patch(`/clients/${client.id}`).send({ phone: nextPhone().display });

      const detail = (await getThread(thread.id)).body;
      expect(detail).toMatchObject({
        matchState: 'NUMBER_NOT_ON_CLIENT',
        sendEligibility: { canSend: false, code: 'NUMBER_NOT_ON_CLIENT' },
      });
      expect((await send(thread.id, 'Lab results are in.')).status).toBe(409);
    });

    it("ties a message to one of the client's own patients only", async () => {
      const { thread, client } = await consentedThread();
      const [own, someoneElses] = await Promise.all(
        ['Finley', 'Biscuit'].map((name) =>
          prisma.patient.create({
            data: { organizationId: DEV_ORGANIZATION_ID, name, species: 'Canine' },
          }),
        ),
      );
      patientIds.push(own!.id, someoneElses!.id);
      await prisma.patientClient.create({
        data: { patientId: own!.id, clientId: client.id, isPrimary: true },
      });

      const wrong = await send(thread.id, 'Biscuit update', { patientId: someoneElses!.id });
      expect(wrong.status).toBe(400);
      expect(wrong.body.code).toBe('PATIENT_NOT_FOR_CLIENT');

      const right = await send(thread.id, 'Finley update', { patientId: own!.id });
      expect(right.status).toBe(201);
      expect(right.body.message.patientId).toBe(own!.id);

      const fromPatient = await http().get(`/client-communication/threads?patientId=${own!.id}`);
      expect(fromPatient.body.threads.map((row: { id: string }) => row.id)).toEqual([thread.id]);
      const detail = (await getThread(thread.id)).body;
      expect(detail.patients.map((patient: { id: string }) => patient.id)).toEqual([own!.id]);
    });

    it("never exposes another clinic's or another location's conversation", async () => {
      const otherOrgThread = await prisma.clientCommunicationThread.create({
        data: {
          organizationId: otherOrganizationId,
          locationId: otherOrgLocationId,
          contactPhoneE164: nextPhone().e164,
        },
      });
      const otherLocationThread = await prisma.clientCommunicationThread.create({
        data: {
          organizationId: DEV_ORGANIZATION_ID,
          locationId: OTHER_LOCATION_ID,
          contactPhoneE164: nextPhone().e164,
        },
      });
      for (const thread of [otherOrgThread, otherLocationThread]) {
        const message = await prisma.clientCommunicationMessage.create({
          data: {
            organizationId: thread.organizationId,
            locationId: thread.locationId,
            threadId: thread.id,
            direction: 'INBOUND',
            source: 'CLIENT',
            status: 'SIMULATED',
            provider: 'SIMULATED',
            body: 'private',
          },
        });
        await prisma.clientCommunicationThread.update({
          where: { id: thread.id },
          data: { lastMessageId: message.id },
        });

        expect((await getThread(thread.id)).status).toBe(404);
        expect(
          (await http().get(`/client-communication/threads/${thread.id}/messages`)).status,
        ).toBe(404);
        expect((await send(thread.id, 'hello')).status).toBe(404);
        expect((await http().post(`/client-communication/threads/${thread.id}/read`)).status).toBe(
          404,
        );
        expect(
          (
            await http()
              .patch(`/client-communication/threads/${thread.id}`)
              .send({ expectedVersion: 1, status: 'CLOSED' })
          ).status,
        ).toBe(404);
        expect((await clientReply(thread.id, 'hello')).status).toBe(404);
      }

      const listed = await http().get('/client-communication/threads?limit=100');
      const ids = listed.body.threads.map((row: { id: string }) => row.id);
      expect(ids).not.toContain(otherOrgThread.id);
      expect(ids).not.toContain(otherLocationThread.id);
    });

    it('rejects malformed requests', async () => {
      const { thread } = await consentedThread();

      expect(
        (
          await http()
            .post(`/client-communication/threads/${thread.id}/messages`)
            .send({ body: 'no key' })
        ).status,
      ).toBe(400);
      expect((await send(thread.id, '   ')).status).toBe(400);
      expect(
        (
          await http()
            .patch(`/client-communication/threads/${thread.id}`)
            .send({ expectedVersion: 1 })
        ).status,
      ).toBe(400);
      expect(
        (
          await http()
            .patch(`/client-communication/threads/${thread.id}`)
            .send({ expectedVersion: 1, status: 'ARCHIVED' })
        ).status,
      ).toBe(400);
      expect((await http().get('/client-communication/threads?view=everything')).status).toBe(400);
      expect((await http().get('/client-communication/threads?cursor=not-a-cursor')).status).toBe(
        400,
      );
    });
  });

  describe('with a registered clinic number (Telnyx)', () => {
    beforeAll(() => setChannel('ACTIVE'));

    it('reports live texting and refuses to simulate a client reply', async () => {
      const { thread } = await consentedThread();

      const readiness = await http().get('/client-communication/readiness');
      expect(readiness.body).toMatchObject({
        mode: 'LIVE',
        visible: true,
        senderPhone: CLINIC_NUMBER,
        senderPhoneDisplay: '(312) 555-0100',
        capabilities: { receiveFiles: true, simulateClientReply: false },
      });

      const simulated = await clientReply(thread.id, 'hello');
      expect(simulated.status).toBe(409);
      expect(simulated.body.code).toBe('NOT_SIMULATED');
    });

    it('sends through the provider, then follows delivery webhooks without going backwards', async () => {
      const { thread, phone } = await consentedThread();
      const calls = stubTelnyxSend(accepted('tx-delivered-1'));

      const sent = await send(thread.id, 'Luna is ready for pickup.');

      expect(calls).toEqual([
        {
          from: CLINIC_NUMBER,
          to: phone.e164,
          text: 'Luna is ready for pickup.',
          type: 'SMS',
          messaging_profile_id: 'profile-dev',
        },
      ]);
      expect(sent.status).toBe(201);
      expect(sent.body.message).toMatchObject({
        status: 'SENT',
        simulated: false,
        deliveredAt: null,
      });
      expect(sent.body.message.sentAt).toEqual(expect.any(String));

      const delivered = telnyxEvent('message.finalized', {
        id: 'tx-delivered-1',
        from: { phone_number: CLINIC_NUMBER },
        to: [{ phone_number: phone.e164, status: 'delivered' }],
        text: 'Luna is ready for pickup.',
        parts: 1,
      });
      expect((await postTelnyx(delivered)).status).toBe(200);
      // The same delivery again (a provider retry) changes nothing.
      expect((await postTelnyx(delivered)).status).toBe(200);
      // "sent" arriving after "delivered" must not move the message back.
      const lateSent = telnyxEvent('message.sent', {
        id: 'tx-delivered-1',
        from: { phone_number: CLINIC_NUMBER },
        to: [{ phone_number: phone.e164, status: 'sent' }],
        text: 'Luna is ready for pickup.',
      });
      expect((await postTelnyx(lateSent)).status).toBe(200);

      const row = await prisma.clientCommunicationMessage.findUniqueOrThrow({
        where: { id: sent.body.message.id },
      });
      expect(row.status).toBe('DELIVERED');
      expect(row.deliveredAt).toBeInstanceOf(Date);
      const event = await prisma.clientCommunicationWebhookEvent.findUniqueOrThrow({
        where: { id: `TELNYX:${delivered.data.id}` },
      });
      expect(event).toMatchObject({ organizationId: DEV_ORGANIZATION_ID, note: null });
      expect(event.processedAt).toBeInstanceOf(Date);
    });

    it('rejects a webhook that Telnyx did not sign', async () => {
      const event = telnyxEvent('message.received', {
        id: 'forged-1',
        from: { phone_number: nextPhone().e164 },
        to: [{ phone_number: CLINIC_NUMBER }],
        text: 'forged',
      });
      const forged = sign(
        null,
        Buffer.from('something else'),
        generateKeyPairSync('ed25519').privateKey,
      ).toString('base64');

      const response = await postTelnyx(event, { signature: forged });

      expect(response.status).toBe(400);
      expect(
        await prisma.clientCommunicationWebhookEvent.count({
          where: { id: `TELNYX:${event.data.id}` },
        }),
      ).toBe(0);
      expect(
        await prisma.clientCommunicationMessage.count({ where: { providerMessageId: 'forged-1' } }),
      ).toBe(0);
    });

    it('opens a conversation for a text from an unknown number and lets staff reply', async () => {
      const phone = nextPhone();
      const event = telnyxEvent('message.received', {
        id: 'in-unknown-1',
        from: { phone_number: phone.e164 },
        to: [{ phone_number: CLINIC_NUMBER, status: 'webhook_delivered' }],
        text: 'Hi, do you have any openings Friday?',
        parts: 1,
      });

      expect((await postTelnyx(event)).status).toBe(200);
      // A retried delivery under a new event id still creates no duplicate.
      expect(
        (await postTelnyx({ data: { ...event.data, id: 'evt-redelivered-unknown' } })).status,
      ).toBe(200);

      const threads = await prisma.clientCommunicationThread.findMany({
        where: { contactPhoneE164: phone.e164 },
      });
      expect(threads).toHaveLength(1);
      expect(threads[0]).toMatchObject({
        organizationId: DEV_ORGANIZATION_ID,
        locationId: DEV_LOCATION_ID,
        clientId: null,
      });
      expect(
        await prisma.clientCommunicationMessage.count({ where: { threadId: threads[0]!.id } }),
      ).toBe(1);

      const detail = (await getThread(threads[0]!.id)).body;
      expect(detail).toMatchObject({
        matchState: 'UNMATCHED',
        client: null,
        status: 'OPEN',
        unreadCount: 1,
        lastMessage: {
          direction: 'INBOUND',
          source: 'CLIENT',
          status: 'RECEIVED',
          simulated: false,
        },
        consent: { status: 'GRANTED', basis: 'CLIENT_INITIATED' },
        sendEligibility: { canSend: true },
      });

      // Recording agreement needs to know who agreed.
      const consent = await http()
        .put(`/client-communication/threads/${detail.id}/consent`)
        .send({ status: 'GRANTED', method: 'VERBAL' });
      expect(consent.status).toBe(422);
      expect(consent.body.code).toBe('CLIENT_LINK_REQUIRED');

      stubTelnyxSend(accepted('tx-reply-unknown'));
      expect((await send(detail.id, 'We do — may I ask who this is?')).body.message.status).toBe(
        'SENT',
      );
    });

    it('links a new inbound conversation when exactly one client has the number', async () => {
      const phone = nextPhone();
      const client = await makeClient(phone);

      await postTelnyx(
        telnyxEvent('message.received', {
          id: 'in-known-1',
          from: { phone_number: phone.e164 },
          to: [{ phone_number: CLINIC_NUMBER }],
          text: 'Running ten minutes late',
        }),
      );

      const thread = await prisma.clientCommunicationThread.findFirstOrThrow({
        where: { contactPhoneE164: phone.e164 },
      });
      expect(thread.clientId).toBe(client.id);
      expect((await getThread(thread.id)).body.matchState).toBe('MATCHED');
    });

    it('routes by the clinic number that was texted, never by who sent it', async () => {
      // The same person is a client of both clinics.
      const phone = nextPhone();
      await makeClient(phone);
      const theirs = await makeClient(phone, { organizationId: otherOrganizationId });

      const response = await postTelnyx(
        telnyxEvent('message.received', {
          id: 'in-other-clinic-1',
          from: { phone_number: phone.e164 },
          to: [{ phone_number: OTHER_CLINIC_NUMBER }],
          text: 'Question about my invoice',
        }),
      );

      expect(response.status).toBe(200);
      const threads = await prisma.clientCommunicationThread.findMany({
        where: { contactPhoneE164: phone.e164 },
      });
      expect(threads).toHaveLength(1);
      expect(threads[0]).toMatchObject({
        organizationId: otherOrganizationId,
        locationId: otherOrgLocationId,
        clientId: theirs.id,
      });
      const listed = await http().get(
        `/client-communication/threads?search=${phone.e164.slice(-4)}`,
      );
      expect(listed.body.threads).toEqual([]);
    });

    it('acknowledges a text to a number no clinic uses without creating anything', async () => {
      const phone = nextPhone();
      const event = telnyxEvent('message.received', {
        id: 'in-unrouted-1',
        from: { phone_number: phone.e164 },
        to: [{ phone_number: '+13125550198' }],
        text: 'hello?',
      });

      expect((await postTelnyx(event)).status).toBe(200);

      expect(
        await prisma.clientCommunicationThread.count({ where: { contactPhoneE164: phone.e164 } }),
      ).toBe(0);
      const tracked = await prisma.clientCommunicationWebhookEvent.findUniqueOrThrow({
        where: { id: `TELNYX:${event.data.id}` },
      });
      expect(tracked.note).toBe('No clinic uses the number that was texted.');
    });

    it('retries only when the provider said it did not take the message', async () => {
      const { thread } = await consentedThread();
      stubTelnyxSend(
        () =>
          new Response(
            JSON.stringify({ errors: [{ code: '10011', title: 'Too many requests' }] }),
            { status: 429 },
          ),
      );

      const queued = await send(thread.id, 'Your prescription is ready.');
      expect(queued.status).toBe(201);
      expect(queued.body.message).toMatchObject({ status: 'QUEUED', failure: null });
      expect(queued.body.message.nextAttemptAt).toEqual(expect.any(String));

      vi.restoreAllMocks();
      const calls = stubTelnyxSend(accepted('tx-retried-1'));
      // Not due yet: nothing is sent.
      await dispatcher.runOnce(new Date());
      expect(calls).toHaveLength(0);
      await dispatcher.runOnce(new Date(Date.now() + 60_000));
      expect(calls).toHaveLength(1);

      const row = await prisma.clientCommunicationMessage.findUniqueOrThrow({
        where: { id: queued.body.message.id },
      });
      expect(row).toMatchObject({
        status: 'SENT',
        attemptCount: 2,
        providerMessageId: 'tx-retried-1',
        failureCode: null,
      });
    });

    it('never re-sends a message whose outcome is unknown, and settles it from the delivery webhook', async () => {
      const { thread, phone } = await consentedThread();
      stubTelnyxSend(() => {
        throw new DOMException('The operation timed out.', 'TimeoutError');
      });

      const unknown = await send(thread.id, 'Milo is out of surgery and doing well.');
      expect(unknown.status).toBe(201);
      expect(unknown.body.message).toMatchObject({
        status: 'OUTCOME_UNKNOWN',
        canResend: true,
        failure: { code: 'OUTCOME_UNKNOWN' },
      });
      const problem = (await getThread(thread.id)).body;
      expect(problem.deliveryProblemSince).toEqual(expect.any(String));
      const problems = await http().get('/client-communication/threads?view=problems');
      expect(problems.body.threads.map((row: { id: string }) => row.id)).toContain(thread.id);

      vi.restoreAllMocks();
      const calls = stubTelnyxSend(accepted('never-used'));
      await dispatcher.runOnce(new Date(Date.now() + 3_600_000));
      expect(calls).toHaveLength(0);

      // Telnyx did send it: its delivery webhook is matched to this exact send.
      await postTelnyx(
        telnyxEvent('message.finalized', {
          id: 'tx-adopted-1',
          from: { phone_number: CLINIC_NUMBER },
          to: [{ phone_number: phone.e164, status: 'delivered' }],
          text: 'Milo is out of surgery and doing well.',
        }),
      );

      const row = await prisma.clientCommunicationMessage.findUniqueOrThrow({
        where: { id: unknown.body.message.id },
      });
      expect(row).toMatchObject({
        status: 'DELIVERED',
        providerMessageId: 'tx-adopted-1',
        failureCode: null,
      });
      expect((await getThread(thread.id)).body.deliveryProblemSince).toBeNull();
    });

    it('flags a send that lost its process instead of sending it again', async () => {
      const { thread } = await consentedThread();
      const stuck = await prisma.clientCommunicationMessage.create({
        data: {
          organizationId: DEV_ORGANIZATION_ID,
          locationId: DEV_LOCATION_ID,
          threadId: thread.id,
          direction: 'OUTBOUND',
          source: 'STAFF',
          status: 'SENDING',
          provider: 'TELNYX',
          body: 'interrupted',
          toE164: thread.contactPhone,
          claimedAt: new Date(Date.now() - 10 * 60_000),
        },
      });
      const calls = stubTelnyxSend(accepted('never-used'));

      await dispatcher.runOnce();

      expect(calls).toHaveLength(0);
      expect(
        (await prisma.clientCommunicationMessage.findUniqueOrThrow({ where: { id: stuck.id } }))
          .status,
      ).toBe('OUTCOME_UNKNOWN');
    });

    it("records the provider's opt-out block as the client's opt-out", async () => {
      const { thread } = await consentedThread();
      stubTelnyxSend(
        () =>
          new Response(
            JSON.stringify({ errors: [{ code: '40300', title: 'Blocked due to STOP message' }] }),
            {
              status: 400,
            },
          ),
      );

      const failed = await send(thread.id, 'Reminder: Bailey tomorrow at 9:30 AM.');

      expect(failed.body.message).toMatchObject({
        status: 'FAILED',
        canResend: true,
        failure: { code: '40300', message: 'The client opted out of texts from the clinic.' },
      });
      const detail = (await getThread(thread.id)).body;
      expect(detail.consent).toMatchObject({
        status: 'OPTED_OUT',
        basis: 'PROVIDER_BLOCK',
        staffMayGrant: false,
      });
    });

    it('applies a real STOP before anything else is sent', async () => {
      const { thread, phone } = await consentedThread();

      await postTelnyx(
        telnyxEvent('message.received', {
          id: 'in-stop-1',
          from: { phone_number: phone.e164 },
          to: [{ phone_number: CLINIC_NUMBER }],
          text: 'Stop',
        }),
      );
      const calls = stubTelnyxSend(accepted('never-used'));
      const blocked = await send(thread.id, 'One more reminder');

      expect(blocked.status).toBe(409);
      expect(blocked.body.code).toBe('OPTED_OUT');
      expect(calls).toHaveLength(0);
    });

    it("stores a client's photo privately and serves it only to the clinic", async () => {
      const phone = nextPhone();
      await makeClient(phone);
      await postTelnyx(
        telnyxEvent('message.received', {
          id: 'in-photo-1',
          from: { phone_number: phone.e164 },
          to: [{ phone_number: CLINIC_NUMBER }],
          text: 'This is the spot on her leg',
          type: 'MMS',
          media: [
            { url: 'https://media.example.test/leg.jpg', content_type: 'image/jpeg', size: 5 },
          ],
        }),
      );
      const thread = await prisma.clientCommunicationThread.findFirstOrThrow({
        where: { contactPhoneE164: phone.e164 },
      });
      const pending = await http().get(`/client-communication/threads/${thread.id}/messages`);
      expect(pending.body.messages[0].attachments).toMatchObject([
        { status: 'PENDING', mimeType: 'image/jpeg', href: null },
      ]);

      mediaDownloads.length = 0;
      await dispatcher.runOnce();
      expect(mediaDownloads).toEqual(['https://media.example.test/leg.jpg']);

      const stored = await http().get(`/client-communication/threads/${thread.id}/messages`);
      const attachment = stored.body.messages[0].attachments[0];
      expect(attachment).toMatchObject({ status: 'STORED', sizeBytes: 5 });
      expect([...storedFiles.keys()]).toEqual([
        expect.stringMatching(
          new RegExp(
            `^organizations/${DEV_ORGANIZATION_ID}/locations/${DEV_LOCATION_ID}/client-communication/`,
          ),
        ),
      ]);
      expect(attachment.href).toBe(`/client-communication/attachments/${attachment.id}`);

      const file = await http()
        .get(attachment.href)
        .buffer(true)
        .parse((res, callback) => {
          const chunks: Buffer[] = [];
          res.on('data', (chunk: Buffer) => chunks.push(chunk));
          res.on('end', () => callback(null, Buffer.concat(chunks)));
        });
      expect(file.status).toBe(200);
      expect(file.headers['content-type']).toContain('image/jpeg');
      expect(file.headers['x-content-type-options']).toBe('nosniff');
      expect(file.headers['content-security-policy']).toContain('sandbox');
      expect((file.body as Buffer).toString()).toBe('photo');

      // The same file is not reachable from another location's session scope.
      await prisma.clientCommunicationAttachment.update({
        where: { id: attachment.id },
        data: { locationId: OTHER_LOCATION_ID },
      });
      expect((await http().get(attachment.href)).status).toBe(404);
    });

    it('refuses to send, rather than simulate, while the clinic number awaits approval', async () => {
      const { thread } = await consentedThread();
      await setChannel('PENDING');
      const calls = stubTelnyxSend(accepted('never-used'));

      try {
        const readiness = await http().get('/client-communication/readiness');
        expect(readiness.body).toMatchObject({
          mode: 'UNAVAILABLE',
          visible: false,
          reasonCode: 'REGISTRATION_PENDING',
        });

        const blocked = await send(thread.id, 'Hello');
        expect(blocked.status).toBe(409);
        expect(blocked.body.code).toBe('REGISTRATION_PENDING');
        expect(calls).toHaveLength(0);
        expect(
          await prisma.clientCommunicationMessage.count({ where: { threadId: thread.id } }),
        ).toBe(0);
      } finally {
        await setChannel('ACTIVE');
      }
    });
  });
});
