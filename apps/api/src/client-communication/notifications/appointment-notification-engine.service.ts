import { Injectable, Logger } from '@nestjs/common';
import {
  prismaUnscoped as db,
  type Appointment,
  type AppointmentNotification,
  type AppointmentNotificationKind,
  type AppointmentNotificationRule,
  type AppointmentNotificationSettings,
  type Prisma,
} from '@sparki/db';
import { normalizeUsPhone } from '../../common/phone';
import {
  allowsAutomatedTexts,
  ClientTextingConsentService,
} from '../client-texting-consent.service';
import {
  ClientTextingReadinessService,
  isTextingVisible,
  type TextingReadiness,
} from '../client-texting-readiness.service';
import { countSmsSegments } from '../sms-text';
import {
  automatedTextsAllowed,
  NOTIFICATION_KINDS,
  SKIP_REASONS,
  UPCOMING_STATES,
  type SkipReason,
} from './notification-constants';
import {
  formatAppointmentDate,
  formatAppointmentTime,
  placeholdersIn,
  renderTemplate,
} from './notification-templates';
import { nextTimeInWindow } from './send-window';

type Tx = Prisma.TransactionClient;
type SettingsWithRules = AppointmentNotificationSettings & { rules: AppointmentNotificationRule[] };
type NotificationWithRule = AppointmentNotification & { rule: AppointmentNotificationRule | null };

/** A message prepared earlier, checked again before it may be sent. */
interface PreparedMessage {
  toE164: string | null;
  clientId: string | null;
}

/**
 * The single answer to "may this automated text go out right now?", used both
 * when the message is created and immediately before every attempt to send
 * it (including retries), so nothing prepared earlier can go out stale.
 */
type Verdict =
  | { kind: 'skip'; reason: SkipReason }
  | { kind: 'wait'; until: Date }
  | {
      kind: 'send';
      appointment: Appointment & {
        client: { id: string; firstName: string; phone: string | null };
        patient: { id: string; name: string } | null;
      };
      rule: AppointmentNotificationRule;
      phone: string;
      readiness: Extract<TextingReadiness, { mode: 'LIVE' | 'SIMULATED' }>;
      timeZone: string;
      organization: { name: string; phone: string | null };
    };

const BATCH_SIZE = 50;
const RESYNC_PAGE_SIZE = 200;
const MINUTE_MS = 60_000;
/**
 * A booking, move, or cancellation older than this is not announced. After
 * an outage, a day-old "your appointment is booked" helps nobody; reminders
 * are unaffected because they are planned from the appointment's own time.
 */
const CHANGE_MAX_AGE_MS = 24 * 60 * MINUTE_MS;

function snapshotStart(snapshot: Prisma.JsonValue): Date | null {
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) return null;
  const value = snapshot.scheduledAt;
  if (typeof value !== 'string') return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Plans and creates automated appointment texts.
 *
 * It is driven by AppointmentChange, the log the appointments module writes
 * in the same transaction as every booking, move, and cancellation. That
 * makes the trigger durable without touching booking code: a saved booking
 * always has its change row, and a failure here can never undo a booking.
 *
 * Three stages, each safe to repeat:
 * 1. Plan — turn new changes into AppointmentNotification rows, keep each
 *    upcoming appointment's reminders matched to the clinic's rules, and
 *    withdraw any of its messages still waiting to be sent that the change
 *    made stale.
 * 2. Re-plan — after a clinic edits its rules, bring its future
 *    appointments' reminders in line.
 * 3. Dispatch — when a notification is due, check it against the
 *    appointment and the clinic as they are *now* (see evaluate), then
 *    either create the message in the client's conversation or record why
 *    it was not sent.
 *
 * The same check runs again in the dispatcher immediately before each send
 * attempt (recheckBeforeSend), because a message can wait — for a retry, or
 * through an outage — after it was created.
 *
 * One timer serves every clinic, so this uses the unscoped client and names
 * the organization in its writes. Work on one appointment is serialized
 * with a transaction-scoped advisory lock, so two API processes can never
 * plan or create the same notification twice.
 */
