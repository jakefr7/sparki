import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from '@nestjs/common';
import { prismaUnscoped as prisma, type ClientCommunicationMessage, type Prisma } from '@sparki/db';
import { AppConfigService } from '../config/app-config.service';
import { AttachmentStorageService } from '../messaging/attachment-storage.service';
import {
  FAILURE_OUTCOME_UNKNOWN,
  INBOUND_ATTACHMENT_TYPES,
  MAX_ATTACHMENT_ATTEMPTS,
  MAX_SEND_ATTEMPTS,
  RETRY_DELAYS_MS,
  STALE_SENDING_MS,
} from './client-communication.constants';
import { ClientTextingConsentService } from './client-texting-consent.service';
import {
  ClientTextingReadinessService,
  type LiveChannel,
} from './client-texting-readiness.service';
import { DownloadError, InboundMediaDownloader } from './inbound-media-downloader';
import { AppointmentNotificationEngine } from './notifications/appointment-notification-engine.service';
import { SKIP_REASONS, type SkipReason } from './notifications/notification-constants';
import { TelnyxSmsProvider } from './providers/telnyx-sms.provider';
import { refreshDeliveryProblem } from './thread-state';

const POLL_INTERVAL_MS = 5_000;
const BATCH_SIZE = 25;

/** What may happen to a claimed message, decided before the provider is contacted. */
type PreSend =
  | { kind: 'send'; channel: LiveChannel | null }
  | { kind: 'withdraw'; reason: SkipReason }
  | { kind: 'wait'; until: Date };

/**
 * Sends saved outbound messages and copies inbound files into storage.
 *
 * The message row is the queue: a message is committed as QUEUED before
 * anything is sent, so a crash between "saved" and "sent" loses nothing.
 * The request that created a message attempts it immediately (attempt());
 * this service's timer is the safety net that retries what the provider
 * explicitly did not take, and that notices a send which lost its process.
 *
 * Before every attempt — the first and each retry — everything that could
 * have changed since the message was saved is checked again (preSendCheck).
 * A message that should no longer go is withdrawn (CANCELLED) and never
 * reaches the provider.
 *
 * Every claim is a conditional UPDATE, so two API processes (or the request
 * path and the timer) can never both send the same message.
 *
 * This is a cross-tenant system path (one timer serves every clinic), so it
 * uses the unscoped database client and names the organizationId in every
 * per-message write itself. It must not depend on whatever tenant context
 * happens to surround the call: an attempt made inside a staff request and
 * one made by the timer have to behave identically.
 */
