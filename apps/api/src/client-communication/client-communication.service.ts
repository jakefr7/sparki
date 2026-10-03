import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma, prisma, type ClientTextingConsent } from '@sparki/db';
import type { AuthenticatedUser } from '../auth/types';
import { normalizeUsPhone } from '../common/phone';
import { AttachmentStorageService } from '../messaging/attachment-storage.service';
import { CLIENT_COMMUNICATION_ROLES } from './client-communication.constants';
import { ClientCommunicationDispatcher } from './client-communication-dispatcher.service';
import { ClientCommunicationInboundService } from './client-communication-inbound.service';
import {
  matchState,
  messageInclude,
  personSelect,
  presentMessage,
  presentPerson,
  presentReadiness,
  presentThread,
  threadInclude,
  type ClientCandidate,
  type MatchState,
  type ThreadRow,
} from './client-communication.presenter';
import { ClientTextingConsentService } from './client-texting-consent.service';
import {
  ClientTextingReadinessService,
  type TextingReadiness,
} from './client-texting-readiness.service';
import type {
  ListMessagesQuery,
  ListThreadsQuery,
  OpenThreadInput,
  RecordConsentInput,
  SendMessageInput,
  SimulatedReplyInput,
  UpdateThreadInput,
} from './dto/client-communication.schema';
import { cleanMessageBody, countSmsSegments } from './sms-text';

export type SendBlockCode =
  | 'REGISTRATION_PENDING'
  | 'SENDER_SUSPENDED'
  | 'PROVIDER_NOT_CONFIGURED'
  | 'TEXTING_NOT_SET_UP'
  | 'OPTED_OUT'
  | 'NUMBER_NOT_ON_CLIENT'
  | 'CONSENT_REQUIRED';

export type SendEligibility =
  | { canSend: true; code: null; message: null }
  | { canSend: false; code: SendBlockCode; message: string };

/** Why the clinic may or may not text this number right now. Ordered so the
 *  reason shown is the one staff would have to resolve first. */
export function sendEligibility(
  readiness: TextingReadiness,
  consent: ClientTextingConsent | null,
  match: MatchState,
): SendEligibility {
  if (readiness.mode === 'NOT_SET_UP') {
    return {
      canSend: false,
      code: 'TEXTING_NOT_SET_UP',
      message: 'Texting has not been set up for this clinic.',
    };
  }
  if (readiness.mode === 'UNAVAILABLE') {
    return { canSend: false, code: readiness.code, message: readiness.reason };
  }
  if (consent?.status === 'OPTED_OUT') {
    return {
      canSend: false,
      code: 'OPTED_OUT',
      message:
        consent.basis === 'STAFF_RECORDED'
          ? 'The clinic recorded that this client does not want texts.'
          : 'This client opted out by texting STOP. They need to text START before the clinic can text them.',
    };
  }
  if (match === 'NUMBER_NOT_ON_CLIENT') {
    return {
      canSend: false,
      code: 'NUMBER_NOT_ON_CLIENT',
      message:
        "This number is no longer on the linked client's record. Link the right client or remove the link before texting.",
    };
  }
  if (!consent) {
    return {
      canSend: false,
      code: 'CONSENT_REQUIRED',
      message: 'Record that the client agreed to receive texts before sending.',
    };
  }
  return { canSend: true, code: null, message: null };
}

function encodeCursor(at: Date, id: string): string {
  return Buffer.from(JSON.stringify([at.toISOString(), id])).toString('base64url');
}

function decodeCursor(cursor: string): { at: Date; id: string } {
  try {
    const [at, id] = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as [
      string,
      string,
    ];
    const date = new Date(at);
    if (typeof id !== 'string' || Number.isNaN(date.getTime())) throw new Error('bad cursor');
    return { at: date, id };
  } catch {
    throw new BadRequestException('Invalid cursor.');
  }
}