@Injectable()
export class AppointmentNotificationEngine {
  private readonly logger = new Logger(AppointmentNotificationEngine.name);

  constructor(
    private readonly readiness: ClientTextingReadinessService,
    private readonly consent: ClientTextingConsentService,
  ) {}

  /** One full pass. Returns the ids of messages created, for the dispatcher to send. */
  async runOnce(now: Date = new Date()): Promise<string[]> {
    await this.planPendingChanges(now);
    await this.resyncRequestedLocations(now);
    return this.dispatchDue(now);
  }

  async planPendingChanges(now: Date, appointmentId?: string): Promise<void> {
    const changes = await db.appointmentChange.findMany({
      where: { clientNotificationsPlannedAt: null, ...(appointmentId ? { appointmentId } : {}) },
      orderBy: { createdAt: 'asc' },
      take: BATCH_SIZE,
      select: { id: true, appointmentId: true },
    });
    for (const change of changes) {
      try {
        await this.planChange(change.id, change.appointmentId, now);
      } catch (error) {
        // Left unplanned; the next pass tries again.
        this.logger.error(
          `Could not plan notifications for change ${change.id}: ${describe(error)}`,
        );
      }
    }
  }

  async dispatchDue(now: Date, appointmentId?: string): Promise<string[]> {
    const due = await db.appointmentNotification.findMany({
      where: {
        status: 'SCHEDULED',
        dueAt: { lte: now },
        ...(appointmentId ? { appointmentId } : {}),
      },
      orderBy: { dueAt: 'asc' },
      take: BATCH_SIZE,
      select: { id: true, appointmentId: true },
    });
    const messageIds: string[] = [];
    for (const notification of due) {
      try {
        const messageId = await this.dispatchOne(notification.id, notification.appointmentId, now);
        if (messageId) messageIds.push(messageId);
      } catch (error) {
        this.logger.error(`Could not dispatch notification ${notification.id}: ${describe(error)}`);
      }
    }
    return messageIds;
  }

  /**
   * Called by the dispatcher for an automated message it has claimed, right
   * before contacting the provider. On a skip, the notification records why;
   * withdrawing the message itself is the dispatcher's job, since it holds
   * the claim.
   */
  async recheckBeforeSend(
    messageId: string,
    message: PreparedMessage,
    now: Date,
  ): Promise<
    { kind: 'send' } | { kind: 'skip'; reason: SkipReason } | { kind: 'wait'; until: Date }
  > {
    const notification = await db.appointmentNotification.findUnique({
      where: { messageId },
      include: { rule: true },
    });
    // Its notification is gone only when the appointment was deleted.
    if (!notification) return { kind: 'skip', reason: 'APPOINTMENT_CHANGED' };
    const verdict = await this.evaluate(db, notification, now, message);
    if (verdict.kind === 'skip') {
      await db.appointmentNotification.updateMany({
        where: { id: notification.id, status: 'DISPATCHED' },
        data: { status: 'SKIPPED', skipReason: verdict.reason },
      });
    }
    return verdict.kind === 'send' ? { kind: 'send' } : verdict;
  }

