import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  enterTenantContext,
  prisma,
  prismaUnscoped,
  type ClientCommunicationMessage,
  type ClientCommunicationProvider,
  type Prisma,
} from '@sparki/db';
import { statusAdvances } from './client-communication.constants';
import { ClientTextingConsentService } from './client-texting-consent.service';
import type {
  ProviderEvent,
  ProviderInboundEvent,
  ProviderStatusEvent,
} from './providers/sms-provider';
import { TelnyxSmsProvider } from './providers/telnyx-sms.provider';
import { cleanMessageBody, detectConsentKeyword } from './sms-text';
import { refreshDeliveryProblem } from './thread-state';

/** How far back an id-less send may be matched to a delivery webhook. */
const ADOPTION_WINDOW_MS = 24 * 60 * 60 * 1000;
/** Telnyx's error for a number that texted STOP to this messaging profile. */
const OPT_OUT_BLOCK_CODE = '40300';

export interface InboundMessageInput {
  organizationId: string;
  locationId: string;
  provider: ClientCommunicationProvider;
  /** The client's number. */
  contactPhoneE164: string;
  /** The clinic number that was texted; null in simulation. */
  clinicPhoneE164: string | null;
  body: string;
  providerMessageId: string | null;
  segments: number | null;
  media: ProviderInboundEvent['media'];
}

interface ApplyOutcome {
  organizationId: string | null;
  note: string | null;
}

/**
 * Everything that arrives from outside: a client's text, and the provider's
 * word on what happened to a text the clinic sent.
 *
 * Tenant isolation here does not come from a signed-in user — there is
 * none. It comes from the clinic's own number: an inbound message is routed
 * by the number that was texted, a delivery update by the message Sparki
 * itself sent. Only after that lookup names an organization does this
 * service enter its tenant context, so every later query is scoped to it.
 * A sender's number is never used to pick the clinic: the same pet owner
 * can be a client of two clinics.
 */
@Injectable()
export class ClientCommunicationInboundService {
  private readonly logger = new Logger(ClientCommunicationInboundService.name);

  constructor(
    private readonly telnyx: TelnyxSmsProvider,
    private readonly consent: ClientTextingConsentService,
  ) {}

