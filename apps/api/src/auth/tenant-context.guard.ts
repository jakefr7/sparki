import { Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { enterTenantContext } from '@sparki/db';
import type { Request } from 'express';
import type { AuthenticatedUser } from './types';

/**
 * Runs after the identity guard (AuthGuard/DevelopmentAuthGuard — see
 * auth.module.ts's APP_GUARD ordering) and, for authenticated requests,
 * binds the rest of the request to a TenantContext so @sparki/db's
 * tenant-scoping extension can enforce/inject organizationId on every
 * tenant-scoped query made downstream. See packages/db/src/tenant-scoping.ts
 * for what that does and does not cover.
 *
 * Deliberately never guesses: a request with no resolved user (public
 * routes, webhooks, pre-auth flows like invitation-by-token) gets no tenant
 * context at all, rather than one inferred from somewhere unreliable. Those
 * paths keep working exactly as they do today, unscoped.
 */
@Injectable()
export class TenantContextGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request & { user?: AuthenticatedUser }>();
    if (request.user) {
      enterTenantContext({ organizationId: request.user.organizationId });
    }
    return true;
  }
}
