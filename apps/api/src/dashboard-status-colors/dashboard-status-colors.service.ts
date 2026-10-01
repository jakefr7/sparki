import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, prisma } from '@sparki/db';
import { defaultAllowedTransitionKeys, SPARKI_WORKFLOW_PHASES } from '@sparki/config';
import { canManageAdminSettings } from '../auth/permissions';
import type { AuthenticatedUser } from '../auth/types';
import type { UpsertDashboardStatusColorInput } from './dto/dashboard-status-colors.schema';

const BUILT_IN_STEP_PHASES = SPARKI_WORKFLOW_PHASES;

@Injectable()
export class DashboardStatusColorsService {
  async getConfig(user: AuthenticatedUser) {
    const existingKeys = await prisma.dashboardStatusColorSetting.findMany({
      where: { organizationId: user.organizationId, locationId: user.locationId }, select: { status: true },
    });
    const present = new Set(existingKeys.map((entry) => entry.status));
    // Ensure every clinic has the fixed workflow, including clinics created before setup defaults.
    for (const [index, [status, phase]] of Object.entries(BUILT_IN_STEP_PHASES).entries()) {
      if (present.has(status)) continue;
      await prisma.dashboardStatusColorSetting.upsert({
        where: { locationId_status: { locationId: user.locationId, status } },
        create: {
          organizationId: user.organizationId,
          locationId: user.locationId,
          status,
          name: status.replace(/([a-z])([A-Z])/g, '$1 $2'),
          color: '#1FA9A0',
          sortOrder: index * 10,
          lifecyclePhase: phase,
          allowedTransitionKeys: defaultAllowedTransitionKeys(status),
          isInClinic: !['Appointment', 'Checkout'].includes(status),
        },
        update: {},
      });
    }
    const colors = await prisma.dashboardStatusColorSetting.findMany({
      where: { organizationId: user.organizationId, locationId: user.locationId },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
    return {
      colors: colors
        .filter((entry) => entry.status in BUILT_IN_STEP_PHASES)
        .map((entry) => ({
          ...entry,
          sortOrder: Object.keys(BUILT_IN_STEP_PHASES).indexOf(entry.status) * 10,
          isInClinic: !['Appointment', 'Checkout'].includes(entry.status),
          lifecyclePhase: BUILT_IN_STEP_PHASES[entry.status as keyof typeof BUILT_IN_STEP_PHASES],
          allowedTransitionKeys: defaultAllowedTransitionKeys(entry.status),
          isEnabled: true,
        }))
        .sort((a, b) => a.sortOrder - b.sortOrder),
      canManage: canManageAdminSettings(user),
    };
  }

  async save(user: AuthenticatedUser, input: UpsertDashboardStatusColorInput) {
    const existing = await prisma.dashboardStatusColorSetting.findFirst({
      where: { id: input.id, organizationId: user.organizationId, locationId: user.locationId },
    });
    if (!existing) throw new NotFoundException('Status not found.');
    if (!(existing.status in BUILT_IN_STEP_PHASES))
      throw new BadRequestException('Only Sparki workflow labels and colors can be edited.');
    return prisma.$transaction(async (tx) => {
      const updated = await tx.dashboardStatusColorSetting.update({
        where: { id: existing.id },
        data: {
          name: input.name,
          description: input.description || null,
          color: input.color,
        },
      });
      await tx.schedulerConfigChange.create({
        data: {
          organizationId: user.organizationId,
          locationId: user.locationId,
          actorId: user.id,
          entityType: 'VisitWorkflowStep',
          entityId: existing.id,
          action: 'Updated',
          before: JSON.parse(JSON.stringify(existing)) as Prisma.InputJsonValue,
          after: JSON.parse(JSON.stringify(updated)) as Prisma.InputJsonValue,
        },
      });
      return updated;
    });
  }

  async delete(user: AuthenticatedUser, id: string) {
    const existing = await prisma.dashboardStatusColorSetting.findFirst({ where: {
      id, organizationId: user.organizationId, locationId: user.locationId,
    } });
    if (!existing) throw new NotFoundException('Status not found.');
    throw new BadRequestException(
      'Sparki workflow steps cannot be deleted. Customize their names and colors instead.',
    );
  }
}
