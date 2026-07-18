import type { UserRole } from '@sparki/db';

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
  /** Standalone per-user grant (User.canManageAdminSettings), deliberately
   *  not derived from role — see permissions.ts. */
  canManageAdminSettings: boolean;
  /** Per-user grant allowing explicit assignment to finalize another
   * veterinarian's visit record. The actual signer is always recorded. */
  canFinalizeRecordsForOthers: boolean;
}
