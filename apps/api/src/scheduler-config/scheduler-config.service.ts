import { Injectable, NotFoundException } from '@nestjs/common';
import { AppointmentType, prisma, type Prisma } from '@sparki/db';
import type { AuthenticatedUser } from '../auth/types';
import { canManageSchedulerSettings } from '../auth/permissions';
import type {
  UpdateSchedulerSettingsInput,
  UpsertAppointmentTypeSettingInput,
  UpsertSlotTemplateInput,
} from './dto/scheduler-config.schema';

const DEFAULT_SLOT_INTERVAL_MINUTES = 30;

const DEFAULT_APPOINTMENT_TYPE_SETTINGS: {
  appointmentType: AppointmentType;
  name: string;
  color: string;
  sortOrder: number;
}[] = [
  {
    appointmentType: 'WellnessPreventiveCare',
    name: 'Consultation',
    color: '#2563EB',
    sortOrder: 10,
  },
  { appointmentType: 'Recheck', name: 'Recheck', color: '#7C3AED', sortOrder: 20 },
  { appointmentType: 'SurgeryProcedure', name: 'Surgery', color: '#16A34A', sortOrder: 30 },
  { appointmentType: 'TechnicianAppointment', name: 'Technician', color: '#D97706', sortOrder: 40 },
  { appointmentType: 'EmergencyUrgent', name: 'Emergency', color: '#DC2626', sortOrder: 50 },
  { appointmentType: 'SickVisit', name: 'Sick visit', color: '#0891B2', sortOrder: 60 },
  { appointmentType: 'Vaccination', name: 'Vaccination', color: '#0D9488', sortOrder: 70 },
  { appointmentType: 'DropOff', name: 'Drop-off / Post-op', color: '#CA8A04', sortOrder: 80 },
  { appointmentType: 'Telemedicine', name: 'Telemedicine', color: '#4F46E5', sortOrder: 90 },
  { appointmentType: 'Euthanasia', name: 'Euthanasia', color: '#BE123C', sortOrder: 100 },
  { appointmentType: 'BoardingNonMedical', name: 'Boarding', color: '#475569', sortOrder: 110 },
];

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
      appointmentTypes:
        appointmentTypeSettings.length > 0
          ? appointmentTypeSettings
          : DEFAULT_APPOINTMENT_TYPE_SETTINGS.map((setting) => ({
              id: `default-${setting.appointmentType}`,
              organizationId: user.organizationId,
              locationId: user.locationId,
              appointmentType: setting.appointmentType,
              name: setting.name,
              color: setting.color,
              isActive: true,
              sortOrder: setting.sortOrder,
              createdAt: null,
              updatedAt: null,
            })),
      slotTemplates,
      canManage: canManageSchedulerSettings(user),
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
    return prisma.appointmentTypeSetting.upsert({
      where: {
        locationId_appointmentType: {
          locationId: user.locationId,
          appointmentType: input.appointmentType,
        },
      },
      create: {
        organizationId: user.organizationId,
        locationId: user.locationId,
        appointmentType: input.appointmentType,
        name: input.name,
        color: input.color,
        isActive: input.isActive,
        sortOrder: input.sortOrder,
      },
      update: {
        name: input.name,
        color: input.color,
        isActive: input.isActive,
        sortOrder: input.sortOrder,
      },
    });
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

    const fallback = DEFAULT_APPOINTMENT_TYPE_SETTINGS.find(
      (setting) => setting.appointmentType === appointmentType,
    );
    return { color: fallback?.color ?? '#475569', source: 'fallback' };
  }
}