/**
 * Staff-facing client conversations: the queue, a conversation, sending,
 * handoff, and consent. docs/engineering/client-communication-backend.md is
 * the contract the web app builds against.
 *
 * Every query is scoped to the caller's organization AND location — a
 * conversation belongs to the clinic location whose number the client texts.
 */
@Injectable()
export class ClientCommunicationService {
  private readonly logger = new Logger(ClientCommunicationService.name);

  constructor(
    private readonly readinessService: ClientTextingReadinessService,
    private readonly consent: ClientTextingConsentService,
    private readonly dispatcher: ClientCommunicationDispatcher,
    private readonly inbound: ClientCommunicationInboundService,
    private readonly storage: AttachmentStorageService,
  ) {}

  async readiness(user: AuthenticatedUser) {
    const [readiness, location] = await Promise.all([
      this.readinessService.forLocation(user.organizationId, user.locationId),
      prisma.location.findFirstOrThrow({
        where: { id: user.locationId, organizationId: user.organizationId },
        select: { id: true, name: true, organization: { select: { id: true, name: true } } },
      }),
    ]);
    return presentReadiness(readiness, location);
  }

  /** Staff a conversation can be handed to: active team members here. */
  async assignees(user: AuthenticatedUser) {
    const people = await prisma.user.findMany({
      where: this.assigneeWhere(user),
      select: { ...personSelect, role: true },
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
      take: 200,
    });
    return people.map((person) => ({ ...presentPerson(person)!, role: person.role }));
  }

  async listThreads(user: AuthenticatedUser, query: ListThreadsQuery) {
    const scope: Prisma.ClientCommunicationThreadWhereInput = {
      organizationId: user.organizationId,
      locationId: user.locationId,
    };
    // A conversation someone opened but never used is not work. Keep it out
    // of the queues; it still shows when looking at its client or patient.
    const queue: Prisma.ClientCommunicationThreadWhereInput =
      query.clientId || query.patientId ? scope : { ...scope, lastMessageId: { not: null } };

    const filters: Prisma.ClientCommunicationThreadWhereInput[] = [
      queue,
      this.viewWhere(user, query.view),
    ];
    if (query.clientId) filters.push({ clientId: query.clientId });
    if (query.patientId) {
      filters.push({
        OR: [
          { client: { patients: { some: { patientId: query.patientId } } } },
          { messages: { some: { patientId: query.patientId } } },
        ],
      });
    }
    for (const term of (query.search ?? '').split(/\s+/).filter(Boolean)) {
      const digits = term.replace(/[^0-9]/g, '');
      filters.push({
        OR: [
          { client: { firstName: { contains: term, mode: 'insensitive' } } },
          { client: { lastName: { contains: term, mode: 'insensitive' } } },
          {
            client: {
              patients: { some: { patient: { name: { contains: term, mode: 'insensitive' } } } },
            },
          },
          ...(digits.length >= 3 ? [{ contactPhoneE164: { contains: digits } }] : []),
        ],
      });
    }
    if (query.cursor) {
      const { at, id } = decodeCursor(query.cursor);
      filters.push({ OR: [{ lastMessageAt: { lt: at } }, { lastMessageAt: at, id: { lt: id } }] });
    }

    const [rows, counts] = await Promise.all([
      prisma.clientCommunicationThread.findMany({
        where: { AND: filters },
        include: threadInclude,
        orderBy: [{ lastMessageAt: 'desc' }, { id: 'desc' }],
        take: query.limit + 1,
      }),
      // Queue totals come from the database, not the loaded page. Skipped
      // when paging: the first page already carried them.
      query.cursor ? null : this.queueCounts(user, queue),
    ]);

    const page = rows.slice(0, query.limit);
    const last = page[page.length - 1];
    return {
      threads: await this.presentThreads(user.organizationId, page),
      nextCursor:
        rows.length > query.limit && last ? encodeCursor(last.lastMessageAt, last.id) : null,
      counts,
    };
  }

