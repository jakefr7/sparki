import { ForbiddenException } from '@nestjs/common';
import type { UserRole } from '@sparki/db';
import type { AuthenticatedUser } from './types';

export const MANAGE_SCHEDULER_SETTINGS = 'MANAGE_SCHEDULER_SETTINGS';

const SCHEDULER_SETTINGS_MANAGER_ROLES: UserRole[] = ['OWNER', 'PRACTICE_MANAGER', 'RECEPTIONIST'];

export function canManageSchedulerSettings(user: Pick<AuthenticatedUser, 'role'>): boolean {
  return SCHEDULER_SETTINGS_MANAGER_ROLES.includes(user.role);
}

export function requireSchedulerSettingsManager(user: AuthenticatedUser): void {
  if (!canManageSchedulerSettings(user)) {
    throw new ForbiddenException('This action requires permission to manage scheduler settings.');
  }
}

/**
 * Gates the Settings page's "Admin" tab (scheduler settings + dashboard
 * status colors). Deliberately a standalone per-user grant
 * (User.canManageAdminSettings), NOT derived from Role — any team member can
 * be granted it individually (e.g. a receptionist lead) without a role change
 * pulling in that role's other capabilities.
 */
export const MANAGE_ADMIN_SETTINGS = 'MANAGE_ADMIN_SETTINGS';

export function canManageAdminSettings(user: Pick<AuthenticatedUser, 'canManageAdminSettings'>): boolean {
  return user.canManageAdminSettings;
}

export function requireAdminSettingsManager(user: AuthenticatedUser): void {
  if (!canManageAdminSettings(user)) {
    throw new ForbiddenException('This action requires admin settings permission.');
  }
}