  private planChange(changeId: string, appointmentId: string, now: Date): Promise<void> {
    return db.$transaction(async (tx) => {
      await lockAppointment(tx, appointmentId);
      const change = await tx.appointmentChange.findUnique({ where: { id: changeId } });
      if (!change || change.clientNotificationsPlannedAt) return;

      const fresh = change.createdAt.getTime() >= now.getTime() - CHANGE_MAX_AGE_MS;
      const appointment = fresh
        ? await tx.appointment.findUnique({ where: { id: appointmentId } })
        : null;
      const settings = appointment ? await this.settingsFor(tx, appointment.locationId) : null;

      if (appointment && settings) {
        const context = { appointment, settings, changeId, now };
        if (change.action === 'Created') {
          await this.createNotice(tx, 'CONFIRMATION', {
            ...context,
            plannedForStart: snapshotStart(change.after) ?? appointment.scheduledAt,
          });
        } else if (change.action === 'Rescheduled') {
          const previousStart = snapshotStart(change.before);
          const plannedForStart = snapshotStart(change.after);
          // A changed provider, room, or note is not something to text a
          // client about; only a changed time is.
          if (
            previousStart &&
            plannedForStart &&
            previousStart.getTime() !== plannedForStart.getTime()
          ) {
            await this.cancelScheduled(tx, appointmentId, ['CONFIRMATION', 'RESCHEDULED']);
            await this.createNotice(tx, 'RESCHEDULED', {
              ...context,
              plannedForStart,
              previousStart,
            });
          }
        } else if (change.action === 'Cancelled') {
          await this.cancelScheduled(tx, appointmentId, NOTIFICATION_KINDS);
          await this.createNotice(tx, 'CANCELLED', {
            ...context,
            plannedForStart: appointment.scheduledAt,
          });
        }
        await this.syncReminders(tx, appointment, settings, now);
      }
      if (appointment) await this.withdrawStaleQueued(tx, appointmentId, now);

      await tx.appointmentChange.update({
        where: { id: changeId },
        data: { clientNotificationsPlannedAt: now },
      });
    });
  }

  private async createNotice(
    tx: Tx,
    kind: AppointmentNotificationKind,
    context: {
      appointment: Appointment;
      settings: SettingsWithRules;
      changeId: string;
      now: Date;
      plannedForStart: Date;
      previousStart?: Date;
    },
  ): Promise<void> {
    const { appointment, settings, changeId, now, plannedForStart } = context;
    const rule = settings.rules.find((candidate) => candidate.kind === kind && candidate.enabled);
    if (!rule || !this.typeAllowed(settings, appointment)) return;
    // Nothing useful to say about an appointment whose time has passed.
    if (plannedForStart.getTime() <= now.getTime()) return;
    if (await tx.appointmentNotification.findUnique({ where: { sourceChangeId: changeId } }))
      return;

    await tx.appointmentNotification.create({
      data: {
        organizationId: appointment.organizationId,
        locationId: appointment.locationId,
        appointmentId: appointment.id,
        ruleId: rule.id,
        kind,
        dueAt: now,
        plannedForStart,
        previousStart: context.previousStart ?? null,
        sourceChangeId: changeId,
      },
    });
  }

  /**
   * Makes an appointment's reminders match the clinic's current rules:
   * cancels scheduled reminders that no longer apply and adds missing ones.
   * A reminder that was already sent or skipped is never recreated.
   */
  private async syncReminders(
    tx: Tx,
    appointment: Appointment,
    settings: SettingsWithRules,
    now: Date,
  ): Promise<void> {
    const start = appointment.scheduledAt;
    const eligible =
      UPCOMING_STATES.includes(appointment.state) &&
      start.getTime() > now.getTime() &&
      this.typeAllowed(settings, appointment);
    const wanted = eligible
      ? settings.rules.flatMap((rule) =>
          rule.kind === 'REMINDER' && rule.enabled && rule.offsetMinutes
            ? [{ rule, dueAt: new Date(start.getTime() - rule.offsetMinutes * MINUTE_MS) }]
            : [],
        )
      : [];

    const existing = await tx.appointmentNotification.findMany({
      where: { appointmentId: appointment.id, kind: 'REMINDER' },
    });
    const isFor = (notification: (typeof existing)[number], want: (typeof wanted)[number]) =>
      notification.ruleId === want.rule.id &&
      notification.plannedForStart.getTime() === start.getTime() &&
      notification.dueAt.getTime() === want.dueAt.getTime();

    const stale = existing.filter(
      (notification) =>
        notification.status === 'SCHEDULED' && !wanted.some((want) => isFor(notification, want)),
    );
    if (stale.length > 0) {
      await tx.appointmentNotification.updateMany({
        where: { id: { in: stale.map(({ id }) => id) }, status: 'SCHEDULED' },
        data: { status: 'CANCELLED' },
      });
    }

    for (const want of wanted) {
      if (
        existing.some(
          (notification) => notification.status !== 'CANCELLED' && isFor(notification, want),
        )
      ) {
        continue;
      }
      const passed = want.dueAt.getTime() <= now.getTime();
      await tx.appointmentNotification.create({
        data: {
          organizationId: appointment.organizationId,
          locationId: appointment.locationId,
          appointmentId: appointment.id,
          ruleId: want.rule.id,
          kind: 'REMINDER',
          dueAt: want.dueAt,
          plannedForStart: start,
          // Booked (or the rule turned on) inside the reminder's lead time:
          // a "reminder" sent now would arrive right behind the booking.
          ...(passed
            ? {
                status: 'SKIPPED' as const,
                skipReason: 'REMINDER_TIME_PASSED' satisfies SkipReason,
              }
            : {}),
        },
      });
    }
  }

