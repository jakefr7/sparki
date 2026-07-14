import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AppointmentType, prisma } from '@sparki/db';
import type { AuthenticatedUser } from '../auth/types';
import { canManageAdminSettings } from '../auth/permissions';
import type {
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
            include: { provider: { select: { id: true, displayName: true, firstName: true, lastName: true, role: true, isActive: true } } },
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
      slotTemplates,
      canManage: canManageAdminSettings(user),
    };
  }

  async updateSettings(user: AuthenticatedUser, input: UpdateSchedulerSettingsInput) {
    return prisma.schedulerSettings.upsert({
      where: { locationId: user.locationId },
      create: {
        organizationId: user.organizationId,
        locationId: user.locationId,
        slotIntervalMinutes: input.slotIntervalMinutes,
      },
      update: { slotIntervalMinutes: input.slotIntervalMinutes },
    });
  }

  async upsertAppointmentType(user: AuthenticatedUser, input: UpsertAppointmentTypeSettingInput) {
    const eligible = await this.listEligibleProviders(user);
    const eligibleIds = new Set(eligible.map((provider) => provider.id));
    const invalidProviderId = input.providerIds.find((id) => !eligibleIds.has(id));
    if (invalidProviderId) {
      throw new BadRequestException('One or more selected doctors are not eligible at this location.');
    }

    return prisma.$transaction(async (tx) => {
      const existing = input.id
        ? await tx.appointmentTypeSetting.findFirst({
            where: { id: input.id, organizationId: user.organizationId, locationId: user.locationId },
          })
        : null;
      if (input.id && !existing) throw new NotFoundException('Appointment type not found.');
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
          data: input.providerIds.map((providerId) => ({ appointmentTypeId: saved.id, providerId, organizationId: user.organizationId })),
        });
      }
      const result = await tx.appointmentTypeSetting.findUniqueOrThrow({
        where: { id: saved.id },
        include: { providers: { include: { provider: true } } },
      });
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
        clinicLocationAccess: { some: { organizationId: user.organizationId, clinicLocationId: user.locationId, isActive: true } },
      },
      select: { id: true, displayName: true, firstName: true, lastName: true, role: true, isActive: true },
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
    });
    return providers.map((provider) => ({
      id: provider.id,
      displayName: provider.displayName ?? `${provider.firstName} ${provider.lastName}`,
      role: provider.role,
      isActive: provider.isActive,
    }));
  }

  async upsertSlotTemplate(user: AuthenticatedUser, input: UpsertSlotTemplateInput) {
    const data = {
      dayOfWeek: input.dayOfWeek,
      startTime: input.startTime,
      endTime: input.endTime,
      label: input.label,
      color: input.color,
      staffId: input.staffId || null,
      room: input.room?.trim() || null,
      isActive: input.isActive,
    };

    if (!input.id || input.id.startsWith('default-')) {
      return prisma.schedulerSlotTemplate.create({
        data: {
          organizationId: user.organizationId,
          locationId: user.locationId,
          ...data,
        },
      });
    }

    const existing = await prisma.schedulerSlotTemplate.findFirst({
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

    return prisma.schedulerSlotTemplate.update({ where: { id: input.id }, data });
  }

  async setSlotTemplateVisibility(user: AuthenticatedUser, id: string, isActive: boolean) {
    const existing = await prisma.schedulerSlotTemplate.findFirst({
      where: { id, organizationId: user.organizationId, locationId: user.locationId, deletedAt: null },
    });
    if (!existing) {
      throw new NotFoundException(`Scheduler slot template ${id} not found`);
    }

    return prisma.schedulerSlotTemplate.update({ where: { id }, data: { isActive } });
  }

  async deleteSlotTemplate(user: AuthenticatedUser, id: string) {
    const existing = await prisma.schedulerSlotTemplate.findFirst({
      where: { id, organizationId: user.organizationId, locationId: user.locationId, deletedAt: null },
    });
    if (!existing) {
      throw new NotFoundException(`Scheduler slot template ${id} not found`);
    }

    await prisma.schedulerSlotTemplate.update({ where: { id }, data: { deletedAt: new Date() } });
    return { id };
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

    const configured = await prisma.appointmentTypeSetting.findUnique({
      where: { locationId_appointmentType: { locationId, appointmentType } },
    });
    if (configured?.isActive) {
      return { color: configured.color, source: 'type' };
    }

    return { color: '#475569', source: 'fallback' };
  }
}
