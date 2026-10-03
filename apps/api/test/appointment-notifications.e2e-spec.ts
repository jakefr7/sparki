import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
// Unscoped on purpose — see the note at the top of
// client-communication.e2e-spec.ts: in this shared-process harness the
// scoped client silently rewrites another clinic's fixtures.
import { resetEnvCacheForTests } from '@sparki/config';
import { prismaUnscoped as prisma } from '@sparki/db';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../src/app.module';
import {
  DEV_LOCATION_ID,
  DEV_ORGANIZATION_ID,
  DEV_USER_ID,
} from '../src/auth/development-user.service';
import { ClientCommunicationDispatcher } from '../src/client-communication/client-communication-dispatcher.service';
import { localMinuteOfDay } from '../src/client-communication/notifications/send-window';
import { normalizeUsPhone } from '../src/common/phone';

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;
const ZONE = 'America/Chicago';
const ALL_DAY = { startMinute: 0, endMinute: 1440 };

/**
 * Automated appointment texts end to end, in simulation: real bookings,
 * moves, and cancellations through the appointments API, the planner reading
 * the appointment change log, and the dispatcher run at chosen moments.
 * Nothing leaves the process — the development clinic has a SIMULATED
 * channel.
 */
describe('Appointment notifications (e2e)', () => {
  let app: INestApplication;
  let dispatcher: ClientCommunicationDispatcher;
  let wellnessTypeId: string;
  let euthanasiaTypeId: string;
  let otherOrganizationId: string;
  let otherOrgLocationId: string;
  let originalClinicPhone: string | null;
  let dayCounter = 30;
  let phoneCounter = 300;
  const typeIds: string[] = [];
  const blockIds: string[] = [];
  const clientIds: string[] = [];
  const patientIds: string[] = [];

  const http = () => request(app.getHttpServer());

  /** A moment `days` from today at a given clinic-local time, whatever daylight saving is doing. */
  function clinicTime(days: number, hour: number, minute = 0): Date {
    const today = new Date();
    const guess = new Date(
      Date.UTC(
        today.getUTCFullYear(),
        today.getUTCMonth(),
        today.getUTCDate() + days,
        hour + 6,
        minute,
      ),
    );
    return new Date(
      guess.getTime() + (hour * 60 + minute - localMinuteOfDay(guess, ZONE)) * MINUTE,
    );
  }

  /** Each scenario books on its own day so appointments never compete for a slot. */
  function nextDay(hour = 10, minute = 0): Date {
    dayCounter += 1;
    return clinicTime(dayCounter, hour, minute);
  }

  async function makePatient(
    options: {
      consent?: 'RECORDED' | 'CLIENT_INITIATED' | 'OPTED_OUT' | 'NONE';
      phone?: string | null;
    } = {},
  ) {
    phoneCounter += 1;
    const display = options.phone === undefined ? `(312) 555-0${phoneCounter}` : options.phone;
    const e164 = normalizeUsPhone(display);
    const client = await prisma.client.create({
      data: {
        organizationId: DEV_ORGANIZATION_ID,
        firstName: 'Jordan',
        lastName: `Notify ${phoneCounter}`,
        phone: display,
        phoneE164: e164,
      },
    });
    clientIds.push(client.id);
    const patient = await prisma.patient.create({
      data: {
        organizationId: DEV_ORGANIZATION_ID,
        name: 'Finley',
        species: 'Canine',
        clients: { create: [{ clientId: client.id, isPrimary: true }] },
      },
    });
    patientIds.push(patient.id);
    const consent = options.consent ?? 'RECORDED';
    if (e164 && consent !== 'NONE') {
      await prisma.clientTextingConsent.create({
        data: {
          organizationId: DEV_ORGANIZATION_ID,
          phoneE164: e164,
          status: consent === 'OPTED_OUT' ? 'OPTED_OUT' : 'GRANTED',
          basis:
            consent === 'RECORDED'
              ? 'STAFF_RECORDED'
              : consent === 'OPTED_OUT'
                ? 'KEYWORD'
                : 'CLIENT_INITIATED',
          clientId: client.id,
        },
      });
    }
    return { client, patient, phone: e164 };
  }

  async function book(patientId: string, startTime: Date, typeId = wellnessTypeId) {
    const response = await http()
      .post('/appointments')
      .send({
        patientId,
        appointmentType: typeId === euthanasiaTypeId ? 'Euthanasia' : 'WellnessPreventiveCare',
        appointmentTypeId: typeId,
        visitReason: 'Notifications test',
        startTime: startTime.toISOString(),
      });
    expect(response.status).toBe(201);
    return response.body as { id: string };
  }

  async function configure(options: {
    confirmation?: boolean;
    reminders?: number[];
    rescheduled?: boolean;
    cancelled?: boolean;
    sendWindow?: { startMinute: number; endMinute: number };
    appointmentTypes?: Array<{ id: string; automatedMessages: boolean }>;
  }) {
    const response = await http()
      .put('/client-communication/notification-settings')
      .send({
        sendWindow: options.sendWindow ?? ALL_DAY,
        rules: [
          {
            kind: 'CONFIRMATION',
            enabled: options.confirmation ?? false,
            template:
              '{clinic_name}: {patient_name} is booked for {appointment_date} at {appointment_time}.',
          },
          ...(options.reminders ?? []).map((offsetMinutes) => ({
            kind: 'REMINDER',
            enabled: true,
            offsetMinutes,
            template:
              '{clinic_name}: {patient_name} has an appointment on {appointment_date} at {appointment_time}.',
          })),
          {
            kind: 'RESCHEDULED',
            enabled: options.rescheduled ?? false,
            template:
              '{clinic_name}: {patient_name} moved from {previous_time} to {appointment_date} at {appointment_time}.',
          },
          {
            kind: 'CANCELLED',
            enabled: options.cancelled ?? false,
            template:
              '{clinic_name}: the {appointment_date} appointment for {patient_name} is cancelled.',
          },
        ],
        // Unless a test says otherwise, the test wellness type gets automated texts.
        appointmentTypes: options.appointmentTypes ?? [
          { id: wellnessTypeId, automatedMessages: true },
        ],
      });
    expect(response.status).toBe(200);
    // Re-plans reminders for appointments that already exist.
    await dispatcher.runOnce();
    return response.body;
  }

  /** What staff would see after the background pass has run (every few seconds in production). */
  async function notificationsFor(appointmentId: string) {
    await dispatcher.runOnce();
    return readStatus(appointmentId);
  }

  /** The status endpoint alone: it must never plan, create, or send anything. */
  async function readStatus(appointmentId: string) {
    const response = await http().get(
      `/client-communication/appointments/${appointmentId}/notifications`,
    );
    expect(response.status).toBe(200);
    return response.body as {
      planning: { upToDate: boolean; pendingSince: string | null };
      automatedTexts: { anyEnabled: boolean; allowedForAppointmentType: boolean };
      recipient: {
        canReceiveAutomatedTexts: boolean;
        reason: { code: string } | null;
        threadId: string | null;
      };
      notifications: Array<{
        id: string;
        kind: string;
        status: string;
        dueAt: string;
        expectedSendAt: string | null;
        skipped: { code: string; message: string } | null;
        message: {
          id: string;
          threadId: string;
          status: string;
          source: string;
          body: string;
          simulated: boolean;
          appointmentId: string;
        } | null;
      }>;
    };
  }

  type Fixture = Awaited<ReturnType<typeof makePatient>> & {
    appointment: { id: string };
    start: Date;
    due: Date;
    message: { id: string; threadId: string };
  };

  const networkAttempts: string[] = [];
  function blockNetwork() {
    vi.restoreAllMocks();
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      networkAttempts.push(String(input));
      throw new Error(`Network disabled in tests: ${String(input)}`);
    });
  }

  beforeEach(() => {
    blockNetwork();
  });

  const ofKind = (result: Awaited<ReturnType<typeof notificationsFor>>, kind: string) =>
    result.notifications.filter((notification) => notification.kind === kind);

  beforeAll(async () => {
    // Lets one block below use a real (stubbed) Telnyx number; the network is
    // always stubbed there, and every other block runs in simulation.
    process.env.TELNYX_API_KEY = 'KEY_isolated_test_placeholder';
    process.env.TELNYX_PUBLIC_KEY = 'placeholder-public-key-never-used-here';
    resetEnvCacheForTests();
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    dispatcher = app.get(ClientCommunicationDispatcher);

    // Creates the development identity, including its simulated texting channel.
    await http().get('/client-communication/readiness');
    await prisma.clientMessagingChannel.deleteMany({ where: { locationId: DEV_LOCATION_ID } });
    await prisma.clientMessagingChannel.create({
      data: {
        organizationId: DEV_ORGANIZATION_ID,
        locationId: DEV_LOCATION_ID,
        provider: 'SIMULATED',
        status: 'ACTIVE',
      },
    });
    await prisma.appointmentNotificationSettings.deleteMany({
      where: { locationId: DEV_LOCATION_ID },
    });
    originalClinicPhone = (
      await prisma.organization.findUniqueOrThrow({ where: { id: DEV_ORGANIZATION_ID } })
    ).phone;

    for (const [appointmentType, name] of [
      ['WellnessPreventiveCare', 'Notifications E2E Wellness'],
      ['Euthanasia', 'Notifications E2E Euthanasia'],
    ] as const) {
      const type = await prisma.appointmentTypeSetting.create({
        data: {
          organizationId: DEV_ORGANIZATION_ID,
          locationId: DEV_LOCATION_ID,
          appointmentType,
          name,
          defaultDurationMinutes: 30,
          color: '#2563EB',
          providers: { create: { providerId: DEV_USER_ID, organizationId: DEV_ORGANIZATION_ID } },
        },
      });
      typeIds.push(type.id);
    }
    [wellnessTypeId, euthanasiaTypeId] = typeIds as [string, string];
    for (let dayOfWeek = 0; dayOfWeek < 7; dayOfWeek += 1) {
      const block = await prisma.schedulerSlotTemplate.create({
        data: {
          organizationId: DEV_ORGANIZATION_ID,
          locationId: DEV_LOCATION_ID,
          dayOfWeek,
          startTime: '00:00',
          endTime: '23:59',
          label: 'Notifications E2E availability',
          color: '#0F766E',
          staffId: DEV_USER_ID,
          isGeneralAvailability: false,
          appointmentTypes: { create: typeIds.map((appointmentTypeId) => ({ appointmentTypeId })) },
        },
      });
      blockIds.push(block.id);
    }

    const other = await prisma.organization.create({
      data: {
        name: 'Notifications E2E Org (other)',
        locations: { create: { name: 'Other Clinic' } },
      },
      include: { locations: true },
    });
    otherOrganizationId = other.id;
    otherOrgLocationId = other.locations[0]!.id;
  });

  afterAll(async () => {
    const organizations = { in: [DEV_ORGANIZATION_ID, otherOrganizationId] };
    await prisma.appointment.deleteMany({
      where: { OR: [{ patientId: { in: patientIds } }, { organizationId: otherOrganizationId }] },
    });
    await prisma.appointmentNotificationSettings.deleteMany({
      where: { organizationId: organizations },
    });
    await prisma.clientCommunicationThread.deleteMany({ where: { organizationId: organizations } });
    await prisma.clientTextingConsentEvent.deleteMany({ where: { organizationId: organizations } });
    await prisma.clientTextingConsent.deleteMany({ where: { organizationId: organizations } });
    await prisma.schedulerSlotTemplate.deleteMany({ where: { id: { in: blockIds } } });
    await prisma.appointmentTypeProvider.deleteMany({
      where: { appointmentTypeId: { in: typeIds } },
    });
    await prisma.appointmentTypeSetting.deleteMany({ where: { id: { in: typeIds } } });
    await prisma.patientClient.deleteMany({ where: { patientId: { in: patientIds } } });
    await prisma.patient.deleteMany({ where: { id: { in: patientIds } } });
    await prisma.client.deleteMany({ where: { id: { in: clientIds } } });
    await prisma.location.deleteMany({ where: { id: otherOrgLocationId } });
    await prisma.organization.deleteMany({ where: { id: otherOrganizationId } });
    await prisma.organization.update({
      where: { id: DEV_ORGANIZATION_ID },
      data: { phone: originalClinicPhone },
    });
    await app.close();
    delete process.env.TELNYX_API_KEY;
    delete process.env.TELNYX_PUBLIC_KEY;
    resetEnvCacheForTests();
  });

  describe('clinic settings', () => {
    it('starts with suggested wording and everything switched off', async () => {
      const response = await http().get('/client-communication/notification-settings');

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        saved: false,
        timeZone: ZONE,
        sendWindow: { startMinute: 480, endMinute: 1200 },
        texting: { mode: 'SIMULATED', visible: true },
      });
      expect(response.body.rules.map((rule: { kind: string }) => rule.kind)).toEqual([
        'CONFIRMATION',
        'REMINDER',
        'RESCHEDULED',
        'CANCELLED',
      ]);
      expect(
        response.body.rules.every(
          (rule: { enabled: boolean; id: string | null }) => !rule.enabled && rule.id === null,
        ),
      ).toBe(true);
      const types = Object.fromEntries(
        response.body.appointmentTypes.map((type: { id: string; automatedMessages: boolean }) => [
          type.id,
          type.automatedMessages,
        ]),
      );
      // Euthanasia appointments never get automated texts unless the clinic chooses to.
      expect(types[wellnessTypeId]).toBe(true);
      expect(types[euthanasiaTypeId]).toBe(false);
    });

    it('explains wording it cannot save, and requires a clinic phone for wording that uses it', async () => {
      const body = (template: string, enabled = true) => ({
        sendWindow: ALL_DAY,
        rules: [{ kind: 'CONFIRMATION', enabled, template }],
      });

      const unknown = await http()
        .put('/client-communication/notification-settings')
        .send(body('Booked: {appointment_type}'));
      expect(unknown.status).toBe(400);
      expect(unknown.body).toMatchObject({
        code: 'TEMPLATE_INVALID',
        rules: [
          {
            index: 0,
            kind: 'CONFIRMATION',
            problems: ['{appointment_type} is not available for this message.'],
          },
        ],
      });

      await prisma.organization.update({
        where: { id: DEV_ORGANIZATION_ID },
        data: { phone: null },
      });
      const noPhone = await http()
        .put('/client-communication/notification-settings')
        .send(body('Call {clinic_phone}'));
      expect(noPhone.status).toBe(422);
      expect(noPhone.body.code).toBe('CLINIC_PHONE_MISSING');
      await prisma.organization.update({
        where: { id: DEV_ORGANIZATION_ID },
        data: { phone: '(312) 555-0100' },
      });

      const badWindow = await http()
        .put('/client-communication/notification-settings')
        .send({ sendWindow: { startMinute: 900, endMinute: 600 }, rules: [] });
      expect(badWindow.status).toBe(400);
      const twoConfirmations = await http()
        .put('/client-communication/notification-settings')
        .send({ sendWindow: ALL_DAY, rules: [body('a').rules[0], body('b').rules[0]] });
      expect(twoConfirmations.status).toBe(400);
      const reminderWithoutTime = await http()
        .put('/client-communication/notification-settings')
        .send({
          sendWindow: ALL_DAY,
          rules: [{ kind: 'REMINDER', enabled: true, template: 'Reminder' }],
        });
      expect(reminderWithoutTime.status).toBe(400);
    });

    it("saves a clinic's own rules, remembers who changed them, and removes a rule left out", async () => {
      const saved = await http()
        .put('/client-communication/notification-settings')
        .send({
          sendWindow: { startMinute: 540, endMinute: 1080 },
          rules: [
            {
              kind: 'REMINDER',
              enabled: true,
              offsetMinutes: 2880,
              template: 'Two days: {patient_name}',
            },
            {
              kind: 'REMINDER',
              enabled: false,
              offsetMinutes: 120,
              template: 'Two hours: {patient_name}',
            },
          ],
        });

      expect(saved.status).toBe(200);
      expect(saved.body).toMatchObject({
        saved: true,
        updatedBy: { id: DEV_USER_ID },
        sendWindow: { startMinute: 540, endMinute: 1080 },
      });
      const reminders = saved.body.rules.filter(
        (rule: { kind: string }) => rule.kind === 'REMINDER',
      );
      expect(reminders.map((rule: { offsetMinutes: number }) => rule.offsetMinutes)).toEqual([
        2880, 120,
      ]);
      expect(reminders.every((rule: { id: string | null }) => typeof rule.id === 'string')).toBe(
        true,
      );

      const trimmed = await http()
        .put('/client-communication/notification-settings')
        .send({ sendWindow: ALL_DAY, rules: [{ ...reminders[0], enabled: false }] });
      const remaining = trimmed.body.rules.filter(
        (rule: { kind: string }) => rule.kind === 'REMINDER',
      );
      expect(remaining).toMatchObject([
        { id: reminders[0].id, offsetMinutes: 2880, enabled: false },
      ]);
      expect(
        await prisma.appointmentNotificationRule.count({ where: { locationId: DEV_LOCATION_ID } }),
      ).toBe(1);

      const stale = await http()
        .put('/client-communication/notification-settings')
        .send({ sendWindow: ALL_DAY, rules: [{ ...reminders[1], enabled: true }] });
      expect(stale.status).toBe(400);
      expect(stale.body.code).toBe('RULE_NOT_FOUND');
    });

    it('previews what a client would receive, with the required clinic name and opt-out line', async () => {
      const response = await http()
        .post('/client-communication/notification-settings/preview')
        .send({ kind: 'REMINDER', template: 'See you {appointment_date}, {client_first_name}!' });

      expect(response.status).toBe(200);
      expect(response.body.problems).toEqual([]);
      expect(response.body.text).toMatch(
        /^Sparki Development Clinic: See you \w{3}, \w{3} \d{1,2}, Jordan! Reply STOP to opt out\.$/,
      );
      expect(response.body.segments).toBe(1);
    });

    it("does not show another clinic's settings or appointments", async () => {
      await prisma.appointmentNotificationSettings.create({
        data: {
          organizationId: otherOrganizationId,
          locationId: otherOrgLocationId,
          rules: {
            create: {
              organizationId: otherOrganizationId,
              locationId: otherOrgLocationId,
              kind: 'CONFIRMATION',
              enabled: true,
              template: 'Theirs',
            },
          },
        },
      });
      const theirs = await prisma.appointment.create({
        data: {
          organizationId: otherOrganizationId,
          locationId: otherOrgLocationId,
          type: 'WellnessPreventiveCare',
          reason: 'private',
          source: 'Phone',
          state: 'Scheduled',
          scheduledAt: nextDay(),
        },
      });

      await configure({});
      const mine = await http().get('/client-communication/notification-settings');
      expect(JSON.stringify(mine.body)).not.toContain('Theirs');
      expect(
        (await http().get(`/client-communication/appointments/${theirs.id}/notifications`)).status,
      ).toBe(404);
    });
  });

  describe('booking', () => {
    it('sends nothing while the clinic has every message switched off', async () => {
      await configure({});
      const { patient } = await makePatient();

      const appointment = await book(patient.id, nextDay());
      const result = await notificationsFor(appointment.id);

      expect(result.automatedTexts).toEqual({ anyEnabled: false, allowedForAppointmentType: true });
      expect(result.notifications).toEqual([]);
      expect(
        await prisma.clientCommunicationMessage.count({ where: { appointmentId: appointment.id } }),
      ).toBe(0);
    });

    it("texts a confirmation to a client with recorded agreement, in the clinic's time zone", async () => {
      await configure({ confirmation: true });
      const { patient, client } = await makePatient();
      const start = nextDay(14, 30);

      const appointment = await book(patient.id, start);
      // Straight after booking, before the background pass: honest about not
      // having processed the booking yet, rather than doing the work itself.
      const pending = await readStatus(appointment.id);
      expect(pending.planning).toEqual({ upToDate: false, pendingSince: expect.any(String) });
      expect(pending.notifications).toEqual([]);
      expect(pending.recipient).toMatchObject({ canReceiveAutomatedTexts: true });

      const result = await notificationsFor(appointment.id);
      expect(result.planning).toEqual({ upToDate: true, pendingSince: null });

      expect(result.recipient).toMatchObject({ canReceiveAutomatedTexts: true, reason: null });
      expect(result.notifications).toHaveLength(1);
      const [confirmation] = result.notifications;
      expect(confirmation).toMatchObject({
        kind: 'CONFIRMATION',
        status: 'DISPATCHED',
        skipped: null,
        // "Dispatched" is not "delivered": the message carries the truth, and here it is simulated.
        message: {
          source: 'AUTOMATED',
          status: 'SIMULATED',
          simulated: true,
          appointmentId: appointment.id,
        },
      });
      const day = new Intl.DateTimeFormat('en-US', {
        timeZone: ZONE,
        weekday: 'short',
        month: 'short',
        day: 'numeric',
      }).format(start);
      expect(confirmation!.message!.body).toBe(
        `Sparki Development Clinic: Finley is booked for ${day} at 2:30 PM. Reply STOP to opt out.`,
      );

      // It lives in the client's conversation, which it does not mark as needing attention.
      const thread = await http().get(
        `/client-communication/threads/${confirmation!.message!.threadId}`,
      );
      expect(thread.body).toMatchObject({
        client: { id: client.id },
        status: 'CLOSED',
        unread: false,
      });
      expect(result.recipient.threadId).toBe(thread.body.id);

      // Asking again, and further dispatcher passes, never send it twice.
      await notificationsFor(appointment.id);
      await dispatcher.runOnce();
      expect(
        await prisma.clientCommunicationMessage.count({ where: { appointmentId: appointment.id } }),
      ).toBe(1);
    });

    it.each([
      ['no agreement was recorded', 'NONE', 'NO_RECORDED_AGREEMENT'],
      ['the client only texted the clinic first', 'CLIENT_INITIATED', 'NO_RECORDED_AGREEMENT'],
      ['the client opted out', 'OPTED_OUT', 'OPTED_OUT'],
    ] as const)('does not text when %s, and says why', async (_label, consent, code) => {
      await configure({ confirmation: true });
      const { patient } = await makePatient({ consent });

      const appointment = await book(patient.id, nextDay());
      const result = await notificationsFor(appointment.id);

      expect(result.recipient).toMatchObject({ canReceiveAutomatedTexts: false, reason: { code } });
      expect(result.notifications).toMatchObject([
        { kind: 'CONFIRMATION', status: 'SKIPPED', skipped: { code }, message: null },
      ]);
      expect(result.notifications[0]!.skipped!.message).toEqual(expect.any(String));
      expect(
        await prisma.clientCommunicationMessage.count({ where: { appointmentId: appointment.id } }),
      ).toBe(0);
    });

    it('does not text a client whose number cannot receive texts', async () => {
      await configure({ confirmation: true });
      const { patient } = await makePatient({ phone: '555-0199' });

      const appointment = await book(patient.id, nextDay());

      expect((await notificationsFor(appointment.id)).notifications).toMatchObject([
        { status: 'SKIPPED', skipped: { code: 'NO_TEXTABLE_NUMBER' } },
      ]);
    });

    it('never sends automated texts for a euthanasia appointment unless the clinic turns that on', async () => {
      await configure({ confirmation: true, reminders: [1440] });
      const { patient } = await makePatient();

      const appointment = await book(patient.id, nextDay(), euthanasiaTypeId);
      const result = await notificationsFor(appointment.id);
      expect(result.automatedTexts.allowedForAppointmentType).toBe(false);
      expect(result.notifications).toEqual([]);

      await configure({
        confirmation: true,
        reminders: [1440],
        appointmentTypes: [{ id: euthanasiaTypeId, automatedMessages: true }],
      });
      const after = await notificationsFor(appointment.id);
      expect(after.automatedTexts.allowedForAppointmentType).toBe(true);
      // The reminder is planned now; the booking confirmation is not sent after the fact.
      expect(after.notifications).toMatchObject([{ kind: 'REMINDER', status: 'SCHEDULED' }]);
    });
  });

  describe('reminders', () => {
    it('sends a reminder at its time, once, and not before', async () => {
      await configure({ reminders: [1440] });
      const { patient } = await makePatient();
      const start = nextDay();
      const appointment = await book(patient.id, start);
      const due = new Date(start.getTime() - DAY);

      const planned = await notificationsFor(appointment.id);
      expect(planned.notifications).toMatchObject([
        {
          kind: 'REMINDER',
          status: 'SCHEDULED',
          dueAt: due.toISOString(),
          expectedSendAt: due.toISOString(),
        },
      ]);

      await dispatcher.runOnce(new Date(due.getTime() - MINUTE));
      expect((await notificationsFor(appointment.id)).notifications[0]!.status).toBe('SCHEDULED');

      await dispatcher.runOnce(new Date(due.getTime() + MINUTE));
      await dispatcher.runOnce(new Date(due.getTime() + 2 * MINUTE));
      const sent = await notificationsFor(appointment.id);
      expect(sent.notifications).toMatchObject([
        {
          kind: 'REMINDER',
          status: 'DISPATCHED',
          message: { source: 'AUTOMATED', status: 'SIMULATED' },
        },
      ]);
      expect(
        await prisma.clientCommunicationMessage.count({ where: { appointmentId: appointment.id } }),
      ).toBe(1);
    });

    it('skips a reminder whose time had already passed when the appointment was booked', async () => {
      await configure({ reminders: [1440] });
      const { patient } = await makePatient();

      // A few hours from now, on the hour, clear of the day's last half hour
      // (the test availability block ends at 23:59).
      let soon = new Date(Math.ceil((Date.now() + 2 * 60 * MINUTE) / (60 * MINUTE)) * 60 * MINUTE);
      if (localMinuteOfDay(soon, ZONE) >= 23 * 60) soon = new Date(soon.getTime() + 60 * MINUTE);
      const appointment = await book(patient.id, soon);

      expect((await notificationsFor(appointment.id)).notifications).toMatchObject([
        { kind: 'REMINDER', status: 'SKIPPED', skipped: { code: 'REMINDER_TIME_PASSED' } },
      ]);
    });

    it('follows a rescheduled appointment: old reminder cancelled, new one planned, client told once', async () => {
      await configure({ reminders: [1440], rescheduled: true });
      const { patient } = await makePatient();
      const original = nextDay(9);
      const moved = nextDay(15, 30);
      const appointment = await book(patient.id, original);
      await notificationsFor(appointment.id);

      const move = await http()
        .patch(`/appointments/${appointment.id}/move`)
        .send({ startTime: moved.toISOString() });
      expect(move.status).toBe(200);
      const result = await notificationsFor(appointment.id);

      const reminders = ofKind(result, 'REMINDER');
      expect(reminders.map((reminder) => [reminder.status, reminder.dueAt]).sort()).toEqual(
        [
          ['CANCELLED', new Date(original.getTime() - DAY).toISOString()],
          ['SCHEDULED', new Date(moved.getTime() - DAY).toISOString()],
        ].sort(),
      );
      const [notice] = ofKind(result, 'RESCHEDULED');
      expect(notice).toMatchObject({ status: 'DISPATCHED', message: { status: 'SIMULATED' } });
      expect(notice!.message!.body).toContain('moved from 9:00 AM to');
      expect(notice!.message!.body).toContain('at 3:30 PM');

      // At the old reminder time, nothing goes out with the old details.
      await dispatcher.runOnce(new Date(original.getTime() - DAY + MINUTE));
      expect(
        await prisma.clientCommunicationMessage.count({ where: { appointmentId: appointment.id } }),
      ).toBe(1);
    });

    it('stops everything when the appointment is cancelled, and tells the client if the clinic chose to', async () => {
      await configure({ reminders: [1440], cancelled: true });
      const { patient } = await makePatient();
      const start = nextDay();
      const appointment = await book(patient.id, start);
      await notificationsFor(appointment.id);

      const cancel = await http()
        .post(`/appointments/${appointment.id}/cancel`)
        .send({ reason: 'Client requested cancellation' });
      expect(cancel.status).toBe(201);
      const result = await notificationsFor(appointment.id);

      expect(ofKind(result, 'REMINDER')).toMatchObject([{ status: 'CANCELLED' }]);
      expect(ofKind(result, 'CANCELLED')).toMatchObject([
        { status: 'DISPATCHED', message: { status: 'SIMULATED' } },
      ]);

      await dispatcher.runOnce(new Date(start.getTime() - DAY + MINUTE));
      expect(
        await prisma.clientCommunicationMessage.count({ where: { appointmentId: appointment.id } }),
      ).toBe(1);
    });

    it('re-checks the appointment when the reminder is due, and will not send stale details', async () => {
      await configure({ reminders: [1440] });
      const { patient } = await makePatient();
      const start = nextDay();
      const appointment = await book(patient.id, start);
      await notificationsFor(appointment.id);

      // The appointment changes by a path the planner never heard about.
      await prisma.appointment.update({
        where: { id: appointment.id },
        data: { scheduledAt: new Date(start.getTime() + 60 * MINUTE) },
      });
      await dispatcher.runOnce(new Date(start.getTime() - DAY + MINUTE));

      expect((await notificationsFor(appointment.id)).notifications).toMatchObject([
        { kind: 'REMINDER', status: 'SKIPPED', skipped: { code: 'APPOINTMENT_CHANGED' } },
      ]);
      expect(
        await prisma.clientCommunicationMessage.count({ where: { appointmentId: appointment.id } }),
      ).toBe(0);
    });

    it('applies a rule the clinic adds or turns off to appointments already booked', async () => {
      await configure({ reminders: [1440] });
      const { patient } = await makePatient();
      const start = nextDay();
      const appointment = await book(patient.id, start);
      expect(ofKind(await notificationsFor(appointment.id), 'REMINDER')).toHaveLength(1);

      await configure({ reminders: [2880] });
      const changed = ofKind(await notificationsFor(appointment.id), 'REMINDER');
      expect(changed.map((reminder) => [reminder.status, reminder.dueAt]).sort()).toEqual(
        [
          ['CANCELLED', new Date(start.getTime() - DAY).toISOString()],
          ['SCHEDULED', new Date(start.getTime() - 2 * DAY).toISOString()],
        ].sort(),
      );

      await configure({});
      const off = ofKind(await notificationsFor(appointment.id), 'REMINDER');
      expect(off.every((reminder) => reminder.status === 'CANCELLED')).toBe(true);
    });

    it("holds a reminder for the clinic's sending hours, and skips it if they open after the appointment", async () => {
      await configure({
        reminders: [1440, 60],
        sendWindow: { startMinute: 9 * 60, endMinute: 17 * 60 },
      });
      const { patient } = await makePatient();
      dayCounter += 1;
      const start = clinicTime(dayCounter, 6);
      const appointment = await book(patient.id, start);
      const dayBefore = new Date(start.getTime() - DAY);
      const nineTheDayBefore = clinicTime(dayCounter - 1, 9);

      const planned = ofKind(await notificationsFor(appointment.id), 'REMINDER');
      const early = planned.find((reminder) => reminder.dueAt === dayBefore.toISOString());
      // Due at 6 AM the day before; it will actually go at 9 AM.
      expect(early).toMatchObject({
        status: 'SCHEDULED',
        expectedSendAt: nineTheDayBefore.toISOString(),
      });

      await dispatcher.runOnce(new Date(dayBefore.getTime() + MINUTE));
      expect(
        await prisma.clientCommunicationMessage.count({ where: { appointmentId: appointment.id } }),
      ).toBe(0);
      await dispatcher.runOnce(new Date(nineTheDayBefore.getTime() + MINUTE));
      expect(
        await prisma.clientCommunicationMessage.count({ where: { appointmentId: appointment.id } }),
      ).toBe(1);

      // The one-hour reminder is due at 5 AM; sending hours open after the 6 AM appointment.
      await dispatcher.runOnce(new Date(start.getTime() - 60 * MINUTE + MINUTE));
      const after = ofKind(await notificationsFor(appointment.id), 'REMINDER');
      expect(
        after.map((reminder) => [reminder.status, reminder.skipped?.code ?? null]).sort(),
      ).toEqual(
        [
          ['DISPATCHED', null],
          ['SKIPPED', 'OUTSIDE_SEND_HOURS'],
        ].sort(),
      );
      expect(
        await prisma.clientCommunicationMessage.count({ where: { appointmentId: appointment.id } }),
      ).toBe(1);
    });

    it('does not send while texting is not available for the clinic', async () => {
      await configure({ reminders: [1440] });
      const { patient } = await makePatient();
      const start = nextDay();
      const appointment = await book(patient.id, start);
      await notificationsFor(appointment.id);

      await prisma.clientMessagingChannel.deleteMany({ where: { locationId: DEV_LOCATION_ID } });
      try {
        await dispatcher.runOnce(new Date(start.getTime() - DAY + MINUTE));
        const result = await notificationsFor(appointment.id);
        expect(result.recipient).toMatchObject({
          canReceiveAutomatedTexts: false,
          reason: { code: 'TEXTING_NOT_AVAILABLE' },
        });
        expect(result.notifications).toMatchObject([
          { status: 'SKIPPED', skipped: { code: 'TEXTING_NOT_AVAILABLE' } },
        ]);
      } finally {
        await prisma.clientMessagingChannel.create({
          data: {
            organizationId: DEV_ORGANIZATION_ID,
            locationId: DEV_LOCATION_ID,
            provider: 'SIMULATED',
            status: 'ACTIVE',
          },
        });
      }
    });
  });

  describe('with a stubbed live number: stale retries and read-only status', () => {
    const LIVE_NUMBER = '+13125550170';

    beforeAll(async () => {
      await prisma.clientMessagingChannel.deleteMany({ where: { locationId: DEV_LOCATION_ID } });
      await prisma.clientMessagingChannel.create({
        data: {
          organizationId: DEV_ORGANIZATION_ID,
          locationId: DEV_LOCATION_ID,
          provider: 'TELNYX',
          senderPhoneE164: LIVE_NUMBER,
          status: 'ACTIVE',
        },
      });
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    afterAll(async () => {
      await prisma.clientMessagingChannel.deleteMany({ where: { locationId: DEV_LOCATION_ID } });
      await prisma.clientMessagingChannel.create({
        data: {
          organizationId: DEV_ORGANIZATION_ID,
          locationId: DEV_LOCATION_ID,
          provider: 'SIMULATED',
          status: 'ACTIVE',
        },
      });
    });

    /** Stands in for Telnyx. Records every send so a test can prove none happened. */
    function stubTelnyx(respond: () => Response) {
      const sends: Array<{ to: string }> = [];
      vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
        if (String(input) !== 'https://api.telnyx.com/v2/messages')
          throw new Error(`Unexpected fetch: ${String(input)}`);
        sends.push(JSON.parse(String(init?.body)));
        return respond();
      });
      return sends;
    }

    /** A reminder whose first send the provider deferred, so it is waiting to be retried. */
    async function deferredReminder() {
      await configure({ reminders: [1440] });
      const fixture = await makePatient();
      const start = nextDay();
      const appointment = await book(fixture.patient.id, start);
      await notificationsFor(appointment.id);
      const due = new Date(start.getTime() - DAY + MINUTE);

      stubTelnyx(
        () =>
          new Response(
            JSON.stringify({ errors: [{ code: '10011', title: 'Too many requests' }] }),
            { status: 429 },
          ),
      );
      await dispatcher.runOnce(due);
      blockNetwork();
      const message = await prisma.clientCommunicationMessage.findFirstOrThrow({
        where: { appointmentId: appointment.id },
      });
      expect(message).toMatchObject({ status: 'QUEUED', source: 'AUTOMATED', attemptCount: 1 });
      return { ...fixture, appointment, start, due, message };
    }

    async function retryAt(at: Date) {
      const sends = stubTelnyx(
        () =>
          new Response(JSON.stringify({ data: { id: `tx-${Math.random()}`, parts: 1 } }), {
            status: 200,
          }),
      );
      await dispatcher.runOnce(at);
      return sends;
    }

    async function excludeWellnessType() {
      const current = await http().get('/client-communication/notification-settings');
      const saved = await http()
        .put('/client-communication/notification-settings')
        .send({
          sendWindow: current.body.sendWindow,
          rules: current.body.rules
            .filter((rule: { id: string | null }) => rule.id)
            .map(({ id, kind, enabled, offsetMinutes, template }: Record<string, unknown>) => ({
              id,
              kind,
              enabled,
              offsetMinutes,
              template,
            })),
          appointmentTypes: [{ id: wellnessTypeId, automatedMessages: false }],
        });
      expect(saved.status).toBe(200);
    }

    it.each([
      [
        'the appointment was cancelled',
        'APPOINTMENT_CHANGED',
        async ({ appointment }: Fixture) => {
          expect(
            (
              await http()
                .post(`/appointments/${appointment.id}/cancel`)
                .send({ reason: 'Client called' })
            ).status,
          ).toBe(201);
        },
      ],
      [
        'the appointment moved',
        'APPOINTMENT_CHANGED',
        async ({ appointment }: Fixture) => {
          expect(
            (
              await http()
                .patch(`/appointments/${appointment.id}/move`)
                .send({ startTime: nextDay(16).toISOString() })
            ).status,
          ).toBe(200);
        },
      ],
      [
        'the appointment changed by a path that wrote no change record',
        'APPOINTMENT_CHANGED',
        async ({ appointment, start }: Fixture) => {
          await prisma.appointment.update({
            where: { id: appointment.id },
            data: { scheduledAt: new Date(start.getTime() + 60 * MINUTE) },
          });
        },
      ],
      [
        'the clinic turned the reminder off',
        'RULE_DISABLED',
        async () => {
          await configure({});
        },
      ],
      [
        'the clinic excluded the appointment type',
        'APPOINTMENT_TYPE_EXCLUDED',
        async () => {
          await excludeWellnessType();
        },
      ],
      [
        "the client's number changed",
        'RECIPIENT_CHANGED',
        async ({ client }: Fixture) => {
          await http().patch(`/clients/${client.id}`).send({ phone: '(312) 555-0177' });
        },
      ],
      [
        'staff recorded an opt-out',
        'OPTED_OUT',
        async ({ message }: Fixture) => {
          const consent = await http()
            .put(`/client-communication/threads/${message.threadId}/consent`)
            .send({ status: 'OPTED_OUT' });
          expect(consent.status).toBe(200);
        },
      ],
    ] as const)('never reaches the provider when %s', async (_label, reason, change) => {
      const fixture = await deferredReminder();
      await change(fixture);

      const sends = await retryAt(new Date(fixture.due.getTime() + 5 * MINUTE));

      expect(sends.filter(({ to }) => to === fixture.phone)).toEqual([]);
      const message = await prisma.clientCommunicationMessage.findUniqueOrThrow({
        where: { id: fixture.message.id },
      });
      expect(message).toMatchObject({
        status: 'CANCELLED',
        failureCode: reason,
        providerMessageId: null,
        sentAt: null,
      });
      const result = await notificationsFor(fixture.appointment.id);
      const reminder = result.notifications.find(
        (notification) => notification.message?.id === fixture.message.id,
      );
      expect(reminder).toMatchObject({
        status: 'SKIPPED',
        skipped: { code: reason },
        message: { status: 'CANCELLED' },
      });
    });

    it('never sends a retry after the appointment time has passed', async () => {
      const fixture = await deferredReminder();

      const sends = await retryAt(new Date(fixture.start.getTime() + MINUTE));

      expect(sends.filter(({ to }) => to === fixture.phone)).toEqual([]);
      expect(
        await prisma.clientCommunicationMessage.findUniqueOrThrow({
          where: { id: fixture.message.id },
        }),
      ).toMatchObject({
        status: 'CANCELLED',
        failureCode: 'APPOINTMENT_PASSED',
      });
    });

    it("holds a retry that comes due outside the clinic's sending hours, then sends it when they open", async () => {
      const fixture = await deferredReminder();
      const retryMinute = localMinuteOfDay(new Date(fixture.due.getTime() + 5 * MINUTE), ZONE);
      // Sending hours that closed just before the retry and reopen two hours later.
      await prisma.appointmentNotificationSettings.update({
        where: { locationId: DEV_LOCATION_ID },
        data: {
          sendWindowStartMinute: (retryMinute + 120) % 1440,
          sendWindowEndMinute: Math.min(((retryMinute + 120) % 1440) + 60, 1440),
        },
      });
      const settings = await prisma.appointmentNotificationSettings.findUniqueOrThrow({
        where: { locationId: DEV_LOCATION_ID },
      });
      // Only meaningful when the window really excludes the retry minute.
      expect(
        retryMinute >= settings.sendWindowStartMinute && retryMinute < settings.sendWindowEndMinute,
      ).toBe(false);

      const held = await retryAt(new Date(fixture.due.getTime() + 5 * MINUTE));
      expect(held.filter(({ to }) => to === fixture.phone)).toEqual([]);
      const waiting = await prisma.clientCommunicationMessage.findUniqueOrThrow({
        where: { id: fixture.message.id },
      });
      expect(waiting.status).toBe('QUEUED');
      expect(waiting.attemptCount).toBe(1);
      expect(waiting.nextAttemptAt!.getTime()).toBeGreaterThan(fixture.due.getTime() + 5 * MINUTE);

      blockNetwork();
      const sent = await retryAt(new Date(waiting.nextAttemptAt!.getTime() + MINUTE));
      expect(sent.filter(({ to }) => to === fixture.phone)).toHaveLength(1);
      expect(
        (
          await prisma.clientCommunicationMessage.findUniqueOrThrow({
            where: { id: fixture.message.id },
          })
        ).status,
      ).toBe('SENT');
    });

    it.each([
      ['suspended', { status: 'SUSPENDED' as const }],
      ['switched to simulation', { provider: 'SIMULATED' as const, senderPhoneE164: null }],
    ])('never sends a queued real text after the clinic number is %s', async (_label, change) => {
      const fixture = await deferredReminder();
      await prisma.clientMessagingChannel.update({
        where: { locationId: DEV_LOCATION_ID },
        data: change,
      });
      try {
        const sends = await retryAt(new Date(fixture.due.getTime() + 5 * MINUTE));

        expect(sends.filter(({ to }) => to === fixture.phone)).toEqual([]);
        expect(
          await prisma.clientCommunicationMessage.findUniqueOrThrow({
            where: { id: fixture.message.id },
          }),
        ).toMatchObject({
          status: 'CANCELLED',
          failureCode: 'TEXTING_NOT_AVAILABLE',
          provider: 'TELNYX',
        });
      } finally {
        await prisma.clientMessagingChannel.update({
          where: { locationId: DEV_LOCATION_ID },
          data: { provider: 'TELNYX', senderPhoneE164: LIVE_NUMBER, status: 'ACTIVE' },
        });
      }
    });

    it("reading an appointment's status never plans, creates, or sends anything", async () => {
      await configure({ confirmation: true, reminders: [1440] });
      const { patient, phone } = await makePatient();
      const sends = stubTelnyx(
        () =>
          new Response(JSON.stringify({ data: { id: `tx-${Math.random()}`, parts: 1 } }), {
            status: 200,
          }),
      );
      networkAttempts.length = 0;
      const appointment = await book(patient.id, nextDay());

      for (let read = 0; read < 3; read += 1) {
        const status = await readStatus(appointment.id);
        expect(status.planning).toEqual({ upToDate: false, pendingSince: expect.any(String) });
        expect(status.notifications).toEqual([]);
      }
      expect(sends).toEqual([]);
      expect(networkAttempts).toEqual([]);
      expect(
        await prisma.appointmentNotification.count({ where: { appointmentId: appointment.id } }),
      ).toBe(0);
      expect(
        await prisma.clientCommunicationMessage.count({ where: { appointmentId: appointment.id } }),
      ).toBe(0);
      expect(
        await prisma.appointmentChange.count({
          where: { appointmentId: appointment.id, clientNotificationsPlannedAt: null },
        }),
      ).toBe(1);

      // The background pass owns delivery.
      await dispatcher.runOnce();
      const delivered = await readStatus(appointment.id);
      expect(delivered.planning.upToDate).toBe(true);
      expect(ofKind(delivered, 'CONFIRMATION')).toMatchObject([
        { status: 'DISPATCHED', message: { status: 'SENT', simulated: false } },
      ]);
      expect(ofKind(delivered, 'REMINDER')).toMatchObject([{ status: 'SCHEDULED' }]);
      expect(sends.filter(({ to }) => to === phone)).toHaveLength(1);

      // Reading again still changes nothing.
      for (let read = 0; read < 3; read += 1) await readStatus(appointment.id);
      expect(sends.filter(({ to }) => to === phone)).toHaveLength(1);
      expect(
        await prisma.clientCommunicationMessage.count({ where: { appointmentId: appointment.id } }),
      ).toBe(1);
      expect(
        await prisma.appointmentNotification.count({ where: { appointmentId: appointment.id } }),
      ).toBe(2);
    });

    it('still sends a deferred reminder when nothing about it changed', async () => {
      const fixture = await deferredReminder();

      const sends = await retryAt(new Date(fixture.due.getTime() + 5 * MINUTE));

      expect(sends.filter(({ to }) => to === fixture.phone)).toHaveLength(1);
      expect(
        await prisma.clientCommunicationMessage.findUniqueOrThrow({
          where: { id: fixture.message.id },
        }),
      ).toMatchObject({
        status: 'SENT',
        attemptCount: 2,
      });
    });
  });

  describe('old history', () => {
    it('never announces a booking that happened long before the planner saw it', async () => {
      await configure({ confirmation: true });
      const { patient, client } = await makePatient();
      const appointment = await prisma.appointment.create({
        data: {
          organizationId: DEV_ORGANIZATION_ID,
          locationId: DEV_LOCATION_ID,
          patientId: patient.id,
          clientId: client.id,
          type: 'WellnessPreventiveCare',
          appointmentTypeSettingId: wellnessTypeId,
          reason: 'Imported',
          source: 'Migration',
          state: 'Scheduled',
          scheduledAt: nextDay(),
        },
      });
      const change = await prisma.appointmentChange.create({
        data: {
          organizationId: DEV_ORGANIZATION_ID,
          locationId: DEV_LOCATION_ID,
          appointmentId: appointment.id,
          action: 'Created',
          before: {},
          after: { scheduledAt: appointment.scheduledAt.toISOString(), state: 'Scheduled' },
          createdAt: new Date(Date.now() - 2 * DAY),
        },
      });

      const result = await notificationsFor(appointment.id);

      expect(result.notifications).toEqual([]);
      expect(
        (await prisma.appointmentChange.findUniqueOrThrow({ where: { id: change.id } }))
          .clientNotificationsPlannedAt,
      ).toBeInstanceOf(Date);
    });
  });
});
