import { ForbiddenException } from '@nestjs/common';
import type { UserRole } from '@sparki/db';
import type { AuthenticatedUser } from './types';

export const MANAGE_SCHEDULER_SETTINGS = 'MANAGE_SCHEDULER_SETTINGS';

const SCHEDULER_SETTINGS_MANAGER_ROLES: UserRole[] = ['OWNER', 'PRACTICE_MANAGER', 'FRONT_DESK'];

export function canManageSchedulerSettings(user: Pick<AuthenticatedUser, 'role'>): boolean {
  return SCHEDULER_SETTINGS_MANAGER_ROLES.includes(user.role);
}

export function requireSchedulerSettingsManager(user: AuthenticatedUser): void {
  if (!canManageSchedulerSettings(user)) {
    throw new ForbiddenException('This action requires permission to manage scheduler settings.');
  }
}
