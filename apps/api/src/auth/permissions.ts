import { ForbiddenException, HttpException, HttpStatus } from '@nestjs/common';
import type { UserRole } from '@sparki/db';
import { isClinicActive } from './subscription.guard';
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

/** Owners always manage Admin settings. Other roles need the standalone
 * User.canManageAdminSettings grant, without gaining Owner capabilities. */
export const MANAGE_ADMIN_SETTINGS = 'MANAGE_ADMIN_SETTINGS';

export function canManageAdminSettings(user: Pick<AuthenticatedUser, 'role' | 'canManageAdminSettings'>): boolean {
  return user.role === 'OWNER' || user.canManageAdminSettings;
}

export function requireAdminSettingsManager(user: AuthenticatedUser): void {
  if (!canManageAdminSettings(user)) {
    throw new ForbiddenException('This action requires admin settings permission.');
  }
}

/**
 * Explicit, callable form of the same check SubscriptionGuard enforces at
 * the HTTP layer (see subscription.guard.ts) — for a service method that
 * wants to assert it defensively rather than relying only on the route
 * being gated correctly. Prefer the guard for routes; use this inside a
 * service when a single handler mixes gated and @AllowInactiveClinic()
 * behavior (e.g. ClinicService reads clinic/billing state for a suspended
 * clinic but must still refuse a profile *write* in that state).
 */
export function requireActiveClinic(user: Pick<AuthenticatedUser, 'subscriptionStatus'>): void {
  if (!isClinicActive(user.subscriptionStatus)) {
    throw new HttpException(
      {
        statusCode: HttpStatus.PAYMENT_REQUIRED,
        code: 'SUBSCRIPTION_INACTIVE',
        subscriptionStatus: user.subscriptionStatus,
        message: 'This clinic\'s Sparki subscription is not active.',
      },
      HttpStatus.PAYMENT_REQUIRED,
    );
  }
}
