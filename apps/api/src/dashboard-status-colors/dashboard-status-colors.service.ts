import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, prisma } from '@sparki/db';
import { workflowStatusKey } from '@sparki/config';
import { canManageAdminSettings } from '../auth/permissions';
import type { AuthenticatedUser } from '../auth/types';
import type { UpsertDashboardStatusColorInput } from './dto/dashboard-status-colors.schema';

function statusKey(name: string) {
  return name.replace(/[^a-zA-Z0-9]+/g, '').replace(/^./, (letter) => letter.toUpperCase()) || 'Status';
}

@Injectable()
export class DashboardStatusColorsService {
  async getConfig(user: AuthenticatedUser) {
    const colors = await prisma.dashboardStatusColorSetting.findMany({
      where: { organizationId: user.organizationId, locationId: user.locationId },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
    return { colors, canManage: canManageAdminSettings(user) };
  }

  async save(user: AuthenticatedUser, input: UpsertDashboardStatusColorInput) {
    const data = {
      name: input.name,
      description: input.description || null,
      color: input.color,
      sortOrder: input.sortOrder,
      isEnabled: input.isEnabled,
      isInClinic: input.isInClinic,
      allowedTransitionKeys: input.allowedTransitionKeys,
      lifecyclePhase: input.lifecyclePhase,
    };
    if (input.id) {
      const existing = await prisma.dashboardStatusColorSetting.findFirst({
        where: { id: input.id, organizationId: user.organizationId, locationId: user.locationId },
      });
      if (!existing) throw new NotFoundException('Status not found.');
      if (existing.isEnabled && !input.isEnabled) {
        const activeCount = await this.activeUsageCount(user, existing.status);
        if (activeCount > 0) {
          throw new ConflictException(`${activeCount} active visit${activeCount === 1 ? '' : 's'} currently use this step. Move them before disabling it.`);
        }
      }
      if (existing.lifecyclePhase !== input.lifecyclePhase) {
        const activeCount = await this.activeUsageCount(user, existing.status);
        if (activeCount > 0) {
          throw new ConflictException(`${activeCount} active visit${activeCount === 1 ? '' : 's'} currently use this step. Move them before changing its protected phase.`);
        }
      }
      const updated = await prisma.dashboardStatusColorSetting.update({ where: { id: existing.id }, data });
      await this.audit(user, existing.id, 'Updated', existing, updated);
      return updated;
    }
    let status = statusKey(input.name);
    const duplicate = await prisma.dashboardStatusColorSetting.findUnique({
      where: { locationId_status: { locationId: user.locationId, status } },
    });
    if (duplicate) status = `${status}${Date.now().toString(36)}`;
    const created = await prisma.dashboardStatusColorSetting.create({
      data: { organizationId: user.organizationId, locationId: user.locationId, status, ...data },
    });
    await this.audit(user, created.id, 'Created', {}, created);
    return created;
  }

  async delete(user: AuthenticatedUser, id: string) {
    const existing = await prisma.dashboardStatusColorSetting.findFirst({
      where: { id, organizationId: user.organizationId, locationId: user.locationId },
    });
    if (!existing) throw new NotFoundException('Status not found.');
    const activeCount = await this.activeUsageCount(user, existing.status);
    if (activeCount > 0) {
      throw new ConflictException(`${activeCount} active visit${activeCount === 1 ? '' : 's'} currently use this step. Move them before deleting it.`);
    }
    const referencedBy = await prisma.dashboardStatusColorSetting.count({
      where: { organizationId: user.organizationId, locationId: user.locationId, allowedTransitionKeys: { has: existing.status } },
    });
    if (referencedBy > 0) throw new ConflictException('Remove this step from allowed transitions before deleting it.');
    await prisma.dashboardStatusColorSetting.delete({ where: { id } });
    await this.audit(user, existing.id, 'Deleted', existing, {});
    return { id };
  }

  private async activeUsageCount(user: AuthenticatedUser, status: string) {
    const visits = await prisma.visit.findMany({
      where: { organizationId: user.organizationId, locationId: user.locationId, phase: { not: 'Closed' } },
      select: { state: true, workflowStep: { select: { status: true } } },
    });
    return visits.filter((visit) => (visit.workflowStep?.status ?? workflowStatusKey('visit', visit.state)) === status).length;
  }

  private async audit(user: AuthenticatedUser, entityId: string, action: string, before: unknown, after: unknown) {
    await prisma.schedulerConfigChange.create({
      data: {
        organizationId: user.organizationId,
        locationId: user.locationId,
        actorId: user.id,
        entityType: 'VisitWorkflowStep',
        entityId,
        action,
        before: before as Prisma.InputJsonValue,
        after: after as Prisma.InputJsonValue,
      },
    });
  }
}