  /**
   * Withdraws this appointment's automated messages that are still waiting
   * to be sent (a provider retry, or a pass not yet run) and would no longer
   * pass the check. The dispatcher would refuse them anyway; doing it here
   * as well means the appointment's status is right immediately, not only
   * at the next send attempt.
   */
  private async withdrawStaleQueued(tx: Tx, appointmentId: string, now: Date): Promise<void> {
    const waiting = await tx.appointmentNotification.findMany({
      where: { appointmentId, status: 'DISPATCHED', message: { status: 'QUEUED' } },
      include: { rule: true, message: { select: { id: true, toE164: true, clientId: true } } },
    });
    for (const notification of waiting) {
      if (!notification.message) continue;
      const verdict = await this.evaluate(tx, notification, now, notification.message);
      if (verdict.kind !== 'skip') continue;
      const withdrawn = await tx.clientCommunicationMessage.updateMany({
        where: { id: notification.message.id, status: 'QUEUED' },
        data: {
          status: 'CANCELLED',
          failureCode: verdict.reason,
          failureDetail: SKIP_REASONS[verdict.reason],
          nextAttemptAt: null,
        },
      });
      if (withdrawn.count === 1) {
        await tx.appointmentNotification.update({
          where: { id: notification.id },
          data: { status: 'SKIPPED', skipReason: verdict.reason },
        });
      }
    }
  }

  private async resyncRequestedLocations(now: Date): Promise<void> {
    const requests = await db.appointmentNotificationSettings.findMany({
      where: { reminderResyncRequestedAt: { not: null } },
      include: { rules: true },
      take: 5,
    });
    for (const settings of requests) {
      try {
        let cursor: string | undefined;
        for (;;) {
          const page = await db.appointment.findMany({
            where: {
              organizationId: settings.organizationId,
              locationId: settings.locationId,
              scheduledAt: { gt: now },
              state: { in: UPCOMING_STATES },
            },
            orderBy: { id: 'asc' },
            take: RESYNC_PAGE_SIZE,
            ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
          });
          for (const appointment of page) {
            await db.$transaction(async (tx) => {
              await lockAppointment(tx, appointment.id);
              const current = await tx.appointment.findUnique({ where: { id: appointment.id } });
              if (!current) return;
              await this.syncReminders(tx, current, settings, now);
              await this.withdrawStaleQueued(tx, current.id, now);
            });
          }
          if (page.length < RESYNC_PAGE_SIZE) break;
          cursor = page[page.length - 1]!.id;
        }
        // Cleared only if the rules were not edited again while this ran.
        await db.appointmentNotificationSettings.updateMany({
          where: { id: settings.id, reminderResyncRequestedAt: settings.reminderResyncRequestedAt },
          data: { reminderResyncRequestedAt: null },
        });
      } catch (error) {
        this.logger.error(
          `Could not re-plan reminders for location ${settings.locationId}: ${describe(error)}`,
        );
      }
    }
  }

