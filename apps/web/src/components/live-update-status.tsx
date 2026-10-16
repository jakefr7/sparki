'use client';

import { useEffect, useState } from 'react';
import { timeLabel } from '../lib/format';

export function LiveUpdateStatus({
  updatedAt,
  refreshing = false,
  isStale = false,
}: {
  updatedAt: string | null;
  refreshing?: boolean;
  isStale?: boolean;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 5_000);
    return () => window.clearInterval(interval);
  }, []);
  const stale = isStale || (updatedAt !== null && now - new Date(updatedAt).getTime() > 90_000);
  const state = refreshing ? 'refreshing' : stale ? 'stale' : updatedAt ? 'live' : 'loading';
  const label = refreshing ? 'Refreshing' : stale ? 'Stale' : updatedAt ? 'Live' : 'Loading';

  return (
    <span className="live-update-status" data-state={state}>
      <span className="live-update-status__dot" aria-hidden="true" />
      <span>{label}{updatedAt ? ` · Updated ${timeLabel(updatedAt)}` : '…'}</span>
    </span>
  );
}
