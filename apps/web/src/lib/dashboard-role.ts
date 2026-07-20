export type DashboardRole = 'receptionist' | 'technician' | 'veterinarian' | 'manager';

export const DASHBOARD_ROLES: readonly DashboardRole[] = [
  'receptionist',
  'technician',
  'veterinarian',
  'manager',
] as const;

export const DASHBOARD_ROLE_LABELS: Record<DashboardRole, string> = {
  receptionist: 'Receptionist',
  technician: 'Technician',
  veterinarian: 'Veterinarian',
  manager: 'Practice Manager',
};

export const DEFAULT_DASHBOARD_ROLE: DashboardRole = 'receptionist';

export const DASHBOARD_ROLE_STORAGE_KEY = 'sparki:dashboard:dev-mode:view';
export const DASHBOARD_ROLE_CHANGE_EVENT = 'sparki:dashboard-role-change';

export function isDashboardRole(value: unknown): value is DashboardRole {
  return typeof value === 'string' && (DASHBOARD_ROLES as readonly string[]).includes(value);
}

export function dashboardRoleForUserRole(role: string | null | undefined): DashboardRole {
  if (role === 'VETERINARIAN') return 'veterinarian';
  if (role === 'TECHNICIAN' || role === 'ASSISTANT') return 'technician';
  if (role === 'OWNER' || role === 'PRACTICE_MANAGER') return 'manager';
  return 'receptionist';
}
