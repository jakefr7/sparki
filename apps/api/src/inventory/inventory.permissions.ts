import { ForbiddenException } from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/types';

export type InventoryCapability =
  'VIEW' | 'VIEW_COSTS' | 'EDIT_ITEMS' | 'ADJUST' | 'ARCHIVE' | 'DELETE_UNUSED' | 'AUDIT';
const staff = new Set([
  'OWNER',
  'PRACTICE_MANAGER',
  'RECEPTIONIST',
  'VETERINARIAN',
  'TECHNICIAN',
  'ASSISTANT',
]);
const managers = new Set(['OWNER', 'PRACTICE_MANAGER']);
export function canInventory(user: AuthenticatedUser, capability: InventoryCapability) {
  if (capability === 'VIEW') return staff.has(user.role);
  if (capability === 'ADJUST' || capability === 'EDIT_ITEMS' || capability === 'AUDIT')
    return staff.has(user.role) && user.role !== 'ASSISTANT';
  return managers.has(user.role);
}
export function requireInventory(user: AuthenticatedUser, capability: InventoryCapability) {
  if (!canInventory(user, capability))
    throw new ForbiddenException(`Missing inventory capability: ${capability}`);
}