  async getThread(user: AuthenticatedUser, id: string) {
    const thread = await this.requireThread(user, id);
    const [candidates, consent, readiness, patients, events] = await Promise.all([
      this.candidatesFor(user.organizationId, [thread.contactPhoneE164]),
      this.consent.find(user.organizationId, thread.contactPhoneE164),
      this.readinessService.forLocation(user.organizationId, user.locationId),
      thread.clientId
        ? prisma.patient.findMany({
            where: {
              organizationId: user.organizationId,
              clients: { some: { clientId: thread.clientId } },
            },
            select: { id: true, name: true, species: true, breed: true, status: true },
            orderBy: { name: 'asc' },
            take: 50,
          })
        : [],
      prisma.clientCommunicationThreadEvent.findMany({
        where: { organizationId: user.organizationId, threadId: id },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
    ]);
    const forNumber = candidates.get(thread.contactPhoneE164) ?? [];
    const consentView = this.consent.view(consent);

    const peopleIds = [
      ...new Set(
        [...events.map((event) => event.actorUserId), consent?.recordedById].filter(Boolean),
      ),
    ] as string[];
    const people = new Map(
      (peopleIds.length > 0
        ? await prisma.user.findMany({
            where: { id: { in: peopleIds }, organizationId: user.organizationId },
            select: personSelect,
          })
        : []
      ).map((person) => [person.id, presentPerson(person)]),
    );

    return {
      ...presentThread(thread, { candidates: forNumber, consentStatus: consentView.status }),
      contact: thread.client
        ? {
            phone: thread.client.phone,
            alternatePhone: thread.client.alternatePhone,
            email: thread.client.email,
            preferredContactMethod: thread.client.preferredContactMethod,
          }
        : null,
      // Every client record that has this number: who staff may link.
      clientCandidates: forNumber,
      patients,
      consent: { ...consentView, recordedBy: people.get(consentView.recordedById ?? '') ?? null },
      sendEligibility: sendEligibility(readiness, consent, matchState(thread.clientId, forNumber)),
      events: events.map((event) => ({
        id: event.id,
        type: event.type,
        actor: people.get(event.actorUserId ?? '') ?? null,
        before: event.before,
        after: event.after,
        createdAt: event.createdAt.toISOString(),
      })),
    };
  }

  /**
   * One page of a conversation, oldest first within the page.
   * - No parameters: the newest `limit` messages.
   * - `before`: the page older than a previous response's `olderCursor`.
   * - `changedSince`: every message created OR updated since a previous
   *   response's `asOf` — the polling call. It carries delivery-status
   *   changes to messages already on screen, not only new messages, and is
   *   inclusive, so callers merge by id.
   */
  async listMessages(user: AuthenticatedUser, threadId: string, query: ListMessagesQuery) {
    await this.requireThreadAccess(user, threadId);
    const asOf = new Date();
    const scope = { organizationId: user.organizationId, threadId };

    if (query.changedSince) {
      const changed = await prisma.clientCommunicationMessage.findMany({
        where: { ...scope, updatedAt: { gte: new Date(query.changedSince) } },
        include: messageInclude,
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        take: 200,
      });
      return { messages: changed.map(presentMessage), olderCursor: null, asOf: asOf.toISOString() };
    }

    const before = query.before ? decodeCursor(query.before) : null;
    const rows = await prisma.clientCommunicationMessage.findMany({
      where: {
        ...scope,
        ...(before
          ? {
              OR: [
                { createdAt: { lt: before.at } },
                { createdAt: before.at, id: { lt: before.id } },
              ],
            }
          : {}),
      },
      include: messageInclude,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
    });
    const page = rows.slice(0, query.limit).reverse();
    const oldest = page[0];
    return {
      messages: page.map(presentMessage),
      olderCursor:
        rows.length > query.limit && oldest ? encodeCursor(oldest.createdAt, oldest.id) : null,
      asOf: asOf.toISOString(),
    };
  }

  /**
   * Finds or starts the conversation with one of a client's numbers. There
   * is at most one conversation per number at a location, so this returns
   * the existing one — even when it is linked to another client who shares
   * the number (the response's matchState says so).
   */
  async openThread(user: AuthenticatedUser, input: OpenThreadInput) {
    const client = await prisma.client.findFirst({
      where: { id: input.clientId, organizationId: user.organizationId },
      select: {
        id: true,
        phone: true,
        alternatePhone: true,
        phoneE164: true,
        alternatePhoneE164: true,
      },
    });
    if (!client) throw new NotFoundException('Client not found.');

    const useAlternate = input.phone === 'ALTERNATE';
    const contactPhoneE164 = normalizeUsPhone(useAlternate ? client.alternatePhone : client.phone);
    if (!contactPhoneE164) {
      throw new UnprocessableEntityException({
        code: 'NUMBER_NOT_TEXTABLE',
        message: "This client's number is missing or is not a complete US or Canada phone number.",
      });
    }
    // Rows written outside the API (seeds, imports) may not carry the
    // normalized copy yet. Matching inbound texts depends on it, so repair
    // it the moment it is noticed.
    if ((useAlternate ? client.alternatePhoneE164 : client.phoneE164) !== contactPhoneE164) {
      await prisma.client.update({
        where: { id: client.id },
        data: useAlternate
          ? { alternatePhoneE164: contactPhoneE164 }
          : { phoneE164: contactPhoneE164 },
      });
    }

    const key = { locationId_contactPhoneE164: { locationId: user.locationId, contactPhoneE164 } };
    let created = false;
    let thread = await prisma.clientCommunicationThread.findUnique({ where: key });
    if (!thread) {
      try {
        thread = await prisma.clientCommunicationThread.create({
          data: {
            organizationId: user.organizationId,
            locationId: user.locationId,
            contactPhoneE164,
            clientId: client.id,
          },
        });
        created = true;
      } catch (error) {
        // Someone (or an inbound text) created it in the same moment.
        if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002'))
          throw error;
        thread = await prisma.clientCommunicationThread.findUniqueOrThrow({ where: key });
      }
    }
    if (!thread.clientId) {
      // An unlinked conversation with this number: this client's record has
      // the number, and staff picked this client.
      await prisma.clientCommunicationThread.updateMany({
        where: { id: thread.id, organizationId: user.organizationId, clientId: null },
        data: { clientId: client.id, version: { increment: 1 } },
      });
      await prisma.clientCommunicationThreadEvent.create({
        data: {
          organizationId: user.organizationId,
          threadId: thread.id,
          type: 'CLIENT_LINK_CHANGED',
          actorUserId: user.id,
          before: { clientId: null },
          after: { clientId: client.id },
        },
      });
    }
    return { thread: await this.getThread(user, thread.id), created };
  }

  /**
   * Saves a staff message and makes the first delivery attempt before
   * returning, so the response carries the real outcome. Safe to repeat: the
   * same idempotencyKey returns the message already saved (`created: false`)
   * and never produces a second text.
   */
  async sendMessage(user: AuthenticatedUser, threadId: string, input: SendMessageInput) {
    const thread = await this.requireThread(user, threadId);
    const body = cleanMessageBody(input.body);
    const replay = await this.findByIdempotencyKey(user, threadId, input.idempotencyKey);
    if (replay) return { message: this.replayOf(replay, body), created: false };

    if (!body) throw new BadRequestException('Message is empty.');
    const context = await this.resolveContext(user, thread, input);

    const [candidates, consent, readiness] = await Promise.all([
      this.candidatesFor(user.organizationId, [thread.contactPhoneE164]),
      this.consent.find(user.organizationId, thread.contactPhoneE164),
      this.readinessService.forLocation(user.organizationId, user.locationId),
    ]);
    const eligibility = sendEligibility(
      readiness,
      consent,
      matchState(thread.clientId, candidates.get(thread.contactPhoneE164) ?? []),
    );
    if (!eligibility.canSend) {
      throw new ConflictException({ code: eligibility.code, message: eligibility.message });
    }

    const now = new Date();
    let messageId: string;
    try {
      messageId = await prisma.$transaction(async (tx) => {
        const message = await tx.clientCommunicationMessage.create({
          data: {
            organizationId: user.organizationId,
            locationId: user.locationId,
            threadId,
            direction: 'OUTBOUND',
            source: 'STAFF',
            status: 'QUEUED',
            body,
            senderUserId: user.id,
            clientId: thread.clientId,
            patientId: context.patientId,
            appointmentId: context.appointmentId,
            idempotencyKey: input.idempotencyKey,
            provider: readiness.mode === 'LIVE' ? readiness.channel.provider : 'SIMULATED',
            fromE164: readiness.mode === 'LIVE' ? readiness.channel.senderPhoneE164 : null,
            toE164: thread.contactPhoneE164,
            // The provider's own count replaces this once it accepts.
            segments: countSmsSegments(body),
          },
        });
        // Replying means the clinic has seen the conversation and now waits
        // on the client.
        const moves = thread.status !== 'WAITING';
        await tx.clientCommunicationThread.update({
          where: { id: threadId },
          data: {
            lastMessageId: message.id,
            lastMessageAt: message.createdAt,
            unreadCount: 0,
            markedUnread: false,
            lastReadAt: now,
            lastReadById: user.id,
            ...(moves ? { status: 'WAITING', version: { increment: 1 } } : {}),
          },
        });
        if (moves) {
          await tx.clientCommunicationThreadEvent.create({
            data: {
              organizationId: user.organizationId,
              threadId,
              type: 'STATUS_CHANGED',
              actorUserId: user.id,
              before: { status: thread.status },
              after: { status: 'WAITING' },
            },
          });
        }
        return message.id;
      });
    } catch (error) {
      // Two requests with the same key raced; the other one saved it.
      if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002'))
        throw error;
      const saved = await this.findByIdempotencyKey(user, threadId, input.idempotencyKey);
      if (!saved) throw error;
      return { message: this.replayOf(saved, body), created: false };
    }

    try {
      await this.dispatcher.attempt(messageId);
    } catch (error) {
      // The message is saved and still queued; the dispatcher's timer will
      // pick it up. The request must not fail and invite a duplicate send.
      this.logger.warn(
        `First attempt for message ${messageId} did not finish: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    const saved = await prisma.clientCommunicationMessage.findFirstOrThrow({
      where: { id: messageId, organizationId: user.organizationId },
      include: messageInclude,
    });
    return { message: presentMessage(saved), created: true };
  }

  /**
   * Changes status, owner, or linked client. `expectedVersion` must be the
   * version the caller last saw: if anyone (including an inbound message
   * reopening the conversation) changed it since, this refuses with
   * THREAD_CHANGED instead of overwriting their change.
   */
  async updateThread(user: AuthenticatedUser, id: string, input: UpdateThreadInput) {
    const thread = await this.requireThread(user, id);
    const data: Prisma.ClientCommunicationThreadUncheckedUpdateManyInput = {};
    const events: Prisma.ClientCommunicationThreadEventCreateManyInput[] = [];
    const event = (
      type: Prisma.ClientCommunicationThreadEventCreateManyInput['type'],
      before: Prisma.InputJsonObject,
      after: Prisma.InputJsonObject,
    ) =>
      events.push({
        organizationId: user.organizationId,
        threadId: id,
        type,
        actorUserId: user.id,
        before,
        after,
      });

    if (input.status !== undefined && input.status !== thread.status) {
      data.status = input.status;
      event('STATUS_CHANGED', { status: thread.status }, { status: input.status });
    }
    if (input.assignedToId !== undefined && input.assignedToId !== thread.assignedToId) {
      if (input.assignedToId !== null) {
        const assignee = await prisma.user.findFirst({
          where: { ...this.assigneeWhere(user), id: input.assignedToId },
          select: { id: true },
        });
        if (!assignee) {
          throw new BadRequestException({
            code: 'ASSIGNEE_UNAVAILABLE',
            message: 'That team member is not active at this clinic location.',
          });
        }
      }
      data.assignedToId = input.assignedToId;
      event(
        'ASSIGNMENT_CHANGED',
        { assignedToId: thread.assignedToId },
        { assignedToId: input.assignedToId },
      );
    }
    if (input.clientId !== undefined && input.clientId !== thread.clientId) {
      if (input.clientId !== null) {
        // The client record is the source of truth for whose number this is.
        // Linking a client who does not have the number would make the
        // conversation and the record disagree.
        const candidates = await this.candidatesFor(user.organizationId, [thread.contactPhoneE164]);
        if (
          !(candidates.get(thread.contactPhoneE164) ?? []).some(
            (candidate) => candidate.id === input.clientId,
          )
        ) {
          throw new UnprocessableEntityException({
            code: 'NUMBER_NOT_ON_CLIENT',
            message: "Add this number to the client's record first, then link the conversation.",
          });
        }
      }
      data.clientId = input.clientId;
      event('CLIENT_LINK_CHANGED', { clientId: thread.clientId }, { clientId: input.clientId });
    }

    if (events.length > 0) {
      await prisma.$transaction(async (tx) => {
        const updated = await tx.clientCommunicationThread.updateMany({
          where: { id, organizationId: user.organizationId, version: input.expectedVersion },
          data: { ...data, version: { increment: 1 } },
        });
        if (updated.count !== 1) {
          throw new ConflictException({
            code: 'THREAD_CHANGED',
            message:
              'This conversation changed since you opened it. Review the latest before updating it.',
          });
        }
        await tx.clientCommunicationThreadEvent.createMany({ data: events });
      });
    } else if (input.expectedVersion !== thread.version) {
      throw new ConflictException({
        code: 'THREAD_CHANGED',
        message:
          'This conversation changed since you opened it. Review the latest before updating it.',
      });
    }
    return this.getThread(user, id);
  }

  /** An explicit action, never a side effect of loading the conversation. */
  async markRead(user: AuthenticatedUser, id: string) {
    await this.requireThreadAccess(user, id);
    await prisma.clientCommunicationThread.update({
      where: { id },
      data: { unreadCount: 0, markedUnread: false, lastReadAt: new Date(), lastReadById: user.id },
    });
    return this.getThread(user, id);
  }

  async markUnread(user: AuthenticatedUser, id: string) {
    await this.requireThreadAccess(user, id);
    await prisma.clientCommunicationThread.update({ where: { id }, data: { markedUnread: true } });
    return this.getThread(user, id);
  }

  async recordConsent(user: AuthenticatedUser, id: string, input: RecordConsentInput) {
    const thread = await this.requireThread(user, id);
    if (input.status === 'GRANTED' && !thread.clientId) {
      throw new UnprocessableEntityException({
        code: 'CLIENT_LINK_REQUIRED',
        message: 'Link this number to a client before recording that they agreed to texts.',
      });
    }
    await prisma.$transaction((tx) =>
      this.consent.recordByStaff(tx, {
        organizationId: user.organizationId,
        phoneE164: thread.contactPhoneE164,
        status: input.status,
        method: input.method ?? null,
        note: input.note ?? null,
        clientId: thread.clientId,
        actorUserId: user.id,
      }),
    );
    return this.getThread(user, id);
  }

  /**
   * Workflow testing only: saves a client reply as if one had arrived, at a
   * location that is in simulation. Runs the same rules as a real inbound
   * text (unread, reopen, STOP/START) and is stored as SIMULATED so it can
   * never be mistaken for something a client sent.
   */
  async simulateClientReply(user: AuthenticatedUser, id: string, input: SimulatedReplyInput) {
    const thread = await this.requireThread(user, id);
    const readiness = await this.readinessService.forLocation(user.organizationId, user.locationId);
    if (readiness.mode !== 'SIMULATED') {
      throw new ConflictException({
        code: 'NOT_SIMULATED',
        message: 'This clinic location texts real clients; replies cannot be simulated here.',
      });
    }
    const message = await this.inbound.recordInbound({
      organizationId: user.organizationId,
      locationId: user.locationId,
      provider: 'SIMULATED',
      contactPhoneE164: thread.contactPhoneE164,
      clinicPhoneE164: null,
      body: input.body,
      providerMessageId: null,
      segments: null,
      media: [],
    });
    const saved = await prisma.clientCommunicationMessage.findFirstOrThrow({
      where: { id: message.id, organizationId: user.organizationId },
      include: messageInclude,
    });
    return presentMessage(saved);
  }

  async downloadAttachment(user: AuthenticatedUser, id: string) {
    const attachment = await prisma.clientCommunicationAttachment.findFirst({
      where: {
        id,
        organizationId: user.organizationId,
        locationId: user.locationId,
        status: 'STORED',
      },
    });
    if (
      !attachment?.storageKey ||
      !this.storage.clientCommunicationBelongsTo(
        attachment.storageKey,
        user.organizationId,
        user.locationId,
      )
    ) {
      throw new NotFoundException('Attachment not found.');
    }
    const stored = await this.storage.get(attachment.storageKey);
    return { ...stored, mimeType: attachment.mimeType ?? stored.contentType };
  }

  private assigneeWhere(user: AuthenticatedUser): Prisma.UserWhereInput {
    return {
      organizationId: user.organizationId,
      isActive: true,
      role: { in: CLIENT_COMMUNICATION_ROLES },
      OR: [
        { clinicLocationAccess: { some: { clinicLocationId: user.locationId, isActive: true } } },
        { locations: { some: { id: user.locationId } } },
      ],
    };
  }

  private viewWhere(
    user: AuthenticatedUser,
    view: ListThreadsQuery['view'],
  ): Prisma.ClientCommunicationThreadWhereInput {
    switch (view) {
      case 'unread':
        return { OR: [{ unreadCount: { gt: 0 } }, { markedUnread: true }] };
      case 'open':
        return { status: 'OPEN' };
      case 'waiting':
        return { status: 'WAITING' };
      case 'closed':
        return { status: 'CLOSED' };
      case 'mine':
        return { assignedToId: user.id, status: { not: 'CLOSED' } };
      case 'unassigned':
        return { assignedToId: null, status: { not: 'CLOSED' } };
      case 'problems':
        return { deliveryProblemSince: { not: null } };
      case 'all':
        return {};
    }
  }

  private async queueCounts(
    user: AuthenticatedUser,
    queue: Prisma.ClientCommunicationThreadWhereInput,
  ) {
    const count = (view: ListThreadsQuery['view']) =>
      prisma.clientCommunicationThread.count({
        where: { AND: [queue, this.viewWhere(user, view)] },
      });
    const [unread, open, waiting, mine, unassigned, problems] = await Promise.all([
      count('unread'),
      count('open'),
      count('waiting'),
      count('mine'),
      count('unassigned'),
      count('problems'),
    ]);
    return { unread, open, waiting, mine, unassigned, problems };
  }

  private async presentThreads(organizationId: string, threads: ThreadRow[]) {
    const phones = [...new Set(threads.map((thread) => thread.contactPhoneE164))];
    const [candidates, consents] = await Promise.all([
      this.candidatesFor(organizationId, phones),
      this.consent.findMany(organizationId, phones),
    ]);
    const consentByPhone = new Map(consents.map((consent) => [consent.phoneE164, consent.status]));
    return threads.map((thread) =>
      presentThread(thread, {
        candidates: candidates.get(thread.contactPhoneE164) ?? [],
        consentStatus: consentByPhone.get(thread.contactPhoneE164) ?? 'UNKNOWN',
      }),
    );
  }

  /** Client records at this clinic that have each number, by number. */
  private async candidatesFor(
    organizationId: string,
    phones: string[],
  ): Promise<Map<string, ClientCandidate[]>> {
    const byPhone = new Map<string, ClientCandidate[]>();
    if (phones.length === 0) return byPhone;
    const clients = await prisma.client.findMany({
      where: {
        organizationId,
        OR: [{ phoneE164: { in: phones } }, { alternatePhoneE164: { in: phones } }],
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        phoneE164: true,
        alternatePhoneE164: true,
      },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    });
    for (const { phoneE164, alternatePhoneE164, ...candidate } of clients) {
      for (const phone of new Set([phoneE164, alternatePhoneE164])) {
        if (!phone || !phones.includes(phone)) continue;
        byPhone.set(phone, [...(byPhone.get(phone) ?? []), candidate]);
      }
    }
    return byPhone;
  }

  private async requireThread(user: AuthenticatedUser, id: string): Promise<ThreadRow> {
    const thread = await prisma.clientCommunicationThread.findFirst({
      where: { id, organizationId: user.organizationId, locationId: user.locationId },
      include: threadInclude,
    });
    if (!thread) throw new NotFoundException('Client conversation not found.');
    return thread;
  }

  private async requireThreadAccess(user: AuthenticatedUser, id: string): Promise<void> {
    const thread = await prisma.clientCommunicationThread.findFirst({
      where: { id, organizationId: user.organizationId, locationId: user.locationId },
      select: { id: true },
    });
    if (!thread) throw new NotFoundException('Client conversation not found.');
  }

  /**
   * A retry of a message already saved returns that message. The same key
   * with different text is a different message wrongly sharing a key:
   * answering with the earlier message would show staff text they did not
   * write as sent, so it is refused instead.
   */
  private replayOf(
    saved: Prisma.ClientCommunicationMessageGetPayload<{ include: typeof messageInclude }>,
    body: string,
  ) {
    if (saved.body !== body) {
      throw new ConflictException({
        code: 'IDEMPOTENCY_KEY_REUSED',
        message:
          'This send key was already used for a different message. Create a new key for each message.',
      });
    }
    return presentMessage(saved);
  }

  private findByIdempotencyKey(user: AuthenticatedUser, threadId: string, idempotencyKey: string) {
    return prisma.clientCommunicationMessage.findFirst({
      where: { organizationId: user.organizationId, threadId, idempotencyKey },
      include: messageInclude,
    });
  }

  /** Validates the optional patient/appointment a message is about. */
  private async resolveContext(
    user: AuthenticatedUser,
    thread: ThreadRow,
    input: Pick<SendMessageInput, 'patientId' | 'appointmentId'>,
  ): Promise<{ patientId: string | null; appointmentId: string | null }> {
    let patientId = input.patientId ?? null;
    if (input.appointmentId) {
      const appointment = await prisma.appointment.findFirst({
        where: {
          id: input.appointmentId,
          organizationId: user.organizationId,
          locationId: user.locationId,
        },
        select: { clientId: true, patientId: true },
      });
      if (!appointment || (appointment.clientId && appointment.clientId !== thread.clientId)) {
        throw new BadRequestException({
          code: 'APPOINTMENT_NOT_FOR_CLIENT',
          message: "That appointment does not belong to this conversation's client.",
        });
      }
      patientId ??= appointment.patientId;
    }
    if (patientId) {
      // The patient must be one of this conversation's client's patients —
      // a message must never tie one family's animal to another's number.
      const linked = thread.clientId
        ? await prisma.patientClient.findFirst({
            where: {
              patientId,
              clientId: thread.clientId,
              patient: { organizationId: user.organizationId },
            },
            select: { patientId: true },
          })
        : null;
      if (!linked) {
        throw new BadRequestException({
          code: 'PATIENT_NOT_FOR_CLIENT',
          message: "That patient is not linked to this conversation's client.",
        });
      }
    }
    return { patientId, appointmentId: input.appointmentId ?? null };
  }
}
