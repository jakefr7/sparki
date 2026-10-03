import { Injectable, NotFoundException } from '@nestjs/common';
import { prisma } from '@sparki/db';
import type { AuthenticatedUser } from '../../auth/types';
import { formatUsPhone, normalizeUsPhone } from '../../common/phone';
import { messageInclude, presentMessage } from '../client-communication.presenter';
import {
  allowsAutomatedTexts,
  ClientTextingConsentService,
} from '../client-texting-consent.service';
import {
  ClientTextingReadinessService,
  isTextingVisible,
} from '../client-texting-readiness.service';
import { automatedTextsAllowed, skipReasonView, type SkipReason } from './notification-constants';
import { nextTimeInWindow } from './send-window';

/**
 * What Sparki has told, will tell, or decided not to tell a client about one
 * appointment. This is what lets a booking screen say something true about
 * the confirmation instead of "messages are managed separately".
 *
 * Read-only by design: it never plans, creates, or sends anything — the
 * dispatcher's background pass owns that. Straight after a booking, before
 * that pass has run (normally within seconds), `planning.upToDate` is false
 * and the list may not yet show the confirmation; the caller polls rather
 * than this request doing the work.
 */
@Injectable()
export class AppointmentNotificationStatusService {
  constructor(
    private readonly readiness: ClientTextingReadinessService,
    private readonly consent: ClientTextingConsentService,
  ) {}

  async forAppointment(user: AuthenticatedUser, appointmentId: string) {
    const scope = { organizationId: user.organizationId, locationId: user.locationId };
    const appointment = await prisma.appointment.findFirst({
      where: { id: appointmentId, ...scope },
      include: {
        client: { select: { id: true, phone: true } },
        location: { select: { timeZone: true } },
      },
    });
    if (!appointment) throw new NotFoundException('Appointment not found.');

    const now = new Date();
    const phone = normalizeUsPhone(appointment.client?.phone);
    const [notifications, settings, readiness, unplanned, consent, thread] = await Promise.all([
      prisma.appointmentNotification.findMany({
        where: { organizationId: user.organizationId, appointmentId },
        include: {
          rule: { select: { offsetMinutes: true } },
          message: { include: messageInclude },
        },
        orderBy: [{ dueAt: 'asc' }, { createdAt: 'asc' }],
      }),
      prisma.appointmentNotificationSettings.findFirst({
        where: scope,
        include: { rules: { where: { enabled: true }, select: { id: true } } },
      }),
      this.readiness.forLocation(user.organizationId, user.locationId),
      // A booking, move, or cancellation the background pass has not
      // processed yet: the list below does not reflect it until it has.
      prisma.appointmentChange.findFirst({
        where: { ...scope, appointmentId, clientNotificationsPlannedAt: null },
        orderBy: { createdAt: 'asc' },
        select: { createdAt: true },
      }),
      phone ? this.consent.find(user.organizationId, phone) : null,
      phone
        ? prisma.clientCommunicationThread.findFirst({
            where: { ...scope, contactPhoneE164: phone },
            select: { id: true },
          })
        : null,
    ]);

    // The same order the engine checks in, so this says today what a
    // notification would be skipped for when it comes due.
    const blocked: SkipReason | null = !isTextingVisible(readiness)
      ? 'TEXTING_NOT_AVAILABLE'
      : !appointment.client
        ? 'NO_CLIENT'
        : !phone
          ? 'NO_TEXTABLE_NUMBER'
          : consent?.status === 'OPTED_OUT'
            ? 'OPTED_OUT'
            : !allowsAutomatedTexts(consent)
              ? 'NO_RECORDED_AGREEMENT'
              : null;

    return {
      appointmentId,
      planning: {
        // False until the background pass has processed every change to this
        // appointment (normally within seconds). Poll while false.
        upToDate: unplanned === null,
        pendingSince: unplanned?.createdAt.toISOString() ?? null,
      },
      automatedTexts: {
        // Whether the clinic has any automated message turned on at all.
        anyEnabled: (settings?.rules.length ?? 0) > 0,
        allowedForAppointmentType: automatedTextsAllowed(
          settings?.appointmentTypeChoices ?? {},
          appointment.appointmentTypeSettingId,
          appointment.type,
        ),
      },
      recipient: {
        clientId: appointment.client?.id ?? null,
        phoneDisplay: phone ? formatUsPhone(phone) : null,
        // The conversation to record the client's agreement in, when one exists.
        threadId: thread?.id ?? null,
        canReceiveAutomatedTexts: blocked === null,
        reason: skipReasonView(blocked),
      },
      notifications: notifications.map((notification) => ({
        id: notification.id,
        kind: notification.kind,
        status: notification.status,
        offsetMinutes: notification.rule?.offsetMinutes ?? null,
        dueAt: notification.dueAt.toISOString(),
        // When it will actually go, allowing for the clinic's sending hours.
        expectedSendAt:
          notification.status === 'SCHEDULED' && settings
            ? this.expectedSendAt(notification.dueAt, now, appointment.location.timeZone, settings)
            : null,
        plannedForStart: notification.plannedForStart.toISOString(),
        skipped: notification.status === 'SKIPPED' ? skipReasonView(notification.skipReason) : null,
        // Delivery truth lives on the message: DISPATCHED here only means a
        // message was created.
        message: notification.message ? presentMessage(notification.message) : null,
        createdAt: notification.createdAt.toISOString(),
        updatedAt: notification.updatedAt.toISOString(),
      })),
    };
  }

  private expectedSendAt(
    dueAt: Date,
    now: Date,
    timeZone: string,
    settings: { sendWindowStartMinute: number; sendWindowEndMinute: number },
  ): string | null {
    try {
      const earliest = dueAt.getTime() > now.getTime() ? dueAt : now;
      return nextTimeInWindow(
        earliest,
        timeZone,
        settings.sendWindowStartMinute,
        settings.sendWindowEndMinute,
      ).toISOString();
    } catch {
      return null;
    }
  }
}
