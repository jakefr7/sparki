import { ConflictException, Injectable } from '@nestjs/common';
import {
  prisma,
  type ClientTextingConsent,
  type ClientTextingConsentBasis,
  type ClientTextingConsentStatus,
  type Prisma,
} from '@sparki/db';

type Db = Prisma.TransactionClient | typeof prisma;
type Tx = Prisma.TransactionClient;

export interface ConsentView {
  /** UNKNOWN: nothing recorded — the clinic may not start texting this number. */
  status: 'UNKNOWN' | ClientTextingConsentStatus;
  basis: ClientTextingConsentBasis | null;
  method: string | null;
  note: string | null;
  recordedAt: string | null;
  recordedById: string | null;
  /**
   * False when the client opted out themselves (STOP, or the carrier's
   * block): only the client texting START can undo that. Staff can still
   * record an opt-out at any time.
   */
  staffMayGrant: boolean;
  /**
   * Whether automated appointment texts may go to this number. Narrower than
   * being allowed to reply: it needs agreement a staff member recorded.
   */
  automatedTextsAllowed: boolean;
}

interface ConsentChange {
  organizationId: string;
  phoneE164: string;
  status: ClientTextingConsentStatus;
  basis: ClientTextingConsentBasis;
  method?: string | null;
  note?: string | null;
  clientId?: string | null;
  actorUserId?: string | null;
  messageId?: string | null;
}

type KeywordChange = Pick<ConsentChange, 'organizationId' | 'phoneE164' | 'clientId' | 'messageId'>;

/** The client took this decision themselves; staff cannot reverse it. */
export function isClientOwnedOptOut(consent: ClientTextingConsent | null): boolean {
  return (
    consent?.status === 'OPTED_OUT' &&
    (consent.basis === 'KEYWORD' || consent.basis === 'PROVIDER_BLOCK')
  );
}

/**
 * Founder decision 2026-10-02: automated appointment texts need agreement a
 * staff member recorded. A client who texted the clinic first may get staff
 * replies, not automated texts. A client who texted START after STOP has
 * their replies back; whether START should also restore automated texts is
 * an open product question, so until it is answered it does not — staff
 * record the agreement again.
 */
export function allowsAutomatedTexts(consent: ClientTextingConsent | null): boolean {
  return consent?.status === 'GRANTED' && consent.basis === 'STAFF_RECORDED';
}

/**
 * Texting permission for a phone number at a clinic organization (founder
 * decision 2026-10-02: recorded consent). The clinic may start texting a
 * number only when a staff member has recorded the client's agreement or
 * the client texted the clinic first. An opt-out always wins.
 *
 * Kept per organization + number rather than per conversation: a client who
 * texts STOP to one location has opted out of the clinic, not of a thread.
 *
 * Every change runs inside a transaction holding a lock on that one number,
 * and decides from the record as it is under that lock. Without it, a staff
 * member recording agreement at the moment the client texts STOP could
 * overwrite the client's opt-out.
 */
@Injectable()
export class ClientTextingConsentService {
  find(
    organizationId: string,
    phoneE164: string,
    db: Db = prisma,
  ): Promise<ClientTextingConsent | null> {
    return db.clientTextingConsent.findUnique({
      where: { organizationId_phoneE164: { organizationId, phoneE164 } },
    });
  }

  findMany(
    organizationId: string,
    phones: string[],
    db: Db = prisma,
  ): Promise<ClientTextingConsent[]> {
    if (phones.length === 0) return Promise.resolve([]);
    return db.clientTextingConsent.findMany({
      where: { organizationId, phoneE164: { in: phones } },
    });
  }

  view(consent: ClientTextingConsent | null): ConsentView {
    return {
      status: consent?.status ?? 'UNKNOWN',
      basis: consent?.basis ?? null,
      method: consent?.method ?? null,
      note: consent?.note ?? null,
      recordedAt: consent?.updatedAt.toISOString() ?? null,
      recordedById: consent?.recordedById ?? null,
      staffMayGrant: !isClientOwnedOptOut(consent),
      automatedTextsAllowed: allowsAutomatedTexts(consent),
    };
  }

  /**
   * A staff member records what the client told them. Recording an opt-out
   * over an existing opt-out keeps the existing one — in particular a
   * client's own STOP, which only the client can lift — and is kept in the
   * history.
   */
  async recordByStaff(
    tx: Tx,
    change: Omit<ConsentChange, 'basis' | 'messageId'> & { actorUserId: string },
  ): Promise<ClientTextingConsent> {
    const existing = await this.lockAndFind(tx, change.organizationId, change.phoneE164);
    const staffChange = { ...change, basis: 'STAFF_RECORDED' as const };
    if (change.status === 'GRANTED' && isClientOwnedOptOut(existing)) {
      throw new ConflictException({
        code: 'CLIENT_MUST_OPT_IN',
        message:
          'This client opted out by texting STOP. They need to text START to the clinic before texts can resume.',
      });
    }
    if (change.status === 'OPTED_OUT' && existing?.status === 'OPTED_OUT') {
      await this.recordEvent(tx, staffChange);
      return existing;
    }
    return this.write(tx, staffChange);
  }