  /**
   * Creates the message for one due notification, or records why not.
   * Returns the id of the message created, or null when nothing was created
   * (skipped, not yet inside sending hours, or already handled).
   */
  private dispatchOne(id: string, appointmentId: string, now: Date): Promise<string | null> {
    return db.$transaction(async (tx) => {
      await lockAppointment(tx, appointmentId);
      const notification = await tx.appointmentNotification.findUnique({
        where: { id },
        include: { rule: true },
      });
      if (!notification || notification.status !== 'SCHEDULED' || notification.dueAt > now)
        return null;

      const verdict = await this.evaluate(tx, notification, now);
      if (verdict.kind === 'wait') return null;
      if (verdict.kind === 'skip') {
        await tx.appointmentNotification.update({
          where: { id },
          data: { status: 'SKIPPED', skipReason: verdict.reason },
        });
        return null;
      }

      const { appointment, rule, phone, readiness, timeZone, organization } = verdict;
      const body = renderTemplate(rule.template, {
        clinic_name: organization.name,
        clinic_phone: organization.phone ?? '',
        client_first_name: appointment.client.firstName,
        patient_name: appointment.patient?.name ?? appointment.provisionalPatientName ?? 'your pet',
        appointment_date: formatAppointmentDate(notification.plannedForStart, timeZone),
        appointment_time: formatAppointmentTime(notification.plannedForStart, timeZone),
        ...(notification.previousStart
          ? {
              previous_date: formatAppointmentDate(notification.previousStart, timeZone),
              previous_time: formatAppointmentTime(notification.previousStart, timeZone),
            }
          : {}),
      });

      // An automated notice does not ask anything of the clinic: a
      // conversation it starts is created closed, and one it joins keeps its
      // status and unread state. A reply from the client reopens it.
      const thread = await tx.clientCommunicationThread.upsert({
        where: {
          locationId_contactPhoneE164: {
            locationId: appointment.locationId,
            contactPhoneE164: phone,
          },
        },
        create: {
          organizationId: appointment.organizationId,
          locationId: appointment.locationId,
          contactPhoneE164: phone,
          clientId: appointment.client.id,
          status: 'CLOSED',
        },
        update: {},
      });
      const message = await tx.clientCommunicationMessage.create({
        data: {
          organizationId: appointment.organizationId,
          locationId: appointment.locationId,
          threadId: thread.id,
          direction: 'OUTBOUND',
          source: 'AUTOMATED',
          status: 'QUEUED',
          body,
          clientId: appointment.client.id,
          patientId: appointment.patient?.id ?? null,
          appointmentId: appointment.id,
          idempotencyKey: `appointment-notification:${id}`,
          provider: readiness.mode === 'LIVE' ? readiness.channel.provider : 'SIMULATED',
          fromE164: readiness.mode === 'LIVE' ? readiness.channel.senderPhoneE164 : null,
          toE164: phone,
          segments: countSmsSegments(body),
        },
      });
      await tx.clientCommunicationThread.update({
        where: { id: thread.id },
        data: { lastMessageId: message.id, lastMessageAt: message.createdAt },
      });
      await tx.appointmentNotification.update({
        where: { id },
        data: { status: 'DISPATCHED', messageId: message.id },
      });
      return message.id;
    });
  }

