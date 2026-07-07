import { ForbiddenException } from '@nestjs/common';
import type { UserRole } from '@sparki/db';
import type { AuthenticatedUser } from './types';

/** Throws if the current user's role isn't in `allowedRoles`. Use for the
 *  specific sensitive actions a module spec calls out (e.g. veterinarian-only
 *  clinical completion) — not a general permission framework, per
 *  docs/blueprint/11-permission-and-ownership-v1.md's "no permission
 *  framework yet" note on User.role. */
export function requireRole(user: AuthenticatedUser, allowedRoles: UserRole[]): void {
  if (!allowedRoles.includes(user.role)) {
    throw new ForbiddenException(
      `This action requires one of the following roles: ${allowedRoles.join(', ')}`,
    );
  }
}
