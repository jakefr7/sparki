import { HttpException, HttpStatus, Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import type { SubscriptionStatus } from '@sparki/db';
import { ALLOW_INACTIVE_CLINIC_KEY } from './allow-inactive-clinic.decorator';
import { IS_PUBLIC_KEY } from './public.decorator';
import type { AuthenticatedUser } from './types';

/** ACTIVE and PAST_DUE both allow full access — PAST_DUE is surfaced to the
 *  frontend as a billing warning (GET /clinic/billing), never as a block.
 *  See docs/adr/ADR-007 "Subscription Enforcement". */
const BLOCKING_STATUSES: ReadonlySet<SubscriptionStatus> = new Set(['PENDING', 'CANCELED', 'SUSPENDED']);

export function isClinicActive(status: SubscriptionStatus): boolean {
  return !BLOCKING_STATUSES.has(status);
}

/**
 * Answers question 3 of the four the authorization layer must keep separate
 * (docs/blueprint/11-permission-and-ownership-v1.md's ownership rule, refined
 * for Sparki's own stack): "is the clinic allowed to use Sparki at all right
 * now?" — distinct from question 1 (AuthGuard: is this a real session?),
 * question 2 (AuthService.resolveMembership: does this user belong to
 * exactly one active clinic?), and question 4 (requireRole: does this role
 * allow this specific action?).
 *
 * Runs after AuthGuard (registration order — see AuthModule) so
 * request.user is already populated for any non-@Public() route. Skips
 * entirely for @Public() routes: those have no membership-derived
 * organization context to gate on in the first place (an invitation token
 * carries its own organization, and a lapsed clinic must still be able to
 * finish accepting a pending invite).
 */
@Injectable()
export class SubscriptionGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request & { user?: AuthenticatedUser }>();
    const user = request.user;
    if (!user) {
      // No identity resolved yet (shouldn't happen after AuthGuard on a
      // non-public route, but fail open here — AuthGuard is the one
      // responsible for rejecting unauthenticated requests).
      return true;
    }

    if (isClinicActive(user.subscriptionStatus)) {
      return true;
    }

    const allowInactive = this.reflector.getAllAndOverride<boolean>(ALLOW_INACTIVE_CLINIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (allowInactive) {
      return true;
    }

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
