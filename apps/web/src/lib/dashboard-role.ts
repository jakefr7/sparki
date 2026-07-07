export type DashboardRole = 'receptionist' | 'technician' | 'veterinarian';

export const DASHBOARD_ROLES: readonly DashboardRole[] = [
  'receptionist',
  'technician',
  'veterinarian',
] as const;

export const DASHBOARD_ROLE_LABELS: Record<DashboardRole, string> = {
  receptionist: 'Receptionist',
  technician: 'Technician',
  veterinarian: 'Veterinarian',
};

export const DEFAULT_DASHBOARD_ROLE: DashboardRole = 'receptionist';

export const DASHBOARD_ROLE_STORAGE_KEY = 'sparki:dashboard:dev-mode:view';
export const DASHBOARD_ROLE_CHANGE_EVENT = 'sparki:dashboard-role-change';

export function isDashboardRole(value: unknown): value is DashboardRole {
  return typeof value === 'string' && (DASHBOARD_ROLES as readonly string[]).includes(value);
}
