import { ForbiddenException } from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/types';

export type InventoryCapability =
  | 'VIEW'
  | 'VIEW_COSTS'
  | 'EDIT_ITEMS'
  | 'ADJUST'
  | 'ARCHIVE'
  | 'DELETE_UNUSED'
  | 'AUDIT'
  | 'VIEW_VENDORS'
  | 'MANAGE_VENDORS'
  | 'VIEW_PO'
  | 'CREATE_PO'
  | 'APPROVE_PO'
  | 'PLACE_PO'
  | 'CANCEL_PO'
  | 'RECEIVE'
  | 'TRANSFER'
  | 'PURCHASING_AUDIT'
  | 'VIEW_COUNTS'
  | 'START_COUNTS'
  | 'PARTICIPATE_COUNTS'
  | 'VIEW_COUNT_EXPECTED'
  | 'REVIEW_COUNTS'
  | 'REQUEST_RECOUNT'
  | 'APPROVE_COUNTS'
  | 'POST_COUNTS'
  | 'MANAGE_COUNT_TEMPLATES'
  | 'CANCEL_COUNTS'
  | 'VIEW_COUNT_COST'
  | 'VIEW_USAGE_MAPPINGS'
  | 'MANAGE_USAGE_MAPPINGS'
  | 'CREATE_RESERVATIONS'
  | 'POST_USAGE'
  | 'RELEASE_RESERVATIONS'
  | 'RESOLVE_USAGE_FAILURES'
  | 'REVERSE_USAGE'
  | 'VIEW_PATIENT_LOT_TRACE'
  | 'EXPORT_LOT_PATIENTS';
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
  if (['VIEW_USAGE_MAPPINGS', 'VIEW_PATIENT_LOT_TRACE'].includes(capability))
    return staff.has(user.role) && user.role !== 'RECEPTIONIST';
  if (capability === 'CREATE_RESERVATIONS') return staff.has(user.role);
  if (capability === 'POST_USAGE') return staff.has(user.role);
  if (capability === 'RELEASE_RESERVATIONS')
    return managers.has(user.role) || ['VETERINARIAN', 'TECHNICIAN'].includes(user.role);
  if (capability === 'RESOLVE_USAGE_FAILURES')
    return managers.has(user.role) || ['VETERINARIAN', 'TECHNICIAN'].includes(user.role);
  if (capability === 'REVERSE_USAGE')
    return managers.has(user.role) || user.role === 'VETERINARIAN';
  if (['MANAGE_USAGE_MAPPINGS', 'EXPORT_LOT_PATIENTS'].includes(capability))
    return managers.has(user.role);
  if (['VIEW_VENDORS', 'VIEW_PO'].includes(capability))
    return staff.has(user.role) && user.role !== 'RECEPTIONIST';
  if (capability === 'RECEIVE')
    return managers.has(user.role) || ['TECHNICIAN', 'ASSISTANT'].includes(user.role);
  if (capability === 'TRANSFER') return managers.has(user.role) || user.role === 'TECHNICIAN';
  if (capability === 'VIEW_COUNTS') return staff.has(user.role) && user.role !== 'RECEPTIONIST';
  if (capability === 'PARTICIPATE_COUNTS')
    return (
      managers.has(user.role) || ['VETERINARIAN', 'TECHNICIAN', 'ASSISTANT'].includes(user.role)
    );
  if (capability === 'START_COUNTS')
    return managers.has(user.role) || ['VETERINARIAN', 'TECHNICIAN'].includes(user.role);
  if (capability === 'VIEW_COUNT_EXPECTED')
    return managers.has(user.role) || user.role === 'TECHNICIAN';
  if (['REVIEW_COUNTS', 'REQUEST_RECOUNT'].includes(capability))
    return managers.has(user.role) || user.role === 'TECHNICIAN';
  if (
    [
      'APPROVE_COUNTS',
      'POST_COUNTS',
      'MANAGE_COUNT_TEMPLATES',
      'CANCEL_COUNTS',
      'VIEW_COUNT_COST',
    ].includes(capability)
  )
    return managers.has(user.role);
  if (
    [
      'MANAGE_VENDORS',
      'CREATE_PO',
      'APPROVE_PO',
      'PLACE_PO',
      'CANCEL_PO',
      'PURCHASING_AUDIT',
    ].includes(capability)
  )
    return managers.has(user.role);
  if (capability === 'ADJUST' || capability === 'EDIT_ITEMS' || capability === 'AUDIT')
    return staff.has(user.role) && user.role !== 'ASSISTANT';
  return managers.has(user.role);
}
export function requireInventory(user: AuthenticatedUser, capability: InventoryCapability) {
  if (!canInventory(user, capability))
    throw new ForbiddenException(`Missing inventory capability: ${capability}`);
}
