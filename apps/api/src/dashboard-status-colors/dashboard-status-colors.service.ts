import { Injectable, NotFoundException } from '@nestjs/common';
import { prisma } from '@sparki/db';
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
    };
    if (input.id) {
      const existing = await prisma.dashboardStatusColorSetting.findFirst({
        where: { id: input.id, organizationId: user.organizationId, locationId: user.locationId },
      });
      if (!existing) throw new NotFoundException('Status not found.');
      return prisma.dashboardStatusColorSetting.update({ where: { id: existing.id }, data });
    }
    let status = statusKey(input.name);
    const duplicate = await prisma.dashboardStatusColorSetting.findUnique({
      where: { locationId_status: { locationId: user.locationId, status } },
    });
    if (duplicate) status = `${status}${Date.now().toString(36)}`;
    return prisma.dashboardStatusColorSetting.create({
      data: { organizationId: user.organizationId, locationId: user.locationId, status, ...data },
    });
  }

  async delete(user: AuthenticatedUser, id: string) {
    const existing = await prisma.dashboardStatusColorSetting.findFirst({
      where: { id, organizationId: user.organizationId, locationId: user.locationId },
    });
    if (!existing) throw new NotFoundException('Status not found.');
    await prisma.dashboardStatusColorSetting.delete({ where: { id } });
    return { id };
  }
}
