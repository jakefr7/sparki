'use client';

import { useCallback, useEffect, useState } from 'react';

/** Matches the API's DashboardStatus enum (prisma/schema.prisma) — no spaces,
 *  unlike the display-facing ReceptionStatus strings in
 *  operations-command-center.tsx. */
export type DashboardStatusKey = 'Upcoming' | 'CheckedIn' | 'InRoom' | 'ReadyForCheckout' | 'Completed';

export const DASHBOARD_STATUS_LABELS: Record<DashboardStatusKey, string> = {
  Upcoming: 'Upcoming',
  CheckedIn: 'Checked In',
  InRoom: 'In Room',
  ReadyForCheckout: 'Ready for Checkout',
  Completed: 'Completed',
};

export interface DashboardStatusColor {
  status: DashboardStatusKey;
  color: string;
  isCustom: boolean;
}

interface DashboardStatusColorsConfig {
  colors: DashboardStatusColor[];
  canManage: boolean;
}

/** Reads/writes GET|POST /api/dashboard-status-colors — the per-organization
 *  accent colors for the dashboard's status pills (Settings > Admin), and
 *  the colorMap consumed directly by the pills themselves. */
export function useDashboardStatusColors() {
  const [config, setConfig] = useState<DashboardStatusColorsConfig | null>(null);

  const reload = useCallback(() => {
    return fetch('/api/dashboard-status-colors', { cache: 'no-store' })
      .then((response) => (response.ok ? (response.json() as Promise<DashboardStatusColorsConfig>) : null))
      .then(setConfig)
      .catch(() => setConfig(null));
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const colorMap: Partial<Record<DashboardStatusKey, string>> = {};
  for (const entry of config?.colors ?? []) {
    colorMap[entry.status] = entry.color;
  }

  return {
    colors: config?.colors ?? null,
    colorMap,
    canManage: Boolean(config?.canManage),
    loading: !config,
    reload,
  };
}