@Injectable()
export class ClientCommunicationDispatcher implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(ClientCommunicationDispatcher.name);
  private timer: NodeJS.Timeout | undefined;
  private running = false;

  constructor(
    private readonly config: AppConfigService,
    private readonly telnyx: TelnyxSmsProvider,
    private readonly readiness: ClientTextingReadinessService,
    private readonly consent: ClientTextingConsentService,
    private readonly storage: AttachmentStorageService,
    private readonly notifications: AppointmentNotificationEngine,
    private readonly mediaDownloader: InboundMediaDownloader,
  ) {}

  onApplicationBootstrap(): void {
    // Tests drive runOnce() themselves; a background timer would only make
    // them nondeterministic.
    if (this.config.nodeEnv === 'test') return;
    this.timer = setInterval(() => void this.runOnce(), POLL_INTERVAL_MS);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  /** One pass of the safety net. Never throws: the next pass tries again. */
  async runOnce(now: Date = new Date()): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      // Appointment confirmations and reminders that have come due become
      // QUEUED messages here, and are sent by the same pass below.
      await this.notifications.runOnce(now);
      await this.recoverStaleSends(now);
      const due = await prisma.clientCommunicationMessage.findMany({
        where: { status: 'QUEUED', OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }] },
        orderBy: { createdAt: 'asc' },
        take: BATCH_SIZE,
        select: { id: true },
      });
      for (const { id } of due) await this.attempt(id, now);

      const pending = await prisma.clientCommunicationAttachment.findMany({
        where: { status: 'PENDING' },
        orderBy: { createdAt: 'asc' },
        take: BATCH_SIZE,
        select: { id: true },
      });
      for (const { id } of pending) await this.storeAttachment(id);
    } catch (error) {
      this.logger.error(`Dispatcher pass failed: ${describe(error)}`);
    } finally {
      this.running = false;
    }
  }

  /** Claims one QUEUED message and makes a single delivery attempt. A no-op
   *  when it is not due or another process already claimed it. */
  async attempt(messageId: string, now: Date = new Date()): Promise<void> {
    const claimed = await prisma.clientCommunicationMessage.updateMany({
      where: {
        id: messageId,
        status: 'QUEUED',
        OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }],
      },
      data: { status: 'SENDING', claimedAt: now, attemptCount: { increment: 1 } },
    });
    if (claimed.count !== 1) return;
    const message = await prisma.clientCommunicationMessage.findUniqueOrThrow({
      where: { id: messageId },
    });

    let check: PreSend;
    try {
      check = await this.preSendCheck(message, now);
    } catch (error) {
      // Nothing was sent. Put it back so the next pass retries.
      this.logger.warn(`Could not check message ${message.id} before sending: ${describe(error)}`);
      await this.release(message, new Date(now.getTime() + POLL_INTERVAL_MS));
      return;
    }
    if (check.kind === 'wait') {
      await this.release(message, check.until);
      return;
    }
    if (check.kind === 'withdraw') {
      await this.withdraw(message, check.reason);
      return;
    }

    if (message.provider === 'SIMULATED' || !check.channel || !message.toE164) {
      // Saved for workflow testing only: no provider id, no sent or
      // delivered time, no delivery claim.
      await this.settle(message, { status: 'SIMULATED' });
      return;
    }

    const { channel } = check;
    const result = await this.telnyx.send({
      from: channel.senderPhoneE164,
      to: message.toE164,
      body: message.body,
      profileId: channel.providerProfileId,
    });

    switch (result.outcome) {
      case 'accepted':
        // Record the provider id even if a delivery webhook already moved
        // the status on (it can arrive before this response does).
        await prisma.clientCommunicationMessage.updateMany({
          where: {
            id: message.id,
            organizationId: message.organizationId,
            providerMessageId: null,
          },
          data: { providerMessageId: result.providerMessageId },
        });
        await this.settle(message, {
          status: 'SENT',
          sentAt: now,
          fromE164: channel.senderPhoneE164,
          failureCode: null,
          failureDetail: null,
          ...(result.segments !== null ? { segments: result.segments } : {}),
        });
        return;
      case 'rejected':
        await this.fail(message, now, result.code, result.detail);
        if (result.recipientOptedOut) {
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
        return;
      case 'retryable': {
        const delay = RETRY_DELAYS_MS[message.attemptCount - 1];
        if (message.attemptCount >= MAX_SEND_ATTEMPTS || delay === undefined) {
          await this.fail(message, now, result.code, result.detail);
          return;
        }
        // The next attempt runs preSendCheck again, so a retry can never
        // carry stale details or reach a client who opted out meanwhile.
        await this.settle(message, {
          status: 'QUEUED',
          nextAttemptAt: new Date(now.getTime() + delay),
          failureCode: result.code,
          failureDetail: result.detail,
        });
        return;
      }
      case 'unknown':
        await this.settle(message, {
          status: 'OUTCOME_UNKNOWN',
          failureCode: FAILURE_OUTCOME_UNKNOWN,
          failureDetail: result.detail,
        });
        return;
    }
  }

  /**
   * Everything that could have changed since the message was saved, checked
   * again right before the provider would be contacted:
   * - the client opted out (any message);
   * - for an automated text, the full appointment check — the appointment
   *   moved, was cancelled or passed, the rule or appointment type was
   *   switched off, the client or their number changed, sending hours;
   * - for a staff message, the number still belongs to the client it was
   *   written to;
   * - for a real send, the clinic can still text.
   */
  private async preSendCheck(message: ClientCommunicationMessage, now: Date): Promise<PreSend> {
    const consent = message.toE164
      ? await this.consent.find(message.organizationId, message.toE164, prisma)
      : null;
    if (consent?.status === 'OPTED_OUT') return { kind: 'withdraw', reason: 'OPTED_OUT' };

    if (message.source === 'AUTOMATED') {
      const verdict = await this.notifications.recheckBeforeSend(message.id, message, now);
      if (verdict.kind === 'skip') return { kind: 'withdraw', reason: verdict.reason };
      if (verdict.kind === 'wait') return verdict;
    } else if (message.source === 'STAFF' && message.clientId && message.toE164) {
      const stillTheirs = await prisma.client.count({
        where: {
          id: message.clientId,
          organizationId: message.organizationId,
          OR: [{ phoneE164: message.toE164 }, { alternatePhoneE164: message.toE164 }],
        },
      });
      if (!stillTheirs) return { kind: 'withdraw', reason: 'RECIPIENT_CHANGED' };
    }

    if (message.provider === 'SIMULATED') return { kind: 'send', channel: null };
    const channel = await prisma.clientMessagingChannel.findFirst({
      where: { organizationId: message.organizationId, locationId: message.locationId },
    });
    const readiness = this.readiness.forChannel(channel);
    if (readiness.mode !== 'LIVE' || !message.toE164) {
      return { kind: 'withdraw', reason: 'TEXTING_NOT_AVAILABLE' };
    }
    return { kind: 'send', channel: readiness.channel };
  }

  /** Copies one inbound file from the provider's expiring link into private
   *  storage. Leaves it PENDING to be retried unless it can never succeed. */
  async storeAttachment(attachmentId: string): Promise<void> {
    const attachment = await prisma.clientCommunicationAttachment.findUnique({
      where: { id: attachmentId },
    });
    if (!attachment || attachment.status !== 'PENDING') return;
    const claimed = await prisma.clientCommunicationAttachment.updateMany({
      where: { id: attachment.id, status: 'PENDING', attemptCount: attachment.attemptCount },
      data: { attemptCount: { increment: 1 } },
    });
    if (claimed.count !== 1) return;
    const lastAttempt = attachment.attemptCount + 1 >= MAX_ATTACHMENT_ATTEMPTS;

    const give = (failureDetail: string, permanent: boolean) =>
      prisma.clientCommunicationAttachment.update({
        where: { id: attachment.id },
        data:
          permanent || lastAttempt
            ? { status: 'FAILED', failureDetail: failureDetail.slice(0, 300) }
            : { failureDetail: failureDetail.slice(0, 300) },
      });

    if (!attachment.providerUrl) {
      await give('The provider sent no link for this file.', true);
      return;
    }
    try {
      // Refuses private and internal addresses (including through redirects
      // and DNS) and stops reading as soon as the size limit is passed.
      const file = await this.mediaDownloader.download(attachment.providerUrl);
      const mimeType = (attachment.mimeType ?? file.contentType ?? '')
        .split(';')[0]!
        .trim()
        .toLowerCase();
      const extension = INBOUND_ATTACHMENT_TYPES.get(mimeType);
      if (!extension) {
        await give(`Files of type ${mimeType || 'unknown'} are not stored.`, true);
        return;
      }
      if (file.body.length === 0) {
        await give('The file was empty.', true);
        return;
      }
      const storageKey = this.storage.clientCommunicationKey(
        attachment.organizationId,
        attachment.locationId,
      );
      await this.storage.put(storageKey, file.body, mimeType, `client-file.${extension}`);
      await prisma.clientCommunicationAttachment.update({
        where: { id: attachment.id },
        data: {
          status: 'STORED',
          storageKey,
          mimeType,
          sizeBytes: file.body.length,
          failureDetail: null,
        },
      });
    } catch (error) {
      await give(
        `Could not copy the file: ${describe(error)}`,
        error instanceof DownloadError && error.permanent,
      );
    }
  }

  /** A SENDING message whose claim is old lost its process mid-send. It may
   *  have gone out, so it is flagged for a person rather than re-sent. */
  private async recoverStaleSends(now: Date): Promise<void> {
    const stale = await prisma.clientCommunicationMessage.findMany({
      where: { status: 'SENDING', claimedAt: { lt: new Date(now.getTime() - STALE_SENDING_MS) } },
      take: BATCH_SIZE,
    });
    for (const message of stale) {
      await this.settle(message, {
        status: 'OUTCOME_UNKNOWN',
        failureCode: FAILURE_OUTCOME_UNKNOWN,
        failureDetail: 'The send was interrupted before the provider answered.',
      });
    }
  }

  /** Nothing was sent: put the message back, without counting this as an attempt. */
  private release(message: ClientCommunicationMessage, until: Date): Promise<void> {
    return this.settle(message, {
      status: 'QUEUED',
      nextAttemptAt: until,
      attemptCount: { decrement: 1 },
    });
  }

  /** Sparki withholds the message; it never reaches the provider. */
  private async withdraw(message: ClientCommunicationMessage, reason: SkipReason): Promise<void> {
    await this.settle(message, {
      status: 'CANCELLED',
      failureCode: reason,
      failureDetail: SKIP_REASONS[reason],
      nextAttemptAt: null,
    });
    await prisma.appointmentNotification.updateMany({
      where: { messageId: message.id, status: 'DISPATCHED' },
      data: { status: 'SKIPPED', skipReason: reason },
    });
  }

  private fail(
    message: ClientCommunicationMessage,
    now: Date,
    code: string,
    detail: string,
  ): Promise<void> {
    return this.settle(message, {
      status: 'FAILED',
      failedAt: now,
      failureCode: code,
      failureDetail: detail.slice(0, 500),
    });
  }

  /**
   * Writes the result of an attempt. Guarded on SENDING: if a delivery
   * webhook already advanced the message, that newer fact stands.
   */
  private async settle(
    message: ClientCommunicationMessage,
    data: Prisma.ClientCommunicationMessageUpdateManyMutationInput,
  ): Promise<void> {
    await prisma.clientCommunicationMessage.updateMany({
      where: { id: message.id, organizationId: message.organizationId, status: 'SENDING' },
      data,
    });
    await refreshDeliveryProblem(prisma, message.organizationId, message.threadId);
  }
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
