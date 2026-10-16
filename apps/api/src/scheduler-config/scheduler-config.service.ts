import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AppointmentType, prisma, type Prisma } from '@sparki/db';
import type { AuthenticatedUser } from '../auth/types';
import { canManageAdminSettings } from '../auth/permissions';
import type {
  CreateDateExceptionInput,
  UpdateSchedulerSettingsInput,
  UpsertAppointmentTypeSettingInput,
  UpsertSlotTemplateInput,
} from './dto/scheduler-config.schema';

const DEFAULT_SLOT_INTERVAL_MINUTES = 30;

export type AppointmentColorSource = 'manual' | 'type' | 'fallback';

export interface ResolvedAppointmentColor {
  color: string;
  source: AppointmentColorSource;
}

@Injectable()
export class SchedulerConfigService {
  async getConfig(user: AuthenticatedUser) {
    const [settings, appointmentTypeSettings, slotTemplates] = await Promise.all([
      prisma.schedulerSettings.findUnique({ where: { locationId: user.locationId } }),
      prisma.appointmentTypeSetting.findMany({
        where: { organizationId: user.organizationId, locationId: user.locationId },
        include: {
          providers: {
            include: {
              provider: {
                select: {
                  id: true,
                  displayName: true,
                  firstName: true,
                  lastName: true,
                  role: true,
                  isActive: true,
                },
              },
            },
          },
        },
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      }),
      prisma.schedulerSlotTemplate.findMany({
        where: {
          organizationId: user.organizationId,
          locationId: user.locationId,
          deletedAt: null,
        },
        include: { appointmentTypes: { select: { appointmentTypeId: true } } },
        orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }, { label: 'asc' }],
      }),
    ]);

    return {
      settings: {
        slotIntervalMinutes: settings?.slotIntervalMinutes ?? DEFAULT_SLOT_INTERVAL_MINUTES,
      },
      appointmentTypes: appointmentTypeSettings.map((setting) => ({
        ...setting,
        providers: setting.providers.map(({ provider }) => ({
          id: provider.id,
          displayName: provider.displayName ?? `${provider.firstName} ${provider.lastName}`,
          role: provider.role,
          isActive: provider.isActive,
        })),
        isBookable: setting.isActive && setting.providers.length > 0,
      })),
      slotTemplates: slotTemplates.map((template) => ({
        ...template,
        appointmentTypeIds: template.appointmentTypes.map(
          ({ appointmentTypeId }) => appointmentTypeId,
        ),
        appointmentTypes: undefined,
      })),
      canManage: canManageAdminSettings(user),
    };
  }

  async listDateExceptions(user: AuthenticatedUser) {
    return prisma.schedulerDateException.findMany({
      where: { organizationId: user.organizationId, locationId: user.locationId, deletedAt: null },
      orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
    });
  }

  async createDateException(user: AuthenticatedUser, input: CreateDateExceptionInput) {
    return (await this.createDateExceptions(user, [input]))[0];
  }

  async createDateExceptions(user: AuthenticatedUser, inputs: CreateDateExceptionInput[]) {
    const eligible = await this.listEligibleProviders(user);
    if (inputs.some((input) => input.providerId && !eligible.some((p) => p.id === input.providerId)))
      throw new BadRequestException('Provider is not eligible at this location.');
    return prisma.$transaction(async (tx) => {
      const results = [];
      for (const input of inputs) {
        // A retry after a lost response recovers the same closure, without duplicates.
        const existing = await tx.schedulerDateException.findFirst({ where: {
          organizationId: user.organizationId, locationId: user.locationId,
          deletedAt: null, ...input,
        } });
        if (existing) { results.push(existing); continue; }
        const saved = await tx.schedulerDateException.create({ data: {
          organizationId: user.organizationId, locationId: user.locationId, ...input,
        } });
        await recordConfigChange(tx, user, 'SchedulerDateException', saved.id, 'Created', null, saved);
        results.push(saved);
      }
      return results;
    });
  }

  async removeDateException(user: AuthenticatedUser, id: string) {
    return prisma.$transaction(async (tx) => {
      const before = await tx.schedulerDateException.findFirst({
        where: {
          id,
          organizationId: user.organizationId,
          locationId: user.locationId,
          deletedAt: null,
        },
      });
      if (!before) throw new NotFoundException('Date exception not found.');
      const saved = await tx.schedulerDateException.update({
        where: { id },
        data: { deletedAt: new Date() },
      });
      await recordConfigChange(tx, user, 'SchedulerDateException', id, 'Removed', before, saved);
      return { id };
    });
  }

  async updateSettings(user: AuthenticatedUser, input: UpdateSchedulerSettingsInput) {
    return prisma.$transaction(async (tx) => {
      const before = await tx.schedulerSettings.findUnique({
        where: { locationId: user.locationId },
      });
      const saved = await tx.schedulerSettings.upsert({
        where: { locationId: user.locationId },
        create: {
          organizationId: user.organizationId,
          locationId: user.locationId,
          slotIntervalMinutes: input.slotIntervalMinutes,
        },
        update: { slotIntervalMinutes: input.slotIntervalMinutes },
      });
      await recordConfigChange(
        tx,
        user,
        'SchedulerSettings',
        saved.id,
        before ? 'Updated' : 'Created',
        before,
        saved,
      );
      return saved;
    });
  }

  async upsertAppointmentType(user: AuthenticatedUser, input: UpsertAppointmentTypeSettingInput) {
    const eligible = await this.listEligibleProviders(user);
    const eligibleIds = new Set(eligible.map((provider) => provider.id));
    const invalidProviderId = input.providerIds.find((id) => !eligibleIds.has(id));
    if (invalidProviderId) {
      throw new BadRequestException(
        'One or more selected doctors are not eligible at this location.',
      );
    }

    return prisma.$transaction(async (tx) => {
      const existing = input.id
        ? await tx.appointmentTypeSetting.findFirst({
            where: {
              id: input.id,
              organizationId: user.organizationId,
              locationId: user.locationId,
            },
          })
        : null;
      if (input.id && !existing) throw new NotFoundException('Appointment type not found.');
      if (existing) {
        const removedProviderIds = await tx.appointmentTypeProvider.findMany({
          where: { appointmentTypeId: existing.id, providerId: { notIn: input.providerIds } },
          select: { providerId: true },
        });
        const categoryChanged = existing.appointmentType !== (input.appointmentType ?? null);
        const affectsEveryFutureAppointment = !input.isActive || categoryChanged;
        const impactedAppointments = await tx.appointment.count({
          where: {
            appointmentTypeSettingId: existing.id,
            scheduledAt: { gte: new Date() },
            state: { in: ['Scheduled', 'PreVisitPending', 'Confirmed', 'Arrived', 'VisitCreated'] },
            ...(affectsEveryFutureAppointment
              ? {}
              : { providerId: { in: removedProviderIds.map(({ providerId }) => providerId) } }),
          },
        });
        if (
          impactedAppointments > 0 &&
          (affectsEveryFutureAppointment || removedProviderIds.length > 0)
        ) {
          throw new BadRequestException(
            `${impactedAppointments} future appointment${impactedAppointments === 1 ? '' : 's'} must be reassigned before changing this appointment style.`,
          );
        }
      }
      const data = {
        appointmentType: input.appointmentType ?? null,
        name: input.name.trim(),
        description: input.description?.trim() || null,
        defaultDurationMinutes: input.defaultDurationMinutes,
        color: input.color,
        isActive: input.isActive,
        sortOrder: input.sortOrder,
      };
      const saved = existing
        ? await tx.appointmentTypeSetting.update({ where: { id: existing.id }, data })
        : await tx.appointmentTypeSetting.create({
            data: { organizationId: user.organizationId, locationId: user.locationId, ...data },
          });
      await tx.appointmentTypeProvider.deleteMany({ where: { appointmentTypeId: saved.id } });
      if (input.providerIds.length > 0) {
        await tx.appointmentTypeProvider.createMany({
          data: input.providerIds.map((providerId) => ({
            appointmentTypeId: saved.id,
            providerId,
            organizationId: user.organizationId,
          })),
        });
      }
      const result = await tx.appointmentTypeSetting.findUniqueOrThrow({
        where: { id: saved.id },
        include: { providers: { include: { provider: true } } },
      });
      await recordConfigChange(
        tx,
        user,
        'AppointmentTypeSetting',
        saved.id,
        existing ? 'Updated' : 'Created',
        existing,
        result,
      );
      return {
        ...result,
        providers: result.providers.map(({ provider }) => ({
          id: provider.id,
          displayName: provider.displayName ?? `${provider.firstName} ${provider.lastName}`,
          role: provider.role,
          isActive: provider.isActive,
        })),
        isBookable: result.isActive && result.providers.length > 0,
      };
    });
  }

  async listEligibleProviders(user: AuthenticatedUser) {
    const providers = await prisma.user.findMany({
      where: {
        organizationId: user.organizationId,
        isActive: true,
        staffProfile: { canReceiveAppointments: true },
        organizationMemberships: { some: { organizationId: user.organizationId, isActive: true } },
        clinicLocationAccess: {
          some: {
            organizationId: user.organizationId,
            clinicLocationId: user.locationId,
            isActive: true,
          },
        },
      },
      select: {
        id: true,
        displayName: true,
        firstName: true,
        lastName: true,
        role: true,
        isActive: true,
      },
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
    });
    return providers.map((provider) => ({
      id: provider.id,
      displayName: provider.displayName ?? `${provider.firstName} ${provider.lastName}`,
      role: provider.role,
      isActive: provider.isActive,
    }));
  }

  async createSlotTemplates(user: AuthenticatedUser, inputs: UpsertSlotTemplateInput[]) {
    return prisma.$transaction(async (tx) => {
      const results = [];
      for (const input of inputs) {
        results.push(await this.upsertSlotTemplate(user, input, tx));
      }
      return results;
    });
  }

  async upsertSlotTemplate(user: AuthenticatedUser, input: UpsertSlotTemplateInput, db: Prisma.TransactionClient = prisma) {
    if (input.staffId) {
      const eligibleProviders = await this.listEligibleProviders(user);
      if (!eligibleProviders.some((provider) => provider.id === input.staffId)) {
        throw new BadRequestException('The selected provider is not eligible at this location.');
      }
    }
    const validTypes = await db.appointmentTypeSetting.count({
      where: {
        id: { in: input.appointmentTypeIds },
        organizationId: user.organizationId,
        locationId: user.locationId,
        isActive: true,
      },
    });
    if (validTypes !== new Set(input.appointmentTypeIds).size) {
      throw new BadRequestException(
        'One or more selected appointment styles are not available at this location.',
      );
    }
    const data = {
      dayOfWeek: input.dayOfWeek,
      startTime: input.startTime,
      endTime: input.endTime,
      label: input.label,
      color: input.color,
      staffId: input.staffId || null,
      room: input.room?.trim() || null,
      isActive: input.isActive,
      isGeneralAvailability: input.appointmentTypeIds.length === 0,
    };

    if (!input.id || input.id.startsWith('default-')) {
      const created = await db.schedulerSlotTemplate.create({
        data: {
          organizationId: user.organizationId,
          locationId: user.locationId,
          ...data,
          appointmentTypes: {
            create: input.appointmentTypeIds.map((appointmentTypeId) => ({ appointmentTypeId })),
          },
        },
        include: { appointmentTypes: { select: { appointmentTypeId: true } } },
      });
      await recordConfigChange(
        db,
        user,
        'SchedulerSlotTemplate',
        created.id,
        'Created',
        null,
        created,
      );
      return {
        ...created,
        appointmentTypeIds: created.appointmentTypes.map(
          ({ appointmentTypeId }) => appointmentTypeId,
        ),
        appointmentTypes: undefined,
      };
    }

    const existing = await db.schedulerSlotTemplate.findFirst({
      where: {
        id: input.id,
        organizationId: user.organizationId,
        locationId: user.locationId,
        deletedAt: null,
      },
    });
    if (!existing) {
      throw new NotFoundException(`Scheduler slot template ${input.id} not found`);
    }

    const capacityChanged =
      existing.dayOfWeek !== input.dayOfWeek ||
      existing.startTime !== input.startTime ||
      existing.endTime !== input.endTime ||
      existing.staffId !== (input.staffId || null) ||
      existing.room !== (input.room?.trim() || null) ||
      existing.isActive !== input.isActive;
    const existingTypeIds = await db.appointmentTypeSlotTemplate.findMany({
      where: { slotTemplateId: existing.id },
      select: { appointmentTypeId: true },
    });
    const mappingsChanged =
      [...new Set(existingTypeIds.map(({ appointmentTypeId }) => appointmentTypeId))]
        .sort()
        .join(':') !== [...new Set(input.appointmentTypeIds)].sort().join(':');
    if (capacityChanged || mappingsChanged) {
      await this.assertBlockHasNoFutureAppointments(existing.id);
    }

    const updated = await db.schedulerSlotTemplate.update({
      where: { id: input.id },
      data: {
        ...data,
        appointmentTypes: {
          deleteMany: {},
          create: input.appointmentTypeIds.map((appointmentTypeId) => ({ appointmentTypeId })),
        },
      },
      include: { appointmentTypes: { select: { appointmentTypeId: true } } },
    });
    await recordConfigChange(
      db,
      user,
      'SchedulerSlotTemplate',
      updated.id,
      'Updated',
      existing,
      updated,
    );
    return {
      ...updated,
      appointmentTypeIds: updated.appointmentTypes.map(
        ({ appointmentTypeId }) => appointmentTypeId,
      ),
      appointmentTypes: undefined,
    };
  }

  async setSlotTemplateVisibility(user: AuthenticatedUser, id: string, isActive: boolean) {
    const existing = await prisma.schedulerSlotTemplate.findFirst({
      where: {
        id,
        organizationId: user.organizationId,
        locationId: user.locationId,
        deletedAt: null,
      },
    });
    if (!existing) {
      throw new NotFoundException(`Scheduler slot template ${id} not found`);
    }
    if (!isActive && existing.isActive) await this.assertBlockHasNoFutureAppointments(id);

    const updated = await prisma.schedulerSlotTemplate.update({
      where: { id },
      data: { isActive },
    });
    await recordConfigChange(
      prisma,
      user,
      'SchedulerSlotTemplate',
      id,
      isActive ? 'Activated' : 'Deactivated',
      existing,
      updated,
    );
    return updated;
  }

  async deleteSlotTemplate(user: AuthenticatedUser, id: string) {
    const existing = await prisma.schedulerSlotTemplate.findFirst({
      where: {
        id,
        organizationId: user.organizationId,
        locationId: user.locationId,
        deletedAt: null,
      },
    });
    if (!existing) {
      throw new NotFoundException(`Scheduler slot template ${id} not found`);
    }

    await this.assertBlockHasNoFutureAppointments(id);

    await prisma.schedulerSlotTemplate.update({ where: { id }, data: { deletedAt: new Date() } });
    await recordConfigChange(prisma, user, 'SchedulerSlotTemplate', id, 'Deleted', existing, {
      ...existing,
      deletedAt: new Date().toISOString(),
    });
    return { id };
  }

  private async assertBlockHasNoFutureAppointments(id: string) {
    const count = await prisma.appointment.count({
      where: {
        schedulerSlotTemplateId: id,
        scheduledAt: { gte: new Date() },
        state: { in: ['Scheduled', 'PreVisitPending', 'Confirmed', 'Arrived', 'VisitCreated'] },
      },
    });
    if (count > 0) {
      throw new BadRequestException(
        `${count} future appointment${count === 1 ? '' : 's'} must be moved before changing this schedule block.`,
      );
    }
  }

  async resolveAppointmentColor(
    organizationId: string,
    locationId: string,
    appointmentType: AppointmentType,
    manualColor: string | null | undefined,
  ): Promise<ResolvedAppointmentColor> {
    if (manualColor) {
      return { color: manualColor, source: 'manual' };
    }

    const configured = await prisma.appointmentTypeSetting.findFirst({
      where: { organizationId, locationId, appointmentType, isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
    if (configured) {
      return { color: configured.color, source: 'type' };
    }

    return { color: '#475569', source: 'fallback' };
  }
}

async function recordConfigChange(
  db: Prisma.TransactionClient | typeof prisma,
  user: AuthenticatedUser,
  entityType: string,
  entityId: string,
  action: string,
  before: unknown,
  after: unknown,
) {
  await db.schedulerConfigChange.create({
    data: {
      organizationId: user.organizationId,
      locationId: user.locationId,
      actorId: user.id,
      entityType,
      entityId,
      action,
      before: jsonSnapshot(before),
      after: jsonSnapshot(after),
    },
  });
}

function jsonSnapshot(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value ?? {})) as Prisma.InputJsonValue;
}
