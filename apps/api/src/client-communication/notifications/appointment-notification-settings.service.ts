import { BadRequestException, Injectable, UnprocessableEntityException } from '@nestjs/common';
import { prisma, type AppointmentNotificationKind, type Prisma } from '@sparki/db';
import type { AuthenticatedUser } from '../../auth/types';
import { personSelect, presentPerson } from '../client-communication.presenter';
import {
  ClientTextingReadinessService,
  isTextingVisible,
} from '../client-texting-readiness.service';
import { countSmsSegments } from '../sms-text';
import type {
  PreviewNotificationInput,
  UpdateNotificationSettingsInput,
} from './dto/appointment-notification.schema';
import {
  automatedTextsAllowed,
  MAX_REMINDER_OFFSET_MINUTES,
  MAX_REMINDERS,
  MIN_REMINDER_OFFSET_MINUTES,
  NOTIFICATION_KINDS,
  STARTING_REMINDER_OFFSET_MINUTES,
} from './notification-constants';
import {
  formatAppointmentDate,
  formatAppointmentTime,
  MAX_TEMPLATE_LENGTH,
  PLACEHOLDERS,
  placeholdersIn,
  renderTemplate,
  STARTING_TEMPLATES,
  templateProblems,
} from './notification-templates';

const DEFAULT_SEND_WINDOW = { startMinute: 8 * 60, endMinute: 20 * 60 };

interface RuleView {
  /** Null for a suggestion that has never been saved. */
  id: string | null;
  kind: AppointmentNotificationKind;
  enabled: boolean;
  offsetMinutes: number | null;
  template: string;
}

function startingRule(kind: AppointmentNotificationKind): RuleView {
  return {
    id: null,
    kind,
    enabled: false,
    offsetMinutes: kind === 'REMINDER' ? STARTING_REMINDER_OFFSET_MINUTES : null,
    template: STARTING_TEMPLATES[kind],
  };
}

/**
 * A clinic location's automated appointment texts: which send, when, and
 * with what wording. Founder direction 2026-10-02: fully each clinic's own
 * choice, changed only by an owner or practice manager (the controller
 * enforces the role). Nothing is on until the clinic turns it on.
 */
@Injectable()
export class AppointmentNotificationSettingsService {
  constructor(private readonly readiness: ClientTextingReadinessService) {}

  async get(user: AuthenticatedUser) {
    const scope = { organizationId: user.organizationId, locationId: user.locationId };
    const [settings, location, types, readiness] = await Promise.all([
      prisma.appointmentNotificationSettings.findFirst({ where: scope, include: { rules: true } }),
      this.clinic(user),
      prisma.appointmentTypeSetting.findMany({
        where: scope,
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        select: { id: true, name: true, isActive: true, appointmentType: true },
      }),
      this.readiness.forLocation(user.organizationId, user.locationId),
    ]);
    const updatedBy = settings?.updatedById
      ? await prisma.user.findFirst({
          where: { id: settings.updatedById, organizationId: user.organizationId },
          select: personSelect,
        })
      : null;

    // Always the same four sections, in the same order. A kind the clinic
    // has not saved shows suggested wording, switched off.
    const saved = settings?.rules ?? [];
    const rules: RuleView[] = NOTIFICATION_KINDS.flatMap((kind) => {
      const ofKind = saved
        .filter((rule) => rule.kind === kind)
        .sort((a, b) => (b.offsetMinutes ?? 0) - (a.offsetMinutes ?? 0));
      return ofKind.length > 0
        ? ofKind.map(({ id, enabled, offsetMinutes, template }) => ({
            id,
            kind,
            enabled,
            offsetMinutes,
            template,
          }))
        : [startingRule(kind)];
    });
    const choices = settings?.appointmentTypeChoices ?? {};

    return {
      saved: Boolean(settings),
      updatedAt: settings?.updatedAt.toISOString() ?? null,
      updatedBy: presentPerson(updatedBy),
      timeZone: location.timeZone,
      sendWindow: settings
        ? { startMinute: settings.sendWindowStartMinute, endMinute: settings.sendWindowEndMinute }
        : DEFAULT_SEND_WINDOW,
      rules,
      appointmentTypes: types.map((type) => ({
        id: type.id,
        name: type.name,
        isActive: type.isActive,
        automatedMessages: automatedTextsAllowed(choices, type.id, type.appointmentType),
      })),
      clinic: { name: location.organization.name, phone: location.organization.phone },
      texting: { mode: readiness.mode, visible: isTextingVisible(readiness) },
      placeholders: PLACEHOLDERS,
      limits: {
        maxTemplateLength: MAX_TEMPLATE_LENGTH,
        maxReminders: MAX_REMINDERS,
        minReminderOffsetMinutes: MIN_REMINDER_OFFSET_MINUTES,
        maxReminderOffsetMinutes: MAX_REMINDER_OFFSET_MINUTES,
      },
    };
  }

