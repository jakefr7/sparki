'use client';

import { allowedConfiguredTransitions, type ConfiguredDashboardStatus } from '@sparki/config';
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';

function statusStyle(color: string): CSSProperties {
  const hex = color.replace('#', '');
  const red = Number.parseInt(hex.slice(0, 2), 16);
  const green = Number.parseInt(hex.slice(2, 4), 16);
  const blue = Number.parseInt(hex.slice(4, 6), 16);
  const luminance = (0.2126 * red + 0.7152 * green + 0.0722 * blue) / 255;
  return { '--configured-status': color, '--configured-status-text': luminance > 0.62 ? '#172633' : '#ffffff' } as CSSProperties;
}

export function ConfiguredStatusMenu({ row, statuses, onChanged }: {
  row: { id: string; kind: 'appointment' | 'visit'; state: string; status: ConfiguredDashboardStatus };
  statuses: ConfiguredDashboardStatus[];
  onChanged?: () => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const transitions = allowedConfiguredTransitions(statuses, row.status).filter((target) =>
    row.kind === 'visit' ||
    (row.status.status === 'Appointment' && target.status === 'CheckIn') ||
    (row.status.status === 'CheckIn' && target.status === 'BeginIntake'),
  );

  useEffect(() => {
    if (!open) return;
    function dismiss(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node) && !menuRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function dismissWithKeyboard(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', dismiss);
    document.addEventListener('keydown', dismissWithKeyboard);
    return () => {
      document.removeEventListener('mousedown', dismiss);
      document.removeEventListener('keydown', dismissWithKeyboard);
    };
  }, [open]);

  useLayoutEffect(() => {
    if (!open) return;
    function place() {
      const trigger = containerRef.current?.getBoundingClientRect();
      if (!trigger) return;
      const width = menuRef.current?.offsetWidth ?? 304;
      const height = menuRef.current?.offsetHeight ?? 150;
      const margin = 12;
      const gap = 8;
      let left = trigger.left;
      if (left + width > window.innerWidth - margin) left = trigger.right - width;
      left = Math.max(margin, Math.min(left, window.innerWidth - width - margin));
      let top = trigger.bottom + gap;
      if (top + height > window.innerHeight - margin) top = trigger.top - height - gap;
      top = Math.max(margin, Math.min(top, window.innerHeight - height - margin));
      setPosition({ top, left });
    }
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => { window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true); };
  }, [open, transitions.length]);

  async function update(target: ConfiguredDashboardStatus) {
    setPending(true); setError(null);
    try {
      let response: Response;
      if (row.kind === 'appointment' && target.status === 'BeginIntake') {
        const createResponse = await fetch('/api/visits', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ appointmentId: row.id }),
        });
        const visit = (await createResponse.json()) as { id?: string; message?: string };
        if (!createResponse.ok || !visit.id) {
          const activeVisit = visit.message?.match(/active Visit \(([^)]+)\)/)?.[1];
          throw new Error(activeVisit
            ? 'This patient already has another active visit. Finish or close that visit before beginning this appointment.'
            : visit.message ?? 'Could not create the visit.');
        }
        response = await fetch(`/api/visits/${visit.id}/dashboard-status`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ statusKey: target.status }),
        });
      } else {
        const endpoint = row.kind === 'appointment' ? `/api/appointments/${row.id}/arrive` : `/api/visits/${row.id}/dashboard-status`;
        response = await fetch(endpoint, {
          method: 'POST',
          ...(row.kind === 'visit' ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ statusKey: target.status }) } : {}),
        });
      }
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { message?: string } | null;
        const message = Array.isArray(payload?.message) ? payload.message.join(' ') : payload?.message;
        throw new Error(message ?? `Status update failed (${response.status})`);
      }
      setOpen(false); onChanged?.();
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Status update failed.'); }
    finally { setPending(false); }
  }

  return <div ref={containerRef} className="configured-status-menu">
    <button type="button" className="configured-status-chip" aria-expanded={open} onClick={() => setOpen(!open)} style={statusStyle(row.status.color)}>
      <span>{row.status.name}</span><svg viewBox="0 0 16 16" aria-hidden="true"><path d="m4 6 4 4 4-4" /></svg>
    </button>
    {open ? createPortal(<div ref={menuRef} className="configured-status-menu__popover" role="dialog" aria-label={`Change ${row.status.name} status`} style={position ? { top: position.top, left: position.left } : { top: -9999, left: -9999, visibility: 'hidden' }}>
      <div className="configured-status-menu__heading"><div className="configured-status-menu__heading-copy"><strong>Change status</strong><small>{row.status.name}</small></div></div>
      {transitions.length ? transitions.map((target) => <button key={target.status} type="button" disabled={pending} onClick={() => void update(target)}><span className="configured-status-menu__action-label">Move to</span><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M3 10h13m-4-4 4 4-4 4" /></svg><span className="configured-status-menu__target" style={statusStyle(target.color)}>{pending ? 'Updating…' : target.name}</span></button>) : <div className="configured-status-menu__empty"><span aria-hidden="true">✓</span><strong>No next steps available</strong></div>}
      {error ? <p role="alert">{error}</p> : null}
    </div>, document.body) : null}
  </div>;
}
