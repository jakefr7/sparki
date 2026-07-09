'use client';

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import {
  getAdjacentDashboardStatusActions,
  RECEPTION_STATUS_KEY,
  statusTone,
  type ClinicDisplayRow,
  type ScheduleDisplayRow,
  type StatusAction,
} from '../lib/dashboard-status';
import type { DashboardStatusKey } from '../lib/use-dashboard-status-colors';

const MARGIN = 12;
const FALLBACK_MENU_HEIGHT = 160;
const FALLBACK_MENU_WIDTH = 272;

/**
 * The status pill + its adjacent-transition popover, shared by every place a
 * status pill appears (dashboard "Currently in Clinic" / "Today's Schedule"
 * widgets, and the standalone Today page). Renders the popover into a
 * document.body portal, positioned from the trigger's bounding rect, so it
 * can never be clipped by a card's overflow, a scroll container, or the
 * page — it flips above the trigger when there isn't room below, and shifts
 * horizontally to stay inside the viewport.
 */
export function StatusTransitionMenu({
  row,
  onChanged,
  statusColors,
}: {
  row: Pick<ClinicDisplayRow | ScheduleDisplayRow, 'id' | 'status' | 'state' | 'kind' | 'statusDetail'>;
  onChanged?: (() => void) | undefined;
  statusColors?: Partial<Record<DashboardStatusKey, string>> | undefined;
}) {
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const actions = getAdjacentDashboardStatusActions(row);
  const label = row.statusDetail ? `${row.status} · ${row.statusDetail}` : row.status;
  const customColor = statusColors?.[RECEPTION_STATUS_KEY[row.status]];

  function updatePosition() {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const menuHeight = menuRef.current?.offsetHeight ?? FALLBACK_MENU_HEIGHT;
    const menuWidth = menuRef.current?.offsetWidth ?? FALLBACK_MENU_WIDTH;

    const spaceBelow = window.innerHeight - rect.bottom;
    const openAbove = spaceBelow < menuHeight + MARGIN && rect.top > menuHeight + MARGIN;
    const top = openAbove ? rect.top - menuHeight - 8 : rect.bottom + 8;

    // Right-align with the trigger by default (matches the pill's previous
    // static position), then clamp so it never runs off either edge.
    const left = Math.min(
      Math.max(MARGIN, rect.right - menuWidth),
      window.innerWidth - menuWidth - MARGIN,
    );

    setPosition({ top, left });
  }

  useLayoutEffect(() => {
    if (!open) return;
    updatePosition();
    function handleReposition() {
      updatePosition();
    }
    window.addEventListener('resize', handleReposition);
    window.addEventListener('scroll', handleReposition, true);
    return () => {
      window.removeEventListener('resize', handleReposition);
      window.removeEventListener('scroll', handleReposition, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, actions.length]);

  useEffect(() => {
    if (!open) return;
    function handlePointerDown(event: MouseEvent) {
      const target = event.target as Node;
      if (menuRef.current?.contains(target) || triggerRef.current?.contains(target)) return;
      setOpen(false);
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  useEffect(() => {
    if (!open) setPosition(null);
  }, [open]);

  async function runAction(action: StatusAction) {
    if (!action.endpoint) {
      setOpen(false);
      return;
    }

    setPending(action.endpoint);
    setError(null);
    try {
      const response = await fetch(action.endpoint, {
        method: 'POST',
        ...(action.body
          ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(action.body) }
          : {}),
      });
      if (!response.ok) throw new Error(`Status update failed (${response.status})`);
      setOpen(false);
      onChanged?.();
    } catch (caught) {
      // Row is left showing its previous status — onChanged() only fires on
      // success, so a failed mutation never visually commits.
      setError(caught instanceof Error ? caught.message : 'Status update failed.');
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="status-picker">
      <button
        ref={triggerRef}
        type="button"
        className="reception-status-chip"
        data-tone={customColor ? 'custom' : statusTone(row.status)}
        style={customColor ? ({ '--status-chip-color': customColor } as CSSProperties) : undefined}
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        {label}
      </button>
      {open &&
        createPortal(
          <div
            ref={menuRef}
            className="status-picker__popover"
            role="dialog"
            aria-label={`${label} status actions`}
            style={
              position
                ? { top: position.top, left: position.left }
                : { top: -9999, left: -9999, visibility: 'hidden' }
            }
          >
            <strong>Next status</strong>
            {actions.length > 0 ? (
              <div className="status-picker__actions">
                {actions.map((action) => (
                  <button
                    key={`${action.label}-${action.description}`}
                    type="button"
                    className="status-picker__action"
                    disabled={pending === action.endpoint}
                    onClick={() => void runAction(action)}
                  >
                    <span>{pending === action.endpoint ? 'Updating...' : action.label}</span>
                    <small>{action.description}</small>
                  </button>
                ))}
              </div>
            ) : (
              <p>{row.status === 'Completed' ? 'Completed is terminal.' : 'No dashboard transition available.'}</p>
            )}
            {error && <p className="status-picker__error">{error}</p>}
          </div>,
          document.body,
        )}
    </div>
  );
}