  async update(user: AuthenticatedUser, input: UpdateNotificationSettingsInput) {
    const scope = { organizationId: user.organizationId, locationId: user.locationId };
    const location = await this.clinic(user);

    const invalid = input.rules.flatMap((rule, index) => {
      const problems = templateProblems(rule.kind, rule.template);
      return problems.length > 0 ? [{ index, kind: rule.kind, problems }] : [];
    });
    if (invalid.length > 0) {
      throw new BadRequestException({
        code: 'TEMPLATE_INVALID',
        message: 'Some of the wording cannot be saved.',
        rules: invalid,
      });
    }
    const needsPhone = input.rules.some(
      (rule) => rule.enabled && placeholdersIn(rule.template).includes('clinic_phone'),
    );
    if (needsPhone && !location.organization.phone) {
      throw new UnprocessableEntityException({
        code: 'CLINIC_PHONE_MISSING',
        message:
          "Add the clinic's phone number before turning on a message that includes {clinic_phone}.",
      });
    }

    const existing = await prisma.appointmentNotificationSettings.findFirst({
      where: scope,
      include: { rules: { select: { id: true, kind: true } } },
    });
    for (const rule of input.rules) {
      const saved = rule.id ? existing?.rules.find(({ id }) => id === rule.id) : undefined;
      if (rule.id && saved?.kind !== rule.kind) {
        throw new BadRequestException({
          code: 'RULE_NOT_FOUND',
          message: 'That message is no longer saved. Reload the settings.',
        });
      }
    }

    let choices: Prisma.InputJsonObject | undefined;
    if (input.appointmentTypes) {
      const known = new Set(
        (await prisma.appointmentTypeSetting.findMany({ where: scope, select: { id: true } })).map(
          ({ id }) => id,
        ),
      );
      if (input.appointmentTypes.some(({ id }) => !known.has(id))) {
        throw new BadRequestException({
          code: 'APPOINTMENT_TYPE_NOT_FOUND',
          message: 'An appointment type is no longer available. Reload the settings.',
        });
      }
      choices = Object.fromEntries(
        input.appointmentTypes.map(({ id, automatedMessages }) => [id, automatedMessages]),
      );
    }

    const now = new Date();
    await prisma.$transaction(async (tx) => {
      const fields = {
        sendWindowStartMinute: input.sendWindow.startMinute,
        sendWindowEndMinute: input.sendWindow.endMinute,
        ...(choices ? { appointmentTypeChoices: choices } : {}),
        // Future appointments' reminders are brought in line with the new
        // rules by the dispatcher; see AppointmentNotificationEngine.
        reminderResyncRequestedAt: now,
        updatedById: user.id,
      };
      const settings = await tx.appointmentNotificationSettings.upsert({
        where: { locationId: user.locationId },
        create: { ...scope, ...fields },
        update: fields,
      });
      const keep = input.rules.flatMap((rule) => (rule.id ? [rule.id] : []));
      await tx.appointmentNotificationRule.deleteMany({
        where: { settingsId: settings.id, id: { notIn: keep } },
      });
      for (const rule of input.rules) {
        const data = {
          enabled: rule.enabled,
          offsetMinutes: rule.kind === 'REMINDER' ? (rule.offsetMinutes ?? null) : null,
          template: rule.template.trim(),
        };
        if (rule.id) await tx.appointmentNotificationRule.update({ where: { id: rule.id }, data });
        else {
          await tx.appointmentNotificationRule.create({
            data: { ...scope, settingsId: settings.id, kind: rule.kind, ...data },
          });
        }
      }
    });
    return this.get(user);
  }

  /** What a client would receive, with example details, before anything is saved. */
  async preview(user: AuthenticatedUser, input: PreviewNotificationInput) {
    const location = await this.clinic(user);
    const problems = templateProblems(input.kind, input.template);
    const example = new Date(Date.now() + 24 * 60 * 60 * 1000);
    example.setUTCMinutes(0, 0, 0);
    const earlier = new Date(example.getTime() - 2 * 60 * 60 * 1000);
    const text = renderTemplate(input.template, {
      clinic_name: location.organization.name,
      clinic_phone: location.organization.phone ?? '',
      client_first_name: 'Jordan',
      patient_name: 'Finley',
      appointment_date: formatAppointmentDate(example, location.timeZone),
      appointment_time: formatAppointmentTime(example, location.timeZone),
      previous_date: formatAppointmentDate(earlier, location.timeZone),
      previous_time: formatAppointmentTime(earlier, location.timeZone),
    });
    return { text, segments: countSmsSegments(text), problems };
  }

  private clinic(user: AuthenticatedUser) {
    return prisma.location.findFirstOrThrow({
      where: { id: user.locationId, organizationId: user.organizationId },
      select: { timeZone: true, organization: { select: { name: true, phone: true } } },
    });
  }
}