  /**
   * Verifies and applies one Telnyx webhook delivery. Idempotent the same
   * way BillingWebhookService is: the event is recorded by Telnyx's own
   * event id first, and an event already marked processed is a no-op.
   * Throws (so Telnyx retries) only when processing genuinely failed.
   */
  async handleTelnyxWebhook(
    rawBody: Buffer,
    signature: string | undefined,
    timestamp: string | undefined,
  ): Promise<void> {
    if (!this.telnyx.isConfigured) {
      throw new ServiceUnavailableException('Client texting webhooks are not configured.');
    }
    if (!this.telnyx.verifyWebhook(rawBody, signature, timestamp)) {
      throw new BadRequestException('Invalid webhook signature.');
    }
    let body: unknown;
    try {
      body = JSON.parse(rawBody.toString('utf8'));
    } catch {
      throw new BadRequestException('Webhook body is not JSON.');
    }
    const event = this.telnyx.parseWebhook(body);
    if (!event) throw new BadRequestException('Unrecognized webhook body.');

    const id = `TELNYX:${event.eventId}`;
    const tracking = await prismaUnscoped.clientCommunicationWebhookEvent.upsert({
      where: { id },
      create: {
        id,
        type: event.type,
        providerMessageId: event.kind === 'ignored' ? null : event.providerMessageId,
      },
      update: {},
    });
    if (tracking.processedAt) return;

    try {
      const outcome = await this.apply(event);
      await prismaUnscoped.clientCommunicationWebhookEvent.update({
        where: { id },
        data: {
          processedAt: new Date(),
          organizationId: outcome.organizationId,
          note: outcome.note,
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      // No message text in logs: a client's words are not diagnostic data.
      this.logger.error(`Webhook ${id} (${event.type}) failed: ${message}`);
      await prismaUnscoped.clientCommunicationWebhookEvent.update({
        where: { id },
        data: { note: message.slice(0, 500) },
      });
      throw error;
    }
  }

  /**
   * Saves a message from a client and updates its conversation. Shared by
   * the real webhook and by simulation, so both exercise the same rules.
   * Callers have already established which clinic location it belongs to.
   */
  async recordInbound(input: InboundMessageInput): Promise<ClientCommunicationMessage> {
    const { organizationId, locationId, contactPhoneE164 } = input;
    return prisma.$transaction(async (tx) => {
      if (input.providerMessageId) {
        const existing = await tx.clientCommunicationMessage.findFirst({
          where: {
            organizationId,
            provider: input.provider,
            providerMessageId: input.providerMessageId,
          },
        });
        if (existing) return existing;
      }

      // Link a brand-new conversation to a client only when exactly one
      // client record at this clinic has the number. Never guess between two.
      const candidates = await tx.client.findMany({
        where: {
          organizationId,
          OR: [{ phoneE164: contactPhoneE164 }, { alternatePhoneE164: contactPhoneE164 }],
        },
        select: { id: true },
        take: 2,
      });
      const thread = await tx.clientCommunicationThread.upsert({
        where: { locationId_contactPhoneE164: { locationId, contactPhoneE164 } },
        create: {
          organizationId,
          locationId,
          contactPhoneE164,
          clientId: candidates.length === 1 ? candidates[0]!.id : null,
        },
        update: {},
      });

      const body = cleanMessageBody(input.body);
      const keyword = input.media.length === 0 ? detectConsentKeyword(body) : null;
      const message = await tx.clientCommunicationMessage.create({
        data: {
          organizationId,
          locationId,
          threadId: thread.id,
          direction: 'INBOUND',
          source: 'CLIENT',
          status: input.provider === 'SIMULATED' ? 'SIMULATED' : 'RECEIVED',
          body,
          clientId: thread.clientId,
          provider: input.provider,
          providerMessageId: input.providerMessageId,
          fromE164: contactPhoneE164,
          toE164: input.clinicPhoneE164,
          segments: input.segments,
        },
      });
      if (input.media.length > 0) {
        await tx.clientCommunicationAttachment.createMany({
          data: input.media.map((item) => ({
            organizationId,
            locationId,
            messageId: message.id,
            providerUrl: item.url,
            mimeType: item.contentType,
            sizeBytes: item.sizeBytes,
          })),
        });
      }

      // STOP/START is the client managing their preference, not a message
      // that needs a reply: it does not mark the conversation unread or
      // reopen it. Anything else does both.
      const reopens = !keyword && thread.status !== 'OPEN';
      await tx.clientCommunicationThread.update({
        where: { id: thread.id },
        data: {
          lastMessageId: message.id,
          lastMessageAt: message.createdAt,
          lastInboundAt: message.createdAt,
          ...(keyword ? {} : { unreadCount: { increment: 1 } }),
          ...(reopens ? { status: 'OPEN', version: { increment: 1 } } : {}),
        },
      });
      if (reopens) {
        await tx.clientCommunicationThreadEvent.create({
          data: {
            organizationId,
            threadId: thread.id,
            type: 'STATUS_CHANGED',
            actorUserId: null,
            before: { status: thread.status },
            after: { status: 'OPEN' },
          },
        });
      }

      const consentChange = {
        organizationId,
        phoneE164: contactPhoneE164,
        clientId: thread.clientId,
        messageId: message.id,
      };
      if (keyword) await this.consent.recordKeyword(tx, { ...consentChange, keyword });
      else await this.consent.recordClientInitiated(tx, consentChange);

      return message;
    });
  }

  private async apply(event: ProviderEvent): Promise<ApplyOutcome> {
    if (event.kind === 'ignored') return { organizationId: null, note: 'Event type not used.' };

    if (event.kind === 'inbound') {
      const channel = await prismaUnscoped.clientMessagingChannel.findFirst({
        where: { provider: 'TELNYX', senderPhoneE164: { in: event.to } },
      });
      if (!channel)
        return { organizationId: null, note: 'No clinic uses the number that was texted.' };
      enterTenantContext({ organizationId: channel.organizationId });
      await this.recordInbound({
        organizationId: channel.organizationId,
        locationId: channel.locationId,
        provider: 'TELNYX',
        contactPhoneE164: event.from,
        clinicPhoneE164: channel.senderPhoneE164,
        body: event.body,
        providerMessageId: event.providerMessageId,
        segments: event.segments,
        media: event.media,
      });
      return { organizationId: channel.organizationId, note: null };
    }

    const message =
      (await prismaUnscoped.clientCommunicationMessage.findFirst({
        where: { provider: 'TELNYX', providerMessageId: event.providerMessageId },
      })) ?? (await this.adopt(event));
    if (!message) return { organizationId: null, note: 'No message matches this delivery update.' };
    enterTenantContext({ organizationId: message.organizationId });
    const note = await this.applyDeliveryStatus(message, event);
    return { organizationId: message.organizationId, note };
  }

  /**
   * A delivery update can arrive for a send whose provider id Sparki never
   * learned — the send request timed out (OUTCOME_UNKNOWN), or the webhook
   * beat the request's own response (still SENDING). Match it to that exact
   * send: same clinic number, same client number, same text, no id yet.
   * This is what turns "we don't know if it sent" into a known answer.
   */
  private async adopt(event: ProviderStatusEvent): Promise<ClientCommunicationMessage | null> {
    if (!event.from || !event.to || event.body === null) return null;
    const candidate = await prismaUnscoped.clientCommunicationMessage.findFirst({
      where: {
        provider: 'TELNYX',
        providerMessageId: null,
        direction: 'OUTBOUND',
        status: { in: ['SENDING', 'OUTCOME_UNKNOWN'] },
        fromE164: event.from,
        toE164: event.to,
        body: event.body,
        createdAt: { gte: new Date(Date.now() - ADOPTION_WINDOW_MS) },
      },
      orderBy: { createdAt: 'desc' },
    });
    if (!candidate) return null;
    const adopted = await prismaUnscoped.clientCommunicationMessage.updateMany({
      where: { id: candidate.id, providerMessageId: null },
      data: { providerMessageId: event.providerMessageId },
    });
    if (adopted.count !== 1) return null;
    return { ...candidate, providerMessageId: event.providerMessageId };
  }

  private async applyDeliveryStatus(
    message: ClientCommunicationMessage,
    event: ProviderStatusEvent,
    retried = false,
  ): Promise<string | null> {
    if (!statusAdvances(message.status, event.status)) {
      return `Already ${message.status}; ${event.status} not applied.`;
    }
    const now = new Date();
    const data: Prisma.ClientCommunicationMessageUpdateManyMutationInput = {
      status: event.status,
      ...(event.segments !== null ? { segments: event.segments } : {}),
    };
    if (event.status === 'FAILED') {
      data.failedAt = now;
      data.failureCode = event.errorCode ?? 'DELIVERY_FAILED';
      data.failureDetail = event.errorDetail?.slice(0, 500) ?? null;
    } else {
      // Accepted after all: whatever was recorded while the outcome was
      // unknown no longer applies.
      data.failureCode = null;
      data.failureDetail = null;
      if (!message.sentAt) data.sentAt = now;
      if (event.status === 'DELIVERED') data.deliveredAt = now;
    }

    const updated = await prisma.clientCommunicationMessage.updateMany({
      where: { id: message.id, status: message.status },
      data,
    });
    if (updated.count !== 1) {
      // The dispatcher or another webhook moved it first. Look again once.
      const current = await prisma.clientCommunicationMessage.findUnique({
        where: { id: message.id },
      });
      if (!current || retried) return 'Status changed concurrently; not applied.';
      return this.applyDeliveryStatus(current, event, true);
    }

    await refreshDeliveryProblem(prisma, message.organizationId, message.threadId);
    if (event.status === 'FAILED' && event.errorCode === OPT_OUT_BLOCK_CODE && message.toE164) {
      const toE164 = message.toE164;
      await prisma.$transaction((tx) =>
        this.consent.recordProviderBlock(tx, {
          organizationId: message.organizationId,
          phoneE164: toE164,
          clientId: message.clientId,
          messageId: message.id,
        }),
      );
    }
    return null;
  }
}
