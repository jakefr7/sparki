import type { UserRole } from '@sparki/db';

/**
 * Coarse capability tags surfaced to the web client for UI affordances only.
 * Identity only, same as User.role (see prisma/schema.prisma) — the
 * enforcement that matters happens server-side per-endpoint (see
 * requireRole in require-role.ts), not by trusting this list.
 */
export const ROLE_PERMISSIONS: Record<UserRole, string[]> = {
  OWNER: [
    'dashboard:view',
    'scheduler:view',
    'patients:manage',
    'visits:manage',
    'clinical:complete',
    'settings:manage',
  ],
  PRACTICE_MANAGER: [
    'dashboard:view',
    'scheduler:view',
    'patients:manage',
    'visits:manage',
    'settings:manage',
  ],
  FRONT_DESK: ['dashboard:view', 'scheduler:view', 'patients:manage', 'visits:create'],
  VETERINARIAN: ['dashboard:view', 'scheduler:view', 'visits:view', 'clinical:complete'],
  TECHNICIAN: ['dashboard:view', 'scheduler:view', 'visits:view', 'intake:manage'],
  ASSISTANT: ['dashboard:view', 'scheduler:view', 'visits:view'],
  CLIENT: [],
};