  /**
   * The client texted the clinic first. Only fills an empty record: it never
   * overrides an opt-out, and never downgrades a staff-recorded agreement.
   */
  async recordClientInitiated(tx: Tx, change: KeywordChange): Promise<void> {
    if (await this.lockAndFind(tx, change.organizationId, change.phoneE164)) return;
    await this.write(tx, { ...change, status: 'GRANTED', basis: 'CLIENT_INITIATED' });
  }

  /** The client texted STOP or START (or an equivalent keyword). Always the client's call. */
  async recordKeyword(
    tx: Tx,
    change: KeywordChange & { keyword: 'OPT_OUT' | 'OPT_IN' },
  ): Promise<void> {
    const { keyword, ...rest } = change;
    await this.lockAndFind(tx, change.organizationId, change.phoneE164);
    await this.write(tx, {
      ...rest,
      status: keyword === 'OPT_OUT' ? 'OPTED_OUT' : 'GRANTED',
      basis: 'KEYWORD',
    });
  }

  /**
   * The provider refused a send because the number is on its opt-out list:
   * the carrier holds the client's own STOP. That is client-owned even if
   * staff had already recorded an opt-out, so it replaces a staff opt-out
   * (which staff could otherwise lift) but never a STOP already recorded.
   */
  async recordProviderBlock(tx: Tx, change: KeywordChange): Promise<void> {
    const existing = await this.lockAndFind(tx, change.organizationId, change.phoneE164);
    if (isClientOwnedOptOut(existing)) return;
    await this.write(tx, { ...change, status: 'OPTED_OUT', basis: 'PROVIDER_BLOCK' });
  }

  private async lockAndFind(
    tx: Tx,
    organizationId: string,
    phoneE164: string,
  ): Promise<ClientTextingConsent | null> {
    // $executeRaw: pg_advisory_xact_lock returns void, which Prisma cannot
    // read back as a row. Held until the surrounding transaction ends.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`client-texting-consent:${organizationId}:${phoneE164}`}::text))`;
    return this.find(organizationId, phoneE164, tx);
  }

  private async write(tx: Tx, change: ConsentChange): Promise<ClientTextingConsent> {
    const fields = {
      status: change.status,
      basis: change.basis,
      method: change.method ?? null,
      note: change.note ?? null,
      clientId: change.clientId ?? null,
      recordedById: change.actorUserId ?? null,
    };
    const consent = await tx.clientTextingConsent.upsert({
      where: {
        organizationId_phoneE164: {
          organizationId: change.organizationId,
          phoneE164: change.phoneE164,
        },
      },
      create: { organizationId: change.organizationId, phoneE164: change.phoneE164, ...fields },
      update: fields,
    });
    await this.recordEvent(tx, change);
    if (change.status === 'OPTED_OUT') {
      await this.withdrawQueued(tx, change.organizationId, change.phoneE164);
    }
    return consent;
  }

  private async recordEvent(tx: Tx, change: ConsentChange): Promise<void> {
    await tx.clientTextingConsentEvent.create({
      data: {
        organizationId: change.organizationId,
        phoneE164: change.phoneE164,
        status: change.status,
        basis: change.basis,
        method: change.method ?? null,
        note: change.note ?? null,
        clientId: change.clientId ?? null,
        actorUserId: change.actorUserId ?? null,
        messageId: change.messageId ?? null,
      },
    });
  }

  /**
   * An opt-out takes effect on everything still waiting to go to that
   * number, staff and automated alike — not only on what is sent later. A
   * message already in flight to the provider cannot be recalled; the
   * dispatcher re-checks consent immediately before every send, so that
   * window is the provider request itself.
   */
  private async withdrawQueued(tx: Tx, organizationId: string, phoneE164: string): Promise<void> {
    const queued = await tx.clientCommunicationMessage.findMany({
      where: { organizationId, toE164: phoneE164, direction: 'OUTBOUND', status: 'QUEUED' },
      select: { id: true },
    });
    if (queued.length === 0) return;
    const ids = queued.map(({ id }) => id);
    await tx.clientCommunicationMessage.updateMany({
      where: { id: { in: ids }, status: 'QUEUED' },
      data: {
        status: 'CANCELLED',
        failureCode: 'OPTED_OUT',
        failureDetail: 'The client opted out before this message was sent.',
        nextAttemptAt: null,
      },
    });
    await tx.appointmentNotification.updateMany({
      where: { messageId: { in: ids }, status: 'DISPATCHED' },
      data: { status: 'SKIPPED', skipReason: 'OPTED_OUT' },
    });
  }
}
