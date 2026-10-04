'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

const CommunicationNavigationContext = createContext(false);

// Lives in the root layout so route changes do not reset clinic readiness.
// The authenticated user key on this provider prevents reuse across sessions.
export function CommunicationNavigationProvider({ authenticated, children }: {
  authenticated: boolean;
  children: ReactNode;
}) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!authenticated) return;
    const controller = new AbortController();
    let loading = false;
    const load = async () => {
      if (loading) return;
      loading = true;
      try {
        const response = await fetch('/api/client-communication/readiness', {
          cache: 'no-store', signal: controller.signal,
        });
        if (response.status === 401 || response.status === 403) {
          if (!controller.signal.aborted) setVisible(false);
          return;
        }
        if (!response.ok) return;
        const body: { visible?: boolean } = await response.json();
        if (!controller.signal.aborted && typeof body.visible === 'boolean') {
          setVisible(body.visible);
        }
      } catch { /* Keep confirmed readiness during temporary request failures. */ }
      finally { loading = false; }
    };
    void load();
    const timer = window.setInterval(() => void load(), 10000);
    return () => { controller.abort(); window.clearInterval(timer); };
  }, [authenticated]);

  return <CommunicationNavigationContext.Provider value={authenticated && visible}>{children}</CommunicationNavigationContext.Provider>;
}

export function useCommunicationNavigation() {
  return useContext(CommunicationNavigationContext);
}
