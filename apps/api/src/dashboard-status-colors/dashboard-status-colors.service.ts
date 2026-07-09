import { Injectable } from '@nestjs/common';
import { DashboardStatus, prisma } from '@sparki/db';
import { canManageAdminSettings } from '../auth/permissions';
import type { AuthenticatedUser } from '../auth/types';
import type { UpsertDashboardStatusColorInput } from './dto/dashboard-status-colors.schema';

/** Mirrors the tone colors hardcoded in operations-command-center.tsx's
 *  statusTone()/globals.css `.reception-status-chip[data-tone]` rules, so a
 *  location with no overrides still renders the same colors it always has. */
const DEFAULT_COLORS: Record<DashboardStatus, string> = {
  Upcoming: '#64717D',
  CheckedIn: '#13766F',
  InRoom: '#326FA8',
  ReadyForCheckout: '#A76118',
  Completed: '#1F7A4D',
};

const STATUS_ORDER: DashboardStatus[] = [
  'Upcoming',
  'CheckedIn',
  'InRoom',
  'ReadyForCheckout',
  'Completed',
];

@Injectable()
export class DashboardStatusColorsService {
  async getConfig(user: AuthenticatedUser) {
    const overrides = await prisma.dashboardStatusColorSetting.findMany({
      where: { organizationId: user.organizationId, locationId: user.locationId },
    });
    const overrideByStatus = new Map(overrides.map((row) => [row.status, row.color]));

    return {
      colors: STATUS_ORDER.map((status) => ({
        status,
        color: overrideByStatus.get(status) ?? DEFAULT_COLORS[status],
        isCustom: overrideByStatus.has(status),
      })),
      canManage: canManageAdminSettings(user),
    };
  }

  async upsertColor(user: AuthenticatedUser, input: UpsertDashboardStatusColorInput) {
    return prisma.dashboardStatusColorSetting.upsert({
      where: {
        locationId_status: { locationId: user.locationId, status: input.status },
      },
      create: {
        organizationId: user.organizationId,
        locationId: user.locationId,
        status: input.status,
        color: input.color,
      },
      update: { color: input.color },
    });
  }
}
