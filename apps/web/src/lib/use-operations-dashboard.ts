'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  CHECKOUT_READY_STATE,
  EXAM_READY_STATE,
  UPCOMING_APPOINTMENT_STATES,
  WAITING_STATES,
} from './command-center-states';
import type {
  DashboardAppointmentSummary,
  DashboardVisitSummary,
  OperationsDashboard,
} from './patient-types';

const REFRESH_INTERVAL_MS = 45_000;
const STALE_AFTER_MS = 60_000;

export interface OperationsDashboardGroups {
  waitingVisits: DashboardVisitSummary[];
  examReadyVisits: DashboardVisitSummary[];
  checkoutVisits: DashboardVisitSummary[];
  inProgressVisits: DashboardVisitSummary[];
  completedAppointments: DashboardAppointmentSummary[];
  upcomingAppointments: DashboardAppointmentSummary[];
}

/**
 * Ages every visit's elapsedMinutes forward by the time since the last
 * successful fetch, so wait times visibly tick up between the 45s polls
 * instead of sitting frozen at a stale snapshot value. Purely a display
 * correction — the server value is still what's persisted after refresh.
 */
function withLiveElapsed(visit: DashboardVisitSummary, driftMinutes: number): DashboardVisitSummary {
  return driftMinutes > 0 ? { ...visit, elapsedMinutes: visit.elapsedMinutes + driftMinutes } : visit;
}

function groupDashboard(dashboard: OperationsDashboard | null, driftMinutes: number): OperationsDashboardGroups {
  const activeVisits = (dashboard?.activeVisits ?? []).map((visit) => withLiveElapsed(visit, driftMinutes));
  const waitingVisits = (dashboard?.arrivedOrWaiting ?? []).map((visit) => withLiveElapsed(visit, driftMinutes));

  return {
    waitingVisits,
    examReadyVisits: activeVisits.filter((visit) => visit.state === EXAM_READY_STATE),
    checkoutVisits: activeVisits.filter((visit) => visit.state === CHECKOUT_READY_STATE),
    // Excludes WAITING_STATES too, not just checkout/exam-ready — those visits
    // are already represented in waitingVisits (derived from
    // dashboard.arrivedOrWaiting, itself a subset of activeVisits), so
    // without this exclusion a waiting visit was double-counted here and in
    // waitingVisits wherever both groups get concatenated (e.g. Command
    // Center's "Currently in Clinic" list), producing a duplicate React key.
    inProgressVisits: activeVisits.filter(
      (visit) =>
        visit.state !== CHECKOUT_READY_STATE &&
        visit.state !== EXAM_READY_STATE &&
        !WAITING_STATES.has(visit.state),
    ),
    completedAppointments:
      dashboard?.todaysAppointments.filter((appointment) => appointment.state === 'Completed') ?? [],
    upcomingAppointments:
      dashboard?.upcomingAppointments.filter((appointment) =>
        UPCOMING_APPOINTMENT_STATES.has(appointment.state),
      ) ?? [],
  };
}

/**
 * Owns the Command Center's data lifecycle: initial load, polling refresh,
 * and the display groupings the dashboard renders from. Swapping the
 * interval-based refresh below for push-based updates (WebSocket/SSE) later
 * only touches this hook — consumers just read `dashboard`/`groups`.
 */
export function useOperationsDashboard() {
  const [dashboard, setDashboard] = useState<OperationsDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastLoadedAt, setLastLoadedAt] = useState<Date | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const isMountedRef = useRef(true);
  const controllerRef = useRef<AbortController>(new AbortController());

  const loadDashboard = useCallback(async (mode: 'initial' | 'refresh') => {
    controllerRef.current.abort();
    const controller = new AbortController();
    controllerRef.current = controller;

    if (mode === 'refresh') setRefreshing(true);

    try {
      const response = await fetch('/api/operations/dashboard', { signal: controller.signal });
      if (!response.ok) throw new Error(`Dashboard failed to load (${response.status})`);
      const payload = (await response.json()) as OperationsDashboard;
      if (!isMountedRef.current) return;
      setDashboard(payload);
      setLastLoadedAt(new Date());
      setError(null);
    } catch (caught: unknown) {
      if (caught instanceof DOMException && caught.name === 'AbortError') return;
      if (!isMountedRef.current) return;
      if (mode === 'initial') setDashboard(null);
      setError(caught instanceof Error ? caught.message : 'Dashboard failed to load.');
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  useEffect(() => {
    isMountedRef.current = true;
    void loadDashboard('initial');
    const refreshInterval = window.setInterval(() => void loadDashboard('refresh'), REFRESH_INTERVAL_MS);
    const clockInterval = window.setInterval(() => setNow(Date.now()), 5_000);

    return () => {
      isMountedRef.current = false;
      controllerRef.current.abort();
      window.clearInterval(refreshInterval);
      window.clearInterval(clockInterval);
    };
  }, [loadDashboard]);

  const refresh = useCallback(() => {
    void loadDashboard('refresh');
  }, [loadDashboard]);

  const isStale = lastLoadedAt ? now - lastLoadedAt.getTime() > STALE_AFTER_MS : false;
  const driftMinutes = lastLoadedAt ? Math.max(0, Math.round((now - lastLoadedAt.getTime()) / 60_000)) : 0;

  return {
    dashboard,
    loading,
    refreshing,
    error,
    isStale,
    groups: groupDashboard(dashboard, driftMinutes),
    refresh,
  };
}
