import { BadRequestException } from '@nestjs/common';

interface OrganizationScopedDelegate {
  findFirst(args: { where: { id: string; organizationId: string } }): Promise<{ id: string } | null>;
}

/**
 * Shared "does this row exist in this organization" check used across
 * services that accept a foreign-key id (client, provider, staff member, ...)
 * from the caller and must reject cross-organization references.
 */
export async function assertBelongsToOrganization(
  delegate: OrganizationScopedDelegate,
  entityLabel: string,
  id: string,
  organizationId: string,
): Promise<void> {
  const found = await delegate.findFirst({ where: { id, organizationId } });
  if (!found) {
    throw new BadRequestException(
      `${entityLabel} ${id} not found in organization ${organizationId}`,
    );
  }
}
