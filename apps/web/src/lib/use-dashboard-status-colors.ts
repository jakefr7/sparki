'use client';

import { useCallback, useEffect, useState } from 'react';

export type DashboardStatusKey = string;

export interface DashboardStatusColor {
  id: string;
  status: string;
  name: string;
  description: string | null;
  color: string;
  sortOrder: number;
  isEnabled: boolean;
  isInClinic: boolean;
  allowedTransitionKeys: string[];
}

interface StatusConfig { colors: DashboardStatusColor[]; canManage: boolean }

export function useDashboardStatusColors() {
  const [config, setConfig] = useState<StatusConfig | null>(null);
  const reload = useCallback(() => fetch('/api/dashboard-status-colors', { cache: 'no-store' })
    .then((response) => response.ok ? response.json() as Promise<StatusConfig> : null)
    .then(setConfig).catch(() => setConfig(null)), []);
  useEffect(() => { void reload(); }, [reload]);
  const colorMap: Record<string, string> = {};
  for (const entry of config?.colors ?? []) colorMap[entry.status] = entry.color;
  return { colors: config?.colors ?? null, colorMap, canManage: Boolean(config?.canManage), loading: !config, reload };
}
