import type { SubscriptionStatus, UserRole } from '@sparki/db';

export interface AuthenticatedUser {
  id: string;
  email: string;
  /** User.displayName if set, else "firstName lastName". */
  name: string;
  /** Org/location isolation per docs/blueprint/11-permission-and-ownership-v1.md. */
  organizationId: string;
  /** Current location context. Users may be assigned to more than one
   *  Location (see User.locations), but a request acts within exactly one. */
  locationId: string;
  /** Identity only (User.role) — no permission framework yet. */
  role: UserRole;
  /** The resolved membership's clinic's billing state (Organization.
   *  subscriptionStatus), read at session-resolution time — see
   *  SubscriptionGuard, which is what actually enforces it. Never trust a
   *  cached copy of this for a long-lived process; it is re-read on every
   *  session verification. */
  subscriptionStatus: SubscriptionStatus;
  /** Stored per-user grant (User.canManageAdminSettings). Owners also have
   *  effective Admin access through their role — see permissions.ts. */
  canManageAdminSettings: boolean;
  /** Per-user grant allowing explicit assignment to finalize another
   * veterinarian's visit record. The actual signer is always recorded. */
  canFinalizeRecordsForOthers: boolean;
  /** Explicit medication-clerk grant. Clinical roles may also be authorized
   * by medication workflow policy, but reception is never inferred. */
  canManageMedications?: boolean;
}
