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
  lifecyclePhase: 'Arrived' | 'Intake' | 'Exam' | 'PlanAndApproval' | 'CareInProgress' | 'Discharge' | 'RecordClosure';
}

interface StatusConfig { colors: DashboardStatusColor[]; canManage: boolean }

export function useDashboardStatusColors() {
  const [config, setConfig] = useState<StatusConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const reload = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const response = await fetch('/api/dashboard-status-colors', { cache: 'no-store' });
      if (!response.ok) throw new Error('Could not load visit workflow.');
      setConfig(await response.json() as StatusConfig);
      return true;
    } catch { setError('Could not load visit workflow. Try again.'); return false; }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void reload(); }, [reload]);
  const colorMap: Record<string, string> = {};
  for (const entry of config?.colors ?? []) colorMap[entry.status] = entry.color;
  return { colors: config?.colors ?? null, colorMap, canManage: Boolean(config?.canManage), loading, error, reload };
}