  /**
   * May this notification's text go out at `now`? Checks, in order: the rule
   * is still on; the appointment still starts when the text says, is still
   * in the right state, and has not passed; the clinic still sends for its
   * type; it is inside sending hours (otherwise wait, or skip if they open
   * after the appointment); texting is available; the client has a textable
   * number and staff-recorded agreement, and has not opted out. With
   * `prepared`, also that the message still goes to that client and number.
   */
  private async evaluate(
    tx: Tx,
    notification: NotificationWithRule,
    now: Date,
    prepared?: PreparedMessage,
  ): Promise<Verdict> {
    const skip = (reason: SkipReason): Verdict => ({ kind: 'skip', reason });
    const appointment = await tx.appointment.findUnique({
      where: { id: notification.appointmentId },
      include: {
        client: { select: { id: true, firstName: true, phone: true } },
        patient: { select: { id: true, name: true } },
        location: {
          select: { timeZone: true, organization: { select: { name: true, phone: true } } },
        },
      },
    });
    const rule = notification.rule;
    const settings = appointment ? await this.settingsFor(tx, appointment.locationId) : null;
    if (!rule?.enabled || !settings) return skip('RULE_DISABLED');

    const stillAsPlanned =
      appointment &&
      appointment.scheduledAt.getTime() === notification.plannedForStart.getTime() &&
      (notification.kind === 'CANCELLED'
        ? appointment.state === 'Cancelled'
        : UPCOMING_STATES.includes(appointment.state));
    if (!appointment || !stillAsPlanned) return skip('APPOINTMENT_CHANGED');
    if (notification.plannedForStart.getTime() <= now.getTime()) return skip('APPOINTMENT_PASSED');
    if (!this.typeAllowed(settings, appointment)) return skip('APPOINTMENT_TYPE_EXCLUDED');

    const { timeZone, organization } = appointment.location;
    let sendAt: Date;
    try {
      sendAt = nextTimeInWindow(
        now,
        timeZone,
        settings.sendWindowStartMinute,
        settings.sendWindowEndMinute,
      );
    } catch {
      return skip('CLINIC_TIME_ZONE_INVALID');
    }
    if (sendAt.getTime() > now.getTime()) {
      // Outside sending hours. Wait for them — unless they open after the
      // appointment, when the text would be pointless.
      return sendAt.getTime() >= notification.plannedForStart.getTime()
        ? skip('OUTSIDE_SEND_HOURS')
        : { kind: 'wait', until: sendAt };
    }

    const readiness = await this.readiness.forLocation(
      appointment.organizationId,
      appointment.locationId,
      tx,
    );
    if (!isTextingVisible(readiness)) return skip('TEXTING_NOT_AVAILABLE');
    const { client } = appointment;
    if (!client) return skip('NO_CLIENT');
    const phone = normalizeUsPhone(client.phone);
    if (!phone) return skip('NO_TEXTABLE_NUMBER');
    if (prepared && (prepared.clientId !== client.id || prepared.toE164 !== phone)) {
      return skip('RECIPIENT_CHANGED');
    }

    const consent = await this.consent.find(appointment.organizationId, phone, tx);
    if (consent?.status === 'OPTED_OUT') return skip('OPTED_OUT');
    if (!allowsAutomatedTexts(consent)) return skip('NO_RECORDED_AGREEMENT');
    if (placeholdersIn(rule.template).includes('clinic_phone') && !organization.phone) {
      return skip('TEMPLATE_INCOMPLETE');
    }

    return {
      kind: 'send',
      appointment: { ...appointment, client },
      rule,
      phone,
      readiness: readiness as Extract<TextingReadiness, { mode: 'LIVE' | 'SIMULATED' }>,
      timeZone,
      organization,
    };
  }

  private async cancelScheduled(
    tx: Tx,
    appointmentId: string,
    kinds: AppointmentNotificationKind[],
  ) {
    await tx.appointmentNotification.updateMany({
      where: { appointmentId, status: 'SCHEDULED', kind: { in: kinds } },
      data: { status: 'CANCELLED' },
    });
  }

  private settingsFor(tx: Tx, locationId: string): Promise<SettingsWithRules | null> {
    return tx.appointmentNotificationSettings.findUnique({
      where: { locationId },
      include: { rules: true },
    });
  }

  private typeAllowed(
    settings: AppointmentNotificationSettings,
    appointment: Appointment,
  ): boolean {
    return automatedTextsAllowed(
      settings.appointmentTypeChoices,
      appointment.appointmentTypeSettingId,
      appointment.type,
    );
  }
}

/** Serializes work on one appointment for the rest of the transaction. */
async function lockAppointment(tx: Tx, appointmentId: string): Promise<void> {
  // $executeRaw, not $queryRaw: the function returns void, which Prisma
  // cannot read back as a row.
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`appointment-notification:${appointmentId}`}::text))`;
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
