import type { UserRole } from '@sparki/db';
import { MANAGE_SCHEDULER_SETTINGS } from './permissions';

/**
 * Coarse capability tags surfaced to the web client for UI affordances only.
 * Identity only, same as User.role (see prisma/schema.prisma) — the
 * enforcement that matters happens server-side per-endpoint (see
 * requireRole in require-role.ts), not by trusting this list.
 *
 * MANAGE_ADMIN_SETTINGS is deliberately absent here — unlike everything
 * else in this map, it's not implied by Role at all. It's appended
 * per-user from User.canManageAdminSettings in auth.controller.ts's
 * toMeResponse instead (see permissions.ts).
 */
export const ROLE_PERMISSIONS: Record<UserRole, string[]> = {
  OWNER: [
    'dashboard:view',
    'scheduler:view',
    'patients:manage',
    'visits:manage',
    'clinical:complete',
    'settings:manage',
    MANAGE_SCHEDULER_SETTINGS,
  ],
  PRACTICE_MANAGER: [
    'dashboard:view',
    'scheduler:view',
    'patients:manage',
    'visits:manage',
    'settings:manage',
    MANAGE_SCHEDULER_SETTINGS,
  ],
  RECEPTIONIST: [
    'dashboard:view',
    'scheduler:view',
    'patients:manage',
    'visits:create',
    MANAGE_SCHEDULER_SETTINGS,
  ],
  VETERINARIAN: ['dashboard:view', 'scheduler:view', 'visits:view', 'clinical:complete'],
  TECHNICIAN: ['dashboard:view', 'scheduler:view', 'visits:view', 'intake:manage'],
  ASSISTANT: ['dashboard:view', 'scheduler:view', 'visits:view'],
  CLIENT: [],
};
