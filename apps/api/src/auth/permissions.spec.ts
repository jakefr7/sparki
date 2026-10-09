import { describe, expect, it } from 'vitest';
import { canManageAdminSettings } from './permissions';

describe('Admin settings permission', () => {
  it('gives Owners access even when their legacy stored grant is false', () => {
    expect(canManageAdminSettings({ role: 'OWNER', canManageAdminSettings: false })).toBe(true);
  });
  it.each(['PRACTICE_MANAGER', 'RECEPTIONIST', 'VETERINARIAN', 'TECHNICIAN', 'ASSISTANT'] as const)('keeps %s access dependent on the explicit grant', (role) => {
    expect(canManageAdminSettings({ role, canManageAdminSettings: false })).toBe(false);
    expect(canManageAdminSettings({ role, canManageAdminSettings: true })).toBe(true);
  });
});
