export interface AuthenticatedUser {
  id: string;
  email: string;
  /** Org/location isolation per docs/blueprint/11-permission-and-ownership-v1.md. */
  organizationId: string;
  /** Current location context. Users may be assigned to more than one
   *  Location (see User.locations), but a request acts within exactly one. */
  locationId: string;
  /** Role names from the fixed v1 set (Role.name), e.g. "Veterinarian". */
  roles: string[];
}
