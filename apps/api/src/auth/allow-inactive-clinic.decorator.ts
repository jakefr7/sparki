import { SetMetadata } from '@nestjs/common';

export const ALLOW_INACTIVE_CLINIC_KEY = 'allowInactiveClinic';

/**
 * Opts a route or controller out of SubscriptionGuard's block. Use only for
 * the small set of routes an authenticated user must still reach while their
 * clinic's subscription is PENDING/CANCELED/SUSPENDED — reading their own
 * identity, reading/acting on billing state, and clinic-invitation
 * acceptance — so the frontend can render the restricted-access screen
 * itself and let the owner get back to billing.
 */
export const AllowInactiveClinic = () => SetMetadata(ALLOW_INACTIVE_CLINIC_KEY, true);
